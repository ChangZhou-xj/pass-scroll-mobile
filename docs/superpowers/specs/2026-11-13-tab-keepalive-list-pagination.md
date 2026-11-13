# Tab 保活切换 + 首页分页/虚拟列表 设计

- 日期：2026-11-13
- 目标：消除「切 tab = 整页冷启动」；首页不再一次拉死 50 条（超过 50 条不可达），长列表滚动不因 DOM 膨胀掉帧。

## 1. Tab 切换：页面栈保活（不引入原生 tabBar）

**结论：不用原生 `tabBar` + `switchTab`，用「页面栈内 navigateTo / navigateBack」实现等效保活。**

理由（对比后否决原生方案）：

| 维度     | 原生 tabBar + switchTab                                                  | 页面栈保活（本方案）                                |
| -------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| 外观     | 图标必须换 PNG 资源，H5/MP 样式支持不一致；现有 wd-icon 胶囊样式无法复刻 | 自定义 tabbar 原样保留                              |
| 查询参数 | switchTab 不支持 `?tag=` / `?palace=`，仍要 store 换手                   | navigateTo 可带参；保活页用 store 换手              |
| 平台差异 | `custom: true` 仅微信支持，H5 会出现双 tabbar                            | 无差异                                              |
| 性能     | 页面保活、不冷启动                                                       | 同样保活、不冷启动（navigateBack 的目标页常驻栈中） |

### 1.1 导航规则（`src/utils/navigation.ts`）

```
goToTab(path):
  target 在当前栈中且不在栈顶 → uni.navigateBack({ delta: 栈顶下标 - 目标下标 })   // 保活返回
  target 已是栈顶           → 不动
  不在栈中                  → uni.navigateTo({ url: '/' + path })
  栈深 ≥ 9（防御）          → uni.reLaunch 兜底
```

三个 tab 页互相切换时栈内已有实例，永远走「返回」，页面实例与滚动状态全部保留。

### 1.2 高亮态同步

`CustomTabBar` 的 `activePath` 原来在 setup 里读一次 `getCurrentPages()`——reLaunch 每次重建组件所以没暴露问题；保活后组件常驻，必须改为响应式：

- `navigation.ts` 导出 `activeTabPath = ref("")` 与 `syncActiveTab()`；
- 三个 tab 页 `onShow` 调 `syncActiveTab()`（覆盖返回、深链直达等所有入口）；
- `go()` 时乐观写入，避免闪烁。

### 1.3 带参跳转换手（switchTab/navigateBack 都带不了参）

`srs` store 增加一次性信使字段（不持久化）：

- `pendingReviewTag?: string` —— 首页「今日待复习」主题 chip → 复习页；
- `pendingReviewPalace?: string` —— 宫殿页「开始巡游」→ 复习页。

复习页 `onShow` 先消费（读到即清空），再带着 `focusTag/palaceId` 拉队列。显式跳转（`goReview`）必须显式置 `pendingReviewTag = ""` 复现旧「reLaunch 会重置筛选」的语义；tab 直接切换不带 pending，保留上次筛选状态（行为变化，见 §4）。

### 1.4 各跳转点改造

| 现调用                                            | 改为                                                   |
| ------------------------------------------------- | ------------------------------------------------------ |
| `CustomTabBar.go` reLaunch                        | `goToTab`                                              |
| `index.goReview / goReviewTag` reLaunch（带 tag） | 置 pending → `goToTab(review)`                         |
| `review.goHome` reLaunch                          | `goToTab(index)`                                       |
| `review.goPalace` reLaunch                        | `uni.navigateTo`（宫殿页返回即回复习页，栈语义更合理） |
| `palace.开始巡游` reLaunch（带 palace）           | 置 pending → `goToTab(review)`                         |
| 登录/401/onboarding 的 reLaunch                   | **保留**（清栈语义正确）                               |

## 2. 首页分页

- `pageSize = 20`（后端 DTO 封顶 100），`fetchList` 恒为重置到第 1 页；新增 `loadMore()` 追加下一页。
- `hasMore = records.length < total`；`onReachBottom` 触发 `loadMore`，底部显示「加载中… / 没有更多了」。
- 并发防护：复用 `fetchSeq`——`loadMore` 返回时若序号已过期（期间发生筛选切换/重置）直接丢弃结果；`loadingMore` 防重入。
- 所有变更动作（增删改/置顶/掌握度/学习）仍走 `fetchList` 重置到第 1 页：服务端会重排（置顶优先 + updatedAt 倒序），增量补丁无法保证与重排一致。
- **已掌握计数**：分页后本地只能看到已加载页，hero 的「已掌握 x/total」改用服务端口径——`recordStore.fetchStats()`（GET /records/stats 的 `mastery.mastered`），首页 `onShow` 调用（多一次轻量聚合请求，换数据正确）。

## 3. 长列表虚拟化（测量高度 + 渲染窗口）

页级滚动（非 scroll-view）下的窗口化渲染，核心是**用实测高度做占位**，保证总文档高度不变、滚动不跳：

1. `utils/render-window.ts` 纯函数：`prefixSum(heights)` 前缀和；`computeWindow(prefix, scrollTop, viewHeight, buffer, total)` 二分求渲染区间 `[start, end)`（上下各留 buffer 像素）。单测覆盖。
2. 高度来源：列表首次渲染（窗口=全量）后 `uni.createSelectorQuery().selectAll('.record-card')` 一次批测，按可见顺序对齐到记录 id 存 `heightsById`；`loadMore` 追加后补测新增卡。高度只在 mount 时变化（卡片无图片、标签静态），map 按 id 缓存长期有效；筛选/下拉刷新导致 records 整体替换时清空重测。
3. 渲染：`v-for` 只渲染 `[start, end)` 切片（`:key=id`），窗口外用两个占位 `view`（高度 = 前缀和差值）。总高度恒定 ⇒ 滚动位置无跳变。
4. 触发：`onPageScroll` 只做一次算术 + 窗口变化时才写 ref（阈值外零渲染）。

## 4. 行为变化（需验收确认）

1. tab 切换不再清栈：复习页的主题筛选/宫殿巡游、首页滚动位置在切走再切回后**保留**（此前 reLaunch 全部重置）；Android/微信返回手势在 tab 页会退回上一个 tab（页面栈语义本身如此）。
2. 首页 hero 的「已掌握 x/y」来自服务端统计，不再受本地已加载条数影响。
3. 下拉刷新/搜索/切标签后只渲染第 1 页（20 条），继续上滑加载更多。
4. 从详情/编辑返回首页时列表重置到第 1 页（服务端会重排，增量补丁无法保证与重排一致）；滚动位置被夹到新内容范围内。

## 5. 实施结果

- 新增：`utils/navigation.ts`（goToTab/syncActiveTab/activeTabPath）、`utils/render-window.ts`（prefixSum/computeWindow，9 个单测）。
- 改造：`CustomTabBar`（响应式高亮 + goToTab）、`store/record.ts`（分页/loadMore/fetchStats）、`store/srs.ts`（一次性换手字段）、四个页面跳转点、首页虚拟列表（实测高度 + 渲染窗口 + 等高占位）。
- 兼容性要点：小程序端页面级 selectorQuery 查不到子组件内部节点，测量节点用页面自有的包裹 `view`（`.record-card`）；卡片间距改由包裹节点 `pb-24rpx` 承担——boundingClientRect 不含 margin 且 margin 会折叠，padding 才计入高度。
- 验证：`vue-tsc --noEmit` src 零错误、`eslint` 零告警、`pnpm test` 50 passed、`pnpm build:h5` 通过。
- 真机待验收：三 tab 互切状态保留、上滑分页、下拉刷新重置、切标签筛选、首页主题 chip → 复习页聚焦、宫殿巡游 → 复习页。

## 6. 验证（原计划）

## 5. 验证

- `render-window` 纯函数单测（区间、buffer、空表、total 截断）。
- `vue-tsc --noEmit` / `eslint` / `pnpm test` / `pnpm build:h5`。
- 真机手测：三 tab 互切（状态保留）、首页上滑分页、下拉刷新重置、置顶/删除后列表重置、切标签筛选、带参跳复习页（tag/palace 两条链路）。
