# 项目记忆（view-comic-v2）

给后续接手的人 / agent 的长期上下文。改动代码前先读这份，能避开大部分重复踩坑。

## 一句话

本地漫画浏览器：Vue 3 前端 + Express 后端（通过 `vite-plugin-node` 挂在同一个 vite 进程里），数据全部落 `data/*.json`，没有数据库。

## 技术栈与启动

- 前端：Vue 3.5 + TS + naive-ui + pinia + vue-router(hash) + UnoCSS + `@vicons/*`
- 后端：Express 5 + bcrypt + node-stream-zip + yauzl + image-size + dotenv
- 构建：vite 7 + vue-tsc，`vite-plugin-node` 把 `server/index.ts` 的 `viteNodeApp` 挂进 dev server
- `pnpm dev` → `vite --config vite.config.server.ts`（前端与 API 同端口，默认 5173，另一个 3000 是同一进程的别名）
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

## 约定与陷阱

- **路径穿越**：凡是「库根 + 相对路径」都要过 `server/utils/pathSafe.ts` 的 `resolveInsideRoot()`，它同时做字符串包含与 `realpath` 校验。
- **404 必须用 `res.sendStatus(404)`**：express 5 的 `res.send(404)` 实际返回 200 + body `404`。
- **`basePath` 语义**：压缩包书是压缩包自身相对路径（如 `img.zip`、`compare/compare.zip`），目录书是目录相对路径（根目录为 `"."`）。`reloadComicViewList()` 要把它拆成「父路径 + 最后一段」再传给 `comicViewList`。
- **服务端代码不热重载**：`vite.config.server.ts` 的 `VitePluginNode` 没开 watch，改 `server/` 下任何文件都要重启 `pnpm dev`；前端 `.vue` / `.ts` 走 HMR。
- **别在同一文件分多次改**：vite 会缓存「引用了但还没 import」的中间产物，表现为 `xxx is not defined`；同一个文件的多处改动尽量一次写完。
- **`vue-tsc` 有 7 个既有错误**（`common/apis/tools/apiUrlsTrans.ts(11)`、`example.ts(13)`、`transFetch.ts(40/60/67/72)`、`common/utils/ext.ts(15)`），改动前后都应只有这 7 个，多出来就是自己引入的。
- 模板里裸写 `@vicons/*` 组件名不会被解析（`vite.config.ts` 只配了 `NaiveUiResolver`），必须显式 `import`。
- 纯 CSS 的 `<style scoped>` 里不能用 `//` 注释（会报 `Unknown word`）。

## 已实现的功能面

- 阅读器：瀑布流 / 单页翻页两种模式；自适应 / 宽度 / 高度 / 旋转四种适配（宽度与高度适应可拖动看超出部分）；双开页自动两屏（顺序随翻页方向）；页码指示、文件名栏、点击页码跳页、文件列表抽屉（三种排序 + 正反序）
- 点击区域：可拖拽 / 八向改大小 / 2% 吸附；动作含翻页、切 UI、设置、跳页、返回书架 / 书库、切换适配方式；预设布局；布局上传到个人账户（`userConfig.tapZoneLayouts`，同名覆盖）
- 设置页：阅读 / 翻页 / 账号 / 数据四个标签；阅读设置另有半屏抽屉
- 书架：搜索（含扩展名）、三种排序、正反序、文件 / 文件夹过滤、文件夹优先
- 安全：`/file`、`/view/*` 全部限制在书库根内

## 已知待办

- 缩略图接口 `/Thumbnail/:path` 恒 404（未实现）
- `JsonConfig` 是空接口，`/config/getConfig` 返回 `{}`
- 书架排序偏好未持久化（刷新回默认）；`rar` 仍被当普通文件处理
- `server/utils/view.ts` 的文件夹书修复需重启 dev server 才生效（曾导致子目录文件夹书 500）
