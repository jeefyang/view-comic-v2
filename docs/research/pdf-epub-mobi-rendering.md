# PDF / EPUB / MOBI 三种格式的出图方案研究

> 仓库原无 research 笔记目录约定，此文件暂放 `docs/research/`。

- 研究日期：2026-11-09（npm / GitHub / 规范数据均为当日快照）
- 目标仓库：`jeefyang/view-comic-v2`（Vue 3 + TS 前端，Express 5 后端，Node `^20.19.0 || >=22.12.0`，PM2 fork 单实例、`max_memory_restart "1G"`）
- 约束：现有书模型是「一本书 = 一组图片页」；这次只做技术调研，不改业务代码。
- **本笔记按 2026-11-09 补充的两个硬约束收窄**：
  1. **不做浏览器端解析**——不允许把整份 PDF/EPUB/MOBI 下载到浏览器再解析，一律「请求第 N 页 → 服务端只返回第 N 页的图片」，与现有 zip 取图一致；
  2. **加密 / DRM 文件一律按「不支持」处理**——检测到即拒绝，不做解密。
- 因此全文重点放在**服务端按页栅格化**（懒渲染、单页内存、首屏延迟、预编译二进制、许可证）；浏览器 pdf.js / epub.js 只在 §2.5 / §3.3 用一段说明为什么被排除。

## 1. 结论先行

### 1.1 推荐（TL;DR）

1. **PDF：服务端按页出图，选 `pdfjs-dist@4.10.38`（legacy build，Apache-2.0）+ ` @napi-rs/canvas `（MIT，预编译二进制）**，配合磁盘缓存。理由：许可干净、Win x64 / Linux x64 都有预编译包、只渲染请求页、页数与页尺寸解析极快、实测内存远低于 PM2 1G 限制。
2. **EPUB：只支持「固定版式（pre-paginated）/一页一图」的 EPUB**，按 spine 顺序把图片条目映射成页，复用现有 zip 页源；reflowable EPUB 没有稳定页概念，按约束 1 也不允许把整本交给浏览器解析，因此直接标记「不支持」——同样**不要**上 puppeteer/playwright 把每章 XHTML 排成图。
3. **MOBI：先做纯 JS 的「固定版式/图片型 MOBI」图片记录抽取**（不动 PalmDOC 文本），只支持无 DRM 文件；其余格式交给用户用 calibre `ebook-convert`（GPL-3.0）离线转换，作为可选外部程序，不打包。
4. **不要引入** `mupdf` / Ghostscript（AGPL-3.0），也**不要把** pdftoppm / ImageMagick 当主路径（Windows 部署不可靠，ImageMagick 读 PDF 还要再挂 Ghostscript）。
5. **两条硬约束贯穿全文**：所有方案都只在服务端读文件、按页出图（浏览器只拿第 N 页 JPEG）；PDF 的 `/Encrypt`、EPUB 的 `META-INF/encryption.xml` / `license.lcpl`、MOBI 的 Encryption Type ≠ 0 一律判为「不支持」，不做解密。

### 1.2 总对比表

| 格式 | 方案 | 许可 | 原生依赖 / 安装体积 | Win x64 / Linux x64 | 按页出图 | 页数 + 页尺寸 | 单页 2000px 内存 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PDF | `pdfjs-dist@4.10.38` + ` @napi-rs/canvas ` | Apache-2.0 + MIT | 预编译 napi；pdfjs 37.2 MB + 平台包 39.8 MB，合计约 77 MB | ✅ / ✅ | ✅ 只渲染 `getPage(n)` | ✅ `numPages` + `getViewport`（实测 35 ms / 37 ms） | 实测 118.8 MB RSS | **推荐** |
| PDF | `mupdf` 1.28.1（官方 WASM） | **AGPL-3.0-or-later** 或商业授权 | 无原生；14.3 MB | ✅ / ✅ | ✅ | ✅ `countPages` + `getBounds` | 未实测，量级同 pdfjs | 许可不可接受 |
| PDF | ` @hyzyla/pdfium ` 3.0.0（WASM） | MIT + pdfium BSD-3-Clause | 无原生；14.1 MB | ✅ / ✅（**Node ≥22**） | ✅ | 页数 ✅；页尺寸需渲染后取 | 未实测 | Node 22 时的轻量备选 |
| PDF | pdfium-native / pdfium-node | MIT | 原生 | 未验证 | ✅ | 未知 | 未实测 | 太新，暂不选 |
| PDF | poppler `pdftoppm` / `pdfinfo` | **GPL-2.0** | 系统包 | ⚠️ 需第三方构建 / ✅ | ✅ `-f/-l` | ✅ `pdfinfo` | 进程级，约 100 MB 级 | 仅 Linux 兜底 |
| PDF | Ghostscript | **AGPL-3.0** | 系统包 | ✅ / ✅ | ✅ `-dFirstPage/-dLastPage` | 需自己解析 | 进程级 | 许可不可接受 |
| PDF | ImageMagick | ImageMagick License（GPLv3 兼容，非 Apache） | 系统包 + 依赖 Ghostscript | ✅ / ✅ | ✅ | ✅ `identify` | 进程级 | 链路太长，不选 |
| PDF | sharp（已装） | Apache-2.0 | 已有 | ✅ / ✅ | ❌ 实测报错 | ❌ | — | 不可用 |
| PDF | 浏览器 pdf.js | Apache-2.0 | 前端 1.7 MB | ✅ / ✅ | 浏览器渲染 | 需整份 PDF | 浏览器内存 | **排除（约束 1）** |
| EPUB | zip + OPF/spine 抽图（自写） | 自有代码 | 0 | ✅ / ✅ | ✅ 仅固定版式 | ✅ spine 数 + 图片头 | 不渲染整页 | **推荐（限固定版式）** |
| EPUB | epub.js 浏览器渲染 | BSD-2-Clause | 0；前端 224 KB | ✅ / ✅ | 浏览器渲染 | 动态分页，无稳定页数 | 浏览器内存 | **排除（约束 1）** |
| EPUB | 服务端 headless 排版 | 各自许可 | Chromium 150 MB+ | ✅ / ✅ | ✅ 但慢 | 需自算 | 数百 MB | 不建议 |
| MOBI | 纯 JS 图片记录抽取（自写） | 自有代码 | 0 | ✅ / ✅ | ✅ 固定版式 | ✅ 图片记录数 + 图片头 | 不渲染 | **推荐（限 comic/固定版式）** |
| MOBI | ` @lingo-reader/mobi-parser ` | MIT | 0；196 KB | ✅ / ✅ | 提供 spine/资源 | ✅ | 不整页解码 | 可选依赖或参考实现 |
| MOBI | calibre `ebook-convert` | **GPL-3.0** | 外部程序 100 MB+ | ✅ / ✅ | 转换后复用 | ✅ 转换后 | — | 兜底/离线 |
| MOBI | KindleUnpack（npm wrapper） | GPL-3.0（wrapper 声明 MIT） | 0 | ✅ / ✅ | ❌ 只解包 | 解包后 | — | 维护与许可都一般 |

### 1.3 最关键的三个数字

- **版本红线**：`pdfjs-dist@4.10.38` 是 Node 20 能用的最后一条线，v5/v6 的 `engines` 要求 `>=22.13.0 || >=24`[来源](https://registry.npmjs.org/pdfjs-dist)。本仓库 engines 下限是 20.19，所以要么锁 4.10.38，要么抬 engines。
- **内存与首屏**：单页 2000px 实测 72 ms / RSS 118.8 MB；整本 14 页顺序渲染（含 JPEG 编码）1,149 ms、峰值 162.0 MB；首屏约 35 ms（打开）+ 82 ms/页 ≈ **120 ms 冷启动**，命中缓存后只是一次磁盘读——PM2 1G 下并发 2 安全（本机 Windows x64 / Node 22.20，见 §2.3）。
- **许可**：`pdfjs` Apache-2.0 + ` @napi-rs/canvas ` MIT 可以放心用；`mupdf` 与 Ghostscript 是 **AGPL-3.0**，poppler 是 **GPL-2.0**，calibre 是 **GPL-3.0**——对 MIT 风格的自托管项目，它们只能作为「用户自备的外部程序」，不能进默认依赖。

## 2. PDF

### 2.1 现有模型与需要动的地方

- `server/routes/api.ts:105` 的 `/file` 路由目前一条路由三种来源：普通文件流（真 Range → 206）、zip 条目（`node-stream-zip`，压缩包内条目做不了切片，忽略 Range 回 200 全量）、目录取首图。PDF 需要在这里**新增一种「页源」分支**：`?page=N` 或路径化页码 → 返回渲染好的 JPEG。
- 前端 `src/utils/fileUrl.ts:40` 的 `buildFileUrl()`、`src/utils/decodeSize.ts:90` 的 `decodeSize()` 和 `src/views/reader/modes/paged/PagedReader.vue` / `Waterfall.vue` 都假定「一页 = 一个 `<img>`」。**服务端出图的最大好处是前端几乎不用改**：只要返回 JPEG，`<img>` 照旧；但页数/页尺寸需要新接口（或让前端跳过 `decodeSize`，直接用页列表里的宽高）。
- 缩略图 `server/utils/thumb.ts` 目前只认「目录 / 图片 / zip」。PDF 要在 `getThumbBuffer()` 里加一个分支：取第 1 页、缩放到目标宽度、走 sharp 落盘。现有策略（按需生成、`data/thumbs/{thumbId}_{width}.jpg`、并发 2 队列 32、超限 503 + `Retry-After: 3`）可以直接复用[来源](docs/project-memory.md)。

### 2.2 方案逐个评估

#### A. `pdfjs-dist`（legacy build）+ ` @napi-rs/canvas `

- **维护状态**：Mozilla 官方，npm 最新 6.5.438；4.10.38 是 v4 线末版（Node 20 可用的最后一条线），仍在维护线上[来源](https://www.npmjs.com/package/pdfjs-dist)。
- **许可**：Apache-2.0[来源](https://github.com/mozilla/pdf.js/blob/master/LICENSE)；` @napi-rs/canvas ` 是 MIT[来源](https://github.com/Brooooooklyn/canvas)。
- **原生编译**：不需要。` @napi-rs/canvas ` 走 napi 预编译，Windows 是 `canvas-win32-x64-msvc`、Linux 是 `canvas-linux-x64-gnu`（Alpine 另有 musl 包）[来源](https://www.npmjs.com/package/@napi-rs/canvas)。
- **Windows x64 / Linux x64**：都开箱可用；唯一坑是 pnpm 默认可能跳过 optional 平台包（实测报 `Cannot find native binding` / `Cannot find module '@napi-rs/canvas-win32-x64-msvc'`，显式 `pnpm add @napi-rs/canvas-win32-x64-msvc` 后正常）。
- **安装体积**：pdfjs-dist 解包 37,211,583 B；`@napi-rs/canvas` 本体 166,133 B；Windows 平台包 39,783,710 B，合计约 77.2 MB（本机实测）。
- **按页渲染**：可以，`getDocument()` → `getPage(n)` → `page.render({ canvasContext, viewport })`，天然只渲染请求页；官方 Node 示例在 `examples/node/pdf2png/pdf2png.mjs`[来源](https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs)。
- **单页 2000px 内存**：实测 118.8 MB RSS（含 PDF 解析与 canvas），详见 §2.3。
- **页数与页尺寸**：`doc.numPages` 直接给页数；`page.getViewport({ scale: 1 })` 给 `width/height`（PDF 点 → px 按 scale 换算）[来源](https://github.com/mozilla/pdf.js/blob/master/types/src/display/api.d.ts)。
- **注意**：Node 侧要用 `pdfjs-dist/legacy/build/pdf.mjs`；cmaps / standard_fonts / wasm 资源目录要随包带上；ESM only。
- **DRM 检测**：加密 PDF 会在 `getDocument()` 阶段抛 `PasswordException`，不需要额外解析器，正好用于约束 2 的「打开即判不支持」[来源](https://github.com/mozilla/pdf.js/blob/master/types/src/display/api.d.ts)。

#### B. `mupdf`（npm 官方包）

- **维护状态**：Artifex 官方，1.28.1，WASM 包，ESM only，Node 14+[来源](https://www.npmjs.com/package/mupdf)。
- **许可**：**AGPL-3.0-or-later 或商业授权**。官方 README 原文：*"if you distribute software that uses mupdf.js, or provide it as a network service, you must release your source code under the AGPL"*，且「许可同时覆盖 JS wrapper 和底层 MuPDF WebAssembly 二进制」[来源](https://github.com/ArtifexSoftware/mupdf.js)。
- **原生编译**：不需要，单 WASM 文件；体积 14,324,000 B。
- **Win/Linux**：都可用（WASM）。
- **按页渲染**：`doc.countPages()`、`doc.loadPage(i)`、`page.toPixmap(matrix, colorspace)`、`pixmap.asPNG()`。
- **页数/尺寸**：`countPages()` + `page.getBounds()`。
- **2000px 内存**：未实测；RGB pixmap 约 1545×2000×3 ≈ 9.3 MB，加上 WASM 堆，量级与 pdfjs 相当。
- **结论**：技术上是最省事的 WASM 方案，但 AGPL 对本项目是硬伤。旧包 `mupdf-js` 已被官方标记 deprecated（最后发布 2024-06-28）[来源](https://www.npmjs.com/package/mupdf-js)。

#### C. pdfium 绑定

- **` @hyzyla/pdfium ` 3.0.0**：MIT wrapper + 内置 `pdfium.wasm`（PDFium 本身 BSD-3-Clause），零依赖，浏览器 + Node，`engines >=22`（作者测试 22/24/26）[来源](https://github.com/hyzyla/pdfium)。
  - 体积 14,122,523 B；WASM 免编译；Win/Linux 都可用，但**要求 Node ≥22**。
  - API：`library.loadDocument(buffer)` → `document.pages()` → `page.render({ scale, render })` 拿 RGBA，自己用 sharp 编码；页尺寸要等 render 回调给 `{data,width,height}` 才知道（或自己解析 PDF 页树）。
  - 适合「Node 22 + 不想装原生包」的备选，成熟度不如 pdf.js。
- **pdfium-native 0.10.0 / pdfium-node 1.2.1**：均为 MIT、2026 年新发布[来源](https://www.npmjs.com/package/pdfium-native)[来源](https://www.npmjs.com/package/pdfium-node)，原生绑定、按平台分包；太新，未验证。
- **` @embedpdf/pdfium `**：面向浏览器 WASM，服务端不作为首选。

#### D. 系统 CLI

| 工具 | 许可 | 按页 | 页数/尺寸 | 平台 | 评价 |
| --- | --- | --- | --- | --- | --- |
| poppler `pdftoppm` | GPL-2.0[来源](https://gitlab.freedesktop.org/poppler/poppler/-/blob/master/COPYING) | `-f` 首页 / `-l` 末页 / `-r` DPI（默认 150）/ `-jpeg` / `-scale-to`[来源](https://manpages.debian.org/bookworm/poppler-utils/pdftoppm.1.en.html) | `pdfinfo` 给 Pages 与 Page size[来源](https://manpages.debian.org/bookworm/poppler-utils/pdfinfo.1.en.html) | Linux 包管理器一行；Windows 需 MSYS2 或第三方 poppler-windows | 每页 fork 一个进程，100–300 ms/页；适合 Linux-only 兜底 |
| Ghostscript | **AGPL-3.0**[来源](https://github.com/ArtifexSoftware/ghostpdl/blob/master/LICENSE) | `-dFirstPage/-dLastPage`[来源](https://ghostscript.readthedocs.io/en/latest/Use.html) | 需自己解析 | 全平台 | 许可不可接受 |
| ImageMagick | ImageMagick License（GPLv3 兼容、需署名，非 Apache）[来源](https://imagemagick.org/license/) | `magick -density 150 "x.pdf[0]" out.jpg` | `identify` | 全平台 | 读 PDF **依赖 Ghostscript**，发行版 `policy.xml` 常禁 PDF[来源](https://imagemagick.org/script/formats.php) |

#### E. 其他仍在维护的库

- **`pdf-to-img` 7.0.2**：MIT，内部就是 `pdfjs-dist ~6.4.299` 封装，省胶水；但继承 Node ≥22.13 的限制[来源](https://www.npmjs.com/package/pdf-to-img)。
- **`pdf2pic` 3.2.0**：MIT，依赖 `gm` + GraphicsMagick/ImageMagick CLI，等于回到 CLI 路线[来源](https://www.npmjs.com/package/pdf2pic)。
- **sharp**：实测本机 sharp 0.35.5 预编译版读 PDF 直接报 `Input file contains unsupported image format`（预编译 libvips 未带 poppler），**不能**用来出图[来源](https://sharp.pixelplumbing.com/api-input)。
- **`pdf-lib` 1.17.1**：MIT，只能创建/修改 PDF，不能栅格化，但可以用来读页数/页尺寸（`PDFDocument.load()` → `getPages()`）[来源](https://www.npmjs.com/package/pdf-lib)。

### 2.3 本机实测（Windows x64 / Node v22.20.0）

环境：`pdfjs-dist@4.10.38` legacy build + ` @napi-rs/canvas@1.1.0 `，样本为 pdf.js 官方 tracemonkey（14 页，全部 612×792 pt，1,016,315 B）。

| 指标 | 结果 |
| --- | --- |
| `getDocument()` 打开 + `numPages` | 35 ms（14 页） |
| 读取全部 14 页 `getViewport({scale:1})` | 37 ms 总计（612×792 pt） |
| 打开后 RSS | 70–85 MB |
| 第 1 页 2000px 高 | viewport 1545.5×2000（scale 2.53）；渲染 72 ms；PNG 919,805 B；JPEG q80 504,070 B；RSS 118.8 MB |
| 全 14 页顺序渲染（每页 `page.cleanup()` + canvas 清零） | 总 1,149 ms（约 82 ms/页）；峰值 RSS 162.0 MB；平均 JPEG 572,475 B |

结论：**单页约 30 MB 瞬时增量，整本 14 页不到 165 MB**，PM2 1G 下并发 2 没有压力。

### 2.4 页数、页尺寸、缩略图（低成本）

- 页数：`getDocument()` 只解析 xref/对象表，不渲染；1 MB / 14 页 35 ms。页数多时依旧是百毫秒级。
- 页尺寸：`getViewport({ scale: 1 })` 只做矩阵计算，不渲染；实测 14 页 37 ms。
- 首屏延迟：冷启动约 35 ms（打开）+ 82 ms（单页渲染含编码）≈ **120 ms**；命中缓存后只剩磁盘读 + 一次 JPEG 传输，和现有 zip 取图同一量级。
- 缓存：把 `{numPages, pages:[{w,h}]}` 存到 `data/pdf-meta/{sha1(path)}.json`，后续列表零解析。
- 缩略图：渲染第 1 页到高 300px（约 3–5 ms），直接 JPEG 编码；落盘规则沿用现有 `thumbId = sha1(库名 + "\0" + 相对路径).slice(0,20)` 即可[来源](docs/project-memory.md)。

### 2.5 浏览器端 pdf.js：为什么被排除（约束 1）

浏览器渲染要把**整份 PDF**（加上 worker 脚本 1,375,838 B、cmaps/字体资源）下载到浏览器再解析，与「服务端只返回第 N 页图片」的约束直接冲突，也把解析与内存压力搬到用户设备；现有 `<img>` 阅读器的适配、双开页、进度、缩略图、预加载还得全部重写。pdf.js 本身许可干净（Apache-2.0，`build/pdf.min.mjs` 352,645 B / gzip 99,034[来源](https://www.npmjs.com/package/pdfjs-dist)），但本方案**不采用**，此处只作记录。

### 2.6 落地建议（不改前端）

- 新增一个 PDF 页源：`/api/file/:uuid/:index/:basePath?page=N&h=2000` → 检查缓存 → 渲染 → JPEG 返回（`Cache-Control` 长缓存，URL 带版本号）。
- 新增页列表接口：`GET /api/pdf/:uuid/:index/:basePath/pages` → `{count, pages:[{w,h}]}`，前端可直接跳过 `decodeSize`（省一个 64 KB Range 连接）。
- 缓存目录 `data/pdf-cache/{bookHash}/{page}@{height}.jpg`，按总大小 LRU 清理；渲染进程内并发 2，与缩略图队列一致，避免和 sharp 抢内存。
- 生产机 OS 未确认：Windows 与 Linux 都要各跑一遍安装与渲染冒烟（canvas 平台包 + 字体）。

## 3. EPUB

### 3.1 规范里的「页」是什么

- EPUB 是 OCF 容器（本质 zip，`mimetype` 必须是第一个条目且不压缩）；阅读顺序由 OPF 的 `spine` 定义：**"The spine element defines an ordered list of manifest item references that represent the default reading order."**，`itemref` 至少一个，`linear="yes"` 是主阅读序列[来源](https://www.w3.org/TR/epub-33/#sec-spine-elem)。
- 默认是 **reflowable**：分页由阅读器视口和字体动态决定，**不存在服务端可复现的「第 N 页」**。
- **fixed-layout / pre-paginated**：`rendition:layout` 为 `pre-paginated` 时，**"reading systems produce exactly one page per spine itemref when rendering"**——这时「一个 spine item = 一页」才成立[来源](https://www.w3.org/TR/epub-33/#sec-fixed-layouts)。
- `page-list` 导航是可选的，给的是「印刷页码边界」，不能当页数用[来源](https://www.w3.org/TR/epub-33/#x7-4-3-the-page-list-nav-element)。
- 固定版式 XHTML 的尺寸来自 **REQUIRED** 的 `<meta name="viewport" content="width=...,height=...">`[来源](https://www.w3.org/TR/epub-33/#sec-fxl-content-dimensions)。

### 3.2 要「像 zip 一样一页一图」必须做什么

**最小可行（推荐）**：只处理固定版式、且每个 spine 文档就是一张 `<img>` 或一个 `<svg><image>` 的 EPUB。

1. 读 `META-INF/container.xml` → OPF 路径 → 解析 `manifest` / `spine`；
2. 按 spine 顺序，对每项取 manifest 的 href：媒体类型是图片 → 直接就是一页；是 XHTML → 解析出 `img[src]` / `svg image[href]`；
3. 只有当「每页恰好一张图、且没有正文文字」时才接受——Komga 就是这么判的：`body().text().length > letterCountThreshold` 直接放弃 divina 模式[来源](https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/EpubExtractor.kt)；
4. 图片条目直接从 zip 解出来，与现有 zip 页源同构。

**做不到的情况**：XHTML 里有文字、CSS 背景图、多图拼版——这些必须真正排版才能变成「页」。

**服务端无头浏览器排版（不推荐）**：puppeteer/playwright 每个实例带 Chromium，安装 150–300 MB、冷启动数百 ms、每页 100–500 ms，还要处理字体、`@font-face`、并发与内存；放进 PM2 单进程 1G 里和现有服务抢内存，得不偿失。只有「必须支持任意 reflowable EPUB 且必须出图」时才考虑，且应做成独立 worker/容器。

### 3.3 epub.js：为什么被排除（约束 1）

epub.js（BSD-2-Clause，`dist/epub.min.js` 223,875 B / gzip 63,810[来源](https://www.npmjs.com/package/epubjs)）在浏览器 iframe 里排版，同样要求先把**整份 EPUB** 交给浏览器解析，违反约束 1；而且它产出的是 DOM 不是图片，喂不进现有图片页模型。**本方案不采用**，只在「未来放开浏览器阅读」时才值得考虑。

### 3.4 DRM：有没有、怎么判断

- **判断顺序**（都在 zip 的 `META-INF/` 下）：
  1. 有 `license.lcpl` → **Readium LCP**（内容 AES-256，`encryption.xml` 里的 `RetrievalMethod` 指向 `license.lcpl#/encryption/content_key`）[来源](https://readium.org/lcp-specs/releases/lcp/latest.html)；
  2. 有 `encryption.xml` 且 `EncryptionMethod` 不是字体混淆的 `http://www.idpf.org/2008/embedding` → 视为加密（Adobe ADEPT 等）[来源](https://www.w3.org/TR/epub-33/#sec-font-obfuscation)；
  3. 有 `rights.xml` → 存在版权信息（可能配合 ADEPT）[来源](https://www.w3.org/TR/epub-33/#sec-container-metainf-rights.xml)；
  4. 字体混淆（`idpf.org/2008/embedding`）**不算 DRM**，可以正常解出图片/文本。
- **LCP 的现实约束**：规范明确 *"Browser based applications cannot integrate LCP, as such applications cannot handle DRM details safely enough"*，且服务端/客户端要做认证并付年费[来源](https://readium.org/lcp-specs/releases/lcp/latest.html)。
- **策略（约束 2）**：检测到任何上述加密 → 该书直接标记「不支持」（可以出现在列表里，但不可读），不进入页列表与渲染流程；接口建议返回 415 或 404 并带明确错误码，不做任何解密/绕过（法律风险）。

### 3.5 页数 / 页尺寸 / 缩略图

- **页数**：固定版式 = spine `itemref` 数（一一对应）；reflowable **没有页数**，只能给「章节数」或按 Komga 的 Readium 估算法（每个 spine 资源按压缩后每 1024 B 算 1 页）做「约 N 页」[来源](https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/EpubExtractor.kt)。
- **页尺寸**：固定版式直接读图片文件头（`image-size` 只需前几十 KB；zip 条目可只解前 64 KB）；XHTML 页读 `viewport` meta。
- **缩略图（最便宜）**：manifest 里 `properties="cover-image"` 的条目直接取出来给 sharp 缩放，零排版、零渲染[来源](https://www.w3.org/TR/epub-33/#sec-cover-image)；没有 cover-image 就取 spine 第一页的图片；再退回 zip 内第一张图片。Kavita 的封面逻辑同样是 `epubBook.Content.Cover ?? first image`（服务端取封面条目，不渲染）。

## 4. MOBI

### 4.1 文件结构

- **容器**：PalmDB（`.mobi/.prc/.azw`），78 字节头 + record 偏移表；record 0 = PalmDOC header（16 B）+ MOBI header + EXTH[来源](https://wiki.mobileread.com/wiki/PDB)[来源](https://wiki.mobileread.com/wiki/MOBI)。
- **PalmDOC header**：偏移 0 压缩方式（1 无、2 PalmDOC、17480 HUFF/CDIC）、4 文本长度、8 文本 record 数、10 record 大小（4096）；在 MOBI 里偏移 12 变成 **Encryption Type**（0 无、1 旧 Mobipocket、2 Mobipocket）[来源](https://wiki.mobileread.com/wiki/PalmDOC)。
- **MOBI header**：0x6C 第一个图片 record 号；0xa8 DRM Offset、0xac DRM Count（无 DRM 都是 0xFFFFFFFF）[来源](https://wiki.mobileread.com/wiki/MOBI)。
- **EXTH**：121 KF8 边界、122 `fixed-layout`、123 `book-type="comic"`、125 资源数、126 `original-resolution`、**201 coveroffset**（加到 first image index 上就是封面 record）、202 thumboffset、203 hasfakecover[来源](https://wiki.mobileread.com/wiki/MOBI)。
- **图片 records**：紧跟文本 records，**每张图一个 record**；「4096 的 record 大小只约束文本 record，图片 record 可以更大」[来源](https://wiki.mobileread.com/wiki/MOBI)。

### 4.2 纯 JS 解析是否现实

- **元数据 / 页数 / 封面**：只读 record 0 与偏移表，几百行，非常现实。
- **图片抽取**：不需要解 PalmDOC 文本——`recindex` 是 **1-based**，目标 record = `firstImageIndex + recindex - 1`；KindleUnpack 的 `lib/mobi_html.py` 就是 `imageName = rscnames[imageNumber-1]`[来源](https://github.com/kevinhendricks/KindleUnpack/blob/master/lib/mobi_html.py)；calibre 的 `src/calibre/ebooks/mobi/reader/mobi6.py` 里 `extract_images()` 从 `first_image_index` 开始遍历 record，跳过 `FLIS/FCIS/SRCS/RESC/BOUN/FDST/DATP/AUDI/VIDE` 等非图片 magic，按 magic 判断图片类型[来源](https://github.com/kovidgoyal/calibre/blob/master/src/calibre/ebooks/mobi/reader/mobi6.py)。
- **文本排版**：PalmDOC 解压 + HTML + 分页，纯 JS 可行但工程量大；**固定版式漫画不需要**。
- **结论**：只做「固定版式 / 图片型 MOBI」时纯 JS 完全现实；reflowable MOBI 不建议自己做。

### 4.3 现有工具

| 工具 | 许可 | 维护 | 能力 | 用法 |
| --- | --- | --- | --- | --- |
| calibre `ebook-convert` | GPL-3.0[来源](https://github.com/kovidgoyal/calibre/blob/master/LICENSE) | 活跃 | mobi/azw3 → epub/pdf，质量最好 | 外部程序，用户自备；不打包 |
| KindleUnpack | GPL-3.0 | 活跃（Python） | 拆 KF8-only azw3 成 epub-like；dual 拆分；`-i` 高清图、`-s` 拆分[来源](https://github.com/kevinhendricks/KindleUnpack) | 可离线用 |
| npm `kindleunpack` 1.0.5 | wrapper MIT，内含 GPL 代码 | 最后发布 2023-02-17 | 同上，Node 调用 | 许可与维护都一般 |
| ` @lingo-reader/mobi-parser ` 0.4.6 | MIT | 2026-04 发布 | 同时解析 MOBI 与 KF8，基于 foliate-js `mobi.js`；提供 `getSpine/loadChapter/getCoverImage`，资源落盘[来源](https://www.npmjs.com/package/@lingo-reader/mobi-parser) | 可作依赖或参考实现 |
| npm `mobi` | — | 0.0.1（2015） | 已死 | 不要用 |

### 4.4 图片资源怎么取（recindex / EXTH 201）

1. 读 MOBI header 的 `firstImageIndex`；没有（老 BAEN 文件）就从 0 开始兜底；
2. HTML 里的 `<img recindex="00003">` → 第 `firstImageIndex + 3 - 1` 个 PDB record；
3. 用 magic 校验（JPEG `FF D8 FF`、PNG、GIF、BMP），跳过 FLIS/FCIS/SRCS 等；
4. 封面优先用 **EXTH 201**（`coveroffset + firstImageIndex`），其次第一张图；EXTH 202 是缩略图，203 表示有假封面[来源](https://wiki.mobileread.com/wiki/MOBI)。
5. 不需要解压文本 record，也就能在毫秒级拿到「第 N 页图片」——前提是固定版式（一图一页）。

### 4.5 azw3 / KF8 是否顺带覆盖

- KF8 是 MOBI 的 EPUB3 化分支，支持 HTML5/CSS3/SVG，也有「fixed layout」，但和 EPUB 的 fixed-layout 不完全一样[来源](https://wiki.mobileread.com/wiki/KF8)。
- KindleGen 产物常是 **KF7 + KF8 双格式**（EXTH 121 指向 KF8 边界），KindleUnpack 能拆分；` @lingo-reader/mobi-parser ` 也声明同时解析两者。
- 对「一页一图」：KF8 的图片资源同样在 record 里（EXTH 125 资源数），但页面是 XHTML——**只有固定版式才有稳定页映射**；普通 KF8 小说不该走图片页模型。

### 4.6 DRM

- 判断：PalmDOC 偏移 12 的 Encryption Type ≠ 0，或 MOBI header 的 DRM Offset/Count 不是 0xFFFFFFFF[来源](https://wiki.mobileread.com/wiki/MOBI)。
- 现实：Mobipocket PID、Kindle 账号密钥，**没有合法开源解密路径**；MOBI 的 DRM 只保护正文，元数据仍可读，但图片也属于加密内容。
- 策略（约束 2）：record 0 里几个字节就能判定，检测到加密即拒绝（415/404），提示「请用已授权工具自行转换」，不在服务端做任何解密。

### 4.7 页数 / 页尺寸 / 缩略图

- **页数**：固定版式 comic ≈ 图片 record 数（或 EXTH 125 资源数）；reflowable MOBI 只有 location/position，没有页。
- **页尺寸**：对每张图片只读文件头（`image-size`，JPEG SOF / PNG IHDR），不需要完整解码；也可以用 EXTH 126 的 `original-resolution` 作为整本参考[来源](https://wiki.mobileread.com/wiki/MOBI)。
- **缩略图**：EXTH 201 指向的 record 直接取字节 → sharp；没有就用 first image index 那张；完全不用解析正文。

## 5. 同类自托管项目怎么做（读源码，不看二手博客）

| 项目 | PDF | EPUB | MOBI | 页模型 / 缓存 |
| --- | --- | --- | --- | --- |
| **Komga** | PDFBox 3.0.8，**服务端按页渲染**，只渲染请求页；`Accept: application/pdf` 时可回原始页[来源](https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/BookController.kt) | 浏览器端 R2D2BC（`@d-i-t-a/reader` fork）在 iframe 里排版；另有一套 divina 模式，把「固定版式且每页一张图」的 EPUB 抽成图片页[来源](https://github.com/gotson/komga/blob/master/komga-webui/src/views/EpubReader.vue) | 不支持 | `BookPage(fileName, mediaType, dimension, hash, size)`；PDF 页按需渲染，EPUB 页 = spine/图片路径[来源](https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/domain/model/BookPage.kt) |
| **Kavita** | Docnet.Core（PDFium）**预渲染整本**为 `Page-N.png`，默认 1080×1920，并行 4；章节级缓存 | 服务端返回每章 XHTML（VersOne.Epub），浏览器渲染，不出图 | 本次只核对 PDF/EPUB 路径，MOBI 未在源码中确认 | `CacheService.Ensure(chapterId, extractPdfToImages)` 把章节解到缓存目录[来源](https://github.com/Kareadita/Kavita/blob/develop/Kavita.Services/BookService.cs) |
| **calibre-web** | 浏览器 pdf.js（`readpdf.html` 加载 `pdf.js + viewer.js + #viewerContainer.pdfViewer`） | 浏览器 epub.js（`read.html`） | 未核对阅读路径 | 不预渲染，页在浏览器里 |
| **LANraragi** | libvips `pdfload_page_dpi(…, 200)` → JPEG q80；页数用 `vips_image_get_n_pages`（只读头）[来源](https://github.com/Difegue/LANraragi/blob/master/lib/LANraragi/Utils/Archive.pm) | 「barebones support」 | 不支持 | 合成 `1.jpg … N.jpg` 的假文件列表 |
| **Suwayomi** | 不支持 | 不支持 | 不支持 | 只跑 Mihon/Tachiyomi 漫画扩展 |

**共同点**：

- 没有一家把 reflowable EPUB/MOBI 在服务端排版成图片；
- PDF 要么服务端出图（Komga、Kavita、LANraragi），要么浏览器 pdf.js（calibre-web）；
- 缓存都是「按需 + 磁盘」，没有把整本预渲染当默认。

## 6. 许可与部署风险

### 6.1 许可汇总

| 组件 | 许可 | 触发条件 | 对本项目意味着什么 |
| --- | --- | --- | --- |
| pdfjs-dist | Apache-2.0 | 分发需保留 NOTICE/许可 | ✅ 可闭源/自托管 |
| ` @napi-rs/canvas ` | MIT | 保留版权声明 | ✅ |
| pdfium（` @hyzyla/pdfium ` 内置） | BSD-3-Clause | 保留版权/免责声明 | ✅ |
| PDFBox（Komga 用） | Apache-2.0 | — | ✅（若走 Java 方案） |
| epub.js | BSD-2-Clause | 保留版权 | ✅ |
| **mupdf / mupdf.js** | **AGPL-3.0-or-later** | **分发或提供网络服务即触发** | ❌ 整个服务需按 AGPL 开源 |
| **Ghostscript** | **AGPL-3.0** | 同上 | ❌ |
| **poppler** | **GPL-2.0** | 分发二进制需提供源码 | ⚠️ 只能外部程序，不打包 |
| **calibre** | **GPL-3.0** | 分发需提供源码 | ⚠️ 用户自备外部程序 |
| **KindleUnpack** | **GPL-3.0** | 同上 | ⚠️ 不做默认依赖 |
| ImageMagick | ImageMagick License | 分发需附许可与署名 | ⚠️ 且读 PDF 依赖 Ghostscript |

### 6.2 AGPL/GPL 对 MIT 风格自托管项目意味着什么

- **AGPL 的网络条款**：只要用户「通过网络与之交互」，就必须向这些用户提供 Corresponding Source。自托管给团队内部用也通常落入「网络服务」，不只是「分发二进制才触发」[来源](https://www.gnu.org/licenses/agpl-3.0.html)。
- 因此把 `mupdf` 或 Ghostscript 放进默认依赖，等于要求整个 view-comic-v2 以 AGPL 开源——与项目现在的许可状态（仓库里**没有 LICENSE 文件、package.json 没有 license 字段**）冲突，也不符合「MIT 风格」的预期。
- **GPL-2.0 的 poppler**：作为独立进程调用通常不传染（社区惯例），但**分发** poppler 二进制时要满足 GPL（提供源码或书面报价）；最稳妥是「检测到就提示用户自行安装」。
- **结论**：核心路径只用 Apache-2.0 / MIT / BSD；GPL/AGPL 方案一律降级为「用户自备外部程序」的可选后端，并在 README 写清楚。

### 6.3 WASM 与原生二进制的部署差异

| 维度 | WASM（mupdf / @hyzyla/pdfium） | 原生预编译（@napi-rs/canvas） |
| --- | --- | --- |
| 跨平台 | 一份文件通吃 | 每个平台一个包（win32-x64-msvc / linux-x64-gnu / musl…） |
| 安装 | 无需编译 | 无需编译，但必须装对 optional 平台包 |
| 冷启动 | 需加载/编译 wasm，100–300 ms 级 | 直接 dlopen，毫秒级 |
| 内存上限 | wasm32 4 GB 地址空间 | 受进程/系统限制 |
| 调试 | 难（无原生栈） | 相对容易 |
| 体积 | 14 MB 级 | 平台包 37–40 MB 级 |

本仓库是 Windows 开发 + 生产 OS 未确认：如果生产是 Linux x64（glibc），` @napi-rs/canvas ` 有现成包；若是 Alpine（musl）要换 musl 包。WASM 方案没有这个烦恼，但换来 Node 版本/许可约束。

### 6.4 本仓库部署风险清单

1. **Node 版本**：pdfjs 5/6 与 ` @hyzyla/pdfium ` 都要 Node ≥22；本仓库 engines 还写着 20.19。选 4.10.38 就维持现状，否则升 engines 并验证 PM2 机器。
2. **pnpm optional 依赖**：` @napi-rs/canvas ` 的平台包必须真实安装（CI、`--no-optional`、镜像裁剪都会踩）。
3. **内存**：实测整本 14 页峰值 162 MB，PM2 1G 安全；但并发渲染要限 2，且与缩略图队列共享预算。
4. **CSP**：当前「服务端出图」方案不需要任何新 CSP 指令；只有将来放开浏览器渲染才需要为 pdf.js worker 补 `worker-src blob:`（现有 CSP 已为缩略图放行 `img-src blob:`）。
5. **缓存目录**：`data/pdf-cache/` 与 `data/thumbs/` 都要 LRU/定期清理，避免 1G 磁盘/内存之外的第三处膨胀。
6. **生产 OS 未确认**：Windows 与 Linux 各做一次安装 + 渲染 + 中文/日文字体冒烟（PDF 字体嵌入缺失时会走 standard_fonts）。
7. **许可文件**：仓库当前无 LICENSE；若确定 MIT 风格，建议补 LICENSE 并在 README 声明「可选外部程序（calibre/poppler）由用户自行安装，遵循其各自许可」。

## 7. 参考来源

**规范 / 官方文档**

1. W3C EPUB 3.3（spine、fixed-layout、page-list、viewport、rights.xml、字体混淆）— https://www.w3.org/TR/epub-33/
2. Readium LCP 规范（license.lcpl、AES-256、浏览器限制、年费）— https://readium.org/lcp-specs/releases/lcp/latest.html
3. MobileRead MOBI（header、EXTH 201/202、image records、DRM）— https://wiki.mobileread.com/wiki/MOBI
4. MobileRead PDB — https://wiki.mobileread.com/wiki/PDB
5. MobileRead PalmDOC（压缩、Encryption Type）— https://wiki.mobileread.com/wiki/PalmDOC
6. MobileRead KF8 — https://wiki.mobileread.com/wiki/KF8
7. pdf.js 官方 Node 示例 `examples/node/pdf2png/pdf2png.mjs` — https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs
8. pdf.js 类型定义（workerSrc 必须设置）— https://github.com/mozilla/pdf.js/blob/master/types/src/display/worker_options.d.ts
9. pdftoppm man page（-f/-l/-r/-jpeg/-scale-to）— https://manpages.debian.org/bookworm/poppler-utils/pdftoppm.1.en.html
10. pdfinfo man page — https://manpages.debian.org/bookworm/poppler-utils/pdfinfo.1.en.html
11. Ghostscript Use（-dFirstPage/-dLastPage）— https://ghostscript.readthedocs.io/en/latest/Use.html
12. ImageMagick formats（PDF 需 Ghostscript）— https://imagemagick.org/script/formats.php
13. GNU AGPL-3.0 原文（网络条款 §13）— https://www.gnu.org/licenses/agpl-3.0.html

**npm / 仓库**

14. pdfjs-dist — https://www.npmjs.com/package/pdfjs-dist ；https://registry.npmjs.org/pdfjs-dist
15. pdf.js LICENSE — https://github.com/mozilla/pdf.js/blob/master/LICENSE
16. ` @napi-rs/canvas ` — https://github.com/Brooooooklyn/canvas
17. mupdf（AGPL/商业双许可说明）— https://github.com/ArtifexSoftware/mupdf.js ；https://www.npmjs.com/package/mupdf
18. mupdf-js（已 deprecated）— https://www.npmjs.com/package/mupdf-js
19. ` @hyzyla/pdfium ` — https://github.com/hyzyla/pdfium
20. pdfium LICENSE（BSD-3-Clause）— https://github.com/chromium/pdfium/blob/main/LICENSE
21. pdfium-native — https://www.npmjs.com/package/pdfium-native
22. pdfium-node — https://www.npmjs.com/package/pdfium-node
23. pdf-to-img — https://www.npmjs.com/package/pdf-to-img
24. pdf2pic — https://www.npmjs.com/package/pdf2pic
25. pdf-lib — https://www.npmjs.com/package/pdf-lib
26. epubjs — https://www.npmjs.com/package/epubjs
27. ` @lingo-reader/mobi-parser ` — https://www.npmjs.com/package/@lingo-reader/mobi-parser
28. foliate-js `mobi.js` — https://github.com/johnfactotum/foliate-js/blob/main/mobi.js
29. KindleUnpack（GPL-3.0、KF8 拆分、HDImages）— https://github.com/kevinhendricks/KindleUnpack
30. KindleUnpack `lib/mobi_html.py`（recindex → record）— https://github.com/kevinhendricks/KindleUnpack/blob/master/lib/mobi_html.py
31. calibre LICENSE（GPL-3.0）— https://github.com/kovidgoyal/calibre/blob/master/LICENSE
32. calibre `src/calibre/ebooks/mobi/reader/mobi6.py`（extract_images / first_image_index）— https://github.com/kovidgoyal/calibre/blob/master/src/calibre/ebooks/mobi/reader/mobi6.py
33. npm kindleunpack — https://www.npmjs.com/package/kindleunpack
34. poppler COPYING（GPL-2.0）— https://gitlab.freedesktop.org/poppler/poppler/-/blob/master/COPYING
35. Ghostscript LICENSE（AGPL-3.0）— https://github.com/ArtifexSoftware/ghostpdl/blob/master/LICENSE
36. ImageMagick License — https://imagemagick.org/license/

**同类项目源码**

37. Komga PDF 抽取 `PdfExtractor.kt` — https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/pdf/PdfExtractor.kt
38. Komga EPUB 抽取 `EpubExtractor.kt`（divina、fixed-layout、Readium 估页）— https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/infrastructure/mediacontainer/epub/EpubExtractor.kt
39. Komga `BookPage.kt` — https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/domain/model/BookPage.kt
40. Komga `BookController.kt`（/pages、/pages/{n}、thumbnail）— https://github.com/gotson/komga/blob/master/komga/src/main/kotlin/org/gotson/komga/interfaces/api/rest/BookController.kt
41. Komga `EpubReader.vue`（R2D2BC）— https://github.com/gotson/komga/blob/master/komga-webui/src/views/EpubReader.vue
42. Kavita `BookService.cs`（ExtractPdfImages、Page-N.png、EPUB XHTML）— https://github.com/Kareadita/Kavita/blob/develop/Kavita.Services/BookService.cs
43. Kavita `PdfRenderResolution.cs`（1080×1920 等）— https://github.com/Kareadita/Kavita/blob/develop/Kavita.Models/Entities/Enums/PdfRenderResolution.cs
44. Kavita `CacheService.cs` — https://github.com/Kareadita/Kavita/blob/develop/Kavita.Services/CacheService.cs
45. calibre-web `readpdf.html` — https://github.com/janeczku/calibre-web/blob/master/cps/themes/standard/templates/readpdf.html
46. calibre-web `read.html` — https://github.com/janeczku/calibre-web/blob/master/cps/themes/standard/templates/read.html
47. LANraragi `Utils/Archive.pm`（vips pdfload、假页列表）— https://github.com/Difegue/LANraragi/blob/master/lib/LANraragi/Utils/Archive.pm
48. Suwayomi-Server（仅漫画扩展）— https://github.com/Suwayomi/Suwayomi-Server

**本仓库内依据**

49. `server/routes/api.ts:105`（/file 三来源）
50. `src/utils/fileUrl.ts:40`（buildFileUrl）
51. `src/utils/decodeSize.ts:90`（Range 64 KB 探测）
52. `server/utils/thumb.ts`（缩略图落盘规则）
53. `docs/project-memory.md`（PM2 1G、CSP、zip 条目 200、缩略图队列）
54. `ecosystem.config.cjs`（fork 单实例、max_memory_restart）

---

### 附：本次实测环境

- Windows x64，Node v22.20.0，pnpm；`pdfjs-dist@4.10.38` + ` @napi-rs/canvas@1.1.0 `（含 `canvas-win32-x64-msvc`）。
- 样本：pdf.js 官方 tracemonkey.pdf（14 页，612×792 pt，1,016,315 B）。
- 测法：`getDocument()` → 逐页 `getPage()` → `getViewport({ scale: 2000 / 792 })` → `page.render()` → `toBuffer("image/jpeg", 80)`，每页后 `page.cleanup()` 并清零 canvas；RSS 用 `process.memoryUsage().rss` 采样。
