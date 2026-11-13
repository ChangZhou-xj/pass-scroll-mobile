# 全工程性能优化（一期）

- 日期：2026-11-13
- 状态：已实施，待真机验收
- 依据：全仓性能审计（13 页面 / 6 组件 / 2 store / utils 全量排查）的证据清单

## 1. 审计结论（按影响排序）

| 级别 | 问题                                                              | 证据                                                 | 代价                                   |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- | ------ | --------------------- | ---------------------------- |
| P0   | 列表每次刷新后，每张卡片对**整篇正文**重跑 14 条正则生成 2 行摘要 | `components/RecordCard.vue:40`、`utils/format.ts:29` | 50 卡 ≈ 700 次全文扫描，每次进首页都付 |
| P0   | `parseNote`/`mdToBlocks` 在渲染路径上全量同步解析，无缓存         | `utils/markdown.ts:200`、`detail                     | editor                                 | review | versions` 的 computed | 切模式/换卡/返回都重解析整篇 |
| P0   | `persist()` 用 `setStorageSync` 同步写盘（50 篇全文序列化）       | `store/record.ts:45`                                 | 与首屏渲染抢同一帧                     |
| P1   | `fetchList` 无请求序号，快速切换筛选时旧响应可能覆盖新结果        | `store/record.ts:82-97`                              | 偶发列表错乱                           |
| P1   | 还原链路每次重试都重新查 DOM，且每轮 `getSystemInfoSync`          | `utils/read-position.ts:315+`                        | 一次切模式 ~10 次桥调用                |
| P1   | 首页搜索框 `v-model` 直接绑 store state，每次按键写 pinia         | `pages/index/index.vue:52`                           | 每击键触发全页 render                  |
| P1   | `MdContainer` 的 watch getter 每次返回新数组，恒判定为变更        | `components/MdContainer.vue:43`                      | 无谓回调                               |
| P1   | landing 外链 Google Fonts `@import`（跨域阻塞、国内不可达）       | `pages/landing/index.vue:424`                        | 首屏白屏/字体切换                      |
| P2   | `queryWithTimeout` 兜底定时器不清理                               | `utils/read-position.ts:148`                         | 定时器堆积                             |
| P2   | 每个 `CustomNavBar` / 页面 setup 都同步 `getSystemInfoSync`       | `utils/system.ts:7`                                  | 跨线程同步调用                         |

## 2. 本期改动

1. `utils/format.ts`：`plainText` 加 LRU（200 条）记忆化，同正文只算一次 → 消 P0 第一项。
2. `utils/markdown.ts`：`parseNote` 加 LRU（8 条）记忆化，key 为原文（字符串按键值比较，重新拉取后同内容也能命中）→ 消 P0 第二项。
3. `store/record.ts`：
   - `persist()` 改 `uni.setStorage`（异步写盘，不再阻塞渲染帧）；
   - `fetchList` 加请求序号，旧响应不再覆盖新结果。
4. `utils/read-position.ts`：`queryWithTimeout` 正常回调时 `clearTimeout`；`getViewHeight` 进程内缓存。
5. `utils/system.ts`：`getStatusBarPx` 记忆化。
6. `components/MdContainer.vue`：拆成两个浅 watch，避免 getter 每次返回新数组。
7. `pages/index/index.vue`：搜索框改绑本地 `ref`，确认/清空时才写 store。
8. `pages/landing/index.vue`：移除 Google Fonts 外链，回落到系统字体栈。

## 3. 不做（理由）

- **列表接口去掉正文 `content`**：前后端契约变更，且编辑页/详情页目前依赖 store 里的 `content`（`prefill` 命中即不请求详情），改错会静默丢正文。需单独立项，加「列表项无正文」的显式标记与全链路兜底。
- **`reLaunch` 换真 `tabBar` + `switchTab`**：会改变页面栈语义（`getCurrentPages().length`、`CustomNavBar` 返回逻辑、`?tag=`/`?palace=` 传参），风险高。
- **虚拟列表 / 分页**：本质是功能缺口（50 条以上不可达），不属于纯性能改动。

## 4. 验证

- 单测覆盖两处记忆化（命中/未命中/淘汰）。
- `vue-tsc --noEmit`（src 零错误）、`eslint`、`pnpm test`、`pnpm build:h5`。
- 真机手测：首页进入/下拉刷新/切换标签、详情↔编辑往返、编辑态↔预览切换、复习页换卡。

## 5. 实施结果

- 单测：41 passed（新增 `format.test.ts` 6 例、`parseNote` 记忆化 4 例、`flattenInline` 5 例）。
- `vue-tsc --noEmit`：src 零错误；`eslint` 改动文件零告警；`pnpm build:h5` 通过。
- 产物：`dist/build/h5` 中已无 `fonts.googleapis` 引用；主 chunk 235.6 KB（未做体积对比基线，改动不含依赖变更）。

### 行为变化（需验收确认）

1. landing 页字体从 Manrope 回落为系统字体栈（去掉跨域阻塞请求的代价）。
2. `MdContainer` 折叠态：同一篇内容两次进入时不再强制复位为折叠（解析结果被复用，`props.blocks` 引用不变）。跨笔记切换仍是不同数组，会复位。
3. 搜索框改为「确认/清空时才写 store」，中途输入不再写 pinia；`onShow` 会把输入框对齐到 store 里的 keyword（宫殿页会清空它）。
4. 列表缓存写入由同步改为异步：极端情况下（写入回调前进程被杀）冷启动缓存可能比之前旧一次，不影响数据正确性（服务端为准）。

## 6. 后续 backlog

1. 列表接口不再回传正文 `content`（或回传服务端摘要）——同时省掉传输体积、JSON 序列化、摘要计算。
2. ~~`reLaunch` → 真 `tabBar` + `switchTab`~~ → 已实施（2026-11-13）：改用页面栈保活导航（`utils/navigation.ts` 的 goToTab），未引入原生 tabBar，理由与细节见 `specs/2026-11-13-tab-keepalive-list-pagination.md` §1。
3. ~~首页分页 + 长列表虚拟化~~ → 已实施（2026-11-13）：分页 20 条/页 + `onReachBottom` 追加；虚拟化用实测高度 + 渲染窗口（`utils/render-window.ts`），同上 spec §2/§3。
