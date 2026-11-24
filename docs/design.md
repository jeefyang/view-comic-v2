# 视觉规范：印刷工坊

> 一句话：把漫画库做成一家夜里开门的印刷工坊 —— 墨黑是工作台，纸白是校样，朱红是工头留在边上的批注。

## 方向

- **用途**：本地漫画浏览器的全部日常界面 —— 书库、书架、设置、阅读页的「阅读设置」抽屉。
- **读者**：一个人在自己的机器上翻自己收藏的漫画，长期高频使用，不需要营销感。
- **语气**：冷静、手工、可校对。像在看一份印刷校样，而不是一个 SaaS 面板。
- **一个记忆点**：朱红只出现在「当前 / 可动 / 危险」三件事上，其余全靠墨黑、纸白和 1px 细线分层。
- **模式**：操作（operate）。密度偏紧凑，信息优先于留白。

## Tokens

所有 token 定义在 `src/assets/design-system.css` 的 `:root`。组件里只准引用变量，不写裸色值。

### 颜色

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--st-ink` | `#101014` | 页面底色；朱红按钮上的文字 |
| `--st-well` | `#17171b` | 凹槽：输入框、开关轨道、选中项、缩略图底 |
| `--st-line` | `#2b2b33` | 唯一的分隔线颜色，永远 1px |
| `--st-paper` | `#f0ebe1` | 主文字、纸面试片、浅色填充 |
| `--st-graphite` | `#a09b91` | 次级文字、说明、图标 |
| `--st-vermilion` | `#e2503a` | 唯一强调色 |

派生变量：

- `--st-line-soft`：`rgba(240, 235, 225, 0.07)`
- `--st-vermilion-wash`：`rgba(226, 80, 58, 0.12)`
- `--st-graphite-wash`：`rgba(240, 235, 225, 0.08)`

规则：

- 大面积一律 `--st-ink`。面板之间**不用阴影**，只用 1px `--st-line` 或留白分隔。
- 朱红只用于：当前所在项、可交互高亮、危险操作、进度填充。不拿它铺大面积背景。
- 不用渐变做装饰。唯一允许的渐变是滑块 / 进度条的「已选段」和骨架屏微光。
- 状态语义统一走形状与文字，不靠第二、第三种强调色。

### 字体与字号

| 角色 | 变量 | 字体栈 |
| --- | --- | --- |
| 标题 / 书名 | `--st-font-display` | Iowan Old Style → Palatino Linotype → Georgia → Songti SC → Noto Serif CJK SC |
| 正文 / 界面 | `--st-font-body` | MiSans → HarmonyOS Sans SC → PingFang SC → Microsoft YaHei |
| 数字 / 路径 / 元信息 | `--st-font-mono` | Cascadia Mono → JetBrains Mono → Consolas |

字号阶梯（px）：`11 / 12 / 13 / 16 / 22 / 26 / 34`，桌面页标题 42。

- 正文不小于 16px；说明文字 13px；等宽元信息 11–12px。
- 中文正文行长不超过 62ch，导语 `.st-lede` 上限 42ch。
- 数字一律 `font-variant-numeric: tabular-nums`。
- 标题不用 Inter / Roboto / 系统默认字体。

### 间距、圆角、线

- 间距基准 8px，常用 `4 / 8 / 12 / 16 / 20 / 26 / 32`。
- 圆角只有两个：`--st-radius: 2px`（面板、按钮、输入框）与 `--st-radius-pill: 999px`（开关、胶囊索引、圆形图标按钮）。
- 阴影：无。层级只靠 1px 线和 `--st-well` 的明度差。
- 可点击区域最小 44×44。

### 动效

- 唯一入场：`.st-reveal > * > .st-panel` 的 `st-rise`，0.26s，每个面板错开 35ms，最多 5 个。
- 交互反馈：颜色 / 边框 0.15–0.18s；开关滑块 0.18s。
- `prefers-reduced-motion: reduce` 下所有动画压到 0.001ms。

## 版式骨架

三个页面共用同一套骨架，只是右栏内容不同：

- **手机（< 1000px）**：单列。页头 → 吸顶工具条 / 横向索引（可横滑）→ 内容。整页只有内容区滚动。
- **桌面（≥ 1000px）**：设置页是 `280px 索引栏 + 760px 内容栏`，两栏间距 56px；书库与书架是 860px 单列（含 48px 内边距），水平居中。上下留 32 / 64px。
- 索引栏 `position: sticky; top: 0`。当前项用左侧 2px 朱红竖线 + `--st-graphite-wash` 底，不做胶囊底色。
- 内容区自己滚动，`#main` 不滚。滚动条隐藏，键盘与触控板仍可滚。

## 组件

| 类 | 用途 | 关键规则 |
| --- | --- | --- |
| `.st-panel` | 一个内容分组 | 顶部 1px 线，首组无线；标题行 = 序号 + 标题 + 右侧当前值 |
| `.st-row` | 一行设置 | 左文右控件，最小高 56px，行间 1px 线 |
| `.st-action` | 整行可点动作 | 左标题 + 说明，右箭头；hover 时标题变朱红 |
| `.st-btn` / `--primary` / `--ghost` / `--danger` | 按钮 | 主按钮实心朱红，ghost 无边框，danger 只描边 |
| `.st-switch` | 开关 | `role="switch"` + `aria-checked`，轨道 48×26 |
| `.st-range` | 滑块 | 原生 range，已选段朱红，值等宽右对齐 |
| `.st-num` | 数字输入 | 原生 number，等宽，右对齐 |
| `.st-options` / `.st-option` | 单选卡片 | 原生 radio 隐藏，选中项左侧 2px 朱红 |
| `.st-alert` | 超限提醒 | 朱红左边框 3px，`role="status"` |
| `.st-meter` | 用量条 | 纸白 = 图片，半透明纸白 = 视频 |
| `.st-skeleton` | 加载 | 1.6s 微光，用细条而不是堆骨架卡片 |
| `.st-empty` | 空态 | 一句话说明，可选一个主按钮 |

## 页面落地

### 书库（libraryView）

- 每个书库是一张**书架卡**：左侧等宽序号（01、02…），中间书名 + 路径，右侧进入按钮。
- 当前正在使用的书库：左侧 2px 朱红竖线，序号变朱红。
- 空态：一句「还没有书库」+ 新建按钮；加载态用 3 条 `.st-skeleton`。
- 管理员的新建入口在页头右侧，不与卡片操作混排。

### 书架（shelfView）

- 页头：书库名做 serif 大标题，路径做等宽小字面包屑（每段可点，触控高度 44px）。
- 书架不整页滚动：列表自己滚（虚拟列表 + 目录位置记忆），所以页面是定高 flex 列。
- 工具条：搜索、排序、过滤、刷新全部走 `.st-btn` 与原生控件。不用 naive 的 success / info / warning 三色按钮。
- 条目行：左侧缩略图（`--st-well` 底、1px 线），右侧文件名 16px + 等宽元信息。类型用文字角标，不用彩色色块。
- hover 才出现朱红左线，静态不抢眼。
- 骨架屏用 `.st-skeleton` 细条，不用 6 张同款圆角卡。

### 全局外壳

- `body` / `#app` 背景统一 `--st-ink`，文字 `--st-paper`。
- 底部导航：四个等宽项，图标 20px + 11px 标签。当前项只有朱红文字与顶边 2px 朱红线，不做胶囊底。
- naive-ui 的主题覆盖 `src/views/settings/theme.ts` 要在 `App.vue` 的 `n-config-provider` 上生效，否则抽屉、下拉、对话框会退回默认蓝色。

## 可达性底线

- 正文对比 ≥ 4.5:1：paper on ink ≈ 15.6:1，graphite on ink ≈ 7.4:1，ink on vermilion ≈ 4.9:1。
- 所有可聚焦元素有可见焦点：2px `--st-paper` 外描边，或朱红内描边。
- 触控目标 ≥ 44×44：`.st-switch` 56×44，`.st-btn` 44 高。
- 表单控件必须有 label；图标按钮必须有 `title` 或 `aria-label`。
- 开关用 `role="switch"` + `aria-checked`；单选组用原生 radio + `role="radiogroup"`。
- 动效尊重 `prefers-reduced-motion`。
- 任何宽度下都不出现横向滚动。

## 明确不做

- 紫蓝渐变、装饰性光晕、玻璃拟态。
- Inter / Roboto / 系统字体做标题。
- emoji 当图标（只用 `@vicons` 或内联 SVG）。
- success / info / warning 三色按钮组成的工具条。
- 每张卡片一样的圆角 + 柔和阴影。
- 居中大标题 + 三张同构卡片。
- 灰色文字压在灰色背景上。

## 代码位置

- 唯一样式表：`src/assets/design-system.css`，在 `main.css`、`scrollbar.css` 之后引入。
- naive-ui 主题覆盖：`src/views/settings/theme.ts`，朱红主色 + 2px 圆角，全局复用。
- 可复用组件：`src/views/settings/components/*`（开关、滑块、试片、骨架等），新页面直接引用，不要复制。
- 新增页面时：根节点套 `.st-scope`，滚动容器沿用 `.settings-page` 的写法（`flex: 1; min-height: 0; overflow-y: auto`），内容用 `.st-panel` 分组。
