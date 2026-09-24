# 设计 spec：借鉴 ArticlePilot 的四项能力（编辑器预览 / 版本快照 / 掌握度状态机 / 改密+趋势）

日期：2026-09-24
分支：feat/pass-scroll-server（继续沿用）
来源：gitcode.com/dickeryang/articlepilot（Java+Vue Web 后台）的产品模式，用本项目 NestJS+Prisma+uni-app 栈重新实现，不复制代码（CC BY-NC-SA 4.0 无冲突）

## 背景

ArticlePilot 的可取模式经用户拍板全选四项，嫁接到「通关秘籍」：

1. **编辑器实时预览**——当前编辑器是裸 textarea，保存后才知道渲染效果
2. **版本快照与历史回溯**——当前保存即覆盖，改坏无法找回
3. **掌握度状态机**——随机复习缺学习闭环，看完答案没有"我学会了"的落点
4. **改密 + 统计趋势**——auth 无改密入口；我的页统计用 pageSize-50 直取全量是 hack

## 关键决策表

| #   | 决策点               | 决定                                                                                                                                                                     | 理由                                                                        |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| 1   | 快照时机             | 仅 title 或 content 实际变化时，留存**修改前**快照（pin/tags/mastery 变化不产生版本）                                                                                    | 与 ArticlePilot writeSnapshot 一致；避免无意义版本膨胀                      |
| 2   | 版本号               | Record.version 从 1 起，每次内容更新 +1；快照存当时的 version                                                                                                            | 对齐 ArticlePilot；乐观锁复用同一字段                                       |
| 3   | 乐观锁               | UpdateRecordDto 可带 expectedVersion，不匹配 → BusinessException code **10409**"笔记已在其他设备修改，请刷新后重试"；前端编辑器始终携带                                  | 手机+将来网页端并编防静默覆盖                                               |
| 4   | 快照保留上限         | 不设上限（个人笔记体量小；超限治理列 deferred）                                                                                                                          | ArticlePilot 亦无上限                                                       |
| 5   | 恢复语义             | 恢复 = 一次特殊更新：先快照当前内容，再写回旧 title/content，version+1                                                                                                   | 恢复本身可撤销，历史无断点                                                  |
| 6   | 掌握度状态机         | `NONE → {LEARNING, MASTERED}`；`LEARNING → {MASTERED, NONE}`；`MASTERED → {LEARNING}`；禁自迁移；非法 → BusinessException code **10002**                                 | 对齐 ArticlePilot TopicStatusMachine；"已掌握→未掌握"必须经复习中，防止误点 |
| 7   | mastery 变更与排序   | 不刷新 updatedAt（沿用 togglePin 的显式回写手法）                                                                                                                        | 标记掌握度不应顶到列表最前                                                  |
| 8   | 掌握度配色（新令牌） | 已掌握 `#42B883`（VitePress 绿）；复习中 `#F0B429`（复用警告色）；未掌握 `#67676C`（次要色）                                                                             | 唯一新增色值，取自 VitePress 同族                                           |
| 9   | 复习池               | 默认**排除已掌握**，页面加"包含已掌握"开关；开关状态本页内存即可                                                                                                         | 复习的焦点是没掌握的题                                                      |
| 10  | 密码强度             | 8~64 位且同时含字母与数字；**注册与改密统一**校验；弱密码 code **10004**；改密时旧密码错误 code **10003**                                                                | 对齐 ArticlePilot 密码策略                                                  |
| 11  | 改密成功后           | toast → 前端 logout → 回登录页重新登录（不主动失效旧 token）                                                                                                             | 实现最简且语义安全                                                          |
| 12  | 统计接口             | 新增 `GET /records/stats`：`{ total, tagCount, pinnedCount, trend7d: number[7], mastery: { none, learning, mastered } }`；我的页切换到此接口，废弃 pageSize-50 直取 hack | 趋势/分布本来就需要服务端聚合                                               |
| 13  | 趋势图               | 近 7 天新增纯 CSS 柱状图（div 高度百分比），不引入图表库                                                                                                                 | 移动端体积与风格一致性                                                      |
| 14  | 编辑器预览           | 顶部"编辑 \| 预览"分段切换；预览态渲染 标题+tags+parseNote(content)，复用 MdContainer；同一组 refs 不丢草稿                                                              | 纯前端，零后端成本                                                          |

## Schema 演进（一次迁移 `add_snapshot_mastery_version`）

```prisma
enum Mastery {
  NONE
  LEARNING
  MASTERED
}

model Record {
  // 新增：
  version   Int              @default(1)
  mastery   Mastery          @default(NONE)
  snapshots RecordSnapshot[]
}

model RecordSnapshot {
  id        String   @id @default(cuid())
  recordId  String
  record    Record   @relation(fields: [recordId], references: [id], onDelete: Cascade)
  version   Int
  title     String   @db.VarChar(200)
  content   String   @db.Text
  createdAt DateTime @default(now())

  @@index([recordId, version])
}
```

存量行自动 version=1 / mastery=NONE。serializer 输出的 RecordItem 增加 `version`、`mastery`（时间戳毫秒化沿用现状）。

## API 变更（均无 /api 前缀、统一响应、JWT 守卫、所有权校验沿用 findOwned）

| 方法 | 路径                                | 说明                                                                       |
| ---- | ----------------------------------- | -------------------------------------------------------------------------- |
| GET  | /records/:id/snapshots              | 版本列表 `[{ id, version, title, createdAt }]`，version 降序，不含 content |
| GET  | /records/:id/snapshots/:sid         | 单版本全文（含 content）；sid 不属于该记录 → 404                           |
| POST | /records/:id/snapshots/:sid/restore | 按决策 5 恢复，返回最新 RecordItem                                         |
| POST | /records/:id/mastery                | body `{ to }`，状态机校验，返回 RecordItem；updatedAt 不刷新               |
| GET  | /records/stats                      | 决策 12 结构；trend7d 用 `$queryRaw` DATE(created_at) 聚合后 JS 补零       |
| POST | /auth/password                      | body `{ oldPassword, newPassword }`，强度+旧密码校验，data 为 null         |

PATCH /records/:id 扩展：接受 expectedVersion（决策 3）；title/content 变化时先写快照再更新并 version+1（事务内）。

## 前端变更

- **编辑器**（pages/editor）：分段切换 编辑/预览；预览复用详情页渲染结构；保存时携带 expectedVersion，遇 10409 toast 后重新拉取最新内容进表单
- **详情页**：操作栏加"历史"入口 → 新页 pages/versions/index?id=
- **版本页**：列表态（v N、标题、时间）/ 预览态（只读 markdown 渲染）双态同页；"恢复此版本"确认弹窗（confirmColor #D9303E）→ 恢复后 toast 并返回详情
- **复习页**：池默认排除 MASTERED + "包含已掌握"开关；答案容器展开后浮现两个标记按钮：`已掌握`（绿）/ `仍需复习`（复习中色）；当前题 mastery 徽示
- **RecordCard / 详情页**：mastery 徽章小字（决策 8 配色，仅非 NONE 时显示）
- **我的页**：统计卡切到 /records/stats；新增近 7 天趋势 CSS 柱状图 + 掌握度分布行（三色系）；新增"修改密码"入口 → 表单（旧密码/新密码/确认新密码）

## 测试（沿用 jest + supertest，maxWorkers:1）

- 快照：内容变化才留存 / pin 不留存 / 列表降序 / sid 越权 404 / 恢复后 version+1 且旧内容成为新快照
- 乐观锁：expectedVersion 不符 → 10409；不带则跳过校验
- 状态机：全部合法流转通过；非法（MASTERED→NONE、自迁移）→ 10002；mastery 变更后 updatedAt 不变
- 改密：旧密码错误 10003 / 弱密码 10004 / 成功后旧密码登录 401、新密码可登录；注册弱密码 10004
- stats：结构、tagCount 去重、trend7d 长度 7 且今日计数正确

## 非目标

- 不借鉴：RBAC、登录日志、图形验证码、平台 Token 托管、选题库（与本产品定位不符）
- 不做：快照上限治理、快照 diff 对比视图、掌握度复习算法（间隔重复）、图表库
- 不改：统一响应结构、JWT 方案、既有四页信息架构

## 任务拆分（SDD）

- **B1** schema 迁移 + version/mastery 字段贯通（DTO/serializer/响应）+ 测试
- **B2** 快照 API（留存/列表/详情/恢复/乐观锁）+ 测试
- **B3** 掌握度状态机 API + 测试
- **B4** 改密+强度+注册对齐 + stats API + 测试
- **F1** 编辑器实时预览
- **F2** 历史版本 UI（详情入口 + versions 页）
- **F3** 掌握度 UI（复习页标记/过滤 + 徽章）
- **F4** 我的页增强（stats 切换 + 趋势图 + 改密）

每个任务：brief → 实施 subagent → 评审 → 修复闭环 → 台账；B1→B4 串行（schema 先行），F1→F4 在 B 完成后按依赖串行（F2 依赖 B2、F3 依赖 B3、F4 依赖 B4）。
