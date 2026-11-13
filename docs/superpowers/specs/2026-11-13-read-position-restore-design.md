# 阅读位置保持设计（预览/编辑切换不回到顶部）

- 日期：2026-11-13
- 状态：已实现（一期 + 二期），待 H5 / 微信小程序真机验收
- 范围：详情页（预览）、编辑页（编辑态 / 预览态）三视图之间的滚动位置保持，纯前端，无接口与后端改动

## 1. 背景与问题

详情页与编辑页都使用**页面级滚动**（根节点 `min-h-screen`，无 `scroll-view`），三个阅读视图互相切换时都没有任何位置记忆：

| 路径                 | 现象                  | 根因                                                                                                                                                                                   |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 详情预览 → 编辑      | 进入编辑页从顶部开始  | `handleEdit` 用 `uni.navigateTo` 打开新页面，新页 `scrollTop = 0`，两页之间没有位置传递                                                                                                |
| 编辑 ↔ 预览（页内） | 切换后回到顶部 / 错位 | `src/pages/editor/index.vue` 用 `v-if` / `v-else` 销毁重建 DOM，两视图高度差异极大（等宽 `textarea` vs 渲染后的 markdown 块），旧 `scrollTop` 数值在新文档里没有意义，会被运行时 clamp |
| 编辑保存 → 返回详情  | 位置漂移或回顶部      | `navigateBack` 后详情页 `onShow` 重新 `loadRecord`，内容高度变化；详情页也没有恢复逻辑                                                                                                 |

用户的实际诉求：在详情页读到三分之一处，点编辑应该大致落在那段原文的位置；编辑时滚到某处切预览，应该看到对应的渲染结果；从编辑返回详情同理。

## 2. 目标与非目标

### 目标

- 详情预览 ↔ 编辑态 ↔ 编辑页预览态，任意切换后落到「同一阅读进度」，误差在可感知容忍范围内。
- 恢复过程不闪烁、不打断用户：渲染未稳定时不乱滚，用户已手动滚动时放弃恢复。
- 跨端一致（H5 / 微信小程序 / App vue 页面），不依赖 `window.scrollY` 等 H5 专有 API。
- 位置记忆随记录失效：内容版本变化、超时、新建记录等场景有明确降级规则。

### 非目标

- 不把页面滚动模型改成 `scroll-view`，不改动 `MdBlocks` / `MdContainer` 的渲染逻辑。
- 不记忆列表页（首页）的滚动位置。
- 不做「精确到字符」的光标级定位：uni 的 `textarea` 没有读取光标/行号的 API，从原文侧反推行号不可靠。
- 不引入新的服务端字段：阅读位置是设备侧临时态，不同步到后端。

## 3. 核心方案

三个视图共用**一条按 `recordId` 索引的位置记录**，任何切换都遵循「离开前存位置 → 新视图渲染稳定后按位置还原」：

```text
detail(预览) --position--> editor(编辑) --position--> editor(预览)
      ^                                                    |
      +------------------- position <----------------------+
```

记录结构（一期只用到 `progress`，二期启用 `anchor`）：

```ts
interface ReadPosition {
  progress: number; // 0~1，页面滚动比例（主兜底）
  version?: number; // 记录时的记录版本，内容变则 anchor 失效
  anchor?: { seg: number; ratio: number }; // 仅预览态记录：可见分段索引 + 段内比例
  at: number; // 时间戳，用于 TTL
}
```

### 3.1 为什么主定位用「比例」而不是「块锚点」

编辑态是纯文本 `textarea`，预览态是渲染块，两者文档高度不可比，`scrollTop` 无法直接搬运。而**从编辑态无法可靠反推 markdown 块**：uni 不提供 `textarea` 的光标位置 / 行号读取，只能靠「行高 × 行号」估算，软换行（长行折行）会让估算持续漂移。

因此：

- 任何「文本视图 ↔ 渲染视图」的映射用 `progress`（比例）——这是唯一稳健的做法，误差可接受（同一阅读比例附近）。
- 只有「预览视图 ↔ 预览视图」之间才有条件做到精确，用二期 `anchor`（见第 5 节）。

这也决定了 `progress` 必须**永远记录**，`anchor` 只是预览态的精度增强，永不作为唯一来源。

### 3.2 存储与失效

- 存储介质：模块级 `Map`（`src/utils/read-position.ts` 内存表）。页面栈内的连续切换足够，冷启动重建页面不需要（那时用户本来就从顶部开始读）。
- key：`recordId`。
- TTL：30 分钟，超时视为无记忆。
- 显式清理：
  - 删除记录 → `clearPosition(id)`。
  - 保存成功 → **保留 `progress`、丢弃 `anchor`**（正文可能已变，块索引不可信；但用户可能只改了个错别字，不应粗暴回顶部）。
  - 新建记录（无 `recordId`）→ 不参与记忆。

## 4. 一期实现（进度百分比）

### 4.1 新增 `src/utils/read-position.ts`

职责：位置表的存读清理 + 现场测量 + 带重试的还原。对外 API：

```ts
export function savePosition(key: string, pos: Omit<ReadPosition, "at">): void; // 内部补时间戳
export function readPosition(key: string): ReadPosition | undefined; // 内含 TTL 判断
export function clearPosition(key: string): void;

/** 现场测量；scrollTop 由页面 onPageScroll 提供（不用 ref，避免每帧渲染）。测不到有效高度返回 undefined */
export async function measurePosition(
  rootId: string,
  scrollTop: number,
  opts?: MeasureOptions,
): Promise<ReadPosition | undefined>;

/** 只按比例还原，内部做高度稳定性重试 */
export async function restoreProgress(rootId: string, progress: number, opts?: MeasureOptions): Promise<void>;

/** 统一还原入口（二期）：锚点可用且成功则对齐分段，否则退回比例 */
export async function restorePosition(rootId: string, pos: ReadPosition, opts?: RestoreOptions): Promise<void>;

/** 读页面真实 scrollTop（selectViewport().scrollOffset()），锚点换算用 */
export function queryScrollTop(): Promise<number | undefined>;
```

测量原理：

```ts
const max = Math.max(1, contentHeight - (windowHeight - viewInset));
progress = clamp(scrollTop / max, 0, 1);
```

- `contentHeight`：`uni.createSelectorQuery().select('#' + rootId).boundingClientRect()` 的高度。
- `windowHeight`：`uni.getSystemInfoSync().windowHeight`（项目既有用法，见 `src/utils/system.ts`）。
- `viewInset`：底部 `fixed` 操作栏遮挡的高度（详情页约 `100rpx + env(safe-area-inset-bottom)`），作为可选参数，不传按 0 处理。
- `max <= 0`（内容不满一屏）→ 进度无意义，还原时直接 `return`。

还原原理（关键在**重试**，因为 `textarea auto-height`、markdown 块、图片高度都是异步确定的）：

```ts
for (const delay of [0, 80, 240]) {
  await sleep(delay);
  const max = await measureMax(rootId, viewInset);
  if (max <= 0) continue;
  uni.pageScrollTo({ scrollTop: Math.round(progress * max), duration: 0 });
}
```

`duration: 0` 是必须的：动画滚动会与 `nextTick` 后的渲染竞争，产生"滚一半又跳回去"的观感。

### 4.2 `src/pages/detail/index.vue`

| 改动点                          | 说明                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根 `view` 加 `id="detail-page"` | 供 `boundingClientRect` 测高度                                                                                                                       |
| 滚动记录                        | `import { onPageScroll } from "@dcloudio/uni-app"`；用**闭包内的普通 `let scrollTop = 0`**（严禁 `ref`，否则每帧触发渲染）；滚动路径不查 DOM、不落库 |
| 落库时机                        | `onHide` 用缓存高度的 `progressFromScrollTop` 纯算术落库；`handleEdit` 跳转前做一次含锚点的完整测量                                                  |
| `handleEdit`                    | 跳转前**同步补存一次**位置；URL 追加 `&pos=${progress}`（`encodeURIComponent`）作为兜底，避免内存表被意外清空                                        |
| `onShow` 恢复                   | 仅当「本页曾 `onHide` 过」才恢复（`let hiddenOnce = false`），否则从列表新进详情页会莫名跳到中段                                                     |
| 内容未就绪                      | `record` 可能来自异步 `getRecord`，`segments` 为空时高度不足，用 `watch(segments)` 等首次非空后再恢复，且**只消费一次**                              |
| 返回必恢复                      | 从编辑器/历史页返回时**无条件恢复**：平台可能已保留旧滚动位置，但用户期望的是「在编辑器里读到的位置」，二者不一致时必须以记忆值为准                  |

### 4.3 `src/pages/editor/index.vue`

| 改动点                          | 说明                                                                                                                                                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 根 `view` 加 `id="editor-page"` | 同上                                                                                                                                                                                                                                                                              |
| 进入时恢复                      | `onLoad` 优先读 `query.pos`，否则 `readPosition(id)`；**必须放在 `prefill()` 之后**——`content` 未赋值前页面高度是初始值，此时还原必然错位（`prefill` 内 store 未命中时还会走 `getRecord` 异步）                                                                                   |
| 模式切换                        | 两个 `@click="mode = 'edit' / 'preview'"` 改为 `switchMode(next)`：先 `measurePosition` 存旧视图进度 → 切 `mode` → `await nextTick()` → 按同一 key 还原（只测一次、只存一次，切换路径不再额外补存）                                                                               |
| 测量取值                        | `measurePosition` 以 `selectViewport().scrollOffset()` 实测值为准，`onPageScroll` 的缓存值仅作兜底（H5 的 scroll 监听是 rAF 节流的，末次事件可能丢失）                                                                                                                            |
| 落库时机                        | **滚动路径完全不落库**（只赋值 `pageScrollTop` + 切换浮动条显隐）；只在 `switchMode` 前后、`onHide` 时各测一次。早期版本滚动时 200ms 防抖 `measurePosition`，拖动时每次都要 2 次 `selectorQuery`（小程序还跨线程），掉帧明显，且切换瞬间 `scrollTop` 归零会被那次防抖覆盖成进度 0 |
| 保存成功                        | `savePosition(id, { ...pos, anchor: undefined })`，即保留进度、丢弃 anchor；随后 `navigateBack`                                                                                                                                                                                   |
| 乐观锁冲突（10409）             | 重新拉取远端内容后正文整体替换，尺寸变化大，此时 `anchor` 必须丢弃、`progress` 保留                                                                                                                                                                                               |

### 4.4 页面级滚动的两个共性约束

1. `onPageScroll` 只在页面级滚动生效——两页目前都是页面级滚动，若将来某页改成 `scroll-view`，该页需改用 `@scroll` 自行测量，工具函数签名已按「传入 scrollTop」预留。
2. 切换模式时不要立刻读 `scrollTop` 做换算，先存旧视图的 `progress`，让新视图独立计算——旧 `scrollTop` 在新文档里没有语义。

## 5. 二期增量：预览态块锚点精确定位

一期的 `progress` 在「预览 ↔ 预览」之间会残留 10%~20% 偏差（标题字大、代码块行密、容器卡片有 padding，导致同样比例落在不同内容上）。二期在**两个视图都是预览态**时用块锚点做到「落在同一个 markdown 分段」。

### 5.1 生效条件

`anchor` 只在同时满足下列条件时使用，任一不满足即退回 `progress`：

1. 记录时处于**预览态**（详情页预览 / 编辑页 preview），否则 `anchor` 不存在；
2. 目标视图也处于**预览态**；
3. `record.version` 与记录时的 `version` 相同（正文未变，分段索引仍然对应）；
4. 目标视图的 `segments.length > 0`，且 `anchor.seg` 经过 clamp 后仍能取到节点。

场景收益矩阵：

| 切换                                                | 记录              | 还原       | 精度                     |
| --------------------------------------------------- | ----------------- | ---------- | ------------------------ |
| detail 预览 → editor 编辑                           | progress          | progress   | 近似（主链路，二期不变） |
| editor 编辑 → editor 预览                           | progress          | progress   | 近似                     |
| editor 预览 → editor 编辑                           | progress + anchor | progress   | 近似（文本侧无法用锚点） |
| editor 预览 → detail 预览                           | progress + anchor | **anchor** | 精确到分段               |
| detail 预览 → editor 预览（如后续加"直接预览"入口） | progress + anchor | **anchor** | 精确到分段               |
| detail 预览 → detail 预览（返回详情自身）           | progress + anchor | **anchor** | 精确到分段               |

也就是说，二期的核心收益是**返回详情时的阅读位置精确还原**，以及编辑页内部预览态往返的精度。

### 5.2 DOM 标记

两个页面的分段循环外包一层带固定 class + 稳定 id 的容器：

```vue
<!-- detail/index.vue 与 editor/index.vue 预览区同一写法 -->
<view v-for="(seg, index) in segments" :id="`${pageId}-seg-${index}`" class="md-seg" :data-seg="index">
  <MdBlocks v-if="seg.type === 'blocks'" :blocks="seg.blocks" />
  <MdContainer v-else :kind="seg.kind" :title="seg.title" :blocks="seg.blocks" />
</view>
```

- `class="md-seg"` 用于一次 `selectAll` 拿到全部分段矩形；`id` 用于单点还原。
- id 前缀区分页面（`detail-page` / `editor-page`），分段索引在两页之间语义相同（同一 `parseNote` 输出）。

### 5.3 记录：`measureAnchor`

```ts
// visibleTop = 顶部常驻栏高度（编辑页传浮动切换条高度），无常驻栏时为 0
async function measureAnchor(rootId: string, visibleTop = 0): Promise<{ seg: number; ratio: number } | undefined> {
  const rects = await queryAll(`#${rootId} .md-seg`); // boundingClientRect 数组，顺序 = 渲染顺序
  if (!rects.length) return undefined;
  for (let i = rects.length - 1; i >= 0; i--) {
    if (rects[i].height <= 0) continue;
    if (rects[i].top <= visibleTop) {
      return { seg: i, ratio: clamp((visibleTop - rects[i].top) / rects[i].height, 0, 1) };
    }
  }
  // 还在标题区、没有任何分段越过栏底：不记锚点，退回 progress（否则会把首段顶到栏下，跳过标题）
  return undefined;
}
```

- 倒序遍历取「最后一个顶部已越过视口顶端的段」＝ 当前占据视口顶端的段。
- `ratio` 表示该段已被滚过多少比例（0 = 段首刚贴顶，1 = 段尾），用于还原段内位置，避免长代码块/长表格还原后跳到段首。
- 与 `progress` 同一次测量中一起算，避免两次 query：`measurePosition(rootId, scrollTop, { preview, version })` 内部串起来即可。

### 5.4 还原：`restoreAnchor`

```ts
async function restoreAnchor(
  rootId: string,
  anchor: { seg: number; ratio: number },
  scrollTop: number,
): Promise<boolean> {
  const rects = await queryAll(`#${rootId} .md-seg`);
  if (!rects.length) return false;
  const hit = rects[Math.min(Math.max(anchor.seg, 0), rects.length - 1)];
  // query 返回的是相对视口的位置：把"段首贴顶"换算成绝对 scrollTop，再补偿段内比例
  const delta = hit.top - (VISIBLE_TOP - anchor.ratio * hit.height);
  uni.pageScrollTo({ scrollTop: Math.max(0, Math.round(scrollTop + delta)), duration: 0 });
  return true;
}
```

要点：

- `scrollTop` 用 `selectViewport().scrollOffset()` 现场读取（页面显示切换后，页面内缓存的 `scrollTop` 变量会过期），失败再退回 `onPageScroll` 的缓存值；不读 `window.scrollY` 以保持跨端。
- `selectAll` 返回的数组必须与 `v-for` 的 `index` 严格对齐：**不能按高度过滤掉空段**，否则锚点索引整体偏移。
- `delta` 的符号：视口里段首在 `hit.top`，我们希望它在 `visibleTop - ratio*height` 处，需要滚动的距离即两者之差。
- 与一期共用同样的 `[0, 80, 240]ms` 重试节奏；每次重试**重新 query**（折叠容器 `:::details` 展开状态、图片加载都会改变段高，重测比缓存更稳）。
- 整条链路失败（节点取不到、高度为 0）→ 返回 `false`，调用方退回 `restoreProgress`。

### 5.5 统一入口

```ts
export async function restorePosition(rootId, pos, opts = {}): Promise<void> {
  const anchor = resolveAnchor(pos, opts); // 目标预览态 + 版本一致 + 记录时确有锚点
  for (const delay of [0, 80, 240]) {
    if (delay) await sleep(delay);
    if (anchor) {
      const reference = (await queryScrollTop()) ?? opts.getScrollTop?.();
      const landed = reference === undefined ? undefined : await scrollToAnchor(rootId, anchor, reference);
      if (landed !== undefined) continue;
    }
    // 锚点不可用 / 分段取不到 → 每次重试都退回比例还原
    const target = await scrollTopForProgress(rootId, pos.progress, opts.viewInset);
    if (target !== undefined) uni.pageScrollTo({ scrollTop: target, duration: 0 });
  }
}
```

页面侧只调 `measurePosition` / `restorePosition`，不关心走的是锚点还是比例。

### 5.6 二期的已知风险与对策

| 风险                                                            | 对策                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 长文分段多（几十段），`selectAll` 一次返回大量矩形              | 单次 query、只取 `top/height`，不进响应式；实测再决定是否改用「二分 `select` 单段」  |
| 段内图片未加载导致高度变化                                      | 重试期间重新 query（5.4）                                                            |
| 用户在详情页展开过 `:::details`，进编辑页预览默认折叠，段高不同 | 段索引仍正确，仅段内 `ratio` 有偏差；不额外同步折叠态                                |
| 编辑后未保存就切预览，`previewSegments` 已变而 `version` 未变   | `seg` 越界时 clamp 到最后一段，仍比纯比例准；保存后 `anchor` 会被丢弃                |
| 记录时的 `version` 与目标视图 `version` 不一致                  | 直接跳过锚点，退回 `progress`                                                        |
| 小程序 `selectAll` 顺序                                         | 依赖渲染顺序，与 `boundingClientRect` 数组一致（既有端上通用行为），需在真机验证一次 |

## 6. 时序与边界规则（两期共用）

1. **恢复时机**：数据（`record` / `prefill`）就绪 → `nextTick` → `restorePosition`。任一条件缺一不可。
2. **只消费一次**：同一页面实例的生命周期内，`watch(segments)` 触发的恢复只执行一次，避免保存刷新、置顶等引起的重渲染反复拉回位置。
3. **用户打断优先（仅编辑页首次进入）**：`onLoad` 里等 `prefill` 期间用户可能已手动滚动，检测到 `scrollTop > 48px` 就跳过恢复。详情页是「返回必恢复」，不设此判据（平台保留的旧位置可能与编辑器里的位置不一致）。
4. **短内容**：内容高度 ≤ 可视高度时不还原（`max <= 0`）。
5. **保存后**：保留 `progress`、丢弃 `anchor`；删除记录、退出登录（若有清理钩子）时 `clearPosition`。
6. **导航参数**：`pos` 为 `0~1` 保留 4 位小数，必须 `encodeURIComponent`；解析失败按无值处理。
7. **不要用 `ref` 装 `scrollTop`**：`onPageScroll` 每帧触发，写 `ref` 会持续触发渲染。
8. `uni.pageScrollTo` 一律 `duration: 0`。
9. 顶部有常驻栏（sticky 或 fixed 浮动条）时，`measurePosition` 与 `restorePosition` 必须传**同一个** `topInset`（栏高），否则每次往返都会系统性偏移一段栏高。

## 7. 待定决策

| 议题                            | 默认取值                                                                                                        | 影响                                                                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 顶部「编辑/预览」切换栏如何常驻 | **已改**：页内条原样保留（随页面滚走），滚过 `导航行 88rpx + 条身` 后显示右上角 `fixed` 浮动切换条（迟滞 40px） | 先试 `sticky top-0`：uni-app H5 的 `body{overflow-x:hidden}` 会让 sticky 失效，小程序部分 webview 祖先 `overflow` 同样失效，用户实测仍点不到。`fixed` 不受祖先 overflow 影响，跨端可靠。浮动条 `topInset = 状态栏 + 44px`，记录与还原对称传入，否则锚点会把内容压在条下 |
| 保存后返回详情的位置            | 保留 `progress`（不回到顶部）                                                                                   | 用户改错别字后返回不会丢阅读位置；代价是内容大幅缩改后进度略有偏差                                                                                                                                                                                                      |

## 8. 验收标准

一期（`progress`）：

- [ ] 详情页读到 1/3 → 编辑：编辑页 `textarea` 落在原文 1/3 附近（同屏内容大致对应）。
- [ ] 编辑页滚到中段 → 切预览：预览落在对应 1/3 附近，不回顶部、不跳动。
- [ ] 预览 → 切回编辑：同样落在对应位置。
- [ ] 编辑保存返回详情：详情不回顶部。
- [ ] 从列表重新进入同一条记录详情：**从顶部开始**（不误用旧记忆）。
- [ ] 内容仅一屏时切换：不产生任何滚动抖动。
- [ ] 快速连点「编辑/预览」多次：位置稳定，不出现累积漂移。
- [ ] 编辑页滚到正文中下部：右上角出现浮动「编辑/预览」切换条，可点、可切模式；滚回顶部后浮动条消失，不与导航栏重叠。
- [ ] H5 与微信小程序真机各测一遍上述用例。

二期（`anchor`）：

- [ ] 编辑页预览滚到某个代码块中部 → 返回详情：详情停在**同一代码块**的相近位置（不是同一比例的另一处）。
- [ ] 编辑页预览 → 编辑 → 预览：往返后仍落在同段附近。
- [ ] 编辑并保存后再返回详情：位置基于新内容按比例还原（锚点已失效，不报错、不跳飞）。
- [ ] `:::details` 折叠态下的还原：落在容器卡片上而非跳过。

## 9. 改动清单

| 文件                                      | 一期                                                                                                                                                      | 二期                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/utils/read-position.ts`（新增）      | 位置表（`savePosition`/`readPosition`/`clearPosition`）、`calcProgress`/`progressToScrollTop`、`measurePosition`、`restoreProgress`                       | `calcAnchorRatio`/`anchorToScrollTop`、`measureAnchor`、`scrollToAnchor`、`queryScrollTop`、`restorePosition` 统一入口 |
| `src/utils/read-position.test.ts`（新增） | 纯函数单测：进度换算、越界截断、不满一屏、锚点比例、位置表 TTL                                                                                            | 同左（锚点纯计算部分一并覆盖）                                                                                         |
| `src/pages/detail/index.vue`              | 根节点 `id="detail-page"`、`onPageScroll` 记录变量、`onHide` 用缓存高度换算落库、`handleEdit` 补存并带 `pos`、`onShow` 一次性恢复、删除时 `clearPosition` | 分段容器加 `:id="\`detail-page-seg-${index}\`"`+`class="md-seg"`                                                       |
| `src/pages/editor/index.vue`              | 根节点 `id="editor-page"`、`switchMode` 前后测量、`onHide` 补存、`prefill` 后恢复、保存后 `keepProgressOnly`                                              | 预览分段容器加 `:id="\`editor-page-seg-${index}\`"`+`class="md-seg"`，预览态记录锚点                                   |
| `src/pages.json`                          | 无                                                                                                                                                        | 无                                                                                                                     |
| 后端                                      | 无                                                                                                                                                        | 无                                                                                                                     |

测试：纯逻辑（进度换算、clamp、TTL、锚点比率与换算）已抽成纯函数并由 `pnpm test` 覆盖；滚动还原本身属端上行为，靠第 8 节手工用例在 H5 与微信开发者工具各验一遍。
