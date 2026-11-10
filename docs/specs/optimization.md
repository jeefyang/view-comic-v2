# view-comic-v2 优化规格（媒体缓存与视频接入）

> 状态：可交接（wayfinder 地图 [#13](https://github.com/jeefyang/view-comic-v2/issues/13) 的收口产物）
> 决策来源：[优化清单与优先级](https://github.com/jeefyang/view-comic-v2/issues/14)、[视频页模型与混排](https://github.com/jeefyang/view-comic-v2/issues/15)、[视频传输与格式边界](https://github.com/jeefyang/view-comic-v2/issues/16)、[播放器交互（瀑布流/单页）](https://github.com/jeefyang/view-comic-v2/issues/17)、[媒体缓存范围与策略](https://github.com/jeefyang/view-comic-v2/issues/18)、[媒体缓存技术选型](https://github.com/jeefyang/view-comic-v2/issues/19)、[页图取数热路径](https://github.com/jeefyang/view-comic-v2/issues/20)、[大图浏览的剩余策略（路径修复后）](https://github.com/jeefyang/view-comic-v2/issues/21)、[缓存预算的图片预留与多用户边界](https://github.com/jeefyang/view-comic-v2/issues/23)
> 调研底稿（在未合并的 research 分支上）：[video-playback.md](https://github.com/jeefyang/view-comic-v2/blob/67b6cf2/docs/research/video-playback.md)（分支 `research/video-playback`）、[media-cache.md](https://github.com/jeefyang/view-comic-v2/blob/3672895/docs/research/media-cache.md)（分支 `research/media-cache`）
> 实现状态：单页视频播放、五位置播放按钮、旋转 contain、服务端中间帧视频缩略图已在 PR [#25](https://github.com/jeefyang/view-comic-v2/pull/25)（`5815614`，分支 `feat/video-paged-player`）实现，尚未合并；页图热路径（目录清单 LRU、越界 404、zip 图片 206 + 客户端限读）已合并到 main（PR [#27](https://github.com/jeefyang/view-comic-v2/pull/27)，`9c6b67e`）；瀑布流移动端修复已在分支 `feat/waterfall-mobile-fix` 实现，待真机验证与合并；媒体缓存尚未实现。
> 本文只写决策、契约与验收，不写实现步骤；落地时遵循 `AGENTS.md` 与 `docs/project-memory.md` 的既有约定。容量单位按 1024 进制（2GiB = 2147483648 B，500MB = 524288000 B）。

## 1. 目标与非目标

### 目标

1. 降低阅读页打开与滚动的固定开销，尤其是大页数目录书、zip 书。
2. 让大图浏览在路径编码修复后保持可用；不再为“打不开”引入服务端降采样。
3. 增加**有界**媒体缓存：阅读页图片（含 WebP/APNG 动图）与视频，命中时少走网络，重复浏览更快；不是离线阅读。
4. 让视频成为阅读页序列中的一种普通页：目录书、zip 内小视频、独立视频都能进入 `readerPages`，进度/书签/历史仍按页。
5. 单页模式提供最小可用播放体验：自动播放、静音循环、离开暂停、点击暂停/继续、最多一个在播；瀑布流首版明确提示切单页。
6. 修复瀑布流在移动端的横向滚动条与长按选中问题。
7. 给出一份可交接的优先级、验收、风险与明确不做清单。

### 非目标

- 离线阅读、整本下载、Service Worker/PWA。
- 视频转码、AVI/MKV 支持、服务端媒体处理流水线。
- 视频进度条、seek、音量、全屏、原生 controls、时长显示。
- 动图的暂停/播放控制。
- 代码健康清理（7 个 tsc 基线、JsonConfig 空接口、rar 当普通文件）。
- PDF/EPUB/MOBI 的功能补全（CJK 字体、azw3、MOBI 版式）。

完整边界见 §10。

## 2. 优先级与交付边界

| 项 | 内容 | 优先级 | 本 spec 的状态 |
| --- | --- | --- | --- |
| C1 | 目录书页清单服务端 LRU + 越界 404 | P0 | 已合并（PR #27） |
| C2 | zip 图片尺寸探测真 206 + 客户端限读 | P0 | 已合并（PR #27） |
| C5 | 视频原生格式、页模型、单页播放器、缩略图 | P0 | 已在 PR #25 实现（待合并）；本 spec 固化行为 |
| C7 | 有界媒体缓存（图片 + 视频） | P0 | 决策完成，待实现 |
| C10 | 瀑布流移动端横向滚动条 + 禁止选中 | P0 | 已实现，待真机验证与合并（`feat/waterfall-mobile-fix`） |
| C3 | 页表尺寸从主 `view` 拆成紧凑 localStorage | P1 | 决策完成，待实现 |
| C4 | 首屏/传输（静态 import、主包体积、compression） | P1 | 只定优先级，方案未决；不纳入本 spec 验收 |
| C9 | 大图浏览 | 验证项 | 已由 4250d35 修复；本次不改代码 |
| C6 | 离线/整本下载 | Out | 不做 |
| C8 | 代码健康 | Out | 本次不做 |

落地顺序（不是新决策，只用于交接排期）：页图热路径的 404、zip 206、目录 LRU 已合并到 main（PR #27）；页表（P1）随后；瀑布流修复已在 `feat/waterfall-mobile-fix` 实现，待真机验证；媒体缓存最后做，因为它依赖页身份与视频路径稳定。视频单页播放器已在 PR #25 落地，不需要重做。

## 3. 页图取数热路径

### 3.1 目录书页清单：服务端内存 LRU

**问题**：目录书每取一张图都会重新 `readdirSync` 整个目录，并对每个条目 `statSync`；3000 页的书每取 1 张图就是约 3000 次 stat。位置：`server/routes/api.ts:143-150`、`server/utils/view.ts:42/45-47/10`。

**决策**：

| 项 | 规则 |
| --- | --- |
| 缓存位置 | 服务端进程内存；不新增客户端页清单 IndexedDB |
| 键 | 书库内绝对目录路径（已经过 `resolveInsideRoot` 校验） |
| 值 | 该目录的媒体页清单：`name` / `extType` / `ext` / `size`，保持 `readdirSync` 原始顺序（index 才稳定） |
| 失效 | 每次命中先用目录自身 `fs.statSync(dir)` 的 `mtimeMs + size` 校验；不一致就重建。只改文件内容不改目录 mtime，不需要重建 |
| 上限 | LRU 最多 200 个目录，且总缓存条目最多 50,000；超出淘汰最久未用目录 |
| 范围 | 只缓存目录书；zip 继续使用现有 `getMyStreamZip` 实例缓存 |
| 取图 | `/api/file` 目录分支改为“取缓存清单 → 判越界 → 拼文件名”，每请求只付一次目录 stat |

**验收**：

- 3000 页目录书连续取 10 张不同图，服务端每次只对目录做 1 次 `stat`，不再 `readdir` 全目录、不再逐条 `stat`。
- 目录中新增/删除/重命名文件后，下一次取图能反映新页序；仅修改某张图片内容不影响页序。
- 超过 200 个目录或 50,000 条时，旧目录被淘汰且不返回错误。
- 目录书与 zip 书的现有排序、双开页、缩略图、进度行为不变。

### 3.2 zip 图片：真 206 前缀 + 客户端限读

**问题**：zip 条目当前忽略 Range 回 200 全量，却仍宣告 `Accept-Ranges: bytes`；`decodeSize` 以为只拿 64KB，实际整图下载。位置：`server/routes/api.ts:242-250`、`src/utils/decodeSize.ts:60-69`。

**决策**：

| 请求 | 响应 |
| --- | --- |
| zip 图片，`Range: bytes=0-<end>` 且从 0 开始 | 解压并只发送前 `end+1` 字节；回 `206`，带正确的 `Content-Range: bytes 0-end/<entry.size>` 与 `Content-Length`；到量后销毁解压流并 `finishStream` |
| zip 视频 | 不做 206；回 200 全量，并**移除** `Accept-Ranges: bytes`，不再宣告假能力 |
| 其他 zip Range（非 0 起点、多段等） | 忽略 Range，回 200 全量（HTTP 允许） |

客户端 `decodeSize`：

- 不再 `await response.arrayBuffer()` 整份读取；
- 用 `response.body.getReader()` 最多读 64KB 就 `cancel()`；即使服务端回 200，也只付前缀流量；
- 206/200 都能解析图片头部；206 额外校验 `Content-Range` 的总大小，防止截断；
- zip 中央目录只有未压缩 `size`、没有图片宽高，因此不新增尺寸接口、不做服务端全量解码；尺寸仍由客户端从图片头部解析。

**验收**：

- zip 图片请求 `Range: bytes=0-65535` 返回 206，`Content-Range` 总大小等于条目未压缩大小，响应体不超过 65536 字节。
- 同一张 zip 图，`decodeSize` 实际读取不超过 64KB（不含 HTTP 头），图片仍能正常显示。
- zip 视频响应为 200 全量、无 `Accept-Ranges`；播放器不承诺 seek。
- 非 0 起点或多段 Range 不被误当成前缀请求，回 200 全量且不破坏文件。

### 3.3 页表尺寸：紧凑 localStorage

**问题**：`view` 把每页 `width/height` 塞进整份 `comicFileList`，每次保存整份 `JSON.stringify`；超大书有 5MB 配额和主线程序列化风险。位置：`src/stores/view.ts:51-57`、`Waterfall.vue:301-313`。

**决策**：

- `view` 只保留结构：书身份、`basePath`、`baseFile`、页名/index 等；不再存每页宽高。
- 新增按书键的紧凑尺寸表：`view:sizes:<editUUID>:<basePath>:<baseFile.name>`，值为 `[[name, w, h], …]`。
- 只保留最近 10 本尺寸表，按 `view:sizes:lru` 淘汰；`mergeCachedSize` 保留，但改为读尺寸表。
- 旧数据首次加载时迁移：把每页宽高搬进尺寸表，并从主 `view` 剥离。
- 不分片；单本超过 20,000 页时停止追加尺寸，阅读不受影响。

**验收**：

- 新保存的 `view` JSON 中不再出现逐页 `width/height`。
- 已有旧数据首次加载后自动迁移；第二次加载不再重复迁移。
- 最近 10 本保留尺寸；第 11 本淘汰最久未用尺寸表，不影响书本身。
- 单本 20,000 页以上仍能打开、翻页、显示；尺寸表停止增长但不报错。

### 3.4 越界与缺失：404，不是 500

`/api/file` 的目录分支必须判断 `0 <= num < list.length`；越界回 `404`；按页名拼出的文件不存在也回 `404`。禁止再出现 `data[0]!.list[num].name` 这类越界 TypeError 转 500。容器书渲染页的 200+`Accept-Ranges` 不顺手改。

**验收**：目录书请求 `num = -1`、`num = list.length`、删除中间某页后请求该页，均返回 404；现有合法页仍 200。

## 4. 有界媒体缓存

### 4.1 范围

| 缓存 | 不缓存 |
| --- | --- |
| 阅读页图片（含 WebP/APNG 动图） | 书架/文件列表缩略图（已有独立 600 条缓存） |
| 视频（MP4/WebM，完整 Blob） | poster/首帧单独条目 |
| 只缓存真正显示/播放过的页 | 预加载但未进入视口的页 |
| 当前用户自己的条目 | 其他用户的条目（退出登录只清自己） |

缩略图缓存与媒体缓存互相独立：缩略图仍走 `src/utils/thumbCache.ts` 的 `view-comic-thumbs`，600 条 LRU；不占 2GiB/2000。

### 4.2 预算

| 项 | 值 |
| --- | --- |
| 目标容量 | 2GiB（2147483648 B），设置页可改 |
| 实际容量 `realCap` | `min(2GiB, floor(navigator.storage.estimate().quota × 80%))` |
| 无 `estimate()` | 回退 2GiB；实际超限由 QuotaExceeded 降级处理 |
| 总条目 | 2000 个媒体条目，图片 + 视频合计；每张图/每条视频各 1 条 |
| 单图 | 不设硬上限；超过实际可用空间则跳过缓存 |
| 视频单文件 `videoCap` | `min(500MB, floor(realCap × 25%))` |
| 视频分流 | 视频字节数 `<= videoCap` 才缓存；`> videoCap` 直连网络播放，不缓存；拿不到 `Content-Length` 时先按可缓存处理，写库前预检 |
| 淘汰 | 图片/视频统一全局 LRU；字节 + 条目双上限；不设图片/视频分区配额 |

**注意**：不设图片预留、不设视频条数上限。4 条 500MB 视频合计约 1.95GiB，已占掉 2GiB 预算的绝大部分，图片缓存可能被挤到接近 0；这是用户明确接受的取舍。**缓存为空、图片回网络是正常降级，不是缺陷。**

### 4.3 技术契约

**选型：单库 IndexedDB + Blob；否决 Cache API，不引入 Service Worker/PWA。**

理由（来自 `docs/research/media-cache.md`）：

- 局域网 `http://<ip>:<port>` 不是安全上下文，Cache API 与 `navigator.storage` 不可用，而 IndexedDB 可用；项目必须按局域网 + 公网两种访问设计。
- Cache API 没有索引/字节元数据，key 只能 http(s)，忽略 HTTP 头且不过期；播放仍要 `response.blob()` + objectURL，等于多做一层。
- 显式 LRU 需要自己的计数与淘汰，IndexedDB 直接满足。

**存储形状**：

- 一个 IndexedDB 数据库，两个 object store：`media` 存 Blob 与条目元数据，`meta` 存计数/索引。
- `meta.stats` 的 `count` 与 `bytes` 是唯一权威计数；设置页“已用”必须读它，不能用 `estimate().usage`。
- “写条目 + 改 stats + 淘汰”在同一个 `readwrite` 事务里；事务内禁止网络 await。
- 按 `lastAccess` 游标淘汰，跳过 `pinnedKeys`（当前页/正在播放的视频）；单事务最多删 200 条；`lastAccess` 回写节流 5 分钟。
- 命中先于网络；命中后刷新 `lastAccess`；当前页 pinned，避免翻回上一页时被刚写入的下一页挤掉。

**Key**：

```
mc:<schema>:<userScope>:<editUUID>:<basePath>:<kind>:<index>:<name>:<urlVersion>
```

- 复用 `src/utils/fileUrl.ts:6` 的 `normalizeBasePath` 与 `:33` 的 `FILE_URL_VERSION`（当前 `"2"`）。
- `kind` 为 `image` / `video`；`index` 为页序号；`name` 为页名/文件名。
- `userScope` 由登录态决定；未登录不写缓存。退出登录只清本用户前缀，不清全库。
- key 长度上限 1024 字符；超长放弃缓存，不哈希、不截断。
- 版本变化后旧条目不可达，交给 LRU 回收；不做迁移。

**HTTP 缓存**：保留 `Cache-Control: immutable` 与 `?v=`；HTTP 缓存只做加速，不承担 LRU 淘汰；显式缓存是唯一权威。不上 Service Worker。

### 4.4 写入时机

- **图片**：进入视口且完成解码后才写；瀑布流预加载但未进入视口的页不写；单页当前页加载成功后可写。
- **视频**：首次完整缓冲并开始播放后写；不在列表预取；不等 `ended`（`loop` 不触发）；循环播放不重复写。
- 视频走路径 B：整段 `fetch` → Blob → objectURL → `playing` 后把同一 Blob 入库；命中时直接用缓存 Blob 播放；释放顺序 `pause()` → `removeAttribute("src")` → `load()` → `revokeObjectURL()`。
- 视频超过 `videoCap`：直连网络，不写缓存，不阻塞播放。
- 不做部分缓存、不做 poster 缓存、不做视频预取。

### 4.5 配额与失败

- 写入遇 `QuotaExceededError`：先按 LRU 淘汰（至少 20 条或当前条数的 10%，取大者），重试一次；仍失败则本会话停止写入，并提示一次；读取不受影响，不阻塞阅读。
- `navigator.storage.persist()` 可以 fire-and-forget 调用，只降低被清概率，不视为保证。
- Safari 7 天清理、无痕模式会清空/禁用缓存；缓存为空是正常路径；无痕模式下缓存写入 no-op 降级，不报错。
- 设置页显示“目标 / 当前可用 / 已用”；“当前可用”由 `realCap` 与自有 stats 计算，`estimate().quota` 只作上界。

### 4.6 设置页

- 总容量：默认 2GiB，可改。
- 总名额：默认 2000，可改。
- 清除缓存：清空全部媒体缓存并重置 stats（与退出登录只清本用户不同）；不影响缩略图缓存。
- 图片/视频各自占用：只读展示；不设两个独立名额。
- 视频单文件基准上限 500MB；实际 `videoCap` 随 `realCap` 缩放，不单独提供设置项。

### 4.7 验收

- 重复打开同一张已缓存的图，网络面板不再请求原图，页面正常显示；清除缓存后重新走网络。
- 只显示过 1 次、未滚动到的预加载页不产生缓存条目。
- 图片 + 视频合计达到 2000 条或 2GiB/realCap 时，最久未用条目被淘汰；当前页/正在播放视频不被淘汰。
- 视频 `<= videoCap` 首次完整播放后产生 1 条缓存；再次打开命中；`> videoCap` 不产生条目但能在线播放。
- 写入触发 QuotaExceeded 时能淘汰后重试；仍失败只提示一次，阅读不中断。
- 退出登录后本用户条目消失，其他用户条目保留；重新登录不命中已清条目。
- 设置页“已用”与实际条目字节数一致，不出现 `estimate().usage` 导致的偏差。

## 5. 视频接入

### 5.1 格式与传输

| 项 | 决策 |
| --- | --- |
| 第一支持 | MP4 + H.264 + AAC，且 `+faststart`；这是唯一承诺“全平台可播”的组合 |
| 桌面增强 | WebM（Chrome/Firefox 桌面）；Safari/iOS 不承诺 |
| 尽力而为 | HEVC/AV1：`canPlayType` 能播就播，不作为验收条件 |
| 不支持 | AVI、MKV 及其他非原生容器；不转码、不改后缀、不换容器 |
| MIME | `common/utils/ext.ts` 的 `contentTypeList` 必须含 `mp4: video/mp4`、`webm: video/webm`；不得回落 `application/octet-stream` |
| 独立视频文件 | 沿用 `server/routes/api.ts` 的 `sendStream`：真 206 + `Content-Range` + `Content-Length`，可 seek |
| zip 内视频 | 200 全量，无 Range，**移除** `Accept-Ranges`；不承诺 seek；首播可能整段下载；无大小上限 |
| 容器书 | PDF/EPUB/MOBI 内视频不支持，保持纯图片；视频页只来自目录书/zip/独立文件 |

### 5.2 页模型

- 目录书、zip 内图片 + 视频共用 `readerPages`，按现有阅读排序（`readerSort`）排序；视频 1 项、1 个 `order`。
- 独立视频从书架点开：沿用图片语义，打开父目录序列并定位到该视频；历史/书签书名是目录名。
- **不新增** `kind`、`duration`、`poster` 字段；用 `extType === "video"` 判定。
- 视频首次 `loadedmetadata` 的 `videoWidth/videoHeight` 写入现有 `width/height`；之后与图片一样参与布局。
- 进度、`currentIndex`、`order`、history、bookmark 字段不变；视频按 1 页计；不记播放时间/播放状态，续读回页。
- 尺寸未知时按可用视口占位；视口尺寸为 0 才回退 16:9。metadata 回来后只做等比校正，避免首次进入先出现 16:9 大黑边。
- 所有 `decodeSize`/`new Image()` 图片预取路径先分流视频；列表不预取 metadata；进入视口才加载。
- **视频不参与双开页/拆半屏**。这是最终决策，覆盖早先“横屏视频也拆半屏”的方案；`isSpread` 必须排除视频，避免 rotate 被迫退化为 fit、横屏视频被切成两半。
- AVI/MKV 不进入页列表；点击沿用“暂不支持”，不做专门容器视频 UI。

### 5.3 播放器交互

| 项 | 决策 |
| --- | --- |
| 模式 | 单页模式播放视频；瀑布流首版不播放，只显示“视频暂不支持在瀑布流播放，请切换到单页模式” |
| 书架打开 | 从书架点开视频时自动切到单页模式，再进入阅读页 |
| 自动播放 | 进入视口自动播放；离开视口暂停；页面隐藏/组件卸载也暂停 |
| 音频 | `muted`；无声音 |
| 循环 | `loop`；循环不重复写缓存 |
| 内联 | 必须 `playsinline` / `webkit-playsinline`；目标 Android Chrome |
| 控件 | 无原生 controls、无进度/seek/音量/全屏/时长 |
| 按钮 | 40px 播放/暂停小按钮；设置五位置：左上、左下、右上、右下、中间；默认右下 |
| 并发 | 同一时刻最多 1 个视频在播；切换页面/切换视频时旧播放器暂停 |
| 事件 | `loadedmetadata`/`loadeddata`/`canplay`/`resize`/`play`/`pause`/`error`；所有事件先比对 `e.target === videoEl`，忽略换页后旧元素迟到的事件 |
| 适配 | 自适应 = contain；旋转适应 = 0°/90° 各算一次 contain，取装得更大的朝向；完整装入、不裁剪、不拉伸；比例不一致时保留等比例黑边是预期 |
| 尺寸 | metadata 前按可用视口占位；metadata 后写宽高并重排；视频不参与拆半屏 |

**验收**：

- MP4（H.264/AAC）与 WebM（桌面）能打开、自动播放、静音循环；AVI/MKV 不进入页列表。
- 进入视口播放、离开暂停；同一时刻最多 1 个；点击按钮暂停/继续；设置五个位置都能生效，默认右下且不与返回按钮重叠。
- 视频页在页序列中只占 1 页；上一页/下一页、进度、书签、历史按页工作；不记录播放时间。
- 横屏/竖屏视频在“旋转适应”下完整装入视口，不裁剪、不拉伸；切换到其他适配再切回，不出现拉伸铺满。
- 视频不拆双开页；开启“拆半屏”时视频仍独占一页。
- zip 视频能播放；首次可能整段等待；无 seek UI；失败有提示/重试，不白屏。
- 从书架点开视频自动进入单页；瀑布流遇到视频显示提示而不破图。

### 5.4 视频缩略图

| 项 | 决策 |
| --- | --- |
| 生成方 | 服务端 ffmpeg；不在浏览器首播截帧 |
| 格式 | 只对 MP4/WebM 生成；AVI/MKV 不生成 |
| 取帧 | 先用 ffprobe 读时长，截 `duration/2` 的中间帧；无 ffprobe 回退第 1 秒，再回退第 0 帧 |
| 超时 | 单次 15s；失败不阻塞书架/列表 |
| 尺寸 | 按 `/api/Thumbnail` 请求宽度生成 JPEG（现有 160/240 档），不固定 320 |
| 缓存 | 服务端 `data/thumbs`；视频缓存 id 加 `_v2`；前端 `ThumbImage` 的 IndexedDB key 与 URL 带版本 2，隔离旧黑帧 |
| 前端缓存 | 沿用 `view-comic-thumbs` 600 条；不占 2GiB/2000 |
| 依赖 | ffmpeg/ffprobe 是可选系统依赖；未安装时回 404，UI 回退图标；不打包、不引入转码 |
| 范围 | 书架 + 阅读页文件列表共用；GIF/WebP/APNG 仍用现有静帧缩略图；阅读页正文原图会动 |

**验收**：

- 独立 MP4 与 zip 内 MP4 的 `/api/Thumbnail` 返回 JPEG，画面不是黑帧；前 2 秒纯黑的测试视频取到中间彩条帧。
- 书架与阅读页文件列表都显示视频缩略图；未生成/无 ffmpeg 时显示图标。
- 旧的黑帧缓存不再命中；换 v2 后首次重新生成。
- GIF/WebP/APNG 缩略图仍是静帧，阅读页正文仍是动图。

## 6. 瀑布流移动端修复

**问题**：`scrollDiv` 设 `overflow: auto`、宽度 100%，但 `screenWidth` 用 `main.clientWidth - padding` 计算，没有减去垂直滚动条（全局 WebKit 8px）；内容比可视区宽约 8px，出现横向滚动条。长按还会选中文字/图片。

**决策**：

- `scrollDiv` 设 `overflow-x: hidden`，只保留纵向滚动。
- 隐藏 `scrollDiv` 的纵向滚动条（Firefox `scrollbar-width: none`，WebKit `::-webkit-scrollbar`），仍可上下滚动；这样滚动条不占宽度，页宽按 `scrollDiv.clientWidth` 缩放，图片刚好不溢出。
- 在 DOM 内用 `scrollDiv.clientWidth` 计算 `screenWidth`，不再用 `main.clientWidth - padding` 的近似值；若某些环境滚动条仍占宽，按实际 `clientWidth` 重排一次。
- `.main` 与 `scrollDiv` 加 `user-select: none`、`-webkit-user-select: none`、`-webkit-touch-callout: none`。
- 双开页/拆半屏的 2 倍宽渲染与裁切逻辑不变。

**验收**（Android Chrome，360px 与 412px 宽）：

- 纵向滚动时没有横向滚动条，页面不左右晃；纵向滚动条隐藏但上下滚动正常。
- 长按图片/空白不出现文字选中菜单。
- 单页与双开页宽度都贴合视口，右侧不裁切、不出现 8px 白边。
- 滚动性能、图片加载、进度保存不退化。

## 7. 大图浏览结论

- “大图打不开”的根因已由 `4250d35` 修复：`basePath` 含 `#` 时路径按段编码。
- 本次**不**引入 sharp 降采样、分块加载、服务端大图兜底；保留现有加载失败提示与重试。
- 若后续再出现“糊 / 解不出 / 内存峰值 / 首屏慢”，必须带真实样张（路径、尺寸、大小、格式）、设备与 Chrome 版本、所在模式重新起票；不凭猜改 `api.ts` / `PagedReader`。
- 接受：超大图仍受浏览器解码能力限制；这是已知边界，不是本轮优化目标。

## 8. 首屏/传输（P1，未展开）

已记录的现状（来自“优化清单与优先级”）：

- 四个页面路由静态 import（`src/router/index.ts:3`）；
- 主 JS 约 750KB 未压缩；
- `express.static` 与 server 没有 compression（`server/prod.ts:67-68`、`server/index.ts:36`）；
- 字体 Lato / FiraCode 在主入口引入。

**状态**：只定了 P1 优先级，没有决定具体方案；本 spec 不把它写成验收项，也不替用户拍板。排期时另起票评估路由懒加载、构建拆包、compression 等候选。它不影响 §3–§6 的验收。

## 9. 风险与取舍

| 风险 | 影响 | 处理 | 状态 |
| --- | --- | --- | --- |
| 不设图片预留 | 4×500MB 视频约占 1.95GiB，图片缓存接近 0 | 接受；设置页显示占用；缓存为空/图片回网络是正常降级 | 用户已拍板 |
| 视频单文件 500MB | 单条大视频会挤掉大量图片；接近上限时写入慢 | `videoCap` 随 realCap 缩放；超过即直连不缓存 | 已定 |
| 局域网非安全上下文 | `navigator.storage.estimate` 不可用，realCap 回退 2GiB 可能高于实际 | QuotaExceeded 淘汰重试，仍失败停写；不阻塞阅读 | 已定 |
| Safari 7 天清理/无痕 | 缓存随时可能为空 | 视为正常；无痕 no-op；不承诺持久 | 已定 |
| 多用户共享 2GiB | 其他用户条目占预算，可能挤掉当前用户 | 退出登录只清本用户；不做按用户拆分预算 | 用户已拍板 |
| zip 视频无 Range | 首播整段下载，不能 seek，大文件等待明显 | 首版接受；不承诺 seek；无大小上限 | 已定 |
| ffmpeg 不是内置依赖 | 未安装时无视频缩略图 | 回退图标；README 记录安装方式；不打包 | 已定 |
| 旋转 contain 留黑边 | 视频比例与屏幕不一致时有等比例黑边 | 预期行为；要铺满需裁切，但本轮不提供 | 已定 |
| 大 Blob 写 IndexedDB | Safari 可能整段进内存；超大视频写入慢/失败 | 单文件 500MB 上限；失败不阻塞播放；仍需真机压测 | 待验证 |
| 首屏/传输未决 | P1 不落地时首屏仍偏重 | 本 spec 只记录优先级，另起票 | 未决 |

## 10. 明确不做

- 离线阅读、整本下载、Service Worker、PWA。
- AVI/MKV 支持、任何转码、引入 ffmpeg 转码流水线。
- 视频进度/seek/音量/全屏/原生 controls/时长显示。
- 视频预取、部分缓存、poster/首帧独立缓存。
- 客户端首播截帧作为列表封面。
- 动图暂停/播放控制。
- 图片/视频分区配额、图片预留、视频条数上限。
- 服务端大图 sharp 降采样/分块（d163ade 方案撤回）。
- 代码健康清理（7 个 tsc 基线、JsonConfig 空接口、rar 当普通文件）；不是说不该修，是不纳入本次高 ROI 范围。
- PDF/EPUB/MOBI 功能补全（CJK 字体、azw3、MOBI 版式）。

## 11. 交接验收清单

| ID | 验收 | 对应 |
| --- | --- | --- |
| AC-01 | 目录书取图不再每请求重建页清单；越界/缺失 404 | §3.1、§3.4 |
| AC-02 | zip 图片 Range 真 206，客户端最多读 64KB；zip 视频 200 且无 Accept-Ranges | §3.2 |
| AC-03 | 主 `view` 不再含逐页宽高；尺寸表最近 10 本、20k 页上限、旧数据迁移 | §3.3 |
| AC-04 | 媒体缓存命中先于网络；只写显示/播放过的页；2000 条/2GiB 双上限；统一 LRU；当前页 pinned | §4 |
| AC-05 | 视频 `<= videoCap` 首播后入库，`> videoCap` 直连；QuotaExceeded 淘汰重试；退出登录清本用户 | §4.5、§4.7 |
| AC-06 | MP4/WebM 单页播放；自动播放/静音循环/离开暂停/按钮五位置/最多 1 个 | §5.3 |
| AC-07 | 视频 1 页、不拆双开页、进度按页；旋转 contain 完整装入；书架打开自动切单页 | §5.2、§5.3 |
| AC-08 | 视频缩略图服务端中间帧；书架+文件列表；旧黑帧 v2 隔离；无 ffmpeg 回退图标 | §5.4 |
| AC-09 | 瀑布流无横向滚动条、长按不选中；360/412px 宽正常 | §6 |
| AC-10 | 大图只验证不降采样；再现需样张另起票 | §7 |

## 12. 来源与落地提示

- 所有决策来自文首列出的已关闭票；研究事实来自两份 `docs/research` 笔记，未在本文重复引用全部 URL。
- 视频单页播放器与缩略图已在 PR #25 实现（待合并）；页图热路径、媒体缓存、瀑布流修复按 §3–§6 交接。
- 落地时先读 `docs/project-memory.md`；404 用 `res.sendStatus(404)`；路径过 `pathSafe`；server 不热重载；7 个 tsc 基线错误不算新增。
- 本 spec 不替代实现计划；具体文件改动、测试顺序与发布步骤在实现票中拆解。
