# 视频传输与格式边界（wayfinder #16 研究笔记）

- 研究日期：2026-11-09（规范、MDN、WebKit/Chromium 博客均为当日快照）
- 目标仓库：`jeefyang/view-comic-v2`（Vue 3 + TS 前端，Express 5 后端，Node `^20.19.0 || >=22.12.0`，PM2 fork 单实例、`max_memory_restart "1G"`）
- 约束：**服务端没有 ffmpeg，sharp 不支持视频**；本次只做技术调研，不改业务代码、不加依赖。
- 读法：每节先写「事实」（附一手来源 URL），再写「建议」（本仓库上下文下的取舍）；两者不混写。

## 1. 结论摘要

### 1.1 TL;DR

1. **只承诺一种交付格式：MP4 容器 + H.264(AVC) 视频 + AAC 音频，且必须 `+faststart`**。这是 MDN 明确点名的「每个主流浏览器都广泛支持」的组合[来源 3]，也是唯一能同时覆盖 Chrome/Safari/iOS/Android/桌面的组合。
2. **WebM 不能作为首版承诺**：桌面 Safari 要到 14.1 才能直接播 WebM **文件**（14.0 只在 macOS/iPadOS 上通过 MSE 支持），iPadOS/iOS 侧官方宣布的也只是 MSE 路径，没有宣布可直接播 WebM 文件。可以作为「桌面增强」提供，但不能当默认。
3. **传输层基本已经达标**：`server/routes/api.ts:80` 的 `sendStream()` 已经在普通文件分支上实现了真 206 + `Content-Range` + `Content-Length`，`server/routes/api.ts:212` 会走到它。**缺的是 MIME**：`common/utils/ext.ts:10` 的 `contentTypeList` 没有任何视频类型，`getContentType()` 会回落 `application/octet-stream`，而 MDN 明确说 MIME 设错时视频「可能不显示、或显示一个带 X 的灰框」。
4. **首帧缩略图与时长探测都不要在服务端做**：没有 ffmpeg 就没有 H.264/HEVC 解码器，sharp 也不解视频。可用方案是浏览器侧 `preload="metadata"` + `loadedmetadata` 拿时长/尺寸，需要首帧图时再 `<video>` seek 到 0 并 `canvas.drawImage(video)`（同源 `/file` 不污染 canvas）；代价是必须真的加载一段视频。
5. **iOS 的三条硬限制**：无声/静音才允许自动播放；`<video playsinline>` 才内联播放，否则强制全屏；任意元素的 Fullscreen API 官方只宣布了 macOS/iPadOS（Safari 16.4），iPhone 上视频全屏只能靠原生控件/`webkitEnterFullscreen()`。
6. **多音轨不要做**：`HTMLMediaElement.audioTracks` 在 Chrome 需要开实验 flag、Firefox 需要改 pref，只有 Safari 原生可用——跨浏览器切音轨在 2026 年仍不可行。

### 1.2 首版支持矩阵（事实）

图例：✅ 官方支持且可作默认；⚠️ 有条件支持（设备/版本/需转码）；❌ 不支持或不建议。

| 交付格式 | Chrome 桌面 | Safari 桌面 | iOS Safari | Android Chrome | 首版结论 |
| --- | --- | --- | --- | --- | --- |
| MP4 / H.264 + AAC | ✅ 所有版本 | ✅ 所有版本 | ✅ | ✅ | **唯一承诺** |
| MP4 / H.264，无音轨 | ✅ | ✅ | ✅ | ✅ | ✅（自动播放友好） |
| MP4 / HEVC(H.265) + AAC | ⚠️ 107+，且仅限有硬件解码的设备 | ✅ 11+（macOS High Sierra） | ✅（同代 Safari 版本列车） | ⚠️ 5.0+ 有硬解即可 | ⚠️ 只做兼容输入，不承诺 |
| MP4 或 WebM / AV1 | ⚠️ 70+，实际解码看设备 | ⚠️ 17+，仅 M3 MacBook 及更新 | ⚠️ 仅 iPhone 15 Pro / 16 及更新 | ⚠️ 设备相关 | ❌ 不作为首版交付 |
| WebM / VP9 + Opus（`<video src>` 直链） | ✅ | ⚠️ 14.1+（14.0 只有 MSE） | ❌ 只有 MSE 路径 | ✅ | ⚠️ 桌面可选增强 |
| MOV / QuickTime | ❌ | ⚠️ 只有老版本 Safari | ❌ | ❌ | ❌ 不作为交付格式 |

> 表中「所有版本」照抄 MDN 的支持表（见 §9 来源 [2][3]）；MDN 的容器总表把 MP4/WebM/Ogg 都标成 "All browsers"，但同页明确注明该表**只代表容器、不代表容器里的编码**，所以矩阵按 codec 行给结论。

## 2. 容器与编码（事实）

### 2.1 容器与 MIME

- MP4 的注册/推荐 MIME 是 `video/mp4`（纯音频用 `audio/mp4`），可以带 `codecs` 参数[来源 2][来源 6]。RFC 4337 §2 的选型规则就是「含视频/音频流的文件用 `video/mp4`，只有音频才用 `audio/mp4`」。
- WebM 的 MIME 是 `video/webm` / `audio/webm`；规范要求实现至少支持 VP8/VP9 + Vorbis/Opus[来源 2]；桌面 Safari 直到 14.1 才能直接播 WebM **文件**，14.0 只在 macOS/iPadOS 上通过 MSE 支持[来源 13]。
- QuickTime `.mov` 是 `video/quicktime`；MDN 的容器表注明它「只有老版本 Safari」支持，且 Apple 从 macOS 10.15 起已移除 QuickTime 框架，Apple 自己现在也用 MP4[来源 2]。
- Matroska(`.mkv`) 不在 MDN 的 web 容器表里，没有可依赖的浏览器支持承诺[来源 2]。

### 2.2 视频编码

- **AVC/H.264**：MDN 的版本表写 "All versions of Chrome, Edge, Firefox, Opera, and Safari"；Firefox 依赖操作系统自带的解码器；容器为 3GP/MP4[来源 3]。
- **HEVC/H.265**：版本表为 Chrome 107、Edge 18、Firefox 120、Opera 94、Safari 11。细则很关键：
  - Chrome 只在**有硬件解码支持**的设备上支持（Windows 8+、Linux、ChromeOS），macOS Big Sur 11+ 与 Android 5.0+ 全设备；
  - Edge 在 Win10 1709+ 还要用户装 Microsoft Store 的 HEVC Video Extensions；
  - Firefox 从 Windows 134 / macOS 136 / Linux 137（走系统 ffmpeg）起，Android 137 起且仅硬件；
  - Safari 从 macOS High Sierra 起全设备[来源 3]。
- **AV1**：Chrome 70、Edge 121、Firefox 67、Firefox Android 113、Opera 57、Safari 17*。* 号的含义是 Safari 只在**带硬件解码器**的设备上支持——M3 MacBook 及更新、iPhone 15 Pro、iPhone 16 及更新。Safari 17.0 的发布说明原文："Safari 17.0 adds support for AV1 video on devices with hardware decoding support, like iPhone 15 Pro and iPhone 15 Pro Max."[来源 3][来源 12]
- **VP9**：MDN 写 "All versions of Chrome, Edge, Firefox, Opera, and Safari"，但 Safari 不支持 alpha 透明；容器为 MP4/Ogg/WebM[来源 3]。

### 2.3 音频编码

- **AAC**：有专利授权问题；Firefox 只靠系统/外部库提供，Chrome 只在 MP4 容器里支持 AAC[来源 4]。
- **Opus**：WebM 的规范音频，桌面 Chrome/Firefox/Safari 14.1+ 可用；iOS 上受 §2.1 的 WebM 限制[来源 2][来源 3]。

### 2.4 音轨缺失 / 多音轨

- **没有音轨的视频**在自动播放策略里等同于静音视频，不受拦截[来源 5][来源 9]。
- **静音音轨仍然算音轨**：WebKit 的 macOS 策略原文是 "audio tracks that render silence are still audio tracks"，带静音音轨的视频照样会被拦，必须删除音轨或设置 `muted`[来源 10]。
- **多音轨切换不可移植**：`HTMLMediaElement.audioTracks` 在 MDN 标 "Limited availability"；BCD 里 Chrome 37 起**只在 `#enable-experimental-web-platform-features` 下**可用、Firefox 33 起需要 `media.track.enabled`、Safari 7+ 原生可用[来源 19][来源 20]。

**建议**：首版把「选哪条音轨」放在转码/打包阶段解决，前端只播一条默认音轨；不要做音轨切换 UI。

## 3. Range 与 MIME

### 3.1 规范要求（事实）

- RFC 7233 §2.3：`Accept-Ranges: bytes` 只是**可选宣告**，客户端即使没收到也可以发 `Range`。§3.1 原文："A server MAY ignore the Range header field. However, origin servers and intermediate caches ought to support byte ranges when possible."[来源 14]
- RFC 7233 §4.1：单段 206 **MUST** 带 `Content-Range`；多段必须用 `multipart/byteranges` 且顶层响应**不得**带 `Content-Range`。§4.2：416 要带 `Content-Range: bytes */complete-length`[来源 14]。
- RFC 7233 已被 RFC 9110 废止（RFC 9110 摘要里列了 "obsoletes RFCs … 7233 …"），Range 语义现在在 RFC 9110 §14，条款内容一致[来源 15]。
- RFC 8246：`immutable` 表示在 freshness lifetime 内该表示不会更新，客户端刷新时 SHOULD NOT 发条件请求[来源 16]。

### 3.2 本仓库现状（事实）

- `server/routes/api.ts:41` 的 `parseRange()` 只接受单段 `bytes=start-end` / `bytes=-N`；语法错、`start >= size`、`end < start` 都返回 `"invalid"`。
- `server/routes/api.ts:80` 的 `sendStream()` 统一设置 `Content-Type`、`Accept-Ranges: bytes`、`Cache-Control: public, max-age=31536000, immutable`；invalid → **416 + `Content-Range: bytes */size`**；无 Range → 200 + `Content-Length` 全量；有 Range → **206 + `Content-Range: bytes s-e/size` + `Content-Length: e-s+1`** + `createReadStream(path,{start,end})`。
- `server/routes/api.ts:212` 的普通文件分支（`extData.extType !== "zip"`）走 `sendStream`，**所以视频文件天然具备真 206**。
- 但 `common/utils/ext.ts:10` 的 `contentTypeList` 只有 png/jpg/jpeg/gif/webp/apng/bmp/pdf/epub/mobi/azw3，`getContentType()`（`common/utils/ext.ts:24`）未命中回落 `application/octet-stream`——**没有任何视频 MIME**。
- zip 条目分支（`server/routes/api.ts:245-250`）与容器书分支（`server/routes/api.ts:190-194`）忽略 Range 回 200 全量，但同样带上了 `Accept-Ranges: bytes`。

### 3.3 判断与建议

- **事实层面已合规**：206/416/Content-Range/Content-Length 都对，单段语义与 RFC 7233 §4.1 一致。
- **建议 1（必做）**：给 `contentTypeList` 补 `mp4: video/mp4`、`webm: video/webm`，可选 `mov: video/quicktime`、`m4v: video/mp4`。MDN 明确写："If the MIME type for the video is not set correctly on the server, the video may not show or show a gray box containing an X (if JavaScript is enabled)."[来源 1]
- **建议 2**：多段 Range（`bytes=0-1,5-6`）现在会被判成 `"invalid"` 并回 416，但 RFC 允许服务端直接**忽略** Range 回 200 全量。把「多段」与「不可满足」区分开更稳：前者当无 Range 处理，后者才 416。
- **建议 3**：zip/容器书分支既然不支持切片，就**不要**回 `Accept-Ranges: bytes`（或在没有 Range 支持的分支上显式 `Accept-Ranges: none`）。现在等于向播放器宣告了一个做不到的能力。
- **建议 4**：`immutable` + 一年缓存对 `/file/:editUUID/...` 这种路径是合理的（路径里已含不可变 id）；但前提是**任何情况下都不能把 206 的语义降级成 200 全量**——项目记忆里已经记过一次同类事故（`decodeSize` 的 64KB Range 拿到 200 全量、被缓存一年、渐进式 JPEG 糊图）。视频文件更大，代价更高。

## 4. 首帧与时长

### 4.1 服务端（事实）

- 没有 ffmpeg 就没有 H.264/HEVC 解码器；sharp 只解图片，不解视频。仓库里 `server/utils/thumb.ts` 的 `isImageName()` 只认 `imageTypeList`，缩略图链路完全没有视频分支。
- 唯一可行的服务端路径是**解析容器**（MP4 box，读 `moov` 里的 `mvhd`/`tkhd`/`stsd` 拿时长、尺寸、编码），而不是解码。这需要自写 MP4 box 解析或引入新依赖。
- FFmpeg 官方 mov muxer 文档说明：MOV/MP4 默认把全部元数据放在文件**末尾**，为了更好的播放体验可以用 `+faststart` 移到开头[来源 17]。

### 4.2 浏览器（事实）

- `preload="metadata"` 只取元数据，`loadedmetadata` 后即可读 `videoWidth`/`videoHeight`/`duration`[来源 1]。WebKit 博客称 iOS 8 起已尊重 `preload="metadata"`（能拿到尺寸/时长/轨道）[来源 9]。
- `duration` 的类型语义：没有媒体数据时是 `NaN`，未知时长（直播流）是 `Infinity`[来源 8]。所以 UI 必须处理 `!isFinite(duration)`。
- 首帧缩略图：把 `video.currentTime` seek 到 0（或目标时间），等 `seeked`，再 `ctx.drawImage(video,0,0)` → `canvas.toDataURL()`。**同源**资源不会污染 canvas；跨源且没有 CORS 批准时 canvas 会被 taint，任何读回像素的操作都会抛异常[来源 21]。
- 要精确等「新一帧真的画上去了」，用 `requestVideoFrameCallback()`（BCD：Chrome 83 / Safari 15.4 / Firefox 132，MDN 标 Baseline 2024）[来源 18][来源 22]。
- `poster` 属性：不设时，浏览器会在首帧可用后显示首帧[来源 1]；这是"零成本占位"的唯一官方途径。

### 4.3 建议

- **首版不做服务端缩略图**。给 `<video>` 设 `preload="metadata"`，列表页继续用图标/占位块；需要封面时用 `poster` 指向一张用户手动上传或已有的图片。
- 如果一定要自动首帧：在**播放页**用浏览器侧 canvas 抽帧（同源 `/file` 不需要 `crossorigin`），把 dataURL 存前端缓存，别回写服务端。代价是首次要真的 download 一段视频，长视频首帧可能很慢。
- **时长探测必须容忍 `moov` 在文件尾**：没有 faststart 的文件，浏览器要发一次尾部 Range 才能拿到 `duration`，首帧/时长都会慢一拍。入库/转码时用 `ffprobe` 或 `+faststart` 校验，比运行时兜底便宜。
- 如果将来允许加依赖，优先「只读容器元数据」的纯 JS 库，而不是打包 ffmpeg 二进制（体积/许可/Windows 分发都更重）。这是建议，不是本次结论。

## 5. 大文件与 seek

### 5.1 事实

- `seekable` 与 `buffered` 是两回事：**服务端启用 byte-range 时，没下载的部分也可以是 seekable**。MDN 原文："Some parts of the media may be seekable but not buffered if byte-range requests are enabled on the server."[来源 7]
- 同一页的 NOTE 给了可操作的判据："If it doesn't then `audio.seekable` will be equivalent to `audio.buffered` … If range requests are enabled this value usually becomes the duration of the media almost instantly."[来源 7]
- 浏览器不会为了 seek 下载整个文件（这正是 Range 的意义）；但**具体常驻内存没有一手来源量化**，不要编数字。
- 分段（fragmented）MP4：FFmpeg 文档说 fragmented 输出在写入中断时也可解码、写长文件更省内存，但**兼容性更差**；`-movflags +frag_keyframe+empty_moov` 属于这一族[来源 17]。
- 长视频的两个真实成本在**首帧**（要等 moov）与**seek 精度**（关键帧间隔），不在传输带宽。

### 5.2 建议

- 交付侧：普通（非分段）MP4 + `+faststart`，关键帧间隔控制在 2–5 秒量级；**不要**为了"边下边播"上 fragmented，兼容性收益为负。
- 服务端：不要为视频加"整文件读进内存"的兜底路径；`sendStream` 已经是 `createReadStream(start,end)`，保持流式。
- 前端：进度条用 `seekable`（而不是 `buffered`）画"可跳转范围"，用 `buffered` 画"已缓冲"；两者都可能是多段 `TimeRanges`，要遍历。
- 大文件上限：本次没有找到浏览器/规范的硬上限一手来源，**不写数字**；建议用实际部署环境的反向代理 `client_max_body_size` 与磁盘配额来定，并在 README 里写明"单文件建议 ≤ N GB"由运维定。

## 6. 自动播放与 iOS

### 6.1 事实

- **通用规则**：无音轨或音轨已静音时不受 autoplay 拦截；`play()` 返回 Promise，被拒时 `error.name === "NotAllowedError"`；`Navigator.getAutoplayPolicy()` 返回 `"allowed"` / `"allowed-muted"` / `"disallowed"`[来源 5]。
- **iOS（WebKit，2016，iOS 10 起）**：无音轨的 `<video>` 可自动播放；`<video muted>` 可自动播放；"If a `<video>` element gains an audio track or becomes un-muted without a user gesture, playback will pause."；带 `autoplay` 的元素只在可见时播放，滚出视口会暂停[来源 9]。
- **iPhone 内联播放**：只有加了 `playsinline` 才会在元素区域内播放；没有 `playsinline` 时仍**必须全屏播放**[来源 9]。`playsinline` 的语义就是"在元素区域内播放"，缺省并不保证全屏[来源 1]。
- **macOS（Safari 11 起）**：有声媒体默认拦截自动播放；用户可按站点放行；静音视频在后台标签或离屏时不自动播放；`play()` 的 Promise 被拒要 catch[来源 10]。
- **Chrome**：M66 起对 `<video>`/`<audio>` 生效；允许条件为内容静音或无音轨、用户在本站有过点击/触摸、移动端已添加到主屏、桌面端 MEI 高；iframe 默认只能播静音，需要 `allow="autoplay"`[来源 11]。
- **全屏**：Safari 16.4 的发布说明原文是 "Safari 16.4 now supports the updated and unprefixed Fullscreen API on macOS and iPadOS."——只宣布了 macOS 与 iPadOS，**没有 iPhone**[来源 23]。
- **画中画**：`requestPictureInPicture()` 需要 transient activation，否则 `NotAllowedError`；`HAVE_NOTHING`、无视频轨、`disablePictureInPicture=true` 时 `InvalidStateError`；Permissions Policy 拦截时 `SecurityError`。BCD：Chrome 69 / Chrome Android 105 / Firefox 153 / Safari 13.1，**Firefox Android 与 webview_android 不支持**，MDN 页标 "Limited availability"[来源 24]。
- **布尔属性陷阱**：`autoplay`/`muted`/`playsinline` 都是布尔属性，写 `autoplay="false"` **仍然会生效**，要去掉只能删属性[来源 1]。

### 6.2 建议

- 首版播放器：`<video controls playsinline preload="metadata">`，**不自动播放**；需要自动播放时只对无音轨/静音视频开 `muted autoplay`，并且不要试图在 iOS 上"先自动播放再取消静音"——那会被暂停。
- 所有 `play()` 调用都必须 `.catch()` 并降级到"点一下播放"的 UI；不要假设 Promise 一定 resolve。
- iPhone 全屏不要自己实现：用原生控件（`controls`）或 `webkitEnterFullscreen()`；`document.documentElement.requestFullscreen()` 在 iPhone 上不在官方支持范围内。
- PiP 只做"有就显示"的渐进增强，不作为功能依赖；iOS 上按 BCD 记的 Safari 13.1 与 "limited" 之间的差异**待真机验证**。
- CSP 已经放行 `media-src 'self' data: blob:`（`server/index.ts:69`），不需要改。

## 7. 对 view-comic-v2 的建议

按「改动小 → 收益大」排序，全部是**建议**，本次不动代码：

1. **补 MIME（最小改动，必做）**：`common/utils/ext.ts:10` 增加 `mp4: "video/mp4"`、`webm: "video/webm"`，可选 `mov: "video/quicktime"`、`m4v: "video/mp4"`。否则 `/file` 对视频回 `application/octet-stream`，Safari 上大概率灰框。
2. **补 extType 映射**：`server/utils/index.ts:18` 的 `getFileExt()` 目前只产出 zip/image/pdf/epub/mobi，`"video"` 这个类型（`types/common.d.ts:57`）永远拿不到；前端 `src/views/shelf/components/FileItem.vue:61/93` 已经写好了 `extType === "video"` 的图标与「视频」标签，只差服务端给值。
3. **修 Range 宣称**：zip 条目分支与容器书分支回 200 全量时去掉 `Accept-Ranges: bytes`；多段 Range 当无 Range 处理而不是 416。普通文件分支（视频会走的那条）保持现状。
4. **首版只承诺 MP4/H.264/AAC + faststart**：WebM 作为桌面增强（Safari 14.1+ / Chrome / Firefox），iOS 上不承诺；HEVC/AV1 只做"能播就播"的兼容输入，不做默认。
5. **播放页独立于阅读页**：`src/views/reader/` 的模型是「一页 = 一个 `<img>`」、`sizeMap` 按文件名做键，视频塞进去会污染整套缩放/分页逻辑。建议新增一个轻量播放视图，直接复用 `/file` 直链，不要改 `PagedReader`/`Waterfall`。
6. **缩略图先不做服务端方案**：列表用图标，详情用 `poster`（可选）；自动首帧留作后续用浏览器 canvas 抽帧 + 前端缓存。
7. **测试**：至少覆盖 206 的 `Content-Range`/`Content-Length`、416 的 `bytes */size`、无 Range 的 200、`Content-Type: video/mp4`、以及 iOS Safari 真机上的 `playsinline` 内联播放。Express 对 GET 路由的 HEAD 行为未在本次核实，**待验证**。
8. **不要做的事**：不给服务端加 ffmpeg 依赖；不做多音轨切换；不做 fragmented MP4；不做自定义全屏。

## 8. 仍不确定的点

- Safari 对**多段 Range** 的实际行为、以及 Safari 是否"必须拿到 206 才能 seek"：没有找到一手来源，未验证。
- iPhone 上 `requestPictureInPicture()` 的真实可用性：BCD 把 `safari_ios` 记为 13.1（mirror），但同页标 "limited availability"，两者矛盾，需真机验证。
- 浏览器在长视频 seek/缓冲时的**具体内存占用**：一手来源只讲语义（seekable 与 buffered 独立），没有可引用的数字。
- 没有 faststart 的 MP4 在各浏览器上"多久能拿到 duration"：只有 FFmpeg 的定性说明，没有浏览器侧一手量化。
- 服务端只读 `moov` 拿时长/尺寸的纯 JS 方案：本次没有选型（不改依赖），可行性高但未实测。
- Express 5 对 `HEAD /file/...` 的默认处理：未核实。

## 9. 来源

1. MDN, `<video>` 元素（autoplay/muted/playsinline/poster/preload、MIME 错误导致灰框）— https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video
2. MDN, Media containers（MP4/WebM/QuickTime 的 MIME 与支持表）— https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers
3. MDN, Video codecs（AVC/HEVC/AV1/VP9 版本表与细则）— https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs
4. MDN, Audio codecs（AAC 的专利与容器限制）— https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs
5. MDN, Autoplay guide（静音/无音轨、NotAllowedError、getAutoplayPolicy）— https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
6. RFC 4337, MIME Type Registrations for MPEG-4（`video/mp4` 选型规则）— https://www.rfc-editor.org/rfc/rfc4337
7. MDN, buffering / seeking / TimeRanges（seekable 与 buffered 的关系）— https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/buffering_seeking_time_ranges
8. MDN, `HTMLMediaElement.duration`（NaN / Infinity）— https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/duration
9. WebKit blog, "New video policies for iOS"（2016-07-25，iOS 10 自动播放与 playsinline）— https://webkit.org/blog/6784/new-video-policies-for-ios/
10. WebKit blog, "Auto-play policy changes for macOS"（2017-06-08）— https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/
11. Chromium, Autoplay policy（M66 起的允许条件）— https://www.chromium.org/audio-video/autoplay/
12. WebKit blog, "WebKit Features in Safari 17.0"（AV1 仅硬件解码设备）— https://webkit.org/blog/14445/webkit-features-in-safari-17-0/
13. WebKit blog, "New WebKit Features in Safari 14.1"（macOS 支持 WebM 文件；14.0 只有 MSE）— https://webkit.org/blog/11648/new-webkit-features-in-safari-14-1/
14. RFC 7233, HTTP Range Requests（§2.3 / §3.1 / §4.1 / §4.2）— https://www.rfc-editor.org/rfc/rfc7233
15. RFC 9110, HTTP Semantics（obsoletes 7233；Range 见 §14）— https://www.rfc-editor.org/rfc/rfc9110
16. RFC 8246, HTTP Immutable Responses — https://www.rfc-editor.org/rfc/rfc8246
17. FFmpeg, mov/mp4 muxer 文档（faststart 与 fragmentation）— https://ffmpeg.org/ffmpeg-formats.html#mov_002c-mp4_002c-ismv_002c-3gp_002c-3g2_002c-f4v
18. MDN, `HTMLVideoElement.requestVideoFrameCallback()`（BCD：Chrome 83 / Safari 15.4 / Firefox 132）— https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
19. MDN, `HTMLMediaElement.audioTracks`（Limited availability）— https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks
20. MDN browser-compat-data, `api/HTMLMediaElement.json`（audioTracks 的 flag/pref 细节）— https://github.com/mdn/browser-compat-data/blob/main/api/HTMLMediaElement.json
21. MDN, How to use cross-origin images in a canvas（tainted canvas）— https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image
22. MDN browser-compat-data, `api/HTMLVideoElement.json`（requestPictureInPicture / requestVideoFrameCallback 支持数据）— https://github.com/mdn/browser-compat-data/blob/main/api/HTMLVideoElement.json
23. WebKit blog, "WebKit Features in Safari 16.4"（Fullscreen API 仅 macOS / iPadOS）— https://webkit.org/blog/13966/webkit-features-in-safari-16-4/
24. MDN, `HTMLVideoElement.requestPictureInPicture()`（异常与 Permissions Policy）— https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture
