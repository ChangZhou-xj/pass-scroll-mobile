# 设计语言重构（mono chrome + pastel 色块）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 DESIGN.md 设计语言重构 9 个页面视觉：黑白 mono chrome + 每页一个 pastel 签名色块 + pill 按钮体系，业务逻辑零改动。

**Architecture:** 先落 token 层（`src/theme/tokens.ts` 唯一色彩/圆角来源）与三个新组件（PsButton / CustomNavBar / CustomTabBar），再改 pages.json 切全自定义导航并删原生 tabBar（唯一行为改动：switchTab→reLaunch），随后逐页重皮，最后 markdown 管线换色与全局清零走查。

**Tech Stack:** uni-app Vue3 script setup + UnoCSS（unocss-preset-weapp，static class arbitrary value 可用、`:class` 动态色禁用）+ wd-icon（wot-design-uni 内置 iconfont，已验证 `home`/`books`/`user`/`chevron-left` 存在）。前端无测试框架，验证 = `pnpm type-check` + `pnpm lint` + H5 浏览器实测（chrome-devtools）。

**Spec:** [docs/superpowers/specs/2026-09-28-design-language-restyle-design.md](../specs/2026-09-28-design-language-restyle-design.md)（图标决策已修订为 wd-icon，spec 与本计划一致）

**门禁口径（全计划统一）:** 各任务验证行里的「`pnpm type-check` src/ 零报错」不是指命令 exit 0。本仓库基线含 **9 条 `node_modules/wot-design-uni` 的存量 d.ts/组件类型错**（`components/common/util.ts`×3、`wd-progress.vue`×4、`wd-upload.vue`×2），在 ed999b8 之前的提交里就已存在、与本次重皮无关。因此达标判定固定为两条：**① `pnpm type-check 2>&1 | grep -cE '^src/'` == 0；② `pnpm type-check 2>&1 | grep -c '^node_modules'` 仍 == 9（存量集合不扩大）**。修它不在本轮范围：不放宽 tsconfig、不改 package.json、不删依赖来「消掉」这 9 条。

## Global Constraints

- **色板（DESIGN.md 拍板值，全计划唯一来源）**：ink `#0D0D0D`、canvas `#FFFFFF`、surface-soft `#F4F5F7`、hairline `#E3E3E6`、hairline-soft `#EFEFF1`、block-lime `#D9F2B4`、block-lilac `#E7E3FA`、block-cream `#F7F2E7`、block-mint `#D6F0E3`、block-pink `#F9DCE4`、块描边：mintStroke `#A9DCC3`、creamStroke `#E4D5B5`、pinkStroke `#F0B8CB`、lilacStroke `#C4B8EE`；语义色保留：masteryGreen `#42B883`、masteryAmber `#F0B429`、danger `#D9303E`、secondaryText `#67676C`（仅 caption/placeholder/未选中 tab，禁入正文）
- **退役色**：`#3E63DD`、`#3C3C43`、`#F7F8FA`、`#EEEEEE`、`rgba(62,99,221,…)`——T12 前允许暂存于未改造页，改造后不得新增
- **字体**：系统栈（App.vue 全局 `page` 规则），mono 用 unocss `font-mono`；楷体（STKaiti/KaiTi）8 处 style 块全删（login/index/profile 的 `.brand-title`、review/detail/editor/versions 的 `.note-title`、onboarding 的 `.onboard-title`），模板中对应 class 名一并移除；wordmark/标题改 `font-extrabold tracking-[-1rpx]` 系
- **圆角**：pill `9999rpx`（CTA/chip/分段 tab）、卡片 `rounded-48rpx`、输入框/小元素 `rounded-16rpx`、徽章 `rounded-full`；触控高度 ≥88rpx
- **UnoCSS 陷阱**：动态颜色一律 `:style`（可含 tokens 常量），严禁 `:class` 里出现 `[`；本计划所有动态色均已写成 `:style` 形式
- **stylelint**：`<style>` 块内禁 rpx（尺寸走 class；safe-area 用 `:style` 内联）
- **规范**：双引号/分号/2 空格、LF、conventional 中文 scope（`feat(pages): …` / `style(pages): …`）；包管理只用 pnpm；`src/types/auto-imports.d.ts` 的漂移**永不 add 进提交**
- **行为红线**：乐观锁 10409 续编、快照双写、掌握度状态机、排序不变量、缓存优先、401 登出、登录守卫、`RecordStoreProxy` 模式——本计划所有任务不得触碰 store/service/api 逻辑（唯一的跳转改动在 T4）
- **走查环境**（每个 H5 走查步骤前置）：便携 MySQL（CLAUDE.md 命令）、`cd server && npm run start:dev`、根目录 `pnpm dev:h5`（后台起，http://localhost:5173）；走查账号 `walkthrough01 / Passsc2026ok`（不存在则先注册）

### 全局替换表 G（页面重皮任务统一适用，逐文件执行后人工复核边界）

| 原字符串                                                                       | 替换为                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `bg-[#F7F8FA]`                                                                 | `bg-white`                                      |
| `shadow-[0_4rpx_24rpx_rgba(62,99,221,0.06)]`                                   | `border-2rpx border-solid border-[#E3E3E6]`     |
| `text-[#3C3C43]`                                                               | `text-[#0D0D0D]`                                |
| `text-[#3E63DD]`                                                               | `text-[#0D0D0D]`                                |
| `bg-[#3E63DD]/10`                                                              | `bg-[#F4F5F7]`                                  |
| `bg-[#3E63DD]`                                                                 | `bg-[#0D0D0D]`                                  |
| `border-[#3C3C43]/20`                                                          | `border-[#E3E3E6]`                              |
| `#EEEEEE`（class 内）                                                          | `#E3E3E6`（行分割语境改 `#EFEFF1`）             |
| `border-[#3E63DD]`                                                             | `border-[#E3E3E6]`（按钮语境则整段换 PsButton） |
| `rounded-24rpx`（卡片外壳）                                                    | `rounded-48rpx`                                 |
| `rounded-32rpx`（搜索框/分段槽）                                               | `rounded-16rpx`（分段槽改 `rounded-full`）      |
| `rounded-12rpx`、`rounded-44rpx`、`rounded-40rpx`、`rounded-48rpx`（按钮语境） | `rounded-full`（或换 PsButton）                 |

---

### Task 1: token 层与全局字体基线

**Files:**

- Create: `src/theme/tokens.ts`
- Modify: `src/App.vue`（空 style 块 → 全局 page 规则）
- Modify: `src/pages.json`（仅色值字段：各页 `backgroundColor/backgroundColorBottom` 与 `globalStyle` → `#FFFFFF`）

**Interfaces:**

- Produces: `T`（色值常量对象）；App.vue 内 `page` 字体规则全局生效

- [ ] **Step 1: 写 `src/theme/tokens.ts`**

```ts
/** 设计 token 唯一来源（DESIGN.md 落地，见 spec 2026-09-28-design-language-restyle）
 * 模板静态 class 的 hex 必须与本表一致；动态 :style 一律从这里取值 */
export const T = {
  ink: "#0D0D0D",
  onPrimary: "#FFFFFF",
  canvas: "#FFFFFF",
  surfaceSoft: "#F4F5F7",
  hairline: "#E3E3E6",
  hairlineSoft: "#EFEFF1",
  blockLime: "#D9F2B4",
  blockLilac: "#E7E3FA",
  blockCream: "#F7F2E7",
  blockMint: "#D6F0E3",
  blockPink: "#F9DCE4",
  blockCoral: "#F8D8C8",
  blockNavy: "#1B2A4A",
  mintStroke: "#A9DCC3",
  creamStroke: "#E4D5B5",
  pinkStroke: "#F0B8CB",
  lilacStroke: "#C4B8EE",
  masteryGreen: "#42B883",
  masteryAmber: "#F0B429",
  danger: "#D9303E",
  secondaryText: "#67676C",
} as const;
```

- [ ] **Step 2: App.vue 全局字体**

把 `<style></style>` 替换为：

```vue
<style>
page {
  font-family: -apple-system, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif;
}
</style>
```

- [ ] **Step 3: pages.json 色字段**

`globalStyle` 的 `navigationBarBackgroundColor` 与 `backgroundColor`、各页 `backgroundColor/backgroundColorBottom` 的 `#F7F8FA`/`#F8F8F8` 全部改为 `#FFFFFF`。其余不动（本任务不删 tabBar、不设 custom）。

- [ ] **Step 4: 验证**

`pnpm type-check` → src/ 零报错；`pnpm lint` → 通过；`pnpm lint:stylelint` → 通过（App.vue 无 rpx）。起走查环境后打开 http://localhost:5173 首页：下拉刷新露出区域应为白色。

- [ ] **Step 5: Commit**

```bash
git add src/theme/tokens.ts src/App.vue src/pages.json
git commit -m "feat(theme): 设计 token 层与全局字体基线"
```

---

### Task 2: PsButton 与 RecordCard

**Files:**

- Create: `src/components/PsButton.vue`
- Modify: `src/components/RecordCard.vue`（整文件替换）

**Interfaces:**

- Consumes: `T`（Task 1）
- Produces: `PsButton`——props `variant?: "primary" | "secondary"`（默认 primary）、`size?: "sm" | "md" | "lg"`（默认 md：64/88/96rpx 高）、`block?: boolean`、`disabled?: boolean`；emit `click`（disabled 时不触发）；默认插槽为文字。easycom 兜底直接写 `<PsButton>`（同 `<RecordCard>` 现状）

- [ ] **Step 1: 写 `src/components/PsButton.vue`**

```vue
<template>
  <view :class="block ? 'w-full flex-center' : 'flex-center'" :style="boxStyle" @click="onClick">
    <text :style="labelStyle"><slot /></text>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary";
    size?: "sm" | "md" | "lg";
    block?: boolean;
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", block: false, disabled: false },
);

const emit = defineEmits<{ click: [] }>();

const HEIGHTS = { sm: "64rpx", md: "88rpx", lg: "96rpx" } as const;
const FONT_SIZES = { sm: "26rpx", md: "30rpx", lg: "30rpx" } as const;

// secondary 加 hairline 描边：文档的无边白钮依赖彩底对比，App 白 canvas 上需要边缘
const boxStyle = computed(() => {
  const base = `height:${HEIGHTS[props.size]};border-radius:9999rpx;padding:0 48rpx;`;
  if (props.disabled) return `${base}background:${T.hairline};`;
  return props.variant === "primary"
    ? `${base}background:${T.ink};`
    : `${base}background:${T.canvas};border:2rpx solid ${T.hairline};`;
});

const labelStyle = computed(() => {
  const color = props.disabled ? T.secondaryText : props.variant === "primary" ? T.onPrimary : T.ink;
  return `font-size:${FONT_SIZES[props.size]};color:${color};line-height:1;`;
});

const onClick = () => {
  if (props.disabled) return;
  emit("click");
};
</script>
```

- [ ] **Step 2: 整文件替换 `src/components/RecordCard.vue`**

```vue
<template>
  <view class="mb-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-40rpx" @click="handleClick">
    <view class="flex items-center">
      <text v-if="record.isPinned" class="mr-8rpx text-32rpx">📌</text>
      <text class="truncate text-32rpx font-semibold tracking-[-1rpx] text-[#0D0D0D]">{{ record.title }}</text>
      <text
        v-if="record.mastery !== 'NONE'"
        class="ml-12rpx shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"
        :style="masteryStyle">
        {{ masteryText }}
      </text>
    </view>
    <text class="line-clamp-2 mt-12rpx text-26rpx text-[#0D0D0D]">{{ summary }}</text>
    <view class="mt-20rpx flex items-start justify-between">
      <view class="flex flex-1 flex-wrap">
        <text
          v-for="tag in record.tags"
          :key="tag"
          class="mr-12rpx mb-8rpx rounded-full bg-[#F4F5F7] px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
          {{ tag }}
        </text>
      </view>
      <text class="ml-16rpx shrink-0 font-mono text-20rpx tracking-[2rpx] text-[#67676C]">
        {{ formatTime(record.updatedAt) }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { T } from "@/theme/tokens";
import { formatTime, plainText } from "@/utils/format";

const props = defineProps<{ record: RecordItem }>();
const emit = defineEmits<{
  click: [record: RecordItem];
}>();

const summary = computed(() => plainText(props.record.content));

const masteryText = computed(() => (props.record.mastery === "MASTERED" ? "已掌握" : "复习中"));
const masteryStyle = computed(() => {
  const c = props.record.mastery === "MASTERED" ? T.masteryGreen : T.masteryAmber;
  return `border-color:${c};color:${c};`;
});

const handleClick = () => {
  emit("click", props.record);
};
</script>
```

- [ ] **Step 3: 验证**

`pnpm type-check` src/ 零报错、`pnpm lint` 通过。走查环境首页列表：卡片应为白底 1px 级灰描边（chrome-devtools 取 `.RecordCard 根节点` 的 computed `border-top-color` = `rgb(227, 227, 230)`、`box-shadow` = `none`）；tag chip computed `background-color` = `rgb(244, 245, 247)`。

- [ ] **Step 4: Commit**

```bash
git add src/components/PsButton.vue src/components/RecordCard.vue
git commit -m "feat(components): PsButton 黑白 pill 与 RecordCard 描边化"
```

---

### Task 3: CustomNavBar 与 CustomTabBar

**Files:**

- Create: `src/components/CustomNavBar.vue`
- Create: `src/components/CustomTabBar.vue`

**Interfaces:**

- Consumes: `T`（Task 1）、`PsButton`（Task 2，右侧插槽由页面用）、`wd-icon`（easycom `^wd-` 已配）
- Produces: `CustomNavBar`——props `title?: string`（mono eyebrow 展示）、`showBack?: boolean`（默认 false；栈深 ≤1 时组件内部自动不渲染）、`transparent?: boolean`；具名插槽 `right`。`CustomTabBar`——无 props，按 `getCurrentPages()` 尾项 route 判定选中，点击 `uni.reLaunch`

- [ ] **Step 1: 写 `src/components/CustomNavBar.vue`**

```vue
<template>
  <view :style="wrapStyle">
    <view class="h-88rpx flex items-center px-24rpx">
      <view
        v-if="showBack && canGoBack"
        class="mr-16rpx h-72rpx w-72rpx shrink-0 flex-center rounded-full"
        :style="{ background: T.surfaceSoft }"
        @click="goBack">
        <wd-icon name="chevron-left" :size="20" :color="T.ink" />
      </view>
      <text v-if="title" class="font-mono text-22rpx uppercase tracking-[2rpx] text-[#0D0D0D]">{{ title }}</text>
      <view class="flex-1" />
      <slot name="right" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";

const props = withDefaults(defineProps<{ title?: string; showBack?: boolean; transparent?: boolean }>(), {
  title: "",
  showBack: false,
  transparent: false,
});

// H5 无原生状态栏恒 0；App/MP 端 statusBarHeight 异常为 0 时兜底 20px
let statusBarPx = 0;
// #ifndef H5
statusBarPx = uni.getSystemInfoSync().statusBarHeight || 20;
// #endif

const canGoBack = getCurrentPages().length > 1;

const goBack = () => {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: "/pages/index/index" });
  }
};

const wrapStyle = computed(
  () => `padding-top:${statusBarPx}px;background:${props.transparent ? "transparent" : T.canvas};`,
);
</script>
```

- [ ] **Step 2: 写 `src/components/CustomTabBar.vue`**

```vue
<template>
  <view
    class="fixed bottom-0 left-0 right-0 z-50 border-t-2rpx border-solid border-[#E3E3E6] bg-white"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }">
    <view class="h-100rpx flex">
      <view
        v-for="item in items"
        :key="item.path"
        class="flex-1 flex flex-col items-center justify-center"
        @click="go(item.path)">
        <wd-icon :name="item.icon" :size="activePath === item.path ? 22 : 20" :color="colorFor(item.path)" />
        <text class="mt-4rpx text-20rpx" :style="{ color: colorFor(item.path) }">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";

const items = [
  { path: "pages/index/index", icon: "home", text: "首页" },
  { path: "pages/review/index", icon: "books", text: "复习" },
  { path: "pages/profile/index", icon: "user", text: "我的" },
];

const pages = getCurrentPages();
const activePath = pages.length ? pages[pages.length - 1].route : "";

const colorFor = (path: string) => (activePath === path ? T.ink : T.secondaryText);

const go = (path: string) => {
  if (activePath === path) return;
  uni.reLaunch({ url: `/${path}` });
};
</script>
```

- [ ] **Step 3: 验证**

`pnpm type-check` src/ 零报错、`pnpm lint` 通过。组件尚未挂载，编译期不报错即达成本任务；浏览器验证在 T4 挂载后进行。

- [ ] **Step 4: Commit**

```bash
git add src/components/CustomNavBar.vue src/components/CustomTabBar.vue
git commit -m "feat(components): 自定义导航栏与 tabBar（wd-icon）"
```

---

### Task 4: chrome 接线（pages.json 重构 + 挂载 + 跳转改道）

**Files:**

- Modify: `src/pages.json`
- Modify: 9 个页面模板（根部插组件，不改内容区）
- Modify: `src/pages/review/index.vue:191`、`src/pages/login/index.vue:63`（switchTab → reLaunch）

**Interfaces:**

- Consumes: `CustomNavBar`、`CustomTabBar`（Task 3）
- Produces: 各页 chrome 挂载形态（后续页面任务以此为基础）

- [ ] **Step 1: `src/pages.json` 整文件替换为**

```json
{
  "easycom": {
    "autoscan": true,
    "custom": {
      "^my-(.*)": "@/components/$1.vue",
      "^wd-(.*)": "wot-design-uni/components/wd-$1/wd-$1.vue",
      "^(.*)": "@/components/$1.vue"
    }
  },
  "pages": [
    { "path": "pages/index/index", "style": { "enablePullDownRefresh": true, "backgroundColor": "#FFFFFF" } },
    { "path": "pages/review/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/profile/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/onboarding/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/login/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/detail/index", "style": {} },
    { "path": "pages/versions/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/password/index", "style": { "backgroundColor": "#FFFFFF" } },
    { "path": "pages/editor/index", "style": {} }
  ],
  "globalStyle": {
    "navigationStyle": "custom",
    "navigationBarTextStyle": "black",
    "backgroundColor": "#FFFFFF"
  }
}
```

注意：整块删除 `tabBar` 配置与每页 `navigationBarTitleText`/`backgroundColorBottom`；`static/tabbar/*.png` 保留在仓库不引用（spec 决策：回滚资产）。JSON 末尾不留尾逗号（上面示例若有请去除）。

- [ ] **Step 2: 逐页挂载组件（只动模板根部/尾部）**

| 页         | 根 `<view>` 之后插入                                    | 根 `<view>` 闭合前插入 |
| ---------- | ------------------------------------------------------- | ---------------------- |
| index      | （无导航栏——hero wordmark 即标题）                      | `<CustomTabBar />`     |
| review     | `<CustomNavBar title="复习" />`                         | `<CustomTabBar />`     |
| profile    | `<CustomNavBar title="我的" />`                         | `<CustomTabBar />`     |
| detail     | `<CustomNavBar title="详情" show-back />`               | —                      |
| editor     | `<CustomNavBar :title="navTitle" show-back />`          | —                      |
| versions   | `<CustomNavBar title="历史版本" show-back />`           | —                      |
| password   | `<CustomNavBar title="修改密码" show-back />`           | —                      |
| login      | `<CustomNavBar transparent />`                          | —                      |
| onboarding | 不挂（全屏 swiper 与 in-flow 导航冲突，「跳过」即出口） | —                      |

editor 的 script 中删除 `uni.setNavigationBarTitle(...)`（现 204 行），新增：

```ts
const navTitle = computed(() => (editId.value ? "编辑记录" : "新建记录"));
```

versions（现 136 行）、password（现 79 行）的 `uni.setNavigationBarTitle(...)` 直接删除。

- [ ] **Step 3: 三个 tab 页底部留白**

index 根 class `pb-200rpx` → `pb-260rpx`；review 根 `pb-160rpx` → `pb-260rpx`（H5 条件块的 `--tab-bar-height, 50px` 兜底值恰等于自绘 100rpx，不动）；profile 根 `pb-60rpx` → `pb-200rpx`。

- [ ] **Step 4: switchTab → reLaunch**

`src/pages/review/index.vue:191`：`uni.switchTab({ url: "/pages/index/index" });` → `uni.reLaunch({ url: "/pages/index/index" });`
`src/pages/login/index.vue:63`：`setTimeout(() => uni.switchTab({ url: "/pages/index/index" }), 800);` → `setTimeout(() => uni.reLaunch({ url: "/pages/index/index" }), 800);`

- [ ] **Step 5: 验证（本计划第一次完整走查）**

`pnpm type-check` src/ 零报错、`pnpm lint` 通过。H5 走查：

1. 注册/登录 → 800ms 后进首页不白屏（reLaunch 生效）
2. 底部自绘 tabBar：选中项黑、未选灰；三 tab 互切正常，复习页标记栏不与 tabBar 重叠
3. detail→编辑/历史 → NavBar 返回钮可回；栈底（index）无返回钮
4. 首页下拉刷新区域为白色
5. chrome-devtools `getComputedStyle` 抽查 tabBar：`background-color` = `rgb(255,255,255)`，`border-top-color` = `rgb(227,227,230)`

- [ ] **Step 6: Commit**

```bash
git add src/pages.json src/pages/*/index.vue
git commit -m "feat(pages): 全自定义导航与 tabBar 接线，tab 切换改 reLaunch"
```

---

### Task 5: 首页（lilac hero 签名块 + 搜索/chips/FAB 黑白化）

**Files:**

- Modify: `src/pages/index/index.vue`

**Interfaces:** Consumes `T`、`RecordCard`（Task 2）、`CustomTabBar`（Task 4）

- [ ] **Step 1: 模板重写**

模板 2–12 行（品牌区）替换为 lilac hero：

```vue
<view class="min-h-screen bg-white px-30rpx pb-260rpx">
    <!-- 品牌 hero：lilac 签名色块 -->
    <view class="mt-24rpx rounded-48rpx bg-[#E7E3FA] px-48rpx pb-40rpx pt-56rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">PASS SCROLL · NOTES</text>
      <text class="mt-12rpx block text-64rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">通关秘籍</text>
      <text class="mt-12rpx block text-26rpx text-[#0D0D0D]">分享知识，随笔</text>
      <text v-if="recordStore.records.length > 0" class="mt-24rpx block font-mono text-22rpx tracking-[2rpx] text-[#0D0D0D]">
        已掌握 {{ masteredCount }}/{{ recordStore.total }}
      </text>
    </view>
```

搜索区容器（原 15 行）改：`class="mt-32rpx h-80rpx flex items-center rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx"`。
模板尾部 `</view>` 前插 `<CustomTabBar />`（T4 已挂则跳过）。其余按 G 表替换（空态/底部统计文案 `text-[#67676C]` 保留——caption 角色；FAB `bg-[#3E63DD]` → `bg-[#0D0D0D]`）。

- [ ] **Step 2: script 改 chips 样式常量**

```ts
import { T } from "@/theme/tokens";
// chipClass：rounded-32rpx → rounded-full
const chipClass = "mr-16rpx shrink-0 whitespace-nowrap rounded-full px-28rpx py-10rpx text-24rpx";
const chipStyle = (active: boolean) =>
  active ? `background:${T.ink};color:${T.onPrimary};` : `background:${T.surfaceSoft};color:${T.ink};`;
```

tag 前置 `#` 号的颜色绑定改为 `:style="{ color: recordStore.activeTag === tag ? '#FFFFFF' : '#0D0D0D' }"`。

- [ ] **Step 3: 删 `.brand-title` style 块**

整个 `<style scoped>` 块删除（wordmark 已用 class）。

- [ ] **Step 4: 验证**

`pnpm type-check`、`pnpm lint` 通过。H5 首页走查 + computed 断言：hero `background-color` = `rgb(231, 223, 250)`；chips 选中态底色 `rgb(13, 13, 13)`；FAB 底色同。交互回归：搜索、清空、切标签、进详情、新建跳转全部正常。

- [ ] **Step 5: Commit**

```bash
git add src/pages/index/index.vue
git commit -m "style(pages): 首页 lilac hero 与黑白 chrome 化"
```

---

### Task 6: 复习页（mint 题目块 + 黑白按钮对）

**Files:**

- Modify: `src/pages/review/index.vue`

**Interfaces:** Consumes `T`、`PsButton`（Task 2）、`CustomNavBar/TabBar`（Task 4）

- [ ] **Step 1: 题目卡整卡改 mint 块（模板 5–37 行外层容器）**

```vue
<view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#D6F0E3] p-48rpx"></view>
```

块内：标题 `text-40rpx font-bold text-[#3C3C43]` → `text-40rpx font-semibold tracking-[-1rpx] text-[#0D0D0D]`（删 `note-title` class）； mastery 文字（12 行）保留 `:style` 语义色但补 pill 描边形态：`class="ml-12rpx shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"`；tags 按 G 表；分割线 `bg-[#EEEEEE]` → `bg-[#A9DCC3]`（mintStroke，静态 hex）；「先自己作答…」`text-[#67676C]` 保留。

- [ ] **Step 2: 池提示行（40–49 行）**

「重置为全部」「包含已掌握」两处 `text-[#3E63DD]` → `text-[#0D0D0D] font-semibold`。

- [ ] **Step 3: 底部双按钮与标记栏换 PsButton**

```vue
      <view class="mx-30rpx mt-30rpx flex">
        <view class="mr-20rpx flex-1"><PsButton variant="secondary" size="lg" block @click="goDetail">查看详情</PsButton></view>
        <view class="flex-1"><PsButton size="lg" block @click="pickRandom">换一题</PsButton></view>
      </view>
```

标记栏（64–77 行）：外层 `border-[#EEEEEE]` → `border-[#E3E3E6]`；内部两钮替换：

```vue
        <view class="flex">
          <view class="mr-20rpx flex-1"><PsButton variant="secondary" size="lg" block @click="mark('LEARNING')">仍需复习</PsButton></view>
          <view class="flex-1"><PsButton size="lg" block @click="mark('MASTERED')">已掌握</PsButton></view>
        </view>
```

（黄/绿语义已由块内徽章承载，按钮回归黑白对——spec §4。）
空态 CTA（86–90 行）→ `<PsButton class="mt-40rpx" size="lg" @click="handleEmptyAction">…</PsButton>`（文案三元保持）。

- [ ] **Step 4: script/style 清理**

删 `.note-title` style 块；H5 避让 style 块保留，注释改「自绘 tabBar 内容区 100rpx（H5=50px），标记栏上浮避让」；T4 已改 reLaunch。

- [ ] **Step 5: 验证**

`pnpm type-check`/`pnpm lint` 通过。H5 走查：题目块 `background-color` = `rgb(214, 240, 227)`；点开答案→标记栏浮现→标「已掌握」黑 pill 成功、再抽题；「包含已掌握」切换正常；H5 底部标记栏压在 tabBar 之上不重叠。

- [ ] **Step 6: Commit**

```bash
git add src/pages/review/index.vue
git commit -m "style(pages): 复习页 mint 题目块与黑白按钮对"
```

---

### Task 7: 我的页（lime 统计块 + 退出红字行）

**Files:**

- Modify: `src/pages/profile/index.vue`

**Interfaces:** Consumes `T`、`CustomTabBar`（Task 4）

- [ ] **Step 1: 用户卡**

头像圆 `bg-[#3E63DD]` → `bg-[#0D0D0D]`；用户名按 G 表。

- [ ] **Step 2: 统计卡 + 趋势卡合并为一个 lime 块**

模板 13–71 行（两张白卡）整体替换为：

```vue
      <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#D9F2B4] p-48rpx">
        <text class="block font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">STATS</text>
        <view class="mt-24rpx flex">
          <view class="flex-1 flex-col flex-center">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.total }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">笔记</text>
          </view>
          <view class="flex-1 flex-col flex-center">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.tagCount }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">标签</text>
          </view>
          <view class="flex-1 flex-center flex-col">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.pinnedCount }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">置顶</text>
          </view>
        </view>

        <view class="mt-32rpx h-2rpx bg-[#A9DCC3]" />

        <view class="mt-32rpx flex h-200rpx items-end justify-between">
          <view v-for="(day, index) in trendDays" :key="index" class="flex flex-1 flex-col items-center">
            <text class="mb-8rpx text-20rpx text-[#0D0D0D]">{{ day.count || "" }}</text>
            <view class="w-32rpx rounded-t-8rpx" :style="{ height: day.height + 'rpx', background: day.count ? T.ink : T.hairline }" />
            <text class="mt-8rpx font-mono text-20rpx tracking-[2rpx] text-[#0D0D0D]">{{ day.label }}</text>
          </view>
        </view>

        <view class="mt-32rpx flex items-center justify-between">
          <view class="flex items-center">
            <view class="h-120rpx w-120rpx flex-center rounded-full" :style="{ background: masteryRing }">
              <view class="h-88rpx w-88rpx flex-center rounded-full bg-white">
                <text class="text-28rpx font-bold text-[#42B883]">{{ masteryRate }}%</text>
              </view>
            </view>
            <view class="ml-20rpx flex flex-col">
              <text class="text-26rpx font-semibold text-[#0D0D0D]">掌握率</text>
              <text class="mt-4rpx text-22rpx text-[#0D0D0D]">{{ stats.mastery.mastered }}/{{ stats.total }} 条已掌握</text>
            </view>
          </view>
          <view class="flex flex-col">
            <text class="text-22rpx text-[#0D0D0D]">未掌握 {{ stats.mastery.none }}</text>
            <text class="mt-8rpx text-22rpx text-[#0D0D0D]">复习中 {{ stats.mastery.learning }}</text>
            <text class="mt-8rpx text-22rpx text-[#0D0D0D]">已掌握 {{ stats.mastery.mastered }}</text>
          </view>
        </view>
      </view>
```

script 里 `trendDays` 计算与 `masteryRing`（conic green/hairline 保留）不动；柱底色已改 `:style` 引 `T`——需在 script 顶部 `import { T } from "@/theme/tokens";`，并把 `masteryRing` 的 `#EEEEEE` 换 `T.hairline`：

```ts
const masteryRing = computed(
  () => `conic-gradient(${T.masteryGreen} 0% ${masteryRate.value}%, ${T.hairline} ${masteryRate.value}% 100%)`,
);
```

- [ ] **Step 3: 品牌区/菜单/退出**

品牌区：`brand-title` 改 `text-40rpx font-extrabold tracking-[-1rpx] text-[#0D0D0D]`，副句 `text-[#0D0D0D]`，版本号改 mono caption `text-[#67676C]`；`.brand-title` style 块删。
修改密码行与退出登录行合并为一张白卡两行（hairline 描边、行间 hairlineSoft 分割）：

```vue
      <view class="mx-30rpx mt-40rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx">
        <view class="h-100rpx flex items-center justify-between border-b-2rpx border-solid border-[#EFEFF1]" @click="goPassword">
          <text class="text-28rpx text-[#0D0D0D]">修改密码</text>
          <text class="text-28rpx text-[#67676C]">›</text>
        </view>
        <view class="h-100rpx flex items-center" @click="handleLogout">
          <text class="text-28rpx text-[#D9303E]">退出登录</text>
        </view>
      </view>
```

（`border-b-2rpx` 若 unocss 未生成，用 `border-b-2 border-solid` + 验证 computed 兜底——走查时确认。）

- [ ] **Step 4: 验证**

`pnpm type-check`/`pnpm lint` 通过。H5 走查：lime 块 `rgb(217, 242, 180)`；趋势柱黑柱；退出为文字行 + 确认弹窗功能不变；未登录兜底态 CTA `bg-[#0D0D0D]`。

- [ ] **Step 5: Commit**

```bash
git add src/pages/profile/index.vue
git commit -m "style(pages): 我的页 lime 统计块与退出红字行"
```

---

### Task 8: 登录页 + 引导页

**Files:**

- Modify: `src/pages/login/index.vue`
- Modify: `src/pages/onboarding/index.vue`

**Interfaces:** Consumes `T`、`PsButton`（Task 2）

- [ ] **Step 1: login 模板重写（表单入 cream 块）**

```vue
<template>
  <view class="min-h-screen bg-white">
    <CustomNavBar transparent />
    <!-- 品牌区 -->
    <view class="flex flex-col items-center pt-120rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">PASS SCROLL · NOTES</text>
      <text class="mt-12rpx block text-72rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">通关秘籍</text>
      <text class="mt-12rpx block text-26rpx text-[#0D0D0D]">分享知识，随笔</text>
    </view>

    <!-- 表单：cream 签名色块 -->
    <view class="mx-40rpx mt-80rpx rounded-48rpx bg-[#F7F2E7] p-40rpx">
      <input
        v-model="username"
        class="mb-24rpx h-88rpx w-full rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx text-28rpx text-[#0D0D0D]"
        placeholder="请输入用户名（3-20位）"
        placeholder-style="color: #67676C;" />
      <input
        v-model="password"
        class="w-full rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx text-28rpx text-[#0D0D0D]"
        password
        :placeholder="isLogin ? '密码' : '8-64位，含字母与数字'"
        placeholder-style="color: #67676C;" />
      <view class="mt-48rpx">
        <PsButton size="lg" block @click="handleSubmit">{{ isLogin ? "进入" : "创建账号" }}</PsButton>
      </view>
      <view class="mt-30rpx flex justify-center" @click="isLogin = !isLogin">
        <text class="text-26rpx font-semibold text-[#0D0D0D]">
          {{ isLogin ? "没有账号？去注册" : "已有账号？去登录" }}
        </text>
      </view>
    </view>
  </view>
</template>
```

（第二枚 input class 前补 `h-88rpx` 与第一枚一致。）
script 不动逻辑（reLaunch 已在 T4）；删 `.brand-title` style 块。

- [ ] **Step 2: onboarding 改黑**

- `bg-[#F7F8FA]` → `bg-white`
- swiper 属性：`indicator-color="rgba(13,13,13,0.15)"`、`indicator-active-color="#0D0D0D"`
- screens 数组 `color` 三值全改 `"#0D0D0D"`
- 标题 class：`onboard-title text-56rpx` → `text-56rpx font-extrabold tracking-[-1rpx]`；`.onboard-title` style 块删除
- 跳过文字 `text-[#67676C]` 保留（caption 角色）；CTA `bg-[#3E63DD]` → `bg-[#0D0D0D]`

- [ ] **Step 3: 验证**

`pnpm type-check`/`pnpm lint` 通过。H5 走查：登出后到登录页——hero 黑字、表单卧 cream 块 `rgb(247, 242, 231)`、提交黑 pill；清缓存首启进 onboarding——指示点黑、标题黑、CTA 黑；注册→登录链路可达首页。

- [ ] **Step 4: Commit**

```bash
git add src/pages/login/index.vue src/pages/onboarding/index.vue
git commit -m "style(pages): 登录页 cream 表单块与引导页黑白化"
```

---

### Task 9: 详情页 + 历史版本页

**Files:**

- Modify: `src/pages/detail/index.vue`
- Modify: `src/pages/versions/index.vue`

**Interfaces:** Consumes `T`、`PsButton`（Task 2）

- [ ] **Step 1: detail**

- 正文卡（4–6 行容器）按 G 表：`shadow-…` → `border-2rpx border-solid border-[#E3E3E6]`、`rounded-48rpx`；`note-title` 删 class 改 `text-44rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]`；`.note-title` style 块删
- 蓝色下划条 `bg-[#3E63DD]` → `bg-[#0D0D0D]`
- tags/mastery 同 RecordCard 语汇（tags `bg-[#F4F5F7] text-[#0D0D0D]`；mastery `:style` 保留语义色并补 pill 描边 class：`rounded-full border-2rpx border-solid px-16rpx py-2rpx`）
- 分割线 `bg-[#EEEEEE]` → `bg-[#E3E3E6]`；meta 时间改 mono caption（同 RecordCard 尾行写法）
- 底部操作栏：`border-[#E3E3E6]`；四列文字 `text-[#0D0D0D]`（删除列 `text-[#D9303E]`）；列分割 `border-[#E3E3E6]`
- 空态文案 `text-[#67676C]` 保留

- [ ] **Step 2: versions 列表态（cream 块）**

模板 5–17 行替换为：

```vue
      <view v-if="snapshots.length" class="mx-30rpx mt-24rpx rounded-48rpx bg-[#F7F2E7] p-30rpx">
        <view
          v-for="item in snapshots"
          :key="item.id"
          class="mb-20rpx flex items-center rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-24rpx py-20rpx"
          @click="openSnapshot(item)">
          <text class="mr-16rpx rounded-full bg-[#F4F5F7] px-16rpx py-2rpx font-mono text-20rpx tracking-[2rpx] text-[#0D0D0D]">
            v{{ item.version }}
          </text>
          <text class="flex-1 truncate text-28rpx text-[#0D0D0D]">{{ item.title }}</text>
          <text class="ml-16rpx shrink-0 font-mono text-20rpx tracking-[2rpx] text-[#67676C]">{{ formatTime(item.createdAt) }}</text>
        </view>
      </view>
```

预览态：外层卡 `shadow-…`→hairline 描边（G 表）、`note-title` 删（改 `font-extrabold tracking-[-2rpx]`）、v 徽章同列表态、按钮对换 `<PsButton variant="secondary" block>返回列表</PsButton>` + `<PsButton block>恢复此版本</PsButton>`（各套 `flex-1` view）；`handleRestore` 的 `confirmColor: "#3E63DD"` → `"#0D0D0D"`；`.note-title` style 块删；T4 已删 setNavigationBarTitle。空态文案保留 `#67676C`。

- [ ] **Step 3: 验证**

`pnpm type-check`/`pnpm lint`。H5 走查：详情打开→置顶/编辑/历史/删除全功能；删除确认弹窗红色 confirmColor 正常；历史版本列表 cream 块 `rgb(247, 242, 231)`、预览→恢复弹窗确认→回详情页内容更新（快照双写链路不变）。

- [ ] **Step 4: Commit**

```bash
git add src/pages/detail/index.vue src/pages/versions/index.vue
git commit -m "style(pages): 详情页黑白化与历史版本 cream 时间线块"
```

---

### Task 10: 编辑器 + 改密页

**Files:**

- Modify: `src/pages/editor/index.vue`
- Modify: `src/pages/password/index.vue`

**Interfaces:** Consumes `T`、`PsButton`（Task 2）、`CustomNavBar right 插槽`（Task 3）

- [ ] **Step 1: editor 分段 tabs 与保存钮上导航**

模板 4–17 行替换：

```vue
    <view class="mx-30rpx mt-24rpx flex h-72rpx rounded-full bg-[#F4F5F7] p-6rpx">
      <view
        class="flex-1 flex-center rounded-full"
        :style="{ background: mode === 'edit' ? T.ink : 'transparent' }"
        @click="mode = 'edit'">
        <text class="text-26rpx" :style="{ color: mode === 'edit' ? T.onPrimary : T.ink }">编辑</text>
      </view>
      <view
        class="flex-1 flex-center rounded-full"
        :style="{ background: mode === 'preview' ? T.ink : 'transparent' }"
        @click="mode = 'preview'">
        <text class="text-26rpx" :style="{ color: mode === 'preview' ? T.onPrimary : T.ink }">预览</text>
      </view>
    </view>
```

script 增加 `import { T } from "@/theme/tokens";`。
T4 已挂 `<CustomNavBar :title="navTitle" show-back />`，本步补右侧插槽：

```vue
<template #right>
  <PsButton size="sm" :disabled="saving" @click="handleSave">保存</PsButton>
</template>
```

（插槽写在 CustomNavBar 标签内。）删除底部保存栏（79–83 行整段）——入口已移入导航，`saving` 态经 disabled 承载。

- [ ] **Step 2: editor 表单皮**

输入框 class 按 G 表；tag chip `rounded-12rpx bg-[#3E63DD]/10 … text-[#3E63DD]` → `rounded-full bg-[#F4F5F7] … text-[#0D0D0D]`（含删除 ×）；分割线 `#E3E3E6`；预览卡 `shadow-…`→描边 + `rounded-48rpx`、标题 `note-title` 删改 `font-extrabold tracking-[-1rpx]`；`.note-title` style 块删；根 `bg-[#F7F8FA]`→`bg-white`。

- [ ] **Step 3: password**

NavBar T4 已挂；模板按 G 表替换（输入下划线 `border-[#EEEEEE]`→`border-[#E3E3E6]`、确认按钮整段换 `<PsButton size="lg" block @click="handleSubmit">确认修改</PsButton>`，外层 fixed 白底栏保留并 `border-[#E3E3E6]`）。

- [ ] **Step 4: 验证**

`pnpm type-check`/`pnpm lint`。H5 走查：新建笔记（导航右上保存）→保存回首页；编辑已有→预览态 markdown 渲染→切回编辑内容未丢；**乐观锁回归**：浏览器开两个标签页进同一笔记编辑页，A 保存成功后 B 再保存 → B toast「已在其他设备修改」且表单自动刷新为 A 的内容（editor:184 分支不变）。改密页：弱密码提交→10004 toast；成功后登出回登录。

- [ ] **Step 5: Commit**

```bash
git add src/pages/editor/index.vue src/pages/password/index.vue
git commit -m "style(pages): 编辑器 pill 分段与导航保存钮，改密页黑白化"
```

---

### Task 11: markdown 管线与容器 pastel 化

**Files:**

- Modify: `src/utils/markdown.ts`（仅样式常量）
- Modify: `src/components/MdContainer.vue`

**Interfaces:** Consumes `T`；`parseNote`/`injectStyles`/`adaptUnits` 函数签名与流水线结构**零改动**

- [ ] **Step 1: markdown.ts 常量替换**

`TAG_STYLES` 对象替换为：

```ts
const TAG_STYLES: Record<string, string> = {
  h1: "font-size:40rpx;font-weight:800;letter-spacing:-1px;margin:32rpx 0 16rpx;color:#0D0D0D;",
  h2: "font-size:36rpx;font-weight:700;letter-spacing:-1px;margin:32rpx 0 16rpx;color:#0D0D0D;border-bottom:1px solid #E3E3E6;padding-bottom:8rpx;",
  h3: "font-size:32rpx;font-weight:700;margin:24rpx 0 12rpx;color:#0D0D0D;",
  h4: "font-size:30rpx;font-weight:600;margin:20rpx 0 10rpx;color:#0D0D0D;",
  h5: "font-size:28rpx;font-weight:600;margin:16rpx 0 8rpx;color:#0D0D0D;",
  h6: "font-size:26rpx;font-weight:600;margin:16rpx 0 8rpx;color:#0D0D0D;",
  p: "margin:12rpx 0;line-height:1.8;color:#0D0D0D;font-size:28rpx;",
  blockquote: "border-left:6rpx solid #0D0D0D;margin:16rpx 0;padding:8rpx 20rpx;color:#0D0D0D;background:#F4F5F7;",
  ul: "padding-left:40rpx;margin:12rpx 0;",
  ol: "padding-left:40rpx;margin:12rpx 0;",
  li: "margin:6rpx 0;line-height:1.8;font-size:28rpx;color:#0D0D0D;",
  a: "color:#0D0D0D;text-decoration:underline;",
  strong: "font-weight:700;",
  em: "font-style:italic;",
  hr: "border:none;border-top:1px solid #E3E3E6;margin:32rpx 0;",
  table: "border-collapse:collapse;width:100%;margin:16rpx 0;font-size:26rpx;",
  th: "border:1px solid #E3E3E6;background:#F4F5F7;padding:12rpx 16rpx;font-weight:600;color:#0D0D0D;",
  td: "border:1px solid #E3E3E6;padding:12rpx 16rpx;color:#0D0D0D;",
  img: "max-width:100%;border-radius:16rpx;",
  del: "text-decoration:line-through;color:#67676C;",
};
```

`CODE_INLINE_STYLE` 替换为：

```ts
const CODE_INLINE_STYLE =
  "font-family:Consolas,Menlo,monospace;background:#F4F5F7;color:#0D0D0D;border-radius:8rpx;padding:2rpx 8rpx;font-size:26rpx;";
```

`PRE_STYLE`/`CODE_IN_PRE_STYLE` 不动（深色代码块即 inverse 面）。

- [ ] **Step 2: MdContainer 换肤**

`THEMES` 替换：

```ts
const THEMES: Record<Exclude<ContainerKind, "details">, { color: string; bg: string }> = {
  tip: { color: "#A9DCC3", bg: "#D6F0E3" },
  warning: { color: "#E4D5B5", bg: "#F7F2E7" },
  danger: { color: "#F0B8CB", bg: "#F9DCE4" },
};
```

模板：容器标题文字色改固定 `text-[#0D0D0D] font-semibold`（色条承担家族识别）；details 卡（17–23 行）改：

```vue
  <view v-else class="my-16rpx rounded-16rpx border-2rpx border-solid border-[#C4B8EE] bg-[#E7E3FA] p-24rpx">
    <view class="flex items-center justify-between" @click="toggleOpen">
      <text class="text-28rpx font-semibold text-[#0D0D0D]">{{ title }}</text>
      <text class="ml-16rpx text-24rpx text-[#0D0D0D]">{{ isOpen ? "▼" : "▶" }}</text>
    </view>
    <rich-text v-if="isOpen" :nodes="html" class="mt-16rpx" />
  </view>
```

`watch` 复位、emit 逻辑不动。

- [ ] **Step 3: 验证（含种子数据）**

`pnpm type-check`/`pnpm lint`。走查环境新建笔记「管线验证」，正文粘贴：

```markdown
# 一级标题

:::tip 提示容器
**加粗** 与 `行内代码`
:::
:::warning 警告容器

> 引用块
> :::
> :::danger 危险容器
> 普通段落
> :::
> :::details 答案容器
> 点开看我
> :::
```

H5 详情页断言（chrome-devtools computed）：tip 容器底 `rgb(214,240,227)`、warning `rgb(247,242,231)`、danger `rgb(249,220,228)`、details 卡底 `rgb(231,223,250)`；h1 `color rgb(13,13,13)`；行内 code 底 `rgb(244,245,247)`；复习页抽到此条→答案折叠卡点开展示。H5 端 rpx→px 换算正常（无尺寸崩坏）。

- [ ] **Step 4: Commit**

```bash
git add src/utils/markdown.ts src/components/MdContainer.vue
git commit -m "style(utils): markdown 管线与四类容器 pastel 化"
```

---

### Task 12: 全局清零与三端走查

**Files:**

- Modify: 走查中发现的残留处（预期为个位数）

**Interfaces:** Consumes 前序全部

- [ ] **Step 1: 残留 grep 清零（预期全部零命中，命中即修）**

```bash
cd "D:/Software/project/pass-scroll-mobile"
grep -rn --include="*.vue" --include="*.ts" -E "#3E63DD|#3C3C43|#F7F8FA|#EEEEEE|rgba\(62,99,221|STKaiti|KaiTi|setNavigationBarTitle|switchTab" src/ | grep -v auto-imports
grep -rn --include="*.vue" -E ':class="[^"]*\[' src/   # unocss 动态 class 含 [ 必须为零
```

（`#F0B429`/`#D9303E`/`#42B883`/`#67676C` 属保留语义色，不在清零范围。）

- [ ] **Step 2: 静态关卡**

```bash
pnpm type-check && pnpm lint && pnpm lint:stylelint
```

全部 exit 0。

- [ ] **Step 3: H5 全页走查（每页截图存档于对话结论即可）**

9 页逐页：首页（hero lilac/搜索/chips/FAB 黑/空态）、复习（mint/标记栏）、我的（lime/退出行）、登录+引导（首启清缓存重进）、详情、历史版本、编辑器（分段/预览/保存入 nav）、改密、以及 deployment.md 验收表纯前端项抽验：新建（#5）、冲突续编（#7，Task 10 已验可复）、置顶/掌握度不改排序（#8）、飞行模式离线只读（#12，用 devtools offline 模拟）、登出换账号缓存隔离（#14）。

- [ ] **Step 4: 微信小程序编译走查（交用户实测的清单）**

`pnpm dev:mp-weixin` 产出 `dist/dev/mp-weixin`；交给用户在微信开发者工具核对：wd-icon 三图标渲染、custom nav 状态栏占位、rich-text 容器四色、tabBar safe-area。**App 端本轮不实测**（spec §7：发版回归项）。

- [ ] **Step 5: Commit（如有残留修复）**

```bash
git add -u src
git commit -m "style(src): 旧色值与楷体残留清零"
```

无残留则不产生提交，计划收束。

---

## 自检记录（writing-plans self-review 已做）

- spec 覆盖：§1 tokens→T1；§2 chrome→T3/T4；§3 组件→T2/T3；§4 逐页→T5–T10；§5 管线→T11；§7 验收→T4/T5–T11 内嵌 + T12；§8 不做项未越界（无新依赖、无 PNG 删除、无动效）
- 已知偏离 spec 三处（均有理由）：onboarding 不挂透明 NavBar（全屏 swiper 冲突，跳过即出口）；PsButton secondary 加 hairline 描边（白 canvas 上无边白钮不可辨）；onboarding 末屏 CTA「开始通关」保持裸 `view` + `bg-[#0D0D0D]` 而未换 PsButton（终审 Minor-3 正名：它是绝对定位的固定 400rpx 宽胶囊，PsButton 的 `block`/`size` 体系管不到这种「居中悬浮 + 自身宽度」排布，而该页又是唯一无登录态的入口页，改造风险大于收益；视觉基线已与设计语言一致——黑底白字 44rpx 圆角）
- 任务顺序即依赖序；T4 起页面进入「chrome 新、内容旧」过渡态，属预期（spec 允许逐页推进）
