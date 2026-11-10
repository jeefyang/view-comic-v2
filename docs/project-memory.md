# 项目记忆（view-comic-v2）

给后续接手的人 / agent 的长期上下文。改动代码前先读这份，能避开大部分重复踩坑。

## 一句话

本地漫画浏览器：Vue 3 前端 + Express 后端（开发时由 `server/dev.mjs` 挂在同一个 Vite 实例里，页面与接口**同一个端口**），数据全部落 `data/*.json`，没有数据库。

## 技术栈与启动

- 前端：Vue 3.5 + TS + naive-ui + pinia + vue-router(hash) + UnoCSS + `@vicons/*`
- 后端：Express 5 + bcrypt + node-stream-zip + image-size + dotenv + sharp（缩略图）+ ffmpeg/ffprobe（可选，MP4/WebM 视频缩略图）
- 构建：vite 7 + vue-tsc
- `pnpm dev` → `node server/dev.mjs`：**一个进程、一个端口（读 .env 的 PORT，当前是 6006）**
  - `server/dev.mjs` 用 Vite 的 JS API 建 `middlewareMode` dev server（页面 / HMR / 静态资源都走它），`httpServer` 自己 `listen`
  - `/api/*` 与 `/health` 由 `createServerModuleRunner(vite.environments.ssr, { hmr: true })` 按需 `import("/server/index.ts")` 取 express app —— 改 `server/` 下的代码，下一次请求自动是新逻辑，**不用重启**
  - 其余请求交给 `vite.middlewares`，最后兜底用 `transformIndexHtml` 吐 `index.html`
  - 端口写在本项目根目录的 .env（PORT=6006，不用 Vue 默认的 5173）；被占用时启动即报「端口 6006 已被占用 —— 很可能已经有一个 pnpm dev 在跑了」，不会静默换端口
  - `server/index.ts` 里**不要再自建 HTTP server**（历史上它自己 `listen(5173)`，与 dev server 抢端口 → `EADDRINUSE` 直接退出）
- `pnpm type-check` → `vue-tsc --build`（`tsconfig.server.json` 是 `noEmit: false`，会真的产出文件，`outDir` 已挪到 `node_modules/.tmp/server-types`，不要指回 `dist/server` 否则和 SSR 产物抢目录）

## 构建与部署

- `pnpm build` → 四步串行：`build-only`（`vite build`，出 `dist/` 前端）→ `build-server`（`vite build --ssr server/index.ts --outDir dist/server --emptyOutDir`，出**单文件** `dist/server/index.js`）→ `build-prod`（把 `server/prod.ts` 编译成 `dist/server/prod.mjs`，见 `scripts/build-prod.mjs`）→ `gen-ecosystem`（生成 `ecosystem.config.cjs`）。
- 服务端用 Vite 的 SSR 构建而不是 `tsc`，是为了顺手解决两件事：`@common/*` 别名被内联（`tsc` 产物里仍留着别名，Node 解析不了），以及 `__dirname` 落在 `dist/server` 时 `server/utils/cache.ts` 的 `path.resolve(__dirname, "../../data")` 正好指回项目根的 `data/`（用 `tsc` 的 `dist/server/server/...` 会去读 `dist/server/data`，得到一个空库）。
- 生产启动器：源码 `server/prod.ts`（TS，可改、参与类型检查）→ 构建产物 `dist/server/prod.mjs`（2.9 kB，依赖保持 external）。**PM2 跑的是产物那份**，所以 `dist/` 基本自包含（只差 `node_modules` / `.env` / `data/`）。
- `pnpm start` → `node dist/server/prod.mjs`：从自身位置往上找含 `package.json` 的目录作为项目根（所以源码位置和 `dist/server` 位置都能跑），读根目录 `.env`，校验 `dist/server/index.js` 与 `dist/index.html` 存在，动态 `import` 出 express app，挂 `express.static(dist)` + 非 `/api` 的 GET/HEAD 兜底回 `index.html`，自己 `listen`（端口读 `.env` 的 `PORT`，默认 6006），`listen` 成功后 `process.send("ready")` 配合 PM2 的 `wait_ready`，`SIGINT/SIGTERM` 优雅关闭。
- PM2：`ecosystem.config.example.cjs` 是模板，`ecosystem.config.cjs` 由 `pnpm build`（或单独 `pnpm gen-ecosystem`）在**不存在时**复制生成，**已存在就不覆盖**；两个文件都不进 git（`.gitignore` 里有 `ecosystem.config.cjs` 与 `logs/`）。`script` 用 `path.join(__dirname, "dist/server/prod.mjs")` 绝对路径，避开 PM2 对相对路径按 `cwd` 解析的规则。
- `pnpm build:check` = `type-check` + `build`。`pnpm build` 之所以不串 `type-check`，是因为仓库里还有 7 个历史类型错误（见下），会把整个构建卡在第一步、产物出不来；要在 CI 里卡类型就用 `build:check`。
- **只跑 `build-only` 会连 `dist/server` 一起清掉**：`vite build` 默认 `emptyOutDir: true`，`build-only` 之后 `dist/server/{index.js,prod.mjs}` 就没了，这时重启 PM2 只会得到 `Cannot find module '...\dist\server\prod.mjs'` 并进入崩溃-重启循环（`pm2` 的 `↺` 会一路涨）。要改前端又不想整包重建，也必须跑**完整**的 `pnpm build`，然后再 `pm2 restart view-comic-v2`。
- PM2 操作：`pm2 list` / `pm2 restart view-comic-v2` / `pm2 logs` 可直接用（早期在沙箱里会 `connect EPERM //./pipe/rpc.sock`，现在正常）。运行日志在 `logs/out-0.log` 与 `logs/error-0.log`——缩略图的 `warnOnce` 排障日志只会出现在后者里。
- 打包（`vite build` / `vite build --ssr`）在本机需要在沙箱外跑：esbuild 起子进程会 `spawn EPERM`。飞牛（Debian，glibc ≥ 2.36）上 `sharp` 有预编译包，但**原生模块不能跨平台拷**，必须在目标机 `pnpm install`。

## 目录

- `common/apis/*` 前后端共享的接口契约；`common/utils/*` 共享纯函数（重点是 `nameSort.ts`）
- `server/routes/*` 路由；`server/utils/*` 业务与缓存（`library.ts` / `view.ts` / `myStreamZip.ts` / `user.ts`）；容器书（PDF 等）在 `server/utils/book/`，渲染槽位在 `server/utils/renderQueue.ts`
- `server/dev.mjs` 开发启动器（单端口 + 后端热重载）；`server/prod.ts` 生产启动器源码（构建成 `dist/server/prod.mjs`，PM2 指向它）
- `src/views/{library,shelf,reader,settings}` 四个页面；`src/stores/{view,config}.ts`
- `public/reader/tap-zones/*.json` 点击区域默认布局与预设
- `data/*.json`：`library.json` 书库、`user.json` 用户、`totken.json` token、`userConfig.json` 用户设置（含云布局）、`config.json`

## 关键链路

### RPC 薄框架
1. `common/apis/xxx.ts` 用 `apiUrlsTrans()` 声明 key
2. `server/routes/*.ts` 用 `setRouter(key, cb)` 实现
3. 前端 `src/utils/jFetch.ts` 导出的 `userFetch / libraryFetch / viewFetch / configFetch` 调 `.request(key, data)`

### 阅读页
- `readerView.vue` 只做编排：`init()` 校验登录 → `reloadComicViewList()` 确认书还在 → 恢复位置 → 渲染 `Waterfall`（瀑布流）或 `PagedReader`（单页翻页）
- 页面顺序统一来自 `src/views/reader/readerPages.ts` 的 `readerPages`（按 `readerSort` 排序后的数组），**`currentIndex` 是它的下标**
- 三个索引要分清：`item.index` 是服务端序号（只用于拼图片地址）；`page.order` 是「排序后第几张图」；`page.sortIndex` 是「第几屏」（双开页一张图占两屏）
- 进度存 `readerProgress`（localStorage），key 为 `editUUID::basePath::fileName`，值同时记 `index` 与 `name`，排序变化后按 name 重定位
- 单页模式（`modes/paged/PagedReader.vue`）的适配靠 `sizeMap`（真实宽高）+ `viewSize`（可用视口）喂给 `modes/fitStrategies.ts` 的 `computeFit()`。`sizeMap` 的键必须用**文件名**（`sizeKey()`，没有名字才退回 `index`）：用序号会在换排序后把上一张图的尺寸套到新图上，表现为「选了旋转适应却转错、图又小又歪」；`onImgLoad` 必须**每次都用 `naturalWidth/naturalHeight` 覆写**（不能写成「已有就跳过」，错值会永久固化）；换书（`comicFileList.basePath` 变化）时 `watch` 清空整张缓存。
- `computeFit()` 在任一侧尺寸为 0 时返回 `identity`（1:1），会让「旋转 / 缩放」看起来完全失效；`PagedReader` 的 `fit` 因此在尺寸未知时返回 `null` 并由 CSS 兜底，等 `measure()` 拿到真实值再算，不要改回直连 `computeFit`。

### 图片地址
统一走 `src/utils/fileUrl.ts` 的 `buildFileUrl(editUUID, index, basePath)`，不要手拼 `api/file/...`。
`basePath` 必须经 `normalizeBasePath()`：服务端 Windows 的 `path.join` 会给反斜杠，根目录会给 `"."`。
`basePath` 还要按段 URL 编码（`buildFileUrl` 里的 `encodePathSegments`）：目录名带 `#`（例如 `test/#诛仙`）时，不编码的 `#` 会被浏览器当成 fragment 起点，实际请求打到父目录 —— 阅读页第 0 页显示成父目录的首图、其余页 500 报「加载失败」，而缩略图正常（`ThumbImage.vue` 一直按段编码）。`?` 会被当成 query、`%` 会被当成转义，同样要防。

### 图片文件服务（`/api/file`）
- 一条路由分四种来源：`getFileExt(url)` 是容器书（`pdf` / `epub` / `mobi`）时交给 `book/` 现渲染第 `num` 页（渲染结果是小 JPEG，忽略 Range 回 200 全量，越界 404）；不是 `zip` 时按普通文件流式返回（`getContentType()` + `Accept-Ranges: bytes` + `immutable`）；是 `zip` 时走 `node-stream-zip` 取条目；路径是目录时取 `getDirMediaList()` 缓存清单里的第 `num` 张（200 个目录 / 50,000 条 LRU，目录 `mtimeMs + size` 校验；越界或文件缺失回 404）。**别再「不是目录就当压缩包」**：曾经把根目录的单张 JPEG 喂给 `node-stream-zip`，`Bad archive` 一路崩掉整个进程。
- Range 必须是真 Range：`parseRange()` 解析（支持 `bytes=start-end`、`bytes=-N`），`sendStream()` 统一发头 —— 有 Range → **206 + `Content-Range: bytes start-end/size` + 对应 `Content-Length`**；无 Range → `200 + Content-Length: size`；越界 → **416 + `Content-Range: bytes */size`**。
- **绝对不要「截断之后仍回 200」**：旧的 `getLimitStream` 按字节截断上游流、状态码却是 200 还带 `immutable`，浏览器会把残包当成这张图的完整内容缓存一年（详见下方陷阱）。压缩包内条目：图片且 `Range` 从 0 开始时，解压到 `end` 就停，回 **206 + `Content-Range: bytes 0-end/未压缩大小`**；zip 视频回 200 全量且**不发** `Accept-Ranges`；其它 Range 回 200 全量。关键是任何情况都不能截断后仍回 200。
- 图片地址末尾带版本号：`src/utils/fileUrl.ts` 的 `FILE_URL_VERSION`（现在是 `2`），`buildFileUrl()` 输出 `...?v=2`。URL 就是缓存键，改坏过的浏览器缓存只能靠升版本号作废。

### 图片加载占位与慢网降级
- 组件：`src/views/reader/components/PageLoading.vue`（转圈 + 文案，`failed` 时 emit `retry`）；样式是**全局**的 `pageLoading.css`，因为瀑布流的页面容器是命令式创建的，拿不到 scoped 的 `data-v`。
- 两个模式都有：`onload` 前图片透明（`opacity: 0` + 0.2s 过渡），占位层淡出移除；超过 3 秒文案切「网络较慢，仍在加载…」；失败自动重试 2 次（800ms / 2000ms，URL 追加 `?retry=` 避开失败缓存），仍失败显示「加载失败 · 点击重试」。
- 占位层要 `z-index: 2`：瀑布流里它先于 `<img>` 挂进容器，不压一层会被图片盖住；容器必须 `position: relative`。
- 慢网判定：`src/utils/network.ts` 的 `slowNetwork`（Network Information API，`slow-2g/2g/3g`；Safari / Firefox 没有该 API，一律按不慢处理）。慢网时瀑布流预加载 5→3、驻留 8→5、**不再发 `decodeSize`**（省一个 64KB Range 连接），单页预加载 5→2。

### 缩略图
- 地址：`/api/Thumbnail/{editUUID}/{width}/{相对路径}`，路径里可以带压缩包内条目（`img.zip/0001.jpg`），由 `server/utils/thumb.ts` 的 `splitZipEntry()` 拆。
- 生成：`getThumbBuffer()` 命中磁盘直接读，否则按类型取源图（目录取自然序首图、图片取自身、压缩包取包内第一张图；MP4/WebM 先经 ffmpeg 取中间帧），sharp 仅处理图片、按宽度等比缩放成 jpeg，落 `data/thumbs/{thumbId}_{width}.jpg`（`thumbId = sha1(库名 + \0 + 相对路径).slice(0,20)`）；视频缩略图额外加 `_v2` 隔离旧黑帧缓存。
- 「按 id + 宽度查询，没有就生成」就是全部策略：没被请求过的路径不会生成文件，`data/thumbs` 一开始可能根本不存在（`ensureDir()` 在生成时才建）。
- 目录书里一个图片都没有时（常见形态：只放了一个 `compare.zip` 的 `compare/`），回退到目录内第一个压缩包的首图（`firstZipInDir()`，只试前 3 个包），否则封面 404。
- 算 id 前路径必须过 `normalizeRelPath()`（`\`→`/`、合并 `//`、去掉开头 `./`、空串归 `"."`）：前端不同入口会拼出 `img-001.jpg` 与 `./img-001.jpg`，不归一就会给同一个文件各存一份。
- 书库根一律用 `library.ts` 的 `resolveLibRoot(pathUrl)`（相对路径按 `PROJECT_ROOT` 解析），不要用 `process.cwd()`：`library.json` 里存的是相对路径，换个工作目录启动就表现为「书列表正常、图片和缩略图全 404」。
- 排障日志：`thumb.ts` 对「没有对应书库 / 路径越界或不存在 / 内部没有可用图片」三类失败各用 `warnOnce()` 打一次（同 key 只打一次，上限 500 条后清空），日志在 `logs/error-0.log`。
- 背压：同时解码上限 2 张、排队 32 张；超了抛 `ThumbBusyError`，路由回 **503 + `Retry-After: 3`**，前端 `ThumbImage.vue` 最多退避重试 3 次，不会把图误判成「没有缩略图」。
- 前端：`ThumbImage.vue` 先查 IndexedDB（`src/utils/thumbCache.ts`，库 `view-comic-thumbs`，最多 600 条，按时间淘汰），未命中才请求接口；全局并发 4；用 `object-fit: contain` 保证整图可见。
- **缩略图路径要跟着条目走，不能实时读当前层级**：书架条目是 `ShelfFileItem = ViewFileType & { thumbPath: string }`，`sortShelfFileList()` 生成条目时就把当刻 `shelfPath` 拼进去；`FileItem.vue` 只读 `props.item.thumbPath`。阅读页文件列表同理，`FileListDrawer.vue` 在 `rows` 里连 `path` 一起算好再绑给 `<thumb-image :path>`。另外 `updateShelfFolder()` 必须在 `await` 之前先清空 `shelfFileList` / `shelfFolder` / `shelfScrollName`——否则切目录的一瞬间旧条目会带着新前缀去要 `compare/img-006.jpg` 这类不存在的路径，日志里表现为一批「路径不存在或越界」404。
- 开关：`src/utils/appFeatures.ts` 的 `appFeatures.thumbnails`（设置 → 数据 → 缩略图）。关掉后前端一个请求都不发，书架与阅读页文件列表都退回图标。
- 压缩包并发：`myStreamZip.ts` 必须**等 `init()` 完成再入缓存**（用 `opening` Promise 合并同路径的首次打开），否则并发首次访问会拿到空的 `fileList`；读取单个条目不要调 `zip.finishStream()`，它会关掉同包其它请求的流。

### 阅读页媒体缓存（图片 + 视频）

- 模块：`src/utils/mediaCache.ts`（IndexedDB 与 LRU）+ `src/utils/mediaSource.ts`（把网络/缓存包装成 objectURL）。**不要**再给阅读页另起一套缓存；缩略图仍走 `view-comic-thumbs`，两者互不相干。
- 库：IndexedDB `view-comic-media` v1，两个 store：`media` 存 `{ key, blob }`，`meta` 存 `{ key, bytes, kind, lastAccess }` 并带 `lastAccess` 索引；`meta` 里的 `__stats__` 是唯一权威计数（count/bytes，图片/视频各自累计），设置页“已用”读它，**不能**用 `navigator.storage.estimate().usage`。
- 预算：目标容量默认 2GiB（可改），`realCap = min(configured, floor(quota × 80%))`，没有 `navigator.storage.estimate` 时回退 configured；条目 2000（图片+视频合计）；单图不设硬上限；视频单文件 `videoCap = min(500MiB, floor(realCap × 25%))`，超过的视频直连网络播放、不写缓存。
- 统一 LRU：图片和视频共享字节与条目双上限，不分区、不预留图片空间；写条目、改 stats、淘汰在同一个 `readwrite` 事务里；按 `lastAccess` 索引游标淘汰，单事务最多 200 条，跳过 `pinnedKeys`（当前页/在播视频）；`lastAccess` 回写节流 5 分钟。
- key：`mc:1:<userScope>:<editUUID>:<basePath>:<kind>:<index>:<name>:<FILE_URL_VERSION>`，复用 `src/utils/fileUrl.ts` 的 `normalizeBasePath()` 与 `FILE_URL_VERSION`；超过 1024 字符放弃缓存。退出登录只清 `mc:1:<userScope>:` 前缀，不清其他用户。
- 写入时机：图片必须“进入视口 + onload 解码完成”才写；瀑布流预加载但没进视口的页不写；单页当前页 onload 后写。视频必须整段 fetch 成 Blob、`playing` 之后才写；不预取、不等 `ended`（`loop` 不触发）。命中缓存时 `fromCache=true` 且不再回写。
- 缓存损坏：图片/视频从缓存播放失败时先 `deleteMedia(key)`，再走网络重试一次；不要一次失败就判整页加载失败。
- 配额失败：`QuotaExceededError` 先淘汰 `max(20, ceil(count×10%))` 再重试一次；仍失败本会话停止写入，只提示一次（`readerView.vue` 注册 `setMediaCacheErrorHandler`），读取不受影响。
- 设置页“数据”标签：容量上限、条目上限、已用/图片/视频占用、清除媒体缓存；`清除当前客户端缓存` 会先清媒体缓存再 `configStore.clear()`。
- 生产 CSP 已放行 `blob:`（`img-src` / `media-src` / `connect-src`），否则缓存 Blob 的 objectURL 会被拦；不要假设 Service Worker/Cache API 可用——局域网 `http://<ip>:<port>` 不是安全上下文，本项目刻意只用 IndexedDB。

### 容器书（PDF / EPUB / MOBI）页图
- 「和 zip 一致」的全部含义：`comicViewList` 回同样的 `{ list, baseFile, basePath, start }`，页名固定 7 位 `0000001.jpg`、index 0 起，URL 仍是 `/api/file/{editUUID}/{index}/{容器相对路径}`，进度 / 书签 / 文件列表一行不改。
- 分派在 `server/utils/view.ts` 的 `getComicViewList`：`bookKindOf(extType)` 命中就走 `server/utils/book/index.ts`；取页在 `server/routes/api.ts` 的 `/api/file` 的三分支之前（容器书绝不能把整份文件当普通文件发出去）。
- PDF：`book/pdf.ts` 打开一次后按 mtime 做 2 本 LRU（`docCache`），页图 2000px 宽、高封顶 8000、JPEG q80；`data/pages/{sha1(lib\0relPath\0mtime\0size\0index\0width)}.jpg`，默认 2GB、超限删到 80%（`BOOK_PAGE_CACHE_GB`），单飞 + 60s 节流；`BOOK_PDF_MAX_MB`（默认 250）在打开前拦超限。同一页并发生成合并成一个 Promise。
- 缩略图：容器书走 `thumb.ts` 的 `splitContainerEntry()`（后缀含 `.zip` / `.cbz` / `.pdf` / `.epub` / `.mobi` / `.azw3`）；给了页名出那一页，只给容器取第 1 页，按 `min(width*2, 2000)` 宽渲染再由 sharp 缩。**容器书在缩略图链路里必须 `slot: false`**（外层已占槽位，否则互等）。
- 渲染槽位：`renderQueue.ts` 把 sharp 缩略图与容器书页图合并成同一组（运行 2 / 排队 32），满则 503 + `Retry-After: 3`。以前 thumb.ts 内的同名常量已迁走，`ThumbBusyError` 只是别名。
- 已知限制：非嵌入 CJK 字体（WPS 导出、无 `FontFile`）的 PDF 页文字不显示（图片 / 矢量正常），原因与取舍见 `docs/specs/pdf-epub-mobi.md` §12.3；`@napi-rs/canvas` 钉 0.1.100，1.1.0 在 Windows 上 `drawImage` 会 native 崩溃。
- EPUB：`book/epub.ts` 用 `node-stream-zip` + `fast-xml-parser`（精确 5.12.0）；句柄 2 本 LRU 且同一句柄读取串行，container.xml → OPF manifest/spine 定页序；spine 是 `image/*`（非 SVG）直接一页，XHTML / SVG 取正文唯一 `<img>` / `<image>`（`%20`、`../`、`xlink:href` 都验过）；文字页 / 多图页整本 415；DRM 看 `META-INF/encryption.xml` 的非字体算法或 `license.lcpl`。页图是包内原字节透传（不转码、不占槽、不写 `data/pages`），缩略图取第 1 页交 sharp。
- MOBI / AZW3：`book/mobi.ts` 只读 PDB 头 + record0（PalmDOC / MOBI / EXTH），页 = `firstImageIndex` 起的图片 record；判定固定版式先看 EXTH 122 `fixed-layout` 或 EXTH 123 `book-type ∈ {comic, magazine}`，否则「文本总长 < 图片总长 5% 且图片 ≥2」兜底，再不行整本 415 文字版。双格式 MOBI 只看 MOBI7 段（EXTH 121 边界之后是 KF8，含图也不计入）；`azw3`（含 `version ≥ 8` 的 KF8-only）回 415 建议转 EPUB；DRM = Encryption Type ≠ 0 或 DRM offset/count 不为 `0xFFFFFFFF`。页图同样是 record 原字节透传，不占槽、不落盘。句柄不缓存（只读头 + 按 index 偏移，不值得缓存）。

### 历史与书签
- 数据存云端 `userConfig`（`data/userConfig.json`）：`readHistory`（最多 200 条，`openTime` 倒序）与 `bookmarks`（最多 500 条，`createTime` 倒序），读写都在 `src/views/history/historyData.ts`，页面是 `src/views/history/historyView.vue` 的两个标签页。
- 历史一条 = 一本书（id `book::<editUUID>::<basePath>`）或一个书库（id `lib::<libraryUUID>`），`kind` 区分；书签 id 是 `bm_<时间36进制>_<随机>`。
- **写入是增量的，不要改回整包 `setUserConfig`**：`common/apis/user.ts` 有 `patchHistory` / `patchBookmarks`（`op: upsert | remove | clear`，带单条 `item` 或 `id`）与 `patchTapZoneLayout`（`op: set | remove` + 布局名）。服务端在 `server/utils/user.ts` 的 `patchReadHistory()` / `patchBookmarks()` / `patchTapZoneLayout()` 里做合并、去重、截断，`server/routes/userApi.ts` 只做 token 与 uuid 校验。整包接口一次要传 200 + 500 条（约 170 KB），阅读时每 4 秒一次，必须用增量。
- 前端把改动放进 `pendingHistory` / `pendingBookmarks` 两个 `Map<id, "upsert" | "remove">` + `historyClearPending` / `bookmarksClearPending` 两个清空标记，`flushHistory()` 逐条推、推成功才出队，失败保留并 8 秒后重试；`scheduleSave()` 默认 4 秒防抖（页码变化只改本地），离开阅读页调 `flushAll()` 立即推。
- 陷阱：`flushHistory()` 第一行是 `if (!dirty) return`，所以**任何入队之后都必须先 `markDirty()`**，否则这次改动永远不推（历史上「新开的书一条都不进历史」就是这个）。
- 陷阱：`loadHistory()` 拉云端前若 `dirty` 为真要先 `flushHistory()`，并用 `mutateSeq` 版本号判断回填——否则返回的旧数据会把这期间的新记录/删除冲掉。
- 根目录书：服务端把根目录的 `basePath` 与 `baseFile.name` 都给 `"."`，`normalizeFileName(".")` 会归一成空串，于是名字为空、`touchHistoryBook()` 直接 `return`。取书名一律用 `readerView.vue` 的 `bookDisplayName()`（`baseFile.name || basePath 最后一段 || "根目录"`），显示层再用 `displayBookName()` 把 `"."` 换成「根目录」。
- 入口：悬浮菜单 `floatActions.ts` 的 `toggleBookmark`（label 由 `floatActionLabel(key, bookmarked)` 决定，`FloatActions.vue` 接 `bookmarked` prop）与点击区域动作 `tapZones/actions.ts` 的 `toggleBookmark`，两处都调 `readerView.vue` 的 `toggleBookmarkOfPage()`（同页已有书签就删、没有就加）。
- 点击区域布局也走单布局增量：`tapZones/layouts.ts` 的 `patchLayout(name, zones?)` 取代了原来的整包 `putLayouts()`；`saveLayoutAs()` 传 `op: "set"`，`removeLayout()` 传 `op: "remove"`。

### 书架页
- 滚动位置记忆在 `src/views/shelf/components/FileListItem2.vue`：`scrollMemo: Map<目录路径, { name, offset }>`，`snapshot()` 用 `VirtualList` 的 `getScrollState()` 拿首个可见项的**名字**（不用下标，目录重新加载后下标会变）+ 像素偏移存在当前路径下；`restore()` 用 `findIndex(item => item.name === memo.name)` 找回位置再 `restorePosition(index, offset)`，同名条目不存在就留在顶部。
- 这个 watcher 必须写成 `watch(() => pathKey(), (next, prev) => snapshot(prev), { flush: "sync" })`：`updateShelfFolder()` 是「先清空列表再请求」，watcher 若走默认的异步时机，执行时 `getScrollState()` 已经拿不到东西了。
- 恢复时机有四处：`watch(shelfFileList, restore, { flush: "post" })`、`onMounted` + `nextTick`、`onActivated`（从阅读页回来）、进目录前的 `toClick()` 里先 `snapshot()`。
- `containerHeight` 用 `useElementSize(parentRef)` 的高度直接给，**不要再回到 `setTimeout` 量高 + `key = nanoid()` 重挂列表**的老写法（重挂会把滚动位置一起丢掉）。
- 书架顶栏与列表状态都在 `src/views/shelf/shelfView.vue`：`libraryName` / `atRoot` 两个 computed 供面包屑与按钮禁用态使用；`shelfLoading` 为真时渲染 6 条 `n-skeleton`，只有「不在加载且列表为空」才显示 `n-empty`。
- 排序 / 过滤 / 搜索词虽然一直在 `viewStore.save()` 的 `returnData` 里，但过去只有换书库、开书时才调 `save()` → 现在 `sortShelfFileList()` 末尾自己调一次 `save()`，改完偏好立刻生效并持久化。

## 约定与陷阱

- **生产环境的 CSP 必须放行 `blob:`**：`server/index.ts` 只在 `NODE_ENV !== 'development'` 时才 `app.use(helmet(...))`，helmet 默认 CSP 是 `img-src 'self' data:`，而 `'self'` **不匹配 `blob:` 协议**；缩略图恰好是 `fetch → URL.createObjectURL → <img src="blob:...">`，于是打包版整面灰块、图位显示 `alt` 文字，开发版却完全正常（dev 的 HTML 由 Vite 中间件返回，helmet 只作用在 `/api` 响应上）。现在 `img-src` / `media-src` / `connect-src` 都显式带了 `blob:`，改动见 `server/index.ts`。
- **路径穿越**：凡是「库根 + 相对路径」都要过 `server/utils/pathSafe.ts` 的 `resolveInsideRoot()`，它同时做字符串包含与 `realpath` 校验。
- **404 必须用 `res.sendStatus(404)`**：express 5 的 `res.send(404)` 实际返回 200 + body `404`。
- **`basePath` 语义**：压缩包书是压缩包自身相对路径（如 `img.zip`、`compare/compare.zip`），目录书是目录相对路径（根目录为 `"."`）。`reloadComicViewList()` 要把它拆成「父路径 + 最后一段」再传给 `comicViewList`。
- **服务端代码热重载**：`server/dev.mjs` 用 `createServerModuleRunner(..., { hmr: true })`，改 `server/`（或它 import 的 `common/`）下文件后，下一次 `/api` 请求就会用新代码；前端 `.vue` / `.ts` 走 HMR。注意 `server/index.ts` 里**不要再自建 HTTP server**（历史上它 `listen(5173)` 与 dev server 抢端口，导致 `EADDRINUSE` 直接退出）。
- **别在同一文件分多次改**：vite 会缓存「引用了但还没 import」的中间产物，表现为 `xxx is not defined`；同一个文件的多处改动尽量一次写完。
- **`vue-tsc` 有 7 个既有错误**（`common/apis/tools/apiUrlsTrans.ts(11)`、`example.ts(13)`、`transFetch.ts(40/60/67/72)`、`common/utils/ext.ts(15)`），改动前后都应只有这 7 个，多出来就是自己引入的。
- 模板里裸写 `@vicons/*` 组件名不会被解析（`vite.config.ts` 只配了 `NaiveUiResolver`），必须显式 `import`。
- 纯 CSS 的 `<style scoped>` 里不能用 `//` 注释（会报 `Unknown word`）。
- `#main` 是定高 + `overflow: hidden` 的弹性容器，页面内容超一屏要自己开滚动区（参考 `settingsView.vue` 的 `.parent`：`height: 100%; min-height: 0; overflow-y: auto;` + 隐藏滚动条）。
- **滚动条统一走 `src/assets/scrollbar.css`**（在 `main.css` 之后引入）：全局 `*` 规则统一成 8px、圆角 999px、半透明灰滑块、轨道透明，Firefox 用 `scrollbar-width: thin` + `scrollbar-color` 两套写法都要留。naive-ui 自带的 `n-scrollbar` 不用 CSS 类而用 `--n-scrollbar-*` 变量，且这些变量内联写在元素上 → 只能靠 `.n-scrollbar { --n-scrollbar-color: ... !important }` 覆盖。抽屉（`n-drawer-content`）要加 `:native-scrollbar="false"` 才会用这套；书架列表、`VirtualList`、瀑布流、设置页仍刻意隐藏滚动条，它们的选择器优先级高于全局 `*` 规则，别一起改掉。
- **Range 探测会污染浏览器缓存**：`src/utils/decodeSize.ts` 为了只取文件头，用 `Range: bytes=0-65535` 打**与 `<img>` 相同的 URL**；现在只读 64KiB 就 `cancel()`，zip 图片也能拿到真 206 前缀。如果服务端不认 Range 却回 `200`（还带 `immutable`），浏览器会把这条 64KB 残包当完整内容存一年，紧接着的 `<img>` 命中缓存只拿到前 64KB —— 渐进式 JPEG（SOF `FF C2`）从 64KB 能解出「完整尺寸 + 只有低频扫描」，表现就是**整屏糊图**，且只有大于 64KB 的图中招，开 DevTools 禁用缓存就正常。改法只能是服务端发真 206，已经写坏的缓存靠 `FILE_URL_VERSION` 升版本作废。
- **尺寸缓存按序号索引会串号**：`PagedReader` 的 `sizeMap` 曾经用 `String(target.index)` 做键、且 `onImgLoad` 里「已有就 return」。换排序后同一个 `index` 指向另一张图，缓存里还是旧图的宽高（横图尺寸套在竖图上）→ `computeFit` 是按这份错尺寸算的，于是把竖图判成横图、选了 90° 旋转塞进错误盒子，`object-fit: contain` 再缩一次，看着又小又歪；而且真图加载回来也不纠正。**判断方法**：看 `<img>` 的 `style.width/height` 比值是否等于图片真实宽高比（如 `609.221/344 = 1.771` vs `550/780 = 0.705` 就说明尺寸来源错了），`transform` 的 `matrix(0,1,-1,0,…)` 只代表转 90°（转两次是 `matrix(-1,0,0,-1,…)`，不存在）。现在键改成文件名、每次加载都覆写、换书清空，切换适配方式/换排序才会立刻正确。
- **`node-stream-zip` 的 `error` 必须接住**：`myStreamZip.ts` 的 `init()` 里要先常驻 `obj.on("error", ...)` 把错误记进 `lastError` 并 reject 打开，否则 `Bad archive` 会变成未处理的 `'error'` 事件直接杀进程；缓存命中前还要检查 `lastError` 并剔除坏实例。另外 `server/index.ts` 用 `globalThis.__viewComicCrashGuard` 只注册一次 `uncaughtException` / `unhandledRejection` 兜底（只打日志不退出；不能重复注册，dev 下 `server/index.ts` 会被反复加载）。
- **换行符不统一**：`src/views/shelf/shelfView.vue` 等文件是 CRLF，而 `docs/project-memory.md` 是 LF。`edit` 工具的多行 `old_string` 在 CRLF 文件里经常匹配不上（不是文本不对，是换行不同），改用单行锚点，或用 PowerShell 的 `Get-Content -Raw` + `Set-Content -NoNewline` 追加整段。
- 依赖只留用得上的：`adm-zip` / `fflate` / `iconv-lite` / `yauzl` / `tsx` / `vite-plugin-inspect` / `vite-plugin-node` / `vite-plugin-vue-devtools` 已清理，别再顺手装回来。

## 已实现的功能面

- 阅读器：瀑布流 / 单页翻页两种模式；自适应 / 宽度 / 高度 / 旋转四种适配（宽度与高度适应可拖动看超出部分）；双开页自动两屏（顺序随翻页方向）；页码指示、文件名栏、点击页码跳页、文件列表抽屉（三种排序 + 正反序）；单页支持 MP4/WebM 视频（静音循环、进视口自动播放、离开暂停、40px 播放/暂停按钮五位置默认右下；视频不参与双开页）
- 加载体验：每页加载占位（转圈 / 慢网提示 / 失败点击重试，自动重试 2 次）；慢网（2G/3G）自动降低预加载与并发
- 点击区域：可拖拽 / 八向改大小 / 2% 吸附；动作含翻页、切 UI、设置、跳页、返回书架 / 书库、切换适配方式；预设布局；布局上传到个人账户（`userConfig.tapZoneLayouts`，同名覆盖）
- 设置页：阅读 / 翻页 / 账号 / 数据四个标签；阅读设置另有半屏抽屉
- 书架：搜索（含扩展名）、三种排序、正反序、文件 / 文件夹过滤、文件夹优先；顶栏面包屑第一格是书库名（点它回**当前书库的根目录**，不跳书库页），其余是 `shelfPath` 各段，根目录不再额外显示「根目录」字样，此时回根 / 返上一级两个按钮置灰；加载时出骨架屏而非空态；按钮组右侧显示「共 N 项」；滚动位置按目录记忆（离开再回来、进出子目录都停在原位）；排序 / 过滤 / 搜索词会落盘
- 历史：导航栏「历史」页，两个标签页分别列历史与书签；记打开过的书（含页码 / 总页数）与打开过的书库，云端同步（4 秒防抖增量推送，离开阅读页立即推）；历史与书签卡片都显示「书库名 / 路径」，可单条删除、可清空
- 书签：阅读页悬浮菜单与点击区域动作都能加 / 取消当前页书签，书签可点了直接跳到那本书那一页
- 滚动条：全局统一成细圆角半透明滑块（`src/assets/scrollbar.css`），两个抽屉改用 naive 滚动条
- 阅读边距：设置 → 阅读 → 「阅读边距」可调上/下/左/右（0–48px，默认 8/8/8/8）与瀑布流图片间距（0–48px，默认 6），瀑布流与单页都生效，改完 500ms 防抖写云端（`paddingTop/Bottom/Left/Right`、`imageGap`，旧的 `padding` / `pageMargin` 只做一次迁移读取）
- 书架快捷滚动：右下角悬浮两个按钮（回到顶部 / 滚到底部），`FileListItem2` 通过 `defineExpose` 暴露 `scrollToTop/scrollToBottom/snapshot`
- 缩略图：服务端按需生成（目录 / 图片 / 压缩包首图 / MP4/WebM 中间帧，支持包内条目）+ IndexedDB 缓存 + 生成队列背压 + 全局开关
- 媒体缓存：阅读页图片与 MP4/WebM 视频写 IndexedDB，2GiB/2000 条统一 LRU；命中直接 objectURL，设置页可改容量/名额并清除（图片缓存与缩略图缓存互相独立）
- 电子书：PDF / EPUB / MOBI 已按「模拟 zip 页清单」接入（书架入口、页列表、按页出图、页缩略图、进度 / 书签）；EPUB / MOBI 页图是包内原图透传，不占渲染槽、不落盘；azw3 与文字版 MOBI / 可重排 EPUB 回 415 文案
- 安全：`/file`、`/view/*` 全部限制在书库根内

## 已知待办

- 那 7 个历史类型错误还在，`pnpm build:check` 会因此失败（`pnpm build` 不受影响）
- PDF 已知限制：非嵌入 CJK 字体的页文字不显示（本仓库测试的 WPS 导出 PDF 中招）；`@napi-rs/canvas` 钉 0.1.100，升级前先回归 `drawImage`
- MOBI 只做固定版式 / 图片型：文字版、`azw3`（含 KF8-only）回 415；BMP 页缩略图靠 `pages.ts` 的 `decodeBmpRaw()`（sharp 不认 BMP，只解 24/32 位 BI_RGB，调色板 / RLE 的 BMP 缩略图仍 404）；文字版 / 多图页 EPUB 整本 415（可用 calibre 转图片型）
- `JsonConfig` 是空接口，`/config/getConfig` 返回 `{}`
- `rar` 仍被当普通文件处理（书架排序 / 过滤 / 搜索词已持久化，别再当待办）
- 超大图（几十 MB / 上亿像素）在浏览器里仍可能解不出来：曾做过「`/api/file?max=` + sharp 降采样 + 前端按像素自动切换」，实测用户那边大图依旧打不开，已整段撤回（`d163ade revert(reader): 撤掉超大图降采样`，`server/utils/largeImage.ts` 已删除）。要重做必须先拿到真实样张（本机三库最大只有 11.1MB / 8192×6144），别凭猜再动 `api.ts` 与 `PagedReader`。
