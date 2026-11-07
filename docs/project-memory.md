# 项目记忆（view-comic-v2）

给后续接手的人 / agent 的长期上下文。改动代码前先读这份，能避开大部分重复踩坑。

## 一句话

本地漫画浏览器：Vue 3 前端 + Express 后端（开发时由 `server/dev.mjs` 挂在同一个 Vite 实例里，页面与接口**同一个端口**），数据全部落 `data/*.json`，没有数据库。

## 技术栈与启动

- 前端：Vue 3.5 + TS + naive-ui + pinia + vue-router(hash) + UnoCSS + `@vicons/*`
- 后端：Express 5 + bcrypt + node-stream-zip + image-size + dotenv + sharp（缩略图）
- 构建：vite 7 + vue-tsc
- `pnpm dev` → `node server/dev.mjs`：**一个进程、一个端口（读 .env 的 PORT，当前是 6006）**
  - `server/dev.mjs` 用 Vite 的 JS API 建 `middlewareMode` dev server（页面 / HMR / 静态资源都走它），`httpServer` 自己 `listen`
  - `/api/*` 与 `/health` 由 `createServerModuleRunner(vite.environments.ssr, { hmr: true })` 按需 `import("/server/index.ts")` 取 express app —— 改 `server/` 下的代码，下一次请求自动是新逻辑，**不用重启**
  - 其余请求交给 `vite.middlewares`，最后兜底用 `transformIndexHtml` 吐 `index.html`
  - 端口写在本项目根目录的 .env（PORT=6006，不用 Vue 默认的 5173）；被占用时启动即报「端口 6006 已被占用 —— 很可能已经有一个 pnpm dev 在跑了」，不会静默换端口
  - `server/index.ts` 里**不要再自建 HTTP server**（历史上它自己 `listen(5173)`，与 dev server 抢端口 → `EADDRINUSE` 直接退出）
- `pnpm type-check` → `vue-tsc --build`（注意 `tsconfig.server.json` 里 `noEmit: false`，会额外生成 `dist/server`，已 gitignore）

## 目录

- `common/apis/*` 前后端共享的接口契约；`common/utils/*` 共享纯函数（重点是 `nameSort.ts`）
- `server/routes/*` 路由；`server/utils/*` 业务与缓存（`library.ts` / `view.ts` / `myStreamZip.ts` / `user.ts`）
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

### 图片地址
统一走 `src/utils/fileUrl.ts` 的 `buildFileUrl(editUUID, index, basePath)`，不要手拼 `api/file/...`。
`basePath` 必须经 `normalizeBasePath()`：服务端 Windows 的 `path.join` 会给反斜杠，根目录会给 `"."`。

### 图片加载占位与慢网降级
- 组件：`src/views/reader/components/PageLoading.vue`（转圈 + 文案，`failed` 时 emit `retry`）；样式是**全局**的 `pageLoading.css`，因为瀑布流的页面容器是命令式创建的，拿不到 scoped 的 `data-v`。
- 两个模式都有：`onload` 前图片透明（`opacity: 0` + 0.2s 过渡），占位层淡出移除；超过 3 秒文案切「网络较慢，仍在加载…」；失败自动重试 2 次（800ms / 2000ms，URL 追加 `?retry=` 避开失败缓存），仍失败显示「加载失败 · 点击重试」。
- 占位层要 `z-index: 2`：瀑布流里它先于 `<img>` 挂进容器，不压一层会被图片盖住；容器必须 `position: relative`。
- 慢网判定：`src/utils/network.ts` 的 `slowNetwork`（Network Information API，`slow-2g/2g/3g`；Safari / Firefox 没有该 API，一律按不慢处理）。慢网时瀑布流预加载 5→3、驻留 8→5、**不再发 `decodeSize`**（省一个 64KB Range 连接），单页预加载 5→2。

### 缩略图
- 地址：`/api/Thumbnail/{editUUID}/{width}/{相对路径}`，路径里可以带压缩包内条目（`img.zip/0001.jpg`），由 `server/utils/thumb.ts` 的 `splitZipEntry()` 拆。
- 生成：`getThumbBuffer()` 命中磁盘直接读，否则按类型取源图（目录取自然序首图、图片取自身、压缩包取包内第一张图），sharp 按宽度等比缩放成 jpeg，落 `data/thumbs/{thumbId}_{width}.jpg`（`thumbId = sha1(库名 + \0 + 相对路径).slice(0,20)`）。
- 背压：同时解码上限 2 张、排队 32 张；超了抛 `ThumbBusyError`，路由回 **503 + `Retry-After: 3`**，前端 `ThumbImage.vue` 最多退避重试 3 次，不会把图误判成「没有缩略图」。
- 前端：`ThumbImage.vue` 先查 IndexedDB（`src/utils/thumbCache.ts`，库 `view-comic-thumbs`，最多 600 条，按时间淘汰），未命中才请求接口；全局并发 4；用 `object-fit: contain` 保证整图可见。
- 开关：`src/utils/appFeatures.ts` 的 `appFeatures.thumbnails`（设置 → 数据 → 缩略图）。关掉后前端一个请求都不发，书架与阅读页文件列表都退回图标。
- 压缩包并发：`myStreamZip.ts` 必须**等 `init()` 完成再入缓存**（用 `opening` Promise 合并同路径的首次打开），否则并发首次访问会拿到空的 `fileList`；读取单个条目不要调 `zip.finishStream()`，它会关掉同包其它请求的流。

## 约定与陷阱

- **路径穿越**：凡是「库根 + 相对路径」都要过 `server/utils/pathSafe.ts` 的 `resolveInsideRoot()`，它同时做字符串包含与 `realpath` 校验。
- **404 必须用 `res.sendStatus(404)`**：express 5 的 `res.send(404)` 实际返回 200 + body `404`。
- **`basePath` 语义**：压缩包书是压缩包自身相对路径（如 `img.zip`、`compare/compare.zip`），目录书是目录相对路径（根目录为 `"."`）。`reloadComicViewList()` 要把它拆成「父路径 + 最后一段」再传给 `comicViewList`。
- **服务端代码热重载**：`server/dev.mjs` 用 `createServerModuleRunner(..., { hmr: true })`，改 `server/`（或它 import 的 `common/`）下文件后，下一次 `/api` 请求就会用新代码；前端 `.vue` / `.ts` 走 HMR。注意 `server/index.ts` 里**不要再自建 HTTP server**（历史上它 `listen(5173)` 与 dev server 抢端口，导致 `EADDRINUSE` 直接退出）。
- **别在同一文件分多次改**：vite 会缓存「引用了但还没 import」的中间产物，表现为 `xxx is not defined`；同一个文件的多处改动尽量一次写完。
- **`vue-tsc` 有 7 个既有错误**（`common/apis/tools/apiUrlsTrans.ts(11)`、`example.ts(13)`、`transFetch.ts(40/60/67/72)`、`common/utils/ext.ts(15)`），改动前后都应只有这 7 个，多出来就是自己引入的。
- 模板里裸写 `@vicons/*` 组件名不会被解析（`vite.config.ts` 只配了 `NaiveUiResolver`），必须显式 `import`。
- 纯 CSS 的 `<style scoped>` 里不能用 `//` 注释（会报 `Unknown word`）。
- `#main` 是定高 + `overflow: hidden` 的弹性容器，页面内容超一屏要自己开滚动区（参考 `settingsView.vue` 的 `.parent`：`height: 100%; min-height: 0; overflow-y: auto;` + 隐藏滚动条）。
- 依赖只留用得上的：`adm-zip` / `fflate` / `iconv-lite` / `yauzl` / `tsx` / `vite-plugin-inspect` / `vite-plugin-node` / `vite-plugin-vue-devtools` 已清理，别再顺手装回来。

## 已实现的功能面

- 阅读器：瀑布流 / 单页翻页两种模式；自适应 / 宽度 / 高度 / 旋转四种适配（宽度与高度适应可拖动看超出部分）；双开页自动两屏（顺序随翻页方向）；页码指示、文件名栏、点击页码跳页、文件列表抽屉（三种排序 + 正反序）
- 加载体验：每页加载占位（转圈 / 慢网提示 / 失败点击重试，自动重试 2 次）；慢网（2G/3G）自动降低预加载与并发
- 点击区域：可拖拽 / 八向改大小 / 2% 吸附；动作含翻页、切 UI、设置、跳页、返回书架 / 书库、切换适配方式；预设布局；布局上传到个人账户（`userConfig.tapZoneLayouts`，同名覆盖）
- 设置页：阅读 / 翻页 / 账号 / 数据四个标签；阅读设置另有半屏抽屉
- 书架：搜索（含扩展名）、三种排序、正反序、文件 / 文件夹过滤、文件夹优先
- 缩略图：服务端按需生成（目录 / 图片 / 压缩包首图，支持包内条目）+ IndexedDB 缓存 + 生成队列背压 + 全局开关
- 安全：`/file`、`/view/*` 全部限制在书库根内

## 已知待办

- `JsonConfig` 是空接口，`/config/getConfig` 返回 `{}`
- 书架排序偏好未持久化（刷新回默认）；`rar` 仍被当普通文件处理
- 视频文件只做了类型角标，未取首帧缩略图
