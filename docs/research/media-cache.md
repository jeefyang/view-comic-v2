# 媒体缓存技术选型（wayfinder #19 研究笔记）

- 研究日期：2026-11-09（规范、MDN、浏览器官方文档与 WebKit / Chromium 源码均为当日抓取）
- 目标仓库：`jeefyang/view-comic-v2`（Vue 3 + TypeScript 前端，Express 5 后端，Node `^20.19.0 || >=22.12.0`，PM2 fork 单实例，`max_memory_restart: 1G`）
- 上游决议：wayfinder #18「媒体缓存范围与策略」已锁定缓存范围、容量目标、淘汰策略与写入时机。本文只回答「用什么装、怎么索引、key 怎么拼、失效怎么兜」，**不重开 #18**。
- 边界：纯调研。不改应用代码、不引入依赖、不动现有 `src/utils/thumbCache.ts` 的 600 条缩略图缓存。
- 读法：每节先写「事实」（附一手来源 URL），再写「建议」（本仓库上下文下的取舍），两者不混写。来源编号见 §12。

## 1. 结论摘要

### 1.1 TL;DR

1. **底座选 IndexedDB，值存 Blob；不选 Cache API，不引入 Service Worker。** IndexedDB 与 Cache API 共享同一个 origin 配额与淘汰系统[来源 2]，但 IndexedDB 有索引、有事务、有精确的条目枚举能力，而 Cache API 只有「请求 URL 到响应」的映射，没有字节统计、没有范围查询、没有过期时间[来源 12]。
2. **Cache API 与 `navigator.storage` 都被限定在安全上下文，IndexedDB 没有这个限制。** `Window.caches` 与 `CacheStorage` 在 MDN 上带 secure context 标记[来源 14]，WHATWG Storage 里 `StorageManager` 接口声明为 `[SecureContext, Exposed=(Window,Worker)]`[来源 1]；IndexedDB 相关接口没有这一条。本项目是自建服务，局域网里常以 `http://<ip>:<port>` 访问，此时 Cache API 与 `estimate()` 直接不存在。选 IDB 同时让 #18 的「无 `estimate()` 时回退 2GiB」成为一条真实可达的路径，而不是死代码。
3. **Blob 在 Chromium 里不是页面堆里的一坨字节。** IndexedDB 存 Blob 走 external object，落成数据库目录下的独立文件，LevelDB 只存引用[来源 15]；blob 数据驻留 browser 进程，renderer 只拿 handle，读取走 `ReadAll` / `ReadRange`[来源 16]。因此 500MB 视频放进 IDB 既不会压进 IDB 主库，也不会在页面里常驻一个 500MB 的 `ArrayBuffer`。
4. **真正的风险在生命周期，不在存储格式。** 「只要有一个 object URL 活跃，底层对象就不能被 GC，可能造成内存泄漏」[来源 18]；「JS 里一直持有 Blob 对象，后端数据就永远不会被清理」[来源 16]；「创建大量、尤其是很大的 Blob，可能让 renderer 内存增长过快并 OOM」[来源 16]。缓存设计的主要工作量是「谁在什么时候 revoke」，不是「选 Blob 还是 ArrayBuffer」。
5. **2GiB 预算配 500MB 单视频上限，算术结果是「最多 4 个视频」。** 4 × 500MiB = 2000MiB，只剩 48MiB 给图片；而 #18 的「单视频上限 = min(500MB, realCap × 25%)」在 realCap 变小时会让 4 个视频恰好吃满全部预算（4 × 25% = 100%），图片被挤到 0。2000 条条目上限对视频永远先被字节上限挡住。这是 #18 决议的数值后果，本文只记录，并在 §4.6 标出需要 spec 补一条「图片预留」的地方。
6. **LRU 必须自己记账，且记账要和淘汰在同一个事务里。** IndexedDB 没有聚合查询，条目数与总字节只能放在 meta store；同一个 object store 上不能并发跑两个 scope 重叠的 readwrite 事务[来源 10][来源 9]，这正好让「写条目 + 更新计数 + 淘汰」要么全成、要么全败。
7. **命中刷新 recency 必须节流，否则读路径会变成写路径。** 建议同一个 key 在 5–10 分钟内最多回写一次 `lastAccess`；掉电或崩溃丢掉的只是 LRU 精度，不影响正确性。
8. **配额只能当上界用，不能当计量用。** `estimate().quota` 是「保守近似」，还会随访问频率与站点互动变化[来源 3]；`usage` 也是近似值，浏览器可能做去重、压缩与对齐填充[来源 1]，并且包含同源的其他存储（含现有 600 条缩略图库）。设置页的「已用」必须用我们自己的字节计数，不能用 `usage` 充数。
9. **Safari 的 7 天清理由「按 origin 整体删除」实现，现行 WebKit 的时间驱逐把 Cache API（DOMCache）与 IndexedDB 一并清掉**，并跳过「正在使用」或「已 persist」的 origin[来源 8]。所以 Safari 上「缓存多久失效」不可控，缓存为空必须当成正常路径处理（§6）。
10. **视频走「整段下载成 Blob → object URL 播放 → 播放开始后把同一个 Blob 落库」**：zip 分支本来就是 200 全量、忽略 Range，播放已需要完整数据；落库复用同一个 Blob，不产生第二次下载（§7）。

### 1.2 方案对比（事实 + 结论）

| 维度 | IndexedDB + Blob | IndexedDB + ArrayBuffer | Cache API（无 SW） | 纯 HTTP 缓存 |
| --- | --- | --- | --- | --- |
| 图片可直接用 | 是，`get()` 得 Blob 建 URL | 是，但要 `new Blob([buf])` 多一次拷贝 | 否，要 `response.blob()` 再建 URL | 是，但 JS 看不见 |
| 视频可直接用 | 是，Blob 句柄交给 `<video>` | 不现实，整段进 renderer 堆 | 同上，且 SW 内不能建 URL | 是，但不可控 |
| 安全上下文要求 | 无 | 无 | 有[来源 14] | 无 |
| 可枚举 / 可精确计量 | 有索引，可游标遍历[来源 9] | 同左 | 只能 `keys()` 列 URL，无字节元数据[来源 12] | 无 API |
| 事务与一致性 | 有[来源 10] | 有 | 无（单条 `put` 是原子的，但没有跨条事务） | 无 |
| 到期与淘汰 | 自己实现（本文 §4） | 同左 | 「条目不会过期，除非被删除」[来源 12] | 浏览器自主 |
| 共享 origin 配额 | 是[来源 2] | 是 | 是[来源 2] | 否（不计入 quota）[来源 6] |
| **结论** | **选它** | 不选 | 不选 | 只作加速层 |

补充两条否决理由（详见 §2.4）：
- Cache API 的键必须是 http(s) URL，合成键要用伪 URL 绕[来源 13]；而 IndexedDB 的键可以是任意字符串，天然适配 `editUUID + basePath + 页身份 + 版本` 这种复合身份。
- Cache API 明确「不遵守 HTTP 缓存头」[来源 12]，既不能借 `Cache-Control` 管它，也不会自动过期，等于把 LRU 的全部责任搬回自己身上，却少了索引。

### 1.3 与 #18 决议的落点映射

| #18 已定 | 本文落点 | 前置条件 / 备注 |
| --- | --- | --- |
| 目标 2GiB；`realCap = min(2GiB, quota × 80%)` | §4.5 | `estimate()` 需安全上下文，缺失走 2GiB 回退 |
| 2000 条媒体条目（图片 + 视频合计） | §4.2 数据模型 | meta 计数器 + `byLastAccess` 游标 |
| 单视频 500MB；真实配额不足时 `min(500MB, realCap × 25%)` | §4.6 | 25% 规则会让 4 个视频吃满预算（见 §4.6） |
| 单一全局 LRU，字节 + 条目双上限 | §4.3 | 图片与视频同池，同一 `byLastAccess` 索引 |
| 命中刷新 recency | §4.4 | 节流写，5–10 分钟一次 |
| 当前页保护 | §4.3 | 内存里的 `pinnedKeys` 集合，淘汰时跳过 |
| 只缓存实际展示过的页面 | §4.3 | 由组件在 `load` / `playing` 后触发写入 |
| 视频首次完整缓冲并开始播放后写入 | §7.2 | 建议把「完整缓冲」实现为「整段下载成 Blob」 |
| 不使用 Service Worker | §5.6 | 另附「什么时候才值得回头用」 |
| key = editUUID + 规范化 basePath + 页身份 + FILE_URL_VERSION | §5.2 | 复用 `normalizeBasePath` / `normalizeFileName` / `FILE_URL_VERSION` |
| QuotaExceededError：淘汰 LRU → 重试一次 → 停止本次写入 → 提示一次 | §4.5 | 失败后本会话降级为只读 |


## 2. 存储底座：IndexedDB 还是 Cache API

### 2.1 事实：两个容器，一套配额

- IndexedDB、Cache API、OPFS 共享同一套按 origin 计算的配额与淘汰机制；配额耗尽时抛出 `QuotaExceededError`[来源 2]。WHATWG Storage 进一步规定：一个 bucket 被清理时必须整体清理[来源 1]。
- IndexedDB 的值走 structured clone，Blob / File / ArrayBuffer 都能直接存，不需要 base64。Chromium 的实现说明写得很直白：**「IndexedDB 支持 Blob，就是为了让大值不必直接存进 LevelDB（LevelDB 处理大值效果不好）」**，Blob 被当作 external object，落成 `IndexedDB/<origin>.blob/<database_id>/<blob_number>` 的独立文件，LevelDB 里只留引用；数据库处于 in-memory / incognito 模式时 Blob 永不落盘[来源 15]。
- Cache API 的每个条目是一个 `disk_cache::Entry`，包含三段流（protobuf 元数据、响应体、附加数据），响应体通过 data handle 从磁盘流式读出[来源 17]。所以 Cache API 也不是「把响应塞进内存」，这点和 IDB 存 Blob 打平。
- Cache API 有两句关键的话：**「缓存 API 不遵守 HTTP 缓存头」**[来源 12]；**「条目不会过期，除非被删除」**[来源 12]。也就是说它既不读 `Cache-Control`，也不会自己淘汰，清理责任 100% 在脚本。
- Cache API 可以在没有 Service Worker 的 window 里直接用[来源 12][来源 14]，但 `put()` 的 request URL 必须是 http(s) 方案，否则抛 `TypeError`[来源 13]。我们如果要拿它当通用 KV，就得编造 `https://cache.invalid/<key>` 这类伪 URL。
- IndexedDB 的键没有任何 scheme 限制，可以是任意字符串或数组，并且可以建索引、按索引游标有序遍历[来源 9]。

### 2.2 图片：为什么是 IDB + Blob

事实：
- 阅读页图片单张从几十 KB 到几 MB，长条图可能到几十 MB；WebP / APNG 也是单个 `<img>` 能直接吃的格式。
- 命中后要交给 `<img src>` 的只能是 URL，Blob 必须先 `createObjectURL`。
- 解码后的位图（约 `宽 × 高 × 4` 字节）由浏览器管理，和我们存的是 Blob 还是 ArrayBuffer 无关。

**建议**：
1. IDB 存 Blob，记录 `mime`、`bytes`、`key`、`lastAccess`。
2. 单图不设硬上限（#18），但写入前做一次空间预检：`bytes > realCap - used - reserve` 时直接跳过并计入「超大，未缓存」，不要先写再等 `QuotaExceededError`。
3. 不存 data URL / base64（体积 +33%，取回还要再 decode 一次），不存解码后的像素（体积不可控且不可跨会话复用）。
4. 不做图片转码或压缩（#18 非目标），存的是原始响应字节。

### 2.3 视频：为什么仍然是 IDB + Blob

事实（Chromium blob 子系统[来源 16]）：
- blob 数据驻留 browser 进程，renderer 只持 handle，读取通过 `ReadAll` / `ReadRange` 走 data pipe。
- 内存限额：64 位桌面 2GB（ChromeOS / Android 除外），ChromeOS 为内存的 1/5，Android 为内存的 1/100；磁盘限额：ChromeOS 为磁盘的 1/2，Android 6%，其余 10%；可用磁盘下限是内存限额的两倍。
- 内存满或单个 blob 过大时，blob 会被换页到磁盘或直接写盘。
- 原始 README 的告警：「创建大量、尤其是很大的 Blob，可能让 renderer 内存增长过快并导致 renderer 侧 OOM」；「如果 JS 里一直持有 blob 对象，后端数据永远不会被清理」。

**建议**：
1. 500MB 单条视频直接存 Blob。Chromium 上它是外部文件，不进 LevelDB、不进 renderer 堆；这也是「IDB 能不能存 2GB 级视频」的答案——能，但受 §4.6 的预算与 §7 的播放路径约束。
2. 写入前用「自己的计数 + `estimate()`」预检，而不是用异常做控制流：配额异常发生在事务 abort 时，此时写入代价已经付掉。
3. 不做分片、不做 Range 片段缓存、不做边下边存（#18 非目标，且 zip 分支本身不支持 Range）。
4. Cache API 的「流式写」在这里不构成优势：它要求 `put(request, response)`，而 response 只能来自另一次 fetch；我们已经为了播放把整段下载成 Blob，再 `put` 一份等于多一次拷贝（§7.1）。

### 2.4 否决 Cache API 的五条理由

1. **安全上下文门槛**：`caches` 与 `navigator.storage` 都要求安全上下文[来源 14][来源 1]，而本项目在局域网内以 `http://<ip>:<port>` 访问是常态；IndexedDB 没有这个限制。
2. **没有索引，也就没有 LRU**：`Cache.keys()` 只能列出请求 URL，没有字节数、没有最后访问时间；要实现 §4 的双上限 LRU，必须另开一个 IDB 存元数据，于是变成两套存储、两份一致性、两个清理入口。
3. **键必须是 http(s) URL**：我们天然的键是 `editUUID + basePath + 页身份 + 版本`，拿它当伪 URL 用属于逆着 API 设计走[来源 13]。
4. **不遵守 HTTP 头、也不会过期**：既然 `Cache-Control` 对它无效[来源 12]，那它相对 IDB 的唯一优势（浏览器帮忙管新鲜度）就不存在了。
5. **播放路径上并不省事**：命中后仍要 `response.blob()` → `createObjectURL` 才能喂 `<video>`；而 Service Worker 里连 `createObjectURL` 都不能调用[来源 19][来源 20]，想靠 SW 直接返回响应体就又回到「必须上 SW」的复杂度。

**什么时候才值得回头选它**：需要 SW 在网线上拦截 `/api/file/...`、需要由 SW 合成 206 支持 seek、或需要缓存 ZIP 内部条目而不解压。这三件都不在 #18 范围内。

### 2.5 为什么不用 ArrayBuffer

- 500MB 的 `Uint8Array` 一旦 `get()` 出来就常驻 renderer 堆，移动端 Safari 的 jetsam 很容易先杀掉页面。
- 交给 `<video>` 前还要 `new Blob([buf])`，峰值瞬间翻倍（buf + blob 后端）。
- Chromium 对内存态 blob 本身有 2GB 上限[来源 16]，ArrayBuffer 还要受 32 位地址空间与 V8 堆上限约束，等于主动放弃「大文件落盘」这一层保护。
- 唯一优势是「可以切片、可以算 hash」，但 #18 的缓存不做增量校验，用不上。

## 3. Blob 与 object URL：生命周期与内存峰值

### 3.1 事实

- blob URL 形如 `blob:<origin>/<uuid>`，它是对内存/磁盘中一个 Blob 的引用[来源 18]。
- **「只要有一个 object URL 活跃，底层对象就不能被垃圾回收，可能造成内存泄漏」；每个 `createObjectURL()` 都会产生一个新 URL，即使指向同一个对象，所以每一个都必须 revoke**[来源 18]。
- 浏览器在文档卸载时会释放这些 URL[来源 18]，但这是兜底，不是设计依据。
- MDN 明确把「`<img>` 加载完成后立刻 revoke」列为反模式：用户右键保存、在新标签页打开都会失败，只有在确定对象不再被用户触达时才 revoke[来源 18]。
- Service Worker 里不能调用 `createObjectURL` / `revokeObjectURL`，原因正是「可能造成内存泄漏」[来源 19][来源 20]。
- blob URL 支持用 `fetch` 加 `Range` 做部分读取[来源 18]，也就是说交给 `<video>` 之后，浏览器是按需读文件的，不需要把 500MB 读进堆。
- IndexedDB 在无痕模式下 Blob 永不落盘而一直处于 pending 状态[来源 15]，这会放大无痕模式下的内存压力。

### 3.2 建议：一个媒体一个 URL，谁创建谁释放

| 时机 | 动作 | 理由 |
| --- | --- | --- |
| 命中缓存、准备渲染 | `get()` → `createObjectURL(blob)`，登记到 `Map<key, url>` | 同一 key 复用同一个 URL，避免重复创建 |
| 图片 `load` 之后 | **不 revoke** | MDN 反模式[来源 18]；图片 URL 随组件/页面一起消失 |
| 组件卸载、翻页、关闭阅读器 | `revokeObjectURL(url)` 并从 Map 删除 | 释放底层 blob 的最后引用 |
| 视频切换 / 关闭 | `pause()` → `removeAttribute("src")` → `load()` → `revokeObjectURL(url)` | 先断开解码器对 URL 的引用，再 revoke，避免部分版本抛 `MediaError` |
| 整个文档卸载 | 无需处理 | 浏览器会释放[来源 18] |
| 缓存被淘汰（LRU 删了条目） | 不 revoke 正在使用的 URL | 已 `get()` 出来的 Blob 是独立引用，删库不影响当前播放 |

内存峰值的现实分布：

| 场景 | 常驻开销 | 说明 |
| --- | --- | --- |
| 图片 N 张 | N 个 Blob 句柄 + 浏览器解码位图 | 位图约 `w × h × 4` 字节，由浏览器的 image cache 管，我们控制不了 |
| 图片下载并入库 | 下载流 + blob 后端 | Chromium 落盘[来源 16]，renderer 不同时持有整段 |
| 视频命中播放 | 1 个 Blob 句柄 + 解码缓冲 | 后端按 `ReadRange` 读[来源 16] |
| 视频未命中播放 | 同上 | 下载中的响应最终也进 blob 后端 |
| 多标签页 | 按 tab 数线性叠加 URL 与解码器 | blob 后端共享，重复条目由浏览器按 blob id 去重 |

**建议**：阅读页维护一个「当前页 + 预取下一页」的上限，预取只做网络预热、不建 URL；URL 只在真正进入 DOM 时创建。这样峰值 URL 数是有界的（一页的图片数 + 1 个视频）。


## 4. 全局 LRU 的索引设计

### 4.1 事实：IndexedDB 的事务边界

- 事务在创建时就开始，不是在发出第一个请求时[来源 11]；实现会排一个 database task 去启动它，请求按发出顺序执行、结果按同样顺序返回[来源 10]。
- 事务状态在 task 之间来回切换：`success` / `error` 回调执行期间回到 active（可以继续发请求），回调结束后变 inactive；inactive 期间发请求会失败[来源 10][来源 11]。
- **当事务处于 inactive、所有请求都完成且结果已处理、并且没有新请求时，实现会尝试提交**[来源 10]。这条是「不要在事务里 `await fetch`」的规范依据：等网络期间事务没有 pending 请求，会直接提交。
- **「scope 重叠的两个 readwrite 事务不能同时启动，因为它们可能在事务中途互相修改对方的数据」**[来源 10]；同一个 object store 上「只能有一个 readwrite 事务」[来源 9]。所以「读计数 → 判断 → 淘汰 → 写条目」放在同一个事务里是原子的，跨标签页也一样串行。
- 事务 abort 的常见原因包括坏请求、显式 `abort()`、回调里未捕获的异常、I/O 错误、**配额超限**、UA 崩溃[来源 11]。
- Firefox 40 起放宽了 durability：`complete` 在操作系统收到写入指令后就可能触发，并不保证已 flush 到盘；断电/崩溃有小概率丢掉整个事务[来源 11]。
- IndexedDB 没有求和聚合。条目数还能用 `count()`，字节总数没有任何内置手段，必须自己维护，否则每次写入都要全表游标扫一遍。

### 4.2 数据模型

两个 object store，同一个数据库：

`media`（keyPath: `key`）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | string | 复合键，见 §5.2 |
| `bookKey` | string | `<userScope>|<editUUID>`，用于按书清理 |
| `kind` | string | `"img"` 或 `"vid"` |
| `bytes` | number | 响应体字节数，来自 `Blob.size` |
| `mime` | string | 命中时用于类型判断与诊断 |
| `blob` | Blob | 原始响应体 |
| `createdAt` | number | 首次写入时间 |
| `lastAccess` | number | 最近一次命中的时间（节流更新） |
| `urlVersion` | string | 冗余一份 `FILE_URL_VERSION`，便于排查「为什么这条还在」 |

索引：`byLastAccess(lastAccess)`、`byBook(bookKey)`、`byBookLastAccess([bookKey, lastAccess])`。

`meta`（keyPath: `k`）

| `k` | 值 | 说明 |
| --- | --- | --- |
| `"stats"` | `{ count, bytes }` | 唯一权威计数，与 `media` 同事务更新 |
| `"schema"` | `{ v }` | 存储结构版本 |
| `"quota"` | `{ realCap, videoCap, rawQuota, updatedAt }` | 本次会话算出的预算 |
| `"evict"` | `{ lastAt, failStreak }` | 淘汰健康度，连续失败时进入只读降级 |

**为什么计数不能靠 `count()` 现算**：淘汰条件同时包含「字节超限」和「条目超限」，两者都要在同一个事务里判断并立即扣减；分开算会出现「先算后写」的竞态。

### 4.3 三条路径

**写入**（组件在 `<img>` 的 `load`、`<video>` 的 `playing` 之后调用）：

1. 事务外：上限预检。视频 `bytes > videoCap` → 直接跳过；图片 `bytes > realCap - reserve` → 跳过。跳过也要记一次「未缓存原因」，便于设置页展示。
2. 事务外：若 `stats.bytes + bytes > realCap`，先跑一次独立淘汰事务（规则见下）腾出空间；腾不出就跳过。
3. 开 `["media", "meta"]` 的 readwrite 事务。
4. `get(key)` 已存在 → 覆盖 `blob` / `bytes` / `lastAccess`，`stats.bytes` 加上字节差。
5. 不存在 → `put(record)`，`stats.count += 1`，`stats.bytes += bytes`。
6. 若 `stats.bytes > realCap` 或 `stats.count > 2000`，用 `byLastAccess` 游标升序淘汰：跳过 `pinnedKeys`（当前页）与本次写入的 `key`，逐条 `delete` 并扣减 `stats`，达标即停；一次最多删 200 条，剩下的交给下一次写入，避免长时间持锁。
7. `tx.oncomplete` 才算写入成功；`tx.onabort` 走 §4.5。

**命中**（渲染前判断，不可阻塞页面）：

1. readonly 事务 `get(key)`，miss 返回 `null` 交给网络。
2. hit → `createObjectURL(blob)` 交给组件，并登记到 `Map<key, url>`。
3. 若 `now - lastAccess > 5 分钟`，用独立 readwrite 事务只更新 `lastAccess`（失败静默）。节流的原因：一次翻页可能命中几十张图，每次都写就是几十个写事务。

**淘汰**（只由写入路径或启动 reconcile 触发，不做定时器）：

1. 单事务内用 `byLastAccess` 游标从最旧开始。
2. 跳过 `pinnedKeys` 与本次刚写入的 `key`。
3. 每删一条：`stats.count -= 1`、`stats.bytes -= record.bytes`。
4. 满足「`stats.bytes <= realCap` 且 `stats.count <= 2000`」即停。
5. 游标走完仍不达标（极端情况：大量条目都在 pinned 集合里）→ 放弃本次写入并记一次失败。

### 4.4 事务与并发

- **不要用一个长事务包住整页**：事务在 `await` 网络期间会自动提交[来源 10]，而且长事务会阻塞其他标签页的写入。每张图一个短事务即可。
- **读不阻塞写**：命中路径用 readonly，不要图省事用 readwrite；readonly 之间可以并发[来源 10]。
- **事务里不要 await 外部 Promise**：把 `fetch`、`blob()`、`estimate()` 全部放在事务外先做完。
- **异常处理**：事务回调里抛异常会导致 abort，且错误只在 `tx.error` 上[来源 11]，必须显式 `try/catch + tx.abort()`。
- **持久性**：Firefox 的 relaxed durability 意味着「写成功」不代表「已落盘」[来源 11]。缓存本来就允许丢，不要向用户承诺「已保存」。
- **多标签页**：同一 DB 的 readwrite 事务在浏览器内串行[来源 10]，两个 tab 同时淘汰不会重复扣减，因为第二个事务会读到最新的 `stats`。但 `pinnedKeys` 是每个 tab 各自的内存状态，别的 tab 仍可能删掉本 tab 正在展示的条目——已建立的 object URL 依然有效（Blob 是独立引用），只是下次要重新下载，可以接受。
- **onversionchange**：另一个 tab 要升级数据库时，本 tab 必须 `db.close()`，否则对方收到 `blocked`。和现有 `thumbCache` 一样，升级被阻塞时直接降级为无缓存。

### 4.5 配额探测与降级

启动时（一次，结果缓存在 `meta.quota`）：

| 条件 | 行为 |
| --- | --- |
| `typeof navigator.storage?.estimate === "function"` | `realCap = min(2GiB, floor(quota × 0.8))` |
| 没有 `navigator.storage`、或 `estimate()` 抛错（含非安全上下文） | `realCap = 2GiB`（#18 的既定回退） |
| 总是 | `videoCap = min(500MiB, floor(realCap × 0.25))` |
| 总是 | `persist()` 发一次不等待结果；`persisted()` 结果存下来给设置页显示 |

配额数值必须当近似值用：`quota` 是「保守近似」，会随访问频率与站点互动程度变化[来源 3]；`usage` 会因去重、压缩、对齐填充而失真[来源 1]，并且包含同源其他存储（现有 600 条缩略图库就在里面）。设置页展示的三个数字因此是：**目标容量**（realCap，我们算的）、**可用空间**（realCap − stats.bytes，我们记的）、**已用**（stats.bytes，我们记的）；`estimate()` 只用来定 `realCap`。

写入失败的分级降级：

| 异常 | 处理 |
| --- | --- |
| `QuotaExceededError`（看 `err.name`） | 立即淘汰 `max(20, ceil(count × 0.1))` 条（跳过 pinned）→ 重试一次 → 再失败则本会话 `writeDisabled = true`，设置页提示一次「存储空间不足，已暂停缓存写入」；**读路径不受影响** |
| 其他 `DOMException` / 事务 abort | 关连接、重开一次；再失败则本会话降级为无缓存（与 `thumbCache` 的 `openDb()` 返回 `null` 同构） |
| 数据库被外部清除（Safari 7 天、用户清站点数据） | 下次 open 时 `stats` 与 `count()` 对不上 → 触发一次 reconcile，用实际值覆盖 `meta.stats` |
| 升级被其他标签页阻塞 | 不等待，直接降级为无缓存 |

**注意**：`QuotaExceededError` 只能在事务 abort 之后拿到，此时写入代价已经付掉。所以「先写，失败再删」不是好策略；§4.3 第 1、2 步的事务外预检才是主路径，异常只是兜底。

### 4.6 数值边界

| realCap | videoCap = 25% | 可容纳视频数 | 图片剩余 |
| --- | --- | --- | --- |
| 2GiB（2147483648 B） | 500MiB | 4（2000MiB） | 约 48MiB |
| 1.5GiB | 384MiB | 4（1536MiB） | 0 |
| 1GiB | 256MiB | 4（1024MiB） | 0 |
| 512MiB | 128MiB | 4（512MiB） | 0 |

**结论**：25% 规则让视频槽位恒为 4 个，并且 4 个视频恰好能占满全部预算。用户看过 4 个长视频之后，图片缓存会被淘汰到 0——而图片才是阅读的主路径。

**建议（需要 spec 拍板，#18 的 2000 条 / 500MB 决议本身不变）**：引入图片预留 `imageReserve = min(256MiB, floor(realCap × 0.15))`，视频写入时可用上界变成 `realCap - imageReserve`，即 §4.3 第 1 步的判断改为 `stats.bytes + bytes > realCap - imageReserve`。更简单的等价做法是「视频条目数上限 2」。

其余边界：
- 条目上限：2000 × 平均 400KB ≈ 800MB，字节上限通常先触发；2000 条真正起作用的场景是「小图很多」（2000 × 50KB = 100MB）。
- 单条目上限：图片没有（#18），视频是 `videoCap`。
- 键长上限：1024 字符，超长放弃缓存（§5.3）。
- 单次淘汰上限：200 条，避免一次事务持锁过久。


## 5. key 设计

### 5.1 事实：URL 即缓存键，但 JS 看不见它

- HTTP 缓存的键是 URL，新鲜度由 `Cache-Control` 等响应头决定；`immutable` 的含义是「在 fresh 期内响应不会被更新」，用来省掉条件请求，通常配 `max-age=31536000` 与带版本号的 URL 使用[来源 21]。
- Cookie 与 HTTP 缓存不受本文讨论的配额限制，而 Cache API、IndexedDB、Service Worker 都受[来源 6]。反过来，HTTP 缓存虽然「免费」，但对 JS 完全不可见：不能枚举、不能计量、不能主动删单条。
- 浏览器在存储压力下会清理 network state（含 HTTP 缓存）[来源 1]，所以 HTTP 缓存不能当权威副本。

### 5.2 key 结构

`mc:<schema>:<userScope>:<editUUID>:<basePath>:<kind>:<index>:<name>:<urlVersion>`

| 段 | 取值 | 说明 |
| --- | --- | --- |
| `mc` | 固定字面量 | 命名空间前缀，将来与其他 IDB 数据共存时不撞键 |
| `schema` | `"1"` | 我们自己的存储结构版本；结构变化时 +1 |
| `userScope` | 用户 uuid 前 8 位，未登录为 `"anon"` | 多用户隔离；配合 `bookKey` 做退出清理 |
| `editUUID` | 8 位 nanoid | 书身份；书移动路径会重新生成（server/utils/library.ts:60、:106-109） |
| `basePath` | 规范化后逐段 `encodeURIComponent`，空为 `"-"` | 同一本书里不同 zip / 子目录的来源 |
| `kind` | `"img"` / `"vid"` | 同一页序号在两种模式下不互相覆盖 |
| `index` | 十进制页序号 | 页身份之一 |
| `name` | 规范化后的文件名，逐段编码 | 页身份之二；比序号更稳，重排页序时不失效 |
| `urlVersion` | `FILE_URL_VERSION` 当前值 `"2"` | 与 URL 的 `?v=2` 语义对齐 |

把 `schema` 与 `urlVersion` 分开的理由：前者管「我们的库长什么样」，后者管「源站 URL 代表的内容语义」。两者变了都该让旧条目不可达，但触发原因不同。

### 5.3 规范化规则

| 输入 | 规则 | 依据 |
| --- | --- | --- |
| `basePath` | 反斜杠转斜杠、去掉前导 `./`、去掉首尾 `/`、折叠 `//`、`"."` 视为空 | 直接复用 `normalizeBasePath`（src/utils/fileUrl.ts:6），与 `buildFileUrl` 保持同一套语义 |
| 文件名 | Unicode NFC 归一，保留大小写 | Linux 服务端区分大小写，不能 lowercase |
| 编码 | 逐段 `encodeURIComponent` 后用 `/` 连接 | 与 `encodePathSegments`（src/utils/fileUrl.ts:40）一致 |
| 总长 | 超过 1024 字符放弃缓存 | 不截断、不做哈希兜底：截断会碰撞 |
| 空 basePath | 记为 `"-"` | 避免连续分隔符造成的歧义 |

**不做的事**：不把 URL 直接当 key（URL 含 `?v=`、协议与主机，换部署端口就全失效）；不做大小写折叠；不做二次编码（输入应是已解码的逻辑路径）。

### 5.4 多书与多用户

- `bookKey = <userScope>|<editUUID>`，建 `byBook` 索引，删单本用 `IDBKeyRange.bound(bookKey, bookKey + "\uffff")` 游标删除。
- 「清空缓存」用 `store.clear()` 两个 store，比逐条删快一个量级。
- 退出登录：删除该 `userScope` 的全部条目（隐私 + 立即释放配额）；未登录的 `"anon"` 条目保留。
- `/api/file/:editUUID/:index` 没有鉴权中间件（server/routes/api.ts:108），文件字节本身不区分用户，所以跨用户命中不构成越权；做隔离主要是避免「换账号后看到上一个账号的书封面」的观感问题，以及退出登录后仍占着配额。
- 多用户共享同一个 origin 配额：`realCap` 是 origin 级的，两个用户各 2GiB 的加法不存在。建议不做按用户均分（复杂且收益低），靠全局 LRU 共享；这一点列入 §11。

### 5.5 版本失效

- `FILE_URL_VERSION` 变化 → key 的 `urlVersion` 段变 → 旧条目全部不可达 → 由 LRU 慢慢回收。不做数据迁移。
- `schema` 变化 → 在 `onupgradeneeded` 里删 store 重建（缓存可重建，迁移代码不值得写）。
- 启动时比对 `meta.schema.v` 与当前常量；不一致就整体清空并重写，避免旧结构的数据长期滞留。
- 将来若换 `DB_NAME`，在 open 之前调一次 `indexedDB.deleteDatabase(旧名)`，并吞掉 `blocked`。

### 5.6 与 HTTP immutable 的分工，以及为什么不需要 Service Worker

| 关注点 | HTTP 缓存 | 本文的 IDB 缓存 |
| --- | --- | --- |
| 是否权威副本 | 否 | 是 |
| JS 是否可见 | 否（不可枚举、不可计量） | 是 |
| 是否计入 origin 配额 | 否[来源 6] | 是[来源 2] |
| 谁淘汰 | 浏览器自主（压力、清理） | 我们的 LRU |
| 失效依据 | URL + 响应头[来源 21] | key 里的版本段 |
| 命中成本 | 不发请求，但仍有解析与解码 | 不发请求 + 一次 IDB 读 |
| 存储压力下 | 会被清[来源 1] | 会被清[来源 2] |

**结论**：保留 `Cache-Control: max-age=31536000, immutable` + `?v=` 作为网络层加速（首次访问、跨会话冷启动），IDB 作为本地权威副本。IDB 命中时根本不发请求，HTTP 缓存只在 miss 时起作用，两者不冲突。绝不能把「HTTP 缓存命中」当成「缓存存在」来驱动 UI。

**Service Worker：不需要。** 理由：

1. SW 里不能 `createObjectURL`[来源 19][来源 20]，命中后仍要把响应交回页面再建 URL；它省下的只是「页面到网络」这一跳，而 IDB 命中本来就不发网络请求。
2. SW 需要注册、更新、激活、`clients.claim` 的完整生命周期，调试与「清空缓存」都变复杂；#18 已明确不做离线、不做整本下载。
3. SW 与 Cache API 同属安全上下文限制[来源 14]，在 `http://LAN` 部署下直接不可用。
4. 它唯一的独占能力是「在网线上拦截 `/api/file/...` 并合成 206」，而 #18 的视频不做 seek，用不上。

什么时候才值得回头用 SW：要做整本离线阅读、要让视频支持 Range seek、要缓存 ZIP 内条目而不解压。三者都在 #18 的非目标里。

## 6. 平台差异与失效

### 6.1 事实：配额

| 浏览器 | 每 origin 配额 | 全局 / 其他约束 |
| --- | --- | --- |
| Chrome / Edge（Chromium） | 持久与 best-effort 模式都最多为总磁盘的 60% | 浏览器整体上限约总磁盘 80%，超过会触发驱逐；配额按**总磁盘**而非剩余空间计算（反指纹），所以可能永远达不到[来源 2] |
| Firefox | best-effort：min(存放 profile 的磁盘的 10%, 每站点组 10GiB)；persistent：最多磁盘 50%，上限 8TiB[来源 2] | persist() 会弹权限框[来源 4] |
| Safari 17 / iOS 17 / macOS Sonoma | 浏览器 App 每 origin 最多磁盘 60%；其他内嵌 WebKit 的 App 为 15%；跨源 iframe 为主帧 origin 的 1/10[来源 6] | WebKit 整体 80%（浏览器 App）/ 20%（非浏览器 App）；17.0 起不再弹窗申请更多空间[来源 6] |
| 旧版 Safari | 初始 1GiB，之后弹窗向用户申请[来源 2] | 用户拒绝则写入失败 |

- iOS / iPadOS 上的第三方浏览器历史上必须用 WebKit，因此同样受上表约束（EU 在 iOS 17.4+ 允许其他引擎，属于例外）[来源 2]。
- 配额与淘汰按 origin 计：`estimate()` 拿到的是整个 origin 的额度，不是单个数据库的[来源 3]。

### 6.2 Safari 的 7 天与 ITP

- 2020 年的规则：**「对全部脚本可写存储设 7 天上限」——如果用户在 7 天（按 Safari 的使用天数计）内没有与站点交互，站点由脚本写入的存储会被整体删除**；当时列出的受影响类型包括 IndexedDB、LocalStorage、Media keys、SessionStorage、Service Worker 注册与缓存[来源 7]。
- 2023 年的存储策略把它并入更一般的描述：驱逐条件之一是「站点已有一段时间未被用户交互」[来源 6]。
- 现行 WebKit 源码把这件事实现为 time-based eviction：计算 `accessTime = max(fileAccessTime, diskCacheAccessTime)`，跳过 active 与 persisted 的 origin，清理类型取 `allManagedTypes()`，**其中包含 `DOMCache`（Cache API）与 `IndexedDBDatabases`**[来源 8]。所以「Cache API 比 IndexedDB 更持久」这个直觉在 Safari 上是错的。
- 主屏 Web App 有自己的天数计数器，Apple 表示不打算删除其第一方数据[来源 7]。

**对本项目的含义**：Safari 上缓存能不能活过一周，取决于用户是否在 7 天内点过这个站点。UI 不能把「缓存里应该有」当成前提，任何一次 miss 都必须能退回网络且不报错。

### 6.3 无痕 / 隐私模式

| 平台 | 行为 |
| --- | --- |
| Safari 无痕 | 使用独立的 ephemeral 存储目录（`com.apple.WebKit.Storage.ephemeral`），不做配额驱逐，关闭会话即丢弃[来源 8] |
| Firefox 无痕 | Cache API 因需要文件系统访问，在隐私模式下可能不可用[来源 14]；IndexedDB 仅在内存中存活到会话结束[来源 9] |
| Chromium 无痕 | IndexedDB 的 Blob 永不落盘、一直 pending[来源 15]；会话结束数据消失[来源 2] |

**建议**：无痕模式不特殊处理，正常读写；只在设置页加一句「无痕模式下缓存仅本次会话有效」。不要试图检测无痕（不可靠且无必要）。

### 6.4 persist() 的授予

- `persist()` 在 Chromium 55+、Firefox 57+、Safari 15.2+ 可用；`estimate()` 在 Safari 要到 17 才有[来源 5]。所以 **Safari 15.2–16.x 有 `navigator.storage` 和 `persist()`，但没有 `estimate()`**，必须 `typeof` 检测而不是 `if (navigator.storage)`。
- 授予方式：Firefox 弹权限框；Safari 与多数 Chromium 浏览器按交互历史自动决定，不弹窗[来源 4]。
- `persist()` 在 Web Worker 里不可用（`StorageManager` 本身可用）[来源 4]。

**建议**：启动时 fire-and-forget 调一次，把 `persisted()` 的结果存进 `meta`，设置页显示「系统保护：已开启 / 未开启」。不因未授予而改变任何逻辑——它只是降低被清概率，不是保证。

### 6.5 降级矩阵（建议）

| 场景 | 行为 |
| --- | --- |
| 无 `navigator.storage` 或 `estimate()` 抛错（含 http 部署） | `realCap = 2GiB`、`videoCap = 500MiB`；设置页隐藏「系统配额」一行，只显示目标/已用 |
| Safari 17+ | 正常显示 `persisted()` 状态，并提示「Safari 可能在长期未访问后清理本站缓存」 |
| 旧 Safari（15.2–16.x） | 有 persist、无 estimate，走上面的回退分支 |
| 无痕模式 | 正常读写，设置页标注「仅本次会话有效」 |
| IndexedDB 打开失败 / 被 blocked | 全部方法 no-op，阅读功能不受影响（与 `thumbCache` 的 `openDb()` 返回 `null` 同构） |
| 存储被系统清空 | 下次 open 时 reconcile 计数，随后正常回源 |


## 7. 视频缓存

### 7.1 事实：现状决定了播放与缓存必须一起设计

- 视频走 zip 分支时，服务端返回 **200 全量**，忽略 `Range`，但仍然发送 `Accept-Ranges`（server/routes/api.ts:245-250）。浏览器因此拿不到 206，播放器无法 seek，但可以边下边播。
- 缓存 API 的 `put()` 会消费响应体流[来源 13]，理论上能边下边存；IndexedDB 只能接收一个完整的 Blob，不能写一半。
- 命中后交给 `<video src=blob:...>`，浏览器按需对 blob 后端做范围读取[来源 16][来源 18]，不需要把 500MB 读进堆（Chromium；Safari 未证实，见 §11）。
- Chromium 对 blob 有明确的内存与磁盘分层：内存满或单 blob 过大时落盘[来源 16]。所以「下载成 Blob」不等于「占 500MB 内存」。

### 7.2 三条可选路径

| 方案 | 播放源 | 网络传输次数 | 首播延迟 | 能否入库 | 结论 |
| --- | --- | --- | --- | --- | --- |
| A. `<video>` 直连网络，播完再 `fetch` 一次入库 | 网络 URL | 1–2 次（第二次可能命中 HTTP 磁盘缓存） | 短（渐进播放） | 能，但依赖 HTTP 缓存是否留下这个对象 | 备选 |
| B. `fetch` → `Blob` → object URL 播放，播完把同一个 Blob 入库 | blob URL | 1 次 | 长（等整段下载完） | 能，零额外传输 | **推荐** |
| C. `Cache.put()` 存一份、`<video>` 另走网络 | 网络 URL | 2 次 | 短 | 能 | 不选（两套存储 + 双倍流量） |

**为什么不选 A 作为主路径**：A 的第二次 `fetch` 能否不产生网络流量，取决于浏览器是否把这个大对象留在 HTTP 磁盘缓存里。HTTP 缓存不计入配额、可被随时清[来源 1][来源 6]，而且大响应是否缓存属于实现细节，没有规范保证。一旦没留住，用户就为同一个视频付两次流量——在移动端不可接受。

**B 与 #18 的「首次完整缓冲并开始播放后写入」是对齐的**：把「完整缓冲」实现为「整段下载成 Blob」，把「开始播放」实现为 `<video>` 的 `playing` 事件；两个条件都满足后再 `put` 入库。这样写入的一定是用户真的看过、且已经在本地的一份数据。

**B 的代价**：首播要等整段下载。局域网 100Mbps 下 500MB 约 40 秒，需要进度 UI；而这本来也是「zip 全量、无 seek」的既定体验。

**建议的分流规则**：
- `bytes <= videoCap`：走 B，可缓存。
- `bytes > videoCap`：走 A，直接网络播放，**不缓存**。既然本来就不入库，就没必要为它付「先下完再播」的代价。
- 这条分流需要 `Content-Length` 或先 `HEAD`；拿不到长度就按 B 处理并依赖事后预检（写库前发现超限就丢弃）。

### 7.3 2GiB 下的淘汰

- 写入一个 500MB 视频，如果剩余空间不足，全局 LRU 会连续删掉大量图片——一次视频写入可能清掉几百张图。这是「单一全局 LRU」的必然结果（#18 已定），spec 需要接受这个行为，或者采用 §4.6 的图片预留。
- 淘汰发生在写入前的预检阶段，所以不会出现「写到一半空间没了」；真正的中途失败只会来自 `QuotaExceededError`，走 §4.5 的重试一次。
- 写入 500MB 是慢操作（Chromium 要落盘 + 更新 LevelDB），必须放在不阻塞渲染的后台任务里；对用户不显示进度（不可观测），只在设置页体现「已用」的增长。

### 7.4 播放中读取与 object URL 释放

- 命中：`get(key)` → `Blob` → `createObjectURL` → 赋给 `<video>`；播放过程中浏览器按需读 blob 后端。
- 播放中被淘汰：LRU 可能删掉这条记录（另一个标签页写入触发）。已 `get()` 出来的 Blob 是独立引用，URL 继续有效，播放不中断，只是下次要重新下载。这是可接受的行为。
- 释放顺序（重要）：`pause()` → `removeAttribute("src")` → `load()` → `revokeObjectURL(url)`。先断开解码器对 URL 的引用再 revoke，避免部分浏览器在解码器仍持有时读到已释放对象而抛 `MediaError`。
- 循环播放：`loop` 不会触发 `ended`（#18 已指出），所以「首次缓冲并播放」要用一次性标志位，不能等 `ended`；循环重播不重写缓存。

### 7.5 值不值得缓存

- 收益：一次局域网重看省下的下载等待；命中时首帧几乎立即出现（不需要等整段）。
- 成本：500MB = 25% 预算；写入耗时与磁盘 IO；会挤掉图片。
- 只看一次的视频，缓存是净损失。但「看没看过第二次」无法预知，所以只能靠 LRU 与容量上限兜底。
- 结论：按 #18 的 500MB 执行，但把「视频把图片挤空」列为已知风险（§10），并把「视频条目数上限 2」或「图片预留」作为 spec 可选的收敛手段。

## 8. 给 spec 的交接结论

以下每条都可以直接变成 spec 里的验收点。

**MUST**

1. 单一 IndexedDB，两个 object store：`media`（键 = §5.2 复合键，值含 `blob` / `bytes` / `mime` / `lastAccess`）与 `meta`（`stats` / `schema` / `quota` / `evict`）。
2. 值一律存 `Blob`，不存 base64、不存 `ArrayBuffer`、不存解码后的像素。
3. 写入 / 命中 / 淘汰按 §4.3 的三条路径实现；「写条目 + 改 `stats` + 淘汰」在同一个 readwrite 事务内完成。
4. key 按 §5.2 生成，`basePath`、文件名分别复用现有 `normalizeBasePath` / `normalizeFileName`；`urlVersion` 取 `FILE_URL_VERSION`。
5. 启动时按 §4.5 算 `realCap` / `videoCap`；`estimate()` 不可用时回退 2GiB / 500MiB，不得因此禁用缓存。
6. `QuotaExceededError` 走「淘汰 → 重试一次 → 只读降级 → 提示一次」，且**任何情况下不阻塞阅读与播放**。
7. 命中刷新 `lastAccess` 必须节流（同一 key 5 分钟内不重复写）。
8. 当前页的 key 进 `pinnedKeys`，淘汰时跳过。
9. 视频按 §7.2 分流：`<= videoCap` 走 fetch → Blob → 播放 → 入库；`> videoCap` 直接网络播放、不入库。
10. object URL 由创建它的组件负责 revoke，释放顺序按 §3.2 / §7.4。

**MUST NOT**

1. 不引入 Cache API、Service Worker、PWA（SW 的生命周期与版本管理成本见 §5.6[来源 22]）。
2. 不做分片缓存、不做 Range 片段缓存、不做边下边存。
3. 不用定时器驱动淘汰；淘汰只发生在写入前与启动 reconcile。
4. 不在 IDB 事务里 `await` 网络或其他外部 Promise。
5. 不把 `estimate().usage` 当作「已用」展示。
6. 不把 HTTP 缓存命中当作「缓存存在」。
7. 不做旧数据迁移；版本变化直接让旧条目不可达并清空。

**待拍板（不改变 #18 的容量与条目决议）**

- 是否引入 `imageReserve`（§4.6），或把视频条目上限压到 2，避免视频把图片挤空。
- 视频分流阈值是否就用 `videoCap`（即超过上限的视频不做「先下完再播」）。


## 9. 关键约束清单

| # | 约束 | 来源 / 依据 |
| --- | --- | --- |
| 1 | 数据库总占用不超过 `realCap = min(2GiB, quota × 80%)`；无 `estimate()` 时按 2GiB | #18 + [来源 3] |
| 2 | 条目总数不超过 2000（图片 + 视频合计）；字节与条目双上限同时生效 | #18 |
| 3 | 单视频 `videoCap = min(500MiB, realCap × 25%)`；超过不入库 | #18 + §4.6 |
| 4 | 图片无单文件上限，但 `bytes > realCap - used - reserve` 时跳过 | #18 |
| 5 | key ≤ 1024 字符，超长放弃缓存；不做哈希、不截断 | §5.3 |
| 6 | 单次事务最多删除 200 条，避免长时间持锁 | §4.3 |
| 7 | `lastAccess` 回写节流 5 分钟 | §4.4 |
| 8 | 事务内不许出现网络 `await`（会自动提交） | [来源 10] |
| 9 | 打开失败 / 被 `blocked` / 配额不可用 → 全部方法 no-op，阅读功能不受影响 | 与 `thumbCache` 同构 |
| 10 | 与 `thumbCache` 使用不同的数据库与 store，互不影响 | #18 |
| 11 | 设置页三个数字全部来自自有计数；`estimate()` 只用于定 `realCap` | §4.5 |
| 12 | 清空缓存同时清 `media` 与 `meta` | §5.4 |
| 13 | 所有写入路径可被放弃（缓存是纯优化，失败不向上抛） | §4.5 |
| 14 | 不依赖 `crypto.subtle`（与 Cache API 一样受安全上下文约束，http 部署下不可用） | §5.3 |
| 15 | 多标签页通过 `onversionchange` / `onblocked` 协同，冲突时降级而非等待 | §4.4 |

## 10. 风险与不做

### 10.1 风险（按影响排序）

1. **视频把图片挤空**：25% 规则下 4 个视频正好占满预算（§4.6）。用户看完 4 集长视频后，图片缓存归零，阅读页回到全网络加载。缓解：§4.6 的图片预留，或视频条目上限 2。
2. **一次视频写入触发大量淘汰**：500MB 入库可能连续删掉几百条图片记录，写事务耗时上升，且用户会感觉「刚才看过的图又变慢了」。
3. **Safari 上 500MB Blob 的内存行为未证实**（§11），最坏情况是播放时触发 jetsam 杀页面。
4. **B 方案的首播延迟**：整段下载完才开播，弱网或大文件时体验明显差于现状的渐进播放。
5. **HTTP 缓存不保证留下大对象**：如果 spec 最终选 A 方案，第二次 `fetch` 可能产生真实流量。
6. **多用户共享 2GiB**：两个账号在同一浏览器上互相淘汰对方的缓存。
7. **Firefox 的 relaxed durability**：写入「成功」后崩溃可能丢整个事务（缓存可接受，但不要做「已保存」的 UI 承诺）[来源 11]。

### 10.2 不做

- 离线阅读、整本下载、Service Worker、PWA（#18 非目标）。
- 视频进度记忆、音量、全屏、原生控件（#18 非目标）。
- 动图（APNG / GIF）暂停控制。
- AVI / MKV 支持与任何转码。
- 视频预取（只缓存实际播放过的）。
- poster 缓存。
- 分片 / Range 片段缓存、边下边存。
- 缓存加密、压缩、跨设备同步。
- 缓存命中率统计上报（可留本地计数，不做遥测）。

## 11. 仍不确定的点

1. **Safari 对 `get()` 一个 500MB Blob 是否整段进内存**：Chromium 有明确的 external object + 按需读取[来源 15][来源 16]，WebKit 侧没有找到对应的官方说明，只能按「可能常驻」做最坏打算。
2. **Safari / WebKit 对单条 IndexedDB 记录是否有大小上限**：没找到官方文档；Chromium 侧没有硬上限，但 LevelDB 本身不适合大值[来源 15]，所以我们依赖的是 Blob 文件化，而不是记录体本身。
3. **HTTP 磁盘缓存是否保留 500MB 级响应**：Chrome 的实现细节，未见文档；这直接决定 A 方案是否会产生二次流量。
4. **Firefox 的 IndexedDB Blob 是否同样文件化**：本次只核实了 Chromium 与 WebKit，Firefox 源码未查。
5. **Safari 7 天计时里「交互」的精确定义**：2020 博文说 user interaction，2023 博文说 interacted with；「打开页面但没点击」是否算，没有明确说明[来源 7][来源 6]。
6. **iOS 后台被 jetsam 时正在播放的 blob 行为**：无官方说明。
7. **多用户是否应按用户分配预算**：本文建议共享 + 退出清理，但 #18 没规定，属于 spec 可调整项。
8. **Safari 15.2–16.x 的 `estimate()` 缺失**只由 BCD 确认[来源 5]，没有在真机上验证过。

## 12. 来源

1. WHATWG, Storage Standard（bucket、quota、storage pressure 条款）— https://storage.spec.whatwg.org/
2. MDN, Storage quotas and eviction criteria（Chromium / Firefox / Safari 配额与驱逐）— https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
3. MDN, StorageManager.estimate() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate
4. MDN, StorageManager.persist() — https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
5. MDN browser-compat-data, api/StorageManager.json — https://github.com/mdn/browser-compat-data/blob/main/api/StorageManager.json
6. WebKit Blog, Updates to Storage Policy（2023-08-10, Sihui Liu）— https://webkit.org/blog/14403/updates-to-storage-policy/
7. WebKit Blog, Full Third-Party Cookie Blocking and More（2020-03-24, John Wilander，7 天上限）— https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
8. WebKit source, Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp（allManagedTypes / 配额驱逐 / 时间驱逐 / ephemeral 目录）— https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/NetworkStorageManager.cpp
9. MDN, Using IndexedDB（事务范围、隐私模式）— https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
10. W3C, IndexedDB（Editor's Draft，事务并发与生命周期）— https://w3c.github.io/IndexedDB/
11. MDN, IDBTransaction（auto-commit、abort 原因、relaxed durability）— https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
12. MDN, Cache（不遵守 HTTP 头、条目不过期、无需 SW）— https://developer.mozilla.org/en-US/docs/Web/API/Cache
13. MDN, Cache.put()（消费响应体、URL 方案限制）— https://developer.mozilla.org/en-US/docs/Web/API/Cache/put
14. MDN, CacheStorage（非安全上下文抛 SecurityError、隐私模式可能不可用）— https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage
15. Chromium source, content/browser/indexed_db/README.md（Blob external object、LevelDB 引用、incognito 永不落盘）— https://github.com/chromium/chromium/blob/main/content/browser/indexed_db/docs/README.md
16. Chromium source, storage/browser/blob/README.md（renderer handle、内存/磁盘限额、OOM 告警）— https://github.com/chromium/chromium/blob/main/storage/browser/blob/README.md
17. Chromium source, content/browser/cache_storage/README.md（disk_cache::Entry、响应体流式读出）— https://github.com/chromium/chromium/blob/main/content/browser/cache_storage/README.md
18. MDN, blob: URL scheme（保活、revoke 时机、Range 读取）— https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob
19. MDN, URL.createObjectURL()（SW 内不可用）— https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static
20. MDN, URL.revokeObjectURL()（SW 内不可用）— https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static
21. MDN, Cache-Control（immutable 语义）— https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
22. MDN, Service Worker API — https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API


