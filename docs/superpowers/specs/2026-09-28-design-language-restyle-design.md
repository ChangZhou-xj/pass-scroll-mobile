# 设计 spec：按 DESIGN.md 设计语言重构前端视觉（mono chrome + pastel 色块）

日期：2026-09-28
分支：feat/pass-scroll-server（继续沿用）
来源：仓库根 `DESIGN.md`（Figma 官网营销页设计系统的逆向文档）。用户拍板：提取其**设计语言**重构现有移动端页面，不照搬营销页结构（top-nav / pricing / marquee / footer 均不移植）。

## 背景与动机

「通关秘籍」当前视觉是模板演进的「品牌蓝 #3E63DD + 浅灰底 #F7F8FA」体系，色值散落在 9 个页面的 UnoCSS arbitrary value 里，无统一 token。DESIGN.md 提供了一套完整度很高的设计语言：黑白单色 chrome + 大尺寸 pastel 色块叙事 + pill 按钮 + mono 分类标签 + 字重层级。目标是在**不改变任何业务逻辑与数据流**的前提下，把这套语言落到 App 的 9 个页面、2 个现有组件与 markdown 渲染管线。

## 关键决策表

| #   | 决策点          | 决定                                                                                                                                                          | 理由                                                                                                              |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | 实施方式        | 设计语言重构现有页面，不新建营销页                                                                                                                            | 自用笔记 App 无 nav/pricing/footer 需求（用户拍板）                                                               |
| 2   | 页面 chrome     | 全部页面 `navigationStyle: custom` + 自绘 NavBar/TabBar；**删除原生 tabBar 配置**                                                                             | 用户拍板选全自定义路线；视觉上限与 eyebrow 页名需要                                                               |
| 3   | tab 切换        | `switchTab` → `reLaunch`（仅 `review/index.vue:191`、`login/index.vue:63` 两处调用点）                                                                        | 删原生 tabBar 后 switchTab 不可用；数据在 Pinia，丢的只有滚动位置                                                 |
| 4   | 图标            | NavBar/TabBar 图标用 **wd-icon**（wot-design-uni 内置 iconfont，已验证含 `home`/`books`/`user`/`chevron-left`）；`color` 直接吃 tokens 常量；**不再生成 PNG** | 已随依赖打包、三端渲染有保证、零新资产；base64 SVG 在微信 image 历史上不稳，弃用                                  |
| 5   | 字体            | 三端统一系统字体栈，不加载 web 字体；字重层级量化为 400/600/800                                                                                               | 用户拍板；loadFontFace 安卓时序风险不值当                                                                         |
| 6   | 楷体            | **退役**。`brand-title` style 块（login/index/profile 三页）删除，「通关秘籍」改 800 字重 sans wordmark + 负字距                                              | 与 mono 单声部体系冲突（用户拍板）                                                                                |
| 7   | 语义色          | 掌握绿 `#42B883`、复习黄 `#F0B429`、危险红 `#D9303E`、次要灰 `#67676C` **保留色相**；只用于 pill 徽章描边/文字与危险文字，不铺面                              | 复习场景辨识度刚需；与文档 semantic 角色（glyph 不作 surface）兼容（用户拍板）                                    |
| 8   | accent-magenta  | 不引入                                                                                                                                                        | App 无促销场景，YAGNI                                                                                             |
| 9   | 色块分配        | 每页**至多一个**签名色块（映射表见 §4）；块间回白 canvas                                                                                                      | 文档核心节奏与 Don't 条款                                                                                         |
| 10  | token 载体      | 单一来源 `src/theme/tokens.ts`（TS 常量）；模板静态 class 继续写 arbitrary hex 但取值必须出自映射表；动态色一律 `:style` + tokens.ts                          | unocss-preset-weapp 的 transformerClass 只转静态 class（项目既有陷阱记忆）；CSS 变量在 rich-text/三端风险高，弃用 |
| 11  | markdown 容器色 | tip→mint、warning→cream、danger→pink、details→lilac，注入**字面 hex**（自 tokens.ts）                                                                         | rich-text 只认 inline style，不认 CSS 变量                                                                        |
| 12  | wot-design-uni  | 页面内容不消费、不做主题化；仅 chrome 组件消费其 `wd-icon`                                                                                                    | 页面无 wd-\* 使用；图标字体三端可用是唯一刚需                                                                     |
| 13  | H5 适配层       | `adaptUnits`（rpx→px）管线与 `markdown.ts` 三段流水线结构不动，只换色值与字重                                                                                 | 契约稳定                                                                                                          |
| 14  | 深色模式        | 不做                                                                                                                                                          | DESIGN.md 自己声明 Known Gap；自用场景无需求                                                                      |

## 1. Token 系统（`src/theme/tokens.ts`）

### 1.1 色彩

| Token            | 导出名          | 值        | 替换对象                                                        |
| ---------------- | --------------- | --------- | --------------------------------------------------------------- |
| primary / ink    | `ink`           | `#0D0D0D` | `#3E63DD`（一切主色场景）、`#3C3C43`（正文）                    |
| on-primary       | `onPrimary`     | `#FFFFFF` | —                                                               |
| canvas           | `canvas`        | `#FFFFFF` | 页面底（`#F7F8FA` 退役）                                        |
| surface-soft     | `surfaceSoft`   | `#F4F5F7` | chip 底、icon 钮底                                              |
| hairline         | `hairline`      | `#E3E3E6` | `#EEEEEE`                                                       |
| hairline-soft    | `hairlineSoft`  | `#EFEFF1` | 菜单行分割                                                      |
| inverse-canvas   | `inverseCanvas` | `#0D0D0D` | —                                                               |
| inverse-ink      | `inverseInk`    | `#FFFFFF` | —                                                               |
| block-lime       | `blockLime`     | `#D9F2B4` | 新增                                                            |
| block-lilac      | `blockLilac`    | `#E7E3FA` | 新增                                                            |
| block-cream      | `blockCream`    | `#F7F2E7` | 新增                                                            |
| block-mint       | `blockMint`     | `#D6F0E3` | 新增                                                            |
| block-pink       | `blockPink`     | `#F9DCE4` | 新增（danger 容器用）                                           |
| block-coral      | `blockCoral`    | `#F8D8C8` | 本轮未用，登记备用                                              |
| block-navy       | `blockNavy`     | `#1B2A4A` | 本轮未用，登记备用                                              |
| mastery-mastered | `masteryGreen`  | `#42B883` | 保留                                                            |
| mastery-learning | `masteryAmber`  | `#F0B429` | 保留                                                            |
| danger           | `danger`        | `#D9303E` | 保留                                                            |
| secondary-text   | `secondaryText` | `#67676C` | 保留，仅限 mono caption / placeholder / 未选中 tab 等非正文角色 |

说明：DESIGN.md 的 `block-*` 只有 token 名没有 hex（其 Known Gaps 自述为截图推测值），上表为本项目拍板值，实现后如需微调只改 tokens.ts 与 class 字面量两处约定。

### 1.2 字体

- sans：`-apple-system, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif`
- mono：`"SF Mono", Menlo, Consolas, "Courier New", monospace`（eyebrow/caption/tabBar 页名专用，全大写 + 正字距）
- 层级量化（三档，替代文档 320–540 细粒度）：
  - display（hero wordmark、页面大标题）：64–72rpx / 800 / 行高 1.1 / letter-spacing `-2rpx`
  - headline（卡片标题、块内标题）：32–36rpx / 600 / `-1rpx`
  - body（正文、摘要、输入）：28–30rpx / 400
  - caption/eyebrow（meta、时间、页名、统计标签）：20–22rpx / 400 / mono / 大写 / letter-spacing `+2rpx`
- 正文一律 `ink`；层级靠字重与尺寸，**不新增中灰正文**（`secondaryText` 只允许出现在 caption 级 mono 角色、placeholder、未选中 tab）。

### 1.3 圆角与间距

- pill：`9999rpx`——一切文字 CTA、chip、分段 tab；圆形 icon 钮 `rounded-full`
- lg：`48rpx`——色块、卡片（RecordCard 24→48）
- md：`16rpx`——输入框、小元素、markdown 容器
- sm：`12rpx`——徽章小 chip
- 间距 8px 基准（×2 rpx）：色块内 padding `96rpx`（文档 xxl）、卡片内 `48rpx`（lg）、页面 section 间 `128–192rpx`
- 触控下限：pill 高 ≥88rpx（44px），icon 圆钮 88rpx，tabBar 项 ≥100rpx

## 2. Chrome：全自定义导航与 TabBar

### 2.1 pages.json

- `globalStyle`：`navigationStyle: "custom"`、`navigationBarTextStyle: "black"`、`backgroundColor: "#FFFFFF"`
- 每页 style 的 `backgroundColor/backgroundColorBottom`：`#F7F8FA` → `#FFFFFF`（下拉刷新露白底）
- **删除整个 `tabBar` 配置块**（含 6 个 PNG 引用）；`static/tabbar/*.png` 文件本轮不删（体积小、留作回滚），spec 记录为死资产
- 页面栈：tab 三页 + 二级页均 navigateTo/reLaunch 混用，无 `tabBar.list` 后 `switchTab` 调用会报错——两处调用点（决策 #3）必须同批改

### 2.2 `CustomNavBar.vue`（新组件）

- Props：`title?: string`（mono eyebrow 样式，不传则不渲染文字）、`showBack?: boolean`（默认 false）、`transparent?: boolean`（hero 页用，导航区与页面同白底无分割线）
- 结构：状态栏占位（`uni.getSystemInfoSync().statusBarHeight`，H5 恒 0）→ 44px 内容行：左侧 88rpx 圆钮（icon-circular：surface-soft 底 ink 字 `←`）+ 标题 + 右侧 slot（编辑页「保存」pill 用）
- eyebrow 中西文规则：mono 特征 = 等宽字体 + 22rpx + 正字距 `+2rpx`；「大写」仅作用于拉丁字符（如 `PASS SCROLL · NOTES`），中文页名（复习/我的/历史版本）原样渲染不转大写
- 返回逻辑：`getCurrentPages().length > 1 ? uni.navigateBack() : uni.reLaunch({ url: "/pages/index/index" })`
- 挂接：8 个二级页全挂；三个 tab 页挂 eyebrow 变体（首页不挂「首页」二字——wordmark 即标题，仅复习/我的挂 eyebrow 页名）
- 登录/onboarding：`transparent` 模式挂，保留返回能力

### 2.3 `CustomTabBar.vue`（新组件）

- 挂载于 index/review/profile 三页根部；`fixed bottom-0`，白底 + hairline 顶边
- 高度 100rpx + `padding-bottom: env(safe-area-inset-bottom)`；页面内容底部预留 `160rpx + safe-area`（复习页现有 `--tab-bar-height` 避让逻辑改为与自绘高度一致的常量）
- 三项：icon + caption 文字；选中 = `ink`，未选 = `secondaryText`；点击 `uni.reLaunch`
- icon 方案：`wd-icon`（easycom `^wd-` 已配置），TabBar 三项 `home`/`books`/`user`，返回钮 `chevron-left`；选中/未选中颜色经组件 `color` prop 传 tokens 常量（属性绑定非动态 class，无 transformerClass 陷阱）

### 2.4 wot-design-uni

页面内容不改造、不主题化；仅 CustomNavBar/CustomTabBar 消费 `wd-icon`（决策 #4/#12）。

## 3. 通用组件

### 3.1 `PsButton.vue`（新组件）

- Props：`variant: "primary" | "secondary"`（黑 pill / 白 pill）、`size: "md" | "lg"`、`block?: boolean`（全宽）、`disabled?: boolean`；emit `click`
- primary：bg `ink` 字白；secondary：白底 ink 字（文档 button-secondary 无描边）；disabled 为 primary 降至 `hairline` 底 + `secondaryText` 字
- 全 App 按钮收口到此组件：登录/注册提交、空态 CTA、复习标记、版本恢复、保存、确认弹窗替代（uni.showModal 保留系统样式，不强换）

### 3.2 FAB（首页新建钮）

保留形态改皮：120rpx 圆、bg `ink`、白 `+`；hover/按压微缩放（scale 0.96，CSS active）。

### 3.3 `RecordCard.vue` 重构

- 白底 + **1rpx hairline 描边**（替换蓝色 shadow——文档 level 1，色块才是 elevation 语言）；圆角 48rpx；内 padding 40rpx
- 标题 `ink`/600；摘要 `ink`/400/26rpx（去 `#67676C` 正文）
- mastery 徽章：sm 圆角 pill，**语义色描边 + 语义色文字、透明底**（色作 glyph 不作面）；`NONE` 不显示（现状保持）
- tags：surface-soft 底、`ink` 字、pill（去 `#3E63DD`/10 蓝底蓝字）
- 时间/分隔区 meta：mono caption 样式；`updatedAt` meta 属非正文角色可用 `secondaryText`
- 置顶 📌 emoji 保留（黑色系不冲突，图标重绘不在本轮范围）

### 3.4 首页搜索区与 tag chips

- 搜索框：白底 hairline 1rpx、md 圆角（32→16 收敛，输入框按文档 rounded.md）、placeholder `secondaryText`
- chips：静态 class 走 `chipClass` 常量（surface-soft 底 ink 字），选中态颜色继续 `:style` 直写 tokens 常量（现有 `chipStyle` 模式），选中 = 黑底白字

## 4. 逐页改造清单

| 页面                   | 签名色块   | 具体改动                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index/index.vue`      | lilac hero | 品牌区改为 lilac 色块（lg 圆角、96rpx 内 padding）：wordmark 64rpx/800、eyebrow `PASS SCROLL · NOTES`（mono 22rpx）、副句白底黑字、已掌握统计入块；页面底白；搜索/chips 按 §3.4；FAB 黑；空态文案 ink + secondary caption                                                                                       |
| `review/index.vue`     | mint       | 题目卡整体即 mint 块：标题 headline 墨黑、`MdContainer` 答案卡 lilac；「已掌握」PsButton primary、「仍需复习」PsButton secondary（黄字描边语义改由 caption 文字承担，按钮本体回归黑白对）；「包含已掌握」开关置块上方白区；底部标记栏避让改自绘高度常量                                                         |
| `profile/index.vue`    | lime       | 统计卡整体 lime 块：四大数字 display 化（800/56rpx）、趋势柱 `ink` 柱 + mono caption 日期、掌握度分布三色点保持语义色（glyph 级）；菜单列表 hairline-soft 分割、行文字 ink、右箭头 secondary；「退出登录」`danger` 红字（非按钮形态，维持现状语义但去红描边框改纯文字行 + 确认弹窗）；wordmark 同首页语汇缩小版 |
| `login/index.vue`      | cream      | 表单卡卧 cream 块内（lg 圆角）；品牌 wordmark 72rpx/800 sans（去蓝字楷体）；输入框按 §3.4 搜索框同款；提交 PsButton primary block；「去注册」secondary block                                                                                                                                                    |
| `onboarding/index.vue` | lilac      | 与登录同语汇：lilac 块承载品牌宣言 + 特性列表（mono eyebrow 小标签），CTA PsButton primary block                                                                                                                                                                                                                |
| `versions/index.vue`   | cream      | 时间线卡组卧 cream 块；每条快照白卡（md 圆角）+ mono caption 版本号/时间；「恢复此版本」PsButton secondary；预览按钮 secondary                                                                                                                                                                                  |
| `detail/index.vue`     | 无         | 白 canvas；标题 64rpx/800/负字距；tags pill（§3.3 同款）；meta mono caption；正文 markdown 走 §5；底部操作条白底 hairline 顶边，「编辑」PsButton primary、「历史」secondary                                                                                                                                     |
| `editor/index.vue`     | 无         | 白底 textarea（ink 字）；「编辑 \| 预览」分段 = pill tab（选中黑底白字，完全对齐 pricing-tab-selected 模式，颜色经 `:style`）；NavBar 右侧「保存」PsButton primary small；10409 冲突续编逻辑零改动                                                                                                              |
| `password/index.vue`   | 无         | 白底表单 + hairline 输入框 + PsButton primary block；强度提示 mono caption                                                                                                                                                                                                                                      |

行为不变量（每条都是回归红线）：乐观锁 10409 续编、快照双写、掌握度状态机、排序不变量、缓存优先/离线只读、401 强制登出、登录守卫手写模式、`RecordStoreProxy` 类型转换模式。

## 5. markdown 渲染管线（`src/utils/markdown.ts`）

- `injectStyles` 换值不换结构：h1/h2/h3 → `#0D0D0D` + 对应字重档；p/li/code 正文 → `#0D0D0D`；行内 code 底 `#F4F5F7`；hr → `#E3E3E6`
- 容器：`tip` 底 `#D6F0E3`、`warning` 底 `#F7F2E7`、`danger` 底 `#F9DCE4`、`details` 底 `#E7E3FA`，均 1rpx 同族深一档描边（色值 = 底色与 ink 之间取固定字面量，落在 tokens.ts）
- `parseNote`/`adaptUnits`/H5 换算逻辑不动；改后 H5 与 MP 双端详情页实测（rpx 换算回归）

## 6. 错误处理与边界

- 图标方案风险已收敛：wd-icon 为已安装依赖内置字体（决策 #4），无需 spike；微信开发者工具实测时确认图标渲染即可
- `reLaunch` 切 tab 后 review→index 返回手势：index 为栈底，NavBar `showBack=false`，物理返回退出 App（与原生 tabBar 行为一致）
- 安卓机型 statusBarHeight 为 0/undefined 兜底 20px；H5 恒 0
- 键盘弹起顶起 fixed 元素（App 端 `adjustPosition` 默认行为）：编辑器 textarea 非 fixed 安全；复习标记栏实测
- UnoCSS 陷阱合规自检：diff 评审时 grep `:class` 内含 `[` 的新增项，必须为零

## 7. 测试与验收

1. `pnpm type-check` 零新增报错（`RecordStoreProxy` 基线不破坏）
2. `pnpm lint`、`pnpm lint:stylelint` 通过（style 块无 rpx——本规范继续有效，色块 padding 等尺寸全走 class）
3. **H5**：`pnpm dev:h5` + 浏览器逐页截图走查 9 页 + 空态/加载态/危险操作确认弹窗；tab 互切、返回、下拉刷新白底
4. **微信小程序**：`pnpm dev:mp-weixin` + 微信开发者工具实测（wd-icon 渲染、safe-area、rich-text 容器色）
5. **App**：本轮不实测（打包链路见 docs/deployment.md），列为发版回归项
6. 交互回归清单抽验 deployment.md 验收表 #1–#14 中纯前端项：#5 新建、#7 冲突续编、#8 排序不变量、#12 离线只读、#14 登出清缓存——**必须全程通过，任何视觉改动不得触碰 store/service 逻辑**

## 8. 明确不做

- 不新建任何营销页（nav/pricing/footer/marquee 语汇不移植）
- 不引入 accent-magenta、不做深色模式、不做动效重做（仅按压态）
- 不动后端、接口契约、`record.d.ts`、store 数据结构
- 不删 `static/tabbar/*.png`（留作回滚资产）
- 不改 `vite.config.ts` 死 proxy、不动 prettier.config.mjs
- wot-design-uni 页面内容不消费也不卸载（chrome 仅用 wd-icon）
