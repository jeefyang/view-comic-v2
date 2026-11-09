# PDF / EPUB / MOBI 接入规格

> 状态：可实施（wayfinder 地图 [#1](https://github.com/jeefyang/view-comic-v2/issues/1) 的收口产物）
> 决策来源：地图下 #2 可行性、#3 出图侧、#4 页身份与契约、#5 页图生成与缓存、#6 书架入口、#7 加密范围、#8 MOBI 兜底
> 调研底稿：[docs/research/pdf-epub-mobi-rendering.md](../research/pdf-epub-mobi-rendering.md)
> 本 spec 不含代码；改动落地时遵循 AGENTS.md 与 docs/project-memory.md 的既有约定。

## 1. 目标与非目标

### 目标

三种容器（PDF / EPUB / MOBI）在**不改阅读器页模型**的前提下接入，用户操作面与 zip 书完全一致：

1. 书架可点开，进入 `/reader`；
2. 页列表：页数、跳转、排序、行内缩略图；
3. 瀑布流与单页两种阅读模式、双开页、宽度/高度适配；
4. 书架封面与页列表缩略图；
5. 进度 / 历史 / 书签按页记录与恢复；
6. 翻页键、点击区域、手势。

服务的返回形态与 zip 分支保持一致：**页 = 一张图片 URL**，浏览器一次只取当前页（不下载也不解析整份文件），服务端按需出图。

### 非目标（Out of scope）

- 加密 / DRM 文件（含 Kindle 的 DRM）；
- reflowable EPUB 的排版（不服务端排版，也不进浏览器排版）；
- azw3 / KF8（`.azw3` 归 mobi 类型但不支持，见 §7）；
- cbr、fb2、全文搜索、注释、TTS；
- EPUB nav / PDF outline 的章节导航（首版不做）；
- 浏览器端 pdf.js / epub.js 方案；
- 打包或内置 GPL/AGPL 的渲染器（mupdf、poppler、Ghostscript、calibre）。

## 2. 数据契约

### 2.1 类型

`types/common.d.ts`

```ts
type ViewFileExtType = "zip" | "image" | "video" | "pdf" | "epub" | "mobi" | "other";
```

- `.cbz` 并入 `common/utils/ext.ts` 的 `zipTypeList`，`extType` 仍是 `"zip"`，走既有 zip 链路，零代码；
- `.azw3` 并入新增的 `mobiTypeList = ["mobi", "azw3"]`，`extType` 是 `"mobi"`，但打开时按 §7 拒绝。

### 2.2 页身份

| 项 | 规则 |
| --- | --- |
| 页名 | 固定 **7 位**零填充编号 + 真实图片扩展名，如 `0000001.jpg`；扁平单层，不含容器内原路径 |
| 上限 | 9,999,999 页（超出按错误处理） |
| 扩展名 | PDF 恒 `.jpg`；EPUB / MOBI 以图片 magic bytes 判定（JPEG/PNG/GIF/WebP/BMP），认不出的候选跳过 |
| `index` | 0 起，等于 `list` 下标，就是 `api/file/<uuid>/<index>/<basePath>` 的第三段 |
| `start` | 恒 0（与 zip 一致） |

### 2.3 comicViewList 响应

复用 `ComicFileListType`，不新增接口：

```ts
{
  list: ComicFileType[],   // 每页
  baseFile: ViewFileType,  // 容器文件本身，extType ∈ { "pdf" | "epub" | "mobi" }
  start: 0,
  basePath: string         // 相对书库根的容器路径，如 "comics/book.pdf"（Windows 下服务端会给反斜杠，前端 normalizeBasePath 归一）
}
```

每页 `ComicFileType` 字段：

| 字段 | 取值 |
| --- | --- |
| `name` | `0000001.jpg` |
| `index` | 0..n-1 |
| `size` / `sizeStr` | 容器文件的 size / sizeStr（页本身不落盘，没有独立大小） |
| `ext` / `extType` | 真实图片扩展名；`extType` 恒为 `"image"`（前端据此走图片分支） |
| `isDir` | false |
| `createTime` / `createTimeMS` / `updateTime` / `updateTimeMS` | 容器文件的对应值 |
| `width` / `height` | 不带，由前端 `decodeSize` 按需解析（与 zip 一致） |

### 2.4 取页 URL

与 zip 完全同形，前端 `buildFileUrl(editUUID, index, basePath)` 不改：

```
GET api/file/<editUUID>/<index>/<basePath>?v=2
```

- 响应：200 + `Content-Type: image/*` + `Content-Length` + `Cache-Control: public, max-age=31536000, immutable`；
- **忽略 Range，回 200 全量**（与 zip 条目同一策略，见 `server/routes/api.ts:197-205` 的注释）；
- `index` 越界 → 404；容器打不开 / 页渲染失败 → 500。

### 2.5 缩略图 URL

沿用伪包内路径：`api/Thumbnail/<editUUID>/<width>/<basePath>/<页名>`，如
`api/Thumbnail/<uuid>/300/comics/book.pdf/0000001.jpg`。

书架封面 = 第 1 页，等价于 zip 包的"包内第一张图"。不读 OPF `cover-image`，也不读 EXTH 201。

### 2.6 页序

| 格式 | 页序 |
| --- | --- |
| PDF | 页码升序（pdfjs `pageNumber` 1..N） |
| EPUB | OPF spine 顺序；一图 = 一页；同一图片被引用两次算两页 |
| MOBI | 图片 record 升序（`firstImageIndex` 起），跳过 FLIS/FCIS/SRCS 等非图片 record |

### 2.7 空态与错误

- 能打开但 0 页：comicViewList 回 200 + `list: []`；书架点击后 `msg.warning("这本书没有可显示的页面")` 且不跳转（阅读页空列表回书架的既有守卫保持不变）；
- 打不开（DRM / 文字版 / 损坏 / 超限）：非 200 + `msg`，前端 `msg.error(res.msg)`，不进 `/reader`（见 §7）。

## 3. 服务端模块划分

### 3.1 新增

```
server/utils/book/
  index.ts     # getBookViewList(p, f) 分派；把 BookPage[] 组装成 ComicFileListType
  pages.ts     # 页名生成（7 位）、magic bytes 判定、容器 stat 读取
  pdf.ts       # pdfjs + @napi-rs/canvas 渲染单页；文档句柄 LRU
  epub.ts      # node-stream-zip 打开 EPUB；container.xml/OPF 解析；spine → 图片条目
  mobi.ts      # PDB/PalmDOC/MOBI 头解析；固定版式判定；图片 record 取字节
  cache.ts     # data/pages 落盘、键计算、2GB 上限与 atime 淘汰
  errors.ts    # BookError(status, message)
server/utils/renderQueue.ts   # 从 thumb.ts 抽出的共享信号量（MAX_GENERATE=2 / MAX_WAITING=32）
```

对外只暴露三个入口，签名（示意）：

```ts
type BookKind = "pdf" | "epub" | "mobi";

// 列页：返回页名/index，不返回宽高
async function getBookViewList(p: string, f: ViewFileType): Promise<ComicFileListType>;

// 取页图：index 为 0 起的槽位；返回 JPEG/PNG 等原始字节与扩展名
async function getBookPageBuffer(
    libName: string,
    relPath: string,   // 容器相对书库根
    index: number,
    opts?: { width?: number; forThumb?: boolean }
): Promise<{ buffer: Buffer; ext: string } | undefined>;

// 缩略图：只出第 1 页，width 直接决定渲染宽度，不先出 2000px 大图
async function getBookThumbBuffer(libName: string, relPath: string, width: number): Promise<Buffer | undefined>;
```

`BookError` 携带 HTTP 状态码，供 `viewApi` 原样透传（现在一律 500）：

```ts
class BookError extends Error { constructor(public status: 400 | 413 | 415, message: string) {} }
```

### 3.2 既有文件改动

| 文件 | 改动 |
| --- | --- |
| `common/utils/ext.ts` | `zipTypeList` 加 `"cbz"`；新增 `pdfTypeList = ["pdf"]`、`epubTypeList = ["epub"]`、`mobiTypeList = ["mobi","azw3"]`；`contentTypeList` 不动（页面扩展名只可能是图片） |
| `server/utils/index.ts:18-36` | `getFileExt` 的映射表加 `pdf` / `epub` / `mobi` 三键 |
| `server/utils/view.ts:77` | `getComicViewList` 在 `extType === "zip"` 之外加三分支：命中 book 类型走 `getBookViewList`，返回 `{ list, baseFile: f, basePath: path.join(url, f.name), start: 0 }`；错误原样向上抛 `BookError` |
| `server/routes/viewApi.ts:100-147` | `comicViewList` 捕获 `BookError`，回 `{ code: e.status, msg: e.message }`（其余仍 500）；成功路径不变 |
| `server/routes/api.ts:161-209` | `/file` 的非 zip 分支再分叉：`extType` ∈ book → `getBookPageBuffer`，按 `num` 取页；越界 404、失败 500。原有的整文件 `sendStream` 分支保留给 image/video/other |
| `server/utils/thumb.ts` | `splitZipEntry`（145-157）泛化为 `splitContainerEntry`：候选后缀 `.zip/.cbz/.pdf/.epub/.mobi/.azw3`，从右往左找 + `fs.existsSync` 校验；命中 book → `getBookThumbBuffer`，其余走原有 `zipEntryBuffer` / 目录 / 图片分支 |
| `server/utils/thumb.ts:254-295` | 信号量搬到 `renderQueue.ts`，thumb 与 book 共用同一组槽位（保持 2/32 与 `ThumbBusyError` → 503 + `Retry-After: 3`）；`thumbStats` 增加 book 计数 |
| `server/routes/*` | 新增手动清空页缓存的接口，与 `clearThumbs` 并列（如 `clearPageCache`），不做定时清理 |

### 3.3 PDF 实现约束

- 依赖：`pdfjs-dist@4.10.38`（legacy build，Apache-2.0）+ `@napi-rs/canvas`（MIT，预编译，无 node-gyp）。**不要升到 5/6**：它们要求 Node ≥ 22.13，本仓库 engines 允许 20.19。
- 打开：`getDocument({ data, isEvalSupported: false, standardFontDataUrl })`；`data` 为整份文件 Buffer（pdfjs 的 Node 用法，见 §10 风险）。
- 渲染：`page.getViewport({ scale: 2000 / viewport.width })`；若 `viewport.height > 8000`，按 `8000 / height` 等比缩小；canvas 尺寸上限 2000×8000（约 16M 像素，RGBA 64MB）。
- 编码：canvas → JPEG q80（`@napi-rs/canvas` 的 `toBuffer("image/jpeg", 80)`；若该版本参数不生效，回落 sharp 转码，但只在 spike 证明必要时启用）。
- 文档句柄：LRU 2 份，键 = 绝对路径 + `mtimeMs`；淘汰时 `destroy()`；不预热。

### 3.4 EPUB 实现约束

- 容器：`node-stream-zip`（已有依赖），`getMyStreamZip` 的缓存与并发合并逻辑不用于 EPUB，新建轻量 `EpubHandle`（同样 LRU 2，键 = 路径 + mtime）。
- 解析：`META-INF/container.xml` → OPF 路径 → OPF 的 `manifest`/`spine`；XML 用 `fast-xml-parser`（MIT，纯 JS，约 100KB），不手写正则。
- 页映射：spine 的每个 itemref → manifest item：
  - `media-type` 是 `image/*` → 该条目即一页；
  - XHTML 且正文只有一张 `<img>/<image>` → 该图片即一页（兼容固定版式 EPUB 的常见写法）；
  - 其余（文字页、无图页）→ **不跳过而是拒绝整本**（415，文案见 §7）：跳过会做出"残书"，与 #8 对 MOBI 的理由一致。
- 判定"只有一张图"用解析 XML + 统计 `img`/`image` 节点，不做完整 XHTML 渲染。
- 页图：直接透传包内条目字节，**不转码、不落盘、不缓存**（#5）；`Content-Type` 按 magic bytes。
- 条目头读取：为判定 magic bytes，可开流读前 16 字节后 `destroy()`；实现时确认 node-stream-zip 支持中途销毁（早退的流不影响后续 `stream()`），spike 不通过则退回"条目名扩展名 + 服务时再按 magic 校正"。

### 3.5 MOBI 实现约束

- 只读头部区段，不整份 `readFile`：`fs.promises.open` + 按需 `read`（头 78 字节 → record offset 表 `(numRecords+1)*4` → record0 的 PalmDOC/MOBI/EXTH → 目标 record 的 offset/length）。
- 页 = 图片 record：`firstImageIndex` 起按 offset 表逐条读，magic bytes 命中 JPEG/PNG/GIF/BMP 才算一页，跳过 FLIS/FCIS/SRCS 等。
- 固定版式判定（顺序，见 #8）：
  1. EXTH 122 `fixed-layout` = 1，或 EXTH 123 `book-type` ∈ `{comic, magazine}` → 收；
  2. 否则"文本 record 总长 < 图片 record 总长的 5%"且图片 record ≥ 2 → 收（覆盖 calibre/KCC 产物）；
  3. 其余 → 415 文字版。
  阈值 5% 写常量并注明可调；误判取向"宁拒不误"。
- 双格式 `.mobi`（MOBI7 + KF8）：只读 MOBI7 段，EXTH 121 之后的 KF8 段忽略。
- DRM：`Encryption Type != 0` 或 DRM Offset/Count 不为 `0xFFFFFFFF` → 415。
- 句柄不缓存（每次按需 open/close），因为只读头部与少量 record，开销远小于 PDF。

## 4. 前端改动点

刻意做到最小——页仍是图片，阅读页的 `readerPages` / `Waterfall` / `PagedReader` / `FileListDrawer` / `decodeSize` **一行不改**。

| 文件 | 改动 |
| --- | --- |
| `src/views/shelf/components/FileListItem2.vue:116` | 白名单改为 `["image","zip","pdf","epub","mobi"]`；`res.code != 200` 已有 `msg.error(res.msg)`；成功但 `res.data.list.length === 0` 时 `msg.warning("这本书没有可显示的页面")` 且不跳转 |
| `src/views/shelf/components/FileItem.vue:53-104` | `ItemKind` 加 `"book"`；`kind` 对三种 extType 返回 `"book"`；`KIND_LABELS.book = "电子书"`；`icon` 的 book 分支用 `FileCopyRound`（与 #6 决议一致，不新增图标）；`iconColor` 把 book 并入 warning 橙色分支；`metaTitle` 的"类型：<label> · <ext>"自然显示"电子书 · pdf" |
| `src/stores/view.ts:126` | `thumbPath` 条件从 `isDir \|\| image \|\| zip` 改为"非视频的已知类型"，即 book 也生成 `[prefix, name].join("/")` |
| `src/views/history/historyView.vue:140` | 无需改动：按 `parentPath + baseFile.name` 重取列表，book 走同一接口 |
| 阅读页 | 无需改动：`basePath` 已是容器路径，`buildFileUrl` 拼出的地址与 zip 同形；进度/书签键仍是 `editUUID + basePath + pageName`，页名固定 7 位后跨排序稳定 |

## 5. 缓存与性能预算

### 5.1 页图缓存（只 PDF）

- 目录：`data/pages/`；
- 键：`sha1(libName + "\0" + relPath + "\0" + mtimeMs + "\0" + size + "\0" + index + "\0" + targetWidth).slice(0, 32) + ".jpg"`，含 mtime/size，换文件自动失效；
- 写：临时文件 + `rename`，避免半成品被读到；
- 总量上限 **2 GB**（约 4000 页 @ 500KB），超限后台按 `atime` 删最旧 20%，单飞防重入，无 TTL；
- 命中直接读盘；单页失败（渲染抛错）回 500 且**不缓存**；
- EPUB / MOBI 页图不落盘（直接透传容器内字节）。

### 5.2 缩略图

- 复用 `data/thumbs`，键仍 `sha1(库名 + "\0" + 归一相对路径).slice(0,20)`；
- book 的缩略图输入是"第 1 页"：PDF 按 `min(width*2, 2000)` 宽渲染小图（不要先出 2000px 再缩），EPUB/MOBI 取第 1 页原图字节交给 sharp；
- 失败/空容器 → `undefined` → 404（书架显示占位，与 zip 一致）。

### 5.3 预算

| 场景 | 目标 |
| --- | --- |
| 缩略图命中 | < 50ms |
| 缩略图冷生成（PDF 1 页，宽 300） | < 300ms |
| 页图命中缓存 | < 50ms |
| 页图冷渲染（2000px 宽、JPEG q80） | < 500ms（调研实测 72ms/页，余量充足） |
| 首屏并发 | 前端已有 5 页预加载；服务端 2 槽位排队，满 32 回 503 + `Retry-After: 3` |
| 单页内存 | canvas ≤ 64MB（2000×8000 RGBA）+ 编码缓冲；2 并发 + pdfjs 文档 < 400MB |
| PDF 整本内存（pdfjs data 方式） | 约等于文件大小（见 §10） |

## 6. 依赖、构建与部署

- 新增运行时依赖：`pdfjs-dist@4.10.38`（精确版本，不加 `^`）、`@napi-rs/canvas`、`fast-xml-parser`。
- 体积：`@napi-rs/canvas` 平台包约 39.8MB（win32-x64-msvc / linux-x64-gnu 各一份，pnpm 只装当前平台）；整套安装后约 77MB。
- pnpm：`@napi-rs/canvas` 是预编译 optional 平台包；若漏装会报 `Cannot find native binding`，安装后用 `node -e "require('@napi-rs/canvas')"` 自检（ESM 项目用 `import`）。
- 构建：`vite build --ssr server/index.ts` 默认把 dependencies 外置，pdfjs/ canvas 从 `node_modules` 运行时解析，无需改 vite 配置；若被 inline，需在 `ssr.noExternal` 里显式排除 native 包。发布物仍为 `dist/server/prod.mjs`。
- 平台：Windows 开发（win32-x64）、Linux x64 发布（glibc，非 musl）；无 Docker 场景，`pnpm install` 必须在目标平台执行。
- PM2：`max_memory_restart: "1G"` 不变；PDF 并发被 2 槽位限制，峰值内存按 §5.3 估算；建议在 `ecosystem.config.cjs` 的 `env` 里显式写 `BOOK_PDF_MAX_MB`（默认 250）与 `BOOK_PAGE_CACHE_GB`（默认 2），便于运维调整。
- 字体：`standardFontDataUrl` 指向 `node_modules/pdfjs-dist/standard_fonts/`（`createRequire` 解析，不写死路径）；comic PDF 多图为空文本，缺字体只告警不失败。

## 7. 错误与降级

| 场景 | HTTP | 文案（前端 `msg.error` 直接显示） |
| --- | --- | --- |
| DRM（PDF 加密 / EPUB 加密 / MOBI Encryption Type≠0） | 415 | 该文件有 DRM 保护，暂不支持；请用已授权的阅读器导出后再放入书库。 |
| MOBI 文字版（非固定版式） | 415 | 这是文字版 MOBI，按页阅读需要图片型文件；可用 ebook-convert 转成 EPUB 后重试。 |
| EPUB 可重排 / 有文字页 | 415 | 这是文字版（可重排）EPUB，按页阅读需要图片型或固定版式文件；可用 calibre 转换后重试。 |
| azw3 / KF8 | 415 | azw3 暂不支持，请转为 EPUB 后重试。 |
| PDF 超过上限 | 413 | PDF 超过 250MB，暂不支持在线阅读；请拆分或压缩后再试。 |
| 文件损坏 / 不是该格式 | 400 | 文件无法解析，可能已损坏。 |
| 页图渲染失败（单页） | 500 | 页面渲染失败（前端显示"加载失败 · 点击重试"，Waterfall 已有重试层） |
| 生成队列满 | 503 + `Retry-After: 3` | 前端退避重试（沿用缩略图既有行为） |

- 不做书架预扫描、置灰或提前标错：错误只在点开时出现（#8）；
- 任何容器错误都不得冒泡成进程级未捕获异常（沿用 `myStreamZip` 的常驻 `error` 监听教训）；
- calibre 只出现在"格式转换"提示里，DRM 提示不暗示破解。

## 8. 验收清单

### 六项操作面（每种格式各跑一遍）

1. **书架入口**：PDF/EPUB/MOBI 显示"电子书 · <ext>"与橙色角标；点击进入 `/reader`；打不开时 toast 显示 §7 文案且停留书架。
2. **页列表**：抽屉显示页数、当前页高亮、跳转、行内缩略图；按"页码"与"文件名"两种排序都稳定（7 位零填充保证）。
3. **阅读模式**：瀑布流 + 单页；横向页在 splitSpread 下拆双开；宽度/高度适配、旋转、拖动未回归。
4. **缩略图**：书架封面为第 1 页；页列表每行有缩略图；点开前不生成 2000px 大图。
5. **进度/历史/书签**：翻到第 N 页退出，重进落回第 N 页；历史列表可重开；书签按页名恢复；同一文件换内容后仍按名命中（与 zip 同语义）。
6. **翻页交互**：左右键、点击左右区域、滑动均正常；双开页翻页步进正确。

### 回归

- 目录漫画、zip、cbz、单张图片、视频文件行为不变；
- `pnpm build` 通过，`pnpm type-check` 仍只有既有 7 个错误；
- 浏览器网络面板确认：打开一本 300 页 PDF 只请求当前页与预加载页，**没有**下载整份 PDF；
- 并发打开多本书不出现 503 洪泛（队列按 §5.3 退避）。

## 9. 分阶段实施

### 阶段 1：PDF（含 .cbz 验证）

- 落地：`common/utils/ext.ts`、`server/utils/index.ts`、`types/common.d.ts`、书架三件（FileItem / FileListItem2 / stores/view.ts）、`view.ts` 分派、`book/{index,pages,pdf,cache,errors}.ts`、`renderQueue.ts`、`api.ts` 取页、`thumb.ts` 泛化。
- 先跑一个 spike：`getDocument({data})` → `getViewport` → `@napi-rs/canvas` 渲染 → JPEG，确认 2000px 宽耗时与内存，再进入正式实现。
- DoD：§8 六项在 PDF 上全绿；cbz 走既有 zip 链路回归通过。

### 阶段 2：EPUB

- 落地：`book/epub.ts`、`fast-xml-parser` 依赖、`thumb.ts` 的 EPUB 分支。
- DoD：固定版式/图片型 EPUB 六项全绿；文字版 EPUB 得到 §7 的 415 文案；EPUB 页图不经缓存、不落盘（检查 `data/pages` 无增长）。

### 阶段 3：MOBI（含 azw3 拒绝）

- 落地：`book/mobi.ts`、固定版式判定、azw3 分支。
- DoD：图片型 MOBI 六项全绿；文字版 MOBI、azw3 各自得到 §7 文案；DRM 文件不崩溃。

### 阶段 4：收尾

- 更新 `docs/project-memory.md`（新模块、三条链路之外的第四条"容器书"链路、缓存目录与容量、错误码）；
- 在 `GLOSSARY.md`（若届时存在）补"容器书 / 页图 / 页名"三个术语；
- 观察 `data/pages` 增长与 PM2 内存一周，再决定是否调 `BOOK_PAGE_CACHE_GB` / `BOOK_PDF_MAX_MB`。

## 10. 风险与未决

1. **超大 PDF 内存**：pdfjs 的 Node 用法需要整份 `data`，内存 ≈ 文件大小 × 1.5~2。本 spec 用 `BOOK_PDF_MAX_MB`（默认 250）在打开前拦下，超限 413。若将来必须支持更大文件，需引入 Range transport（`PDFDataRangeTransport` + 自定义读取），那是独立 effort。
2. **@napi-rs/canvas 与 pdfjs 4.x 的契合度**：两者组合在调研里用 spike 验证过，但正式实现需再确认 `canvas.toBuffer("image/jpeg", 80)` 的质量参数是否生效；不生效就换 `sharp(raw RGBA)`，但要评估 64MB 额外拷贝。
3. **EPUB "只有一张图"的 XHTML 判定**：用 XML 统计而非完整解析，少数用 CSS 背景图或 SVG 布局的书会被拒（415 文案可操作）。首版接受，误判取向宁拒不误。
4. **node-stream-zip 中途 `destroy()`**：EPUB 读 magic bytes 依赖它；spike 不通过则退回扩展名判定（服务时再校正），契约不变。
5. **MOBI 5% 阈值**：可能有漫画书因大量文本 record（版权页、后记）逼近阈值被误拒；阈值是常量，可在 §7 的 415 文案指引下转 EPUB。
6. **.rar**：`zipTypeList` 既有 `"rar"` 但 node-stream-zip 不支持，现状是报"压缩包无法读取"；本次不改（已在 Out of scope 之外的历史行为），但新格式接入不引入同类问题。

## 11. 决策追溯

| Spec 章节 | 来源票 |
| --- | --- |
| §2 契约、7 位页名、index 0 起、零页空态 | #4 把非图片容器模拟成 zip 页清单 |
| §3.3 / §5 PDF 渲染参数、缓存、队列、LRU | #5 页图生成与缓存策略 |
| §3.4 EPUB 映射、§3.5 MOBI record | #2 技术可行性（调研底稿） |
| §3.1 出图侧 = 服务端 | #3 页图由哪一侧产出 |
| §2.1 extType、§4 书架三件、§5.2 封面 | #6 书架入口 |
| §7 文案、§3.5 判定、azw3 | #8 MOBI 兜底 |
| 加密/DRM 不考虑 | #7 范围决定 |
| §10.1 超大 PDF 上限（本 spec 合成时定：250MiB 可配置） | #9 收口时补的默认，提交 review 可改 |
