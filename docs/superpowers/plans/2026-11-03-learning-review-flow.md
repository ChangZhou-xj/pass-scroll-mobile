# Learning And Review Flow Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让笔记必须在详情页显式完成学习并按曲线排期后，才能进入复习页；复习时先主动回忆，再统一揭示答案并评分。

**Architecture:** 在现有 `Record` 上增加 nullable `learnedAt`，用它区分「未学习」与「已学习等待首次复习」，不复用复习次数或掌握度。新增学习接口，收敛后端所有到期统计到同一条件；前端沿用 `record` store 管笔记本体、`srs` store 管复习队列，并用页面本地状态控制答案揭示。

**Tech Stack:** NestJS 10、Prisma 6、MySQL 8、Jest 29、uni-app、Vue 3、TypeScript、Pinia、UnoCSS。

**Spec:** `docs/superpowers/specs/2026-11-03-learning-review-flow-design.md`

## Global Constraints

- 前端只用 pnpm，后端只在 `server/` 下使用 npm；不要混用包管理器。
- 所有业务结果只看 `body.code`；业务失败使用 `BusinessException`，HTTP 200 不代表业务成功。
- 新业务码往后排：`10005` 每日学习配额已满，`10006` 笔记尚未学习；不得复用旧业务码。
- 每个 records 接口从 JWT 获取 `userId`，service 通过归属校验访问记录；他人记录与不存在记录统一 404。
- 学习、复习、置顶、掌握度操作必须显式回写旧 `updatedAt`，不得改变首页列表排序。
- `record.serializer.ts` 与 `src/types/record.d.ts` 必须同步修改。
- 不修改 `server/src/records/srs.ts` 或 `src/utils/srs.ts` 的评分和排期算法；本功能只使用曲线首间隔。
- 复习队列保持标签分块和块内到期优先，不能退回主题混排。
- 动态颜色/尺寸不能使用含 arbitrary value 的 `:class`；需要动态颜色时使用 `:style`。
- 页面请求失败不重复 toast，`request.ts` 已统一提示。
- 前端没有测试框架；后端按 RED-GREEN 执行，前端用 lint、构建和明确的人工流程验收。
- 后端 Jest 的 `globalSetup` 会重建 `pass_scroll_test`；运行前确认 `TEST_DATABASE_URL` 指向测试库，不得指向开发库。
- 不搭隔离 worktree，直接在当前分支工作；不主动 commit，只有用户明确要求时才提交。

---

## File Map

- `server/prisma/schema.prisma`：增加 `learnedAt` 与查询索引。
- `server/prisma/migrations/20261103090000_add_record_learned_at/migration.sql`：增加字段并回填历史已复习记录。
- `server/src/records/dto/record.dto.ts`：新增 `LearnRecordDto`，移除复习队列不再使用的 `newPerDay` query。
- `server/src/records/records.controller.ts`：注册 `POST /records/:id/learn`。
- `server/src/records/records.service.ts`：完成学习、复习守卫、统一队列和统计。
- `server/src/records/record.serializer.ts`：序列化 `learnedAt`。
- `server/src/common/exceptions/business.exception.ts`：登记新业务码。
- `server/src/records/records.service.spec.ts`：学习、复习守卫、迁移回填、队列和统计集成测试。
- `server/test/records.e2e-spec.ts`：验证学习接口 HTTP 契约。
- `src/types/record.d.ts`：同步 `RecordItem` 与统计语义。
- `src/api/record.ts`：新增学习请求，移除 due query 的 `newPerDay`。
- `src/store/record.ts`：学习动作与旧缓存归一化。
- `src/store/srs.ts`：队列请求和到期/新卡计数更新。
- `src/pages/curve/index.vue`：每日上限文案改为「每日新学习」。
- `src/pages/detail/index.vue`：首次学习入口和排期反馈。
- `src/pages/review/index.vue`：统一答案揭示与评分解锁。
- `CLAUDE.md`：更新学习—复习核心契约，保留其他未提交改动。

---

### Task 1: 增加学习时间与历史数据兼容

**Files:**

- Create: `server/prisma/migrations/20261103090000_add_record_learned_at/migration.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/records/record.serializer.ts`
- Modify: `src/types/record.d.ts`
- Test: `server/src/records/records.service.spec.ts`

**Interfaces:**

- Consumes: 现有 `Record` 模型、`serializeRecord`、`RecordItem`。
- Produces: `Record.learnedAt: Date | null`、序列化结果 `learnedAt: number | null`；后续所有任务以此判断学习状态。

- [ ] **Step 1: 写序列化和历史回填失败测试**

在 `records.service.spec.ts` 顶部增加：

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
```

在 `create 返回序列化记录` 用例的断言中增加：

```ts
expect(record.learnedAt).toBeNull();
```

新增迁移测试，直接执行迁移文件中的回填 SQL，避免测试一份与真实迁移不一致的副本：

```ts
it("迁移只回填已复习记录的 learnedAt", async () => {
  const reviewed = await service.create(userId, { title: "已复习", content: "", tags: [] });
  const fresh = await service.create(userId, { title: "未学习", content: "", tags: [] });
  const firstReviewedAt = new Date("2026-10-01T08:00:00.000Z");
  await prisma.record.update({
    where: { id: reviewed.id },
    data: { reviewCount: 1, firstReviewedAt, learnedAt: null },
  });

  const migration = readFileSync(
    join(__dirname, "../../prisma/migrations/20261103090000_add_record_learned_at/migration.sql"),
    "utf8",
  );
  const backfill = migration.match(/UPDATE `Record`[\s\S]*?;/)?.[0];
  expect(backfill).toBeDefined();
  await prisma.$executeRawUnsafe(backfill!);

  const reviewedRow = await prisma.record.findUniqueOrThrow({ where: { id: reviewed.id } });
  const freshRow = await prisma.record.findUniqueOrThrow({ where: { id: fresh.id } });
  expect(reviewedRow.learnedAt).toEqual(firstReviewedAt);
  expect(freshRow.learnedAt).toBeNull();
});
```

- [ ] **Step 2: 运行测试并确认因缺少字段失败**

Run:

```bash
cd server && npx jest records.service
```

Expected: FAIL；Prisma 类型或运行时尚无 `learnedAt`，迁移文件也尚不存在。若因 `TEST_DATABASE_URL` 指向错误而失败，先停止并修正测试环境，不能继续跑开发库。

- [ ] **Step 3: 增加 Prisma 字段、索引与迁移**

在 `Record` 的调度字段中加入：

```prisma
learnedAt      DateTime? // 首次显式完成学习；null = 未学习，不得进入复习队列
```

在模型索引区加入：

```prisma
@@index([userId, learnedAt, dueAt]) // 已学习且到期队列
```

创建 `20261103090000_add_record_learned_at/migration.sql`：

```sql
ALTER TABLE `Record` ADD COLUMN `learnedAt` DATETIME(3) NULL;

UPDATE `Record`
SET `learnedAt` = COALESCE(`firstReviewedAt`, `createdAt`)
WHERE `reviewCount` > 0;

CREATE INDEX `Record_userId_learnedAt_dueAt_idx` ON `Record`(`userId`, `learnedAt`, `dueAt`);
```

生成客户端并应用迁移：

```bash
cd server && npx prisma generate && npx prisma migrate dev
```

确认命令操作的是开发库；测试仍由 Jest `globalSetup` 用 schema 重建测试库。

- [ ] **Step 4: 同步序列化器与前端类型**

在 `serializeRecord` 的 `reviewCount` 后增加：

```ts
learnedAt: record.learnedAt ? record.learnedAt.getTime() : null,
```

在 `RecordItem` 的 `reviewCount` 后增加：

```ts
/** 首次完成学习时刻（毫秒）；null = 未学习，不得进入复习队列 */
learnedAt: number | null;
```

同时把 `firstReviewedAt` 注释改为「首次复习时刻；null = 还没有复习过」，避免与首次学习混淆。

- [ ] **Step 5: 运行测试并检查格式**

Run:

```bash
cd server && npx jest records.service
```

Expected: PASS，包含新序列化断言和真实迁移回填 SQL 测试。

Run:

```bash
git diff --check -- server/prisma server/src/records/record.serializer.ts src/types/record.d.ts
```

Expected: 无输出。不主动 commit。

---

### Task 2: 新增完成学习接口与每日学习配额

**Files:**

- Modify: `server/src/common/exceptions/business.exception.ts`
- Modify: `server/src/records/dto/record.dto.ts`
- Modify: `server/src/records/records.controller.ts`
- Modify: `server/src/records/records.service.ts`
- Test: `server/src/records/records.service.spec.ts`
- Test: `server/test/records.e2e-spec.ts`

**Interfaces:**

- Consumes: Task 1 的 `learnedAt`；现有 `CurveDto`、`normalizeCurve`、`findOwned`。
- Produces: `RecordsService.learn(userId: string, id: string, dto: LearnRecordDto)` 和 `POST /records/:id/learn`；返回序列化 `RecordItem`。

- [ ] **Step 1: 写学习排期、幂等、配额和归属失败测试**

在 `records.service.spec.ts` 增加独立 `describe("首次学习")`：

```ts
describe("首次学习", () => {
  it("按曲线首间隔排期且不改变复习与排序状态", async () => {
    const record = await service.create(userId, { title: "A", content: "正文", tags: [] });
    const learned = await service.learn(userId, record.id, { curve: { steps: [15, 1440] } });

    expect(learned.learnedAt).not.toBeNull();
    expect(learned.dueAt! - learned.learnedAt!).toBe(15 * 60_000);
    expect(learned.reviewCount).toBe(0);
    expect(learned.stage).toBe(0);
    expect(learned.mastery).toBe("NONE");
    expect(learned.updatedAt).toBe(record.updatedAt);
  });

  it("重复学习幂等，且已学习记录在配额用完后仍可返回", async () => {
    const first = await service.create(userId, { title: "A", content: "", tags: [] });
    const second = await service.create(userId, { title: "B", content: "", tags: [] });
    const learned = await service.learn(userId, first.id, { curve: { steps: [10], newPerDay: 1 } });

    const repeated = await service.learn(userId, first.id, { curve: { steps: [99], newPerDay: 1 } });
    expect(repeated.dueAt).toBe(learned.dueAt);
    expect(repeated.learnedAt).toBe(learned.learnedAt);

    await expect(service.learn(userId, second.id, { curve: { steps: [10], newPerDay: 1 } })).rejects.toMatchObject({
      businessCode: 10005,
    });
  });

  it("不能学习他人的记录", async () => {
    const otherId = await createOtherUser();
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    await expect(service.learn(otherId, record.id, {})).rejects.toMatchObject({ status: 404 });
  });
});
```

在 `records.e2e-spec.ts` 增加 HTTP 契约测试：

```ts
it("POST /records/:id/learn 返回学习时间和首次复习时间", async () => {
  const created = await authed(tokenA).post("/records").send({ title: "A", content: "正文", tags: [] }).expect(201);
  const id = created.body.data.id;

  const learned = await authed(tokenA)
    .post(`/records/${id}/learn`)
    .send({ curve: { steps: [10, 1440] } })
    .expect(201);

  expect(learned.body.code).toBe(0);
  expect(learned.body.data.learnedAt).toEqual(expect.any(Number));
  expect(learned.body.data.dueAt - learned.body.data.learnedAt).toBe(600_000);
  expect(learned.body.data.reviewCount).toBe(0);
});
```

- [ ] **Step 2: 运行失败测试**

Run:

```bash
cd server && npx jest records.service
```

Expected: FAIL，`service.learn is not a function`。

Run:

```bash
cd server && npm run test:e2e -- --runInBand
```

Expected: 新学习接口用例 FAIL，404 或路由不匹配；既有用例不应被修改来迎合失败。

- [ ] **Step 3: 登记业务码并声明 DTO**

在业务码注释中追加：

```text
 *   10005 今日新学习数量已达上限
 *   10006 笔记尚未完成学习，不能复习
```

在 `record.dto.ts` 的 `CurveDto` 后增加：

```ts
/** POST /records/:id/learn——完成首次学习并按曲线首间隔排期 */
export class LearnRecordDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CurveDto)
  curve?: CurveDto;
}
```

- [ ] **Step 4: 实现 service.learn**

在 `records.service.ts` 导入 `LearnRecordDto`，并定义：

```ts
export const LEARN_QUOTA_EXCEEDED = 10005;
export const RECORD_NOT_LEARNED = 10006;
```

在 `review` 前增加：

```ts
async learn(userId: string, id: string, dto: LearnRecordDto) {
  const owned = await this.findOwned(userId, id);
  // 幂等先于配额：已学习记录即使今天额度已满，也不能因重复点击而报错或改期。
  if (owned.learnedAt) return this.detail(userId, id);

  const curve = normalizeCurve(dto.curve);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const learnedToday = await this.prisma.record.count({
    where: { userId, learnedAt: { gte: todayStart } },
  });
  if (learnedToday >= curve.newPerDay) {
    throw new BusinessException(LEARN_QUOTA_EXCEEDED, "今日新学习数量已达上限，明天再来吧");
  }

  const row = await this.prisma.record.update({
    where: { id: owned.id },
    data: {
      learnedAt: now,
      dueAt: new Date(now.getTime() + curve.steps[0] * 60_000),
      updatedAt: owned.updatedAt,
    },
    include: { tags: { include: { tag: true } } },
  });
  return serializeRecord(row);
}
```

不要在 `learn` 中调用 `schedule` 或增加 `reviewCount`。

- [ ] **Step 5: 注册 controller 路由**

在 controller 导入 `LearnRecordDto`，并在 `review` 前增加：

```ts
// 完成首次学习：只写 learnedAt + 首次 dueAt，不算一次复习
@Post(":id/learn")
learn(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: LearnRecordDto) {
  return this.records.learn(user.userId, id, dto);
}
```

同时在文件头 REST 速览中登记该路由。

- [ ] **Step 6: 运行后端测试确认通过**

Run:

```bash
cd server && npx jest records.service && npm run test:e2e -- --runInBand
```

Expected: 全部 PASS。若只有新增用例失败，修正学习实现，不修改断言来绕过业务规则。不主动 commit。

---

### Task 3: 禁止未学习记录直接提交复习

**Files:**

- Modify: `server/src/records/records.service.ts`
- Test: `server/src/records/records.service.spec.ts`
- Test: `server/test/records.e2e-spec.ts`

**Interfaces:**

- Consumes: Task 1 的 `learnedAt`、Task 2 的 `RECORD_NOT_LEARNED` 和 `service.learn`。
- Produces: `review` 的前置状态守卫；合法复习接口签名不变。

- [ ] **Step 1: 写复习守卫失败测试**

在 service 测试中增加：

```ts
it("未学习记录不能评分，完成学习后可以首次评分", async () => {
  const record = await service.create(userId, { title: "A", content: "", tags: [] });
  await expect(service.review(userId, record.id, { grade: "GOOD" })).rejects.toMatchObject({ businessCode: 10006 });

  await service.learn(userId, record.id, { curve: { steps: [10] } });
  const reviewed = await service.review(userId, record.id, { grade: "GOOD", curve: { steps: [10, 1440] } });
  expect(reviewed.reviewCount).toBe(1);
  expect(reviewed.firstReviewedAt).not.toBeNull();
});
```

在 e2e 中增加：

```ts
it("未学习记录复习返回 10006 且 HTTP 200", async () => {
  const created = await authed(tokenA).post("/records").send({ title: "A", content: "", tags: [] }).expect(201);
  const res = await authed(tokenA).post(`/records/${created.body.data.id}/review`).send({ grade: "GOOD" }).expect(200);
  expect(res.body.code).toBe(10006);
});
```

- [ ] **Step 2: 运行并确认旧实现允许非法复习**

Run:

```bash
cd server && npx jest records.service -t "未学习记录不能评分" && npm run test:e2e -- --runInBand -t "未学习记录复习"
```

Expected: 两个新用例 FAIL，因为旧 `review` 会直接给未学习记录评分。

- [ ] **Step 3: 在 review 中加入最小守卫**

在 `review` 的 `findOwned` 之后、调用 `schedule` 之前加入：

```ts
if (!owned.learnedAt) {
  throw new BusinessException(RECORD_NOT_LEARNED, "请先在详情页完成学习");
}
```

不在这里检查 `dueAt`：服务评级接口只负责学习状态守卫，页面队列负责到期展示；这样也保留用户对已学习卡片的既有复习能力。

- [ ] **Step 4: 运行 service 与 e2e 回归**

Run:

```bash
cd server && npx jest records.service && npm run test:e2e -- --runInBand
```

Expected: 全部 PASS。不主动 commit。

---

### Task 4: 统一到期队列、标签和统计口径

**Files:**

- Modify: `server/src/records/dto/record.dto.ts`
- Modify: `server/src/records/records.service.ts`
- Modify: `server/src/records/records.service.spec.ts`
- Modify: `server/src/records/due-block.spec.ts`（仅更新不再存在 `dueAt=null` 新卡的说明/测试语义）

**Interfaces:**

- Consumes: `learnedAt` 和现有 `orderByTagBlock`。
- Produces: `due()` 的统一到期队列；`dueCount` 为到期旧卡数，`freshCount` 为到期首次卡数，`stats.dueCount` 为两者之和。

- [ ] **Step 1: 写队列和统计失败测试**

在 service 测试中增加：

```ts
it("复习队列只含已学习且到期卡片，所有统计使用同一口径", async () => {
  const unlearned = await service.create(userId, { title: "未学习", content: "", tags: ["MySQL"] });
  const future = await service.create(userId, { title: "未到期", content: "", tags: ["MySQL"] });
  const fresh = await service.create(userId, { title: "首次到期", content: "", tags: ["MySQL"] });
  const old = await service.create(userId, { title: "旧卡到期", content: "", tags: ["MySQL"] });
  const now = new Date();
  const past = new Date(now.getTime() - 60_000);
  const later = new Date(now.getTime() + 60 * 60_000);

  await prisma.record.update({ where: { id: unlearned.id }, data: { dueAt: past } });
  await prisma.record.update({ where: { id: future.id }, data: { learnedAt: now, dueAt: later } });
  await prisma.record.update({ where: { id: fresh.id }, data: { learnedAt: now, dueAt: past } });
  await prisma.record.update({
    where: { id: old.id },
    data: { learnedAt: now, dueAt: past, reviewCount: 2, lastReviewedAt: now },
  });

  const due = await service.due(userId, { limit: 50 });
  expect(new Set(due.list.map((item) => item.id))).toEqual(new Set([fresh.id, old.id]));
  expect(due.dueCount).toBe(1);
  expect(due.freshCount).toBe(1);
  expect(due.nextDueAt).toBe(later.getTime());

  const tags = await service.dueTags(userId);
  expect(tags.find((item) => item.name === "MySQL")).toMatchObject({ due: 2, total: 4 });
  expect((await service.stats(userId)).dueCount).toBe(2);
});
```

另加宫殿过滤回归：

```ts
it("宫殿巡游同样排除未学习卡片", async () => {
  const palace = await prisma.palace.create({ data: { userId, name: "回家路线", emoji: "🏠" } });
  const unlearned = await service.create(userId, { title: "未学习", content: "", tags: [] });
  const dueCard = await service.create(userId, { title: "已到期", content: "", tags: [] });
  const now = new Date();
  await prisma.record.update({
    where: { id: unlearned.id },
    data: { palaceId: palace.id, dueAt: new Date(now.getTime() - 60_000) },
  });
  await prisma.record.update({
    where: { id: dueCard.id },
    data: { palaceId: palace.id, learnedAt: now, dueAt: new Date(now.getTime() - 60_000) },
  });

  const result = await service.due(userId, { limit: 50, palaceId: palace.id });
  expect(result.list.map((item) => item.id)).toEqual([dueCard.id]);
});
```

`Palace` 创建只需 `userId/name`，`emoji` 有默认值；以上测试数据直接满足 schema。

- [ ] **Step 2: 运行并确认旧队列错误纳入未学习卡**

Run:

```bash
cd server && npx jest records.service -t "复习队列只含|宫殿巡游同样"
```

Expected: FAIL，旧实现会返回未学习记录，统计也偏大。

- [ ] **Step 3: 用统一查询替换 due 中的双队列拼接**

删除 `introducedToday`、`freshQuota` 和 `freshRows`。保留 `base`、`todayStart`，实现以下查询：

```ts
const dueWhere: Prisma.RecordWhereInput = {
  ...base,
  learnedAt: { not: null },
  dueAt: { lte: now },
};
const [dueCount, freshCount, learnedToday] = await this.prisma.$transaction([
  this.prisma.record.count({ where: { ...dueWhere, reviewCount: { gt: 0 } } }),
  this.prisma.record.count({ where: { ...dueWhere, reviewCount: 0 } }),
  this.prisma.record.count({ where: { ...base, lastReviewedAt: { gte: todayStart } } }),
]);

const [rows, nextRow] = await this.prisma.$transaction([
  this.prisma.record.findMany({
    where: dueWhere,
    include: { tags: { include: { tag: true } } },
    orderBy: [{ dueAt: "asc" }],
    take: limit,
  }),
  this.prisma.record.findFirst({
    where: { ...base, learnedAt: { not: null }, dueAt: { gt: now } },
    orderBy: { dueAt: "asc" },
    select: { dueAt: true },
  }),
]);

const list = orderByTagBlock(rows).slice(0, limit);
return {
  list: list.map(serializeRecord),
  blocks: tagBlocks(list),
  dueCount,
  freshCount,
  learnedToday,
  nextDueAt: nextRow?.dueAt ? nextRow.dueAt.getTime() : null,
};
```

更新 `due()` 头注，删除「到期旧卡 + 所有新卡」，改为「已学习且到期；首次卡/旧卡仅用于统计」。

- [ ] **Step 4: 同步 dueTags、stats 和 DTO**

`dueTags` 的 `dueWhere` 改为：

```ts
const dueWhere: Prisma.RecordWhereInput = {
  userId,
  learnedAt: { not: null },
  dueAt: { lte: now },
};
```

`stats` 的 `dueCount` 查询改为：

```ts
this.prisma.record.count({
  where: { userId, learnedAt: { not: null }, dueAt: { lte: new Date() } },
}),
```

从 `DueQueryDto` 删除 `newPerDay` 字段；每日上限只由 `LearnRecordDto.curve` 携带。更新 `due-block.spec.ts` 中「纯新卡 dueAt=null」用例为通用排序工具测试：保留对 `null` 的防御性排序覆盖，但明确生产 `due()` 不再传入未排期新卡，不删除底层防御逻辑。

- [ ] **Step 5: 运行所有 records 测试**

Run:

```bash
cd server && npx jest records.service due-block srs
```

Expected: 全部 PASS，尤其标签块顺序不回归。不主动 commit。

---

### Task 5: 同步前端学习 API、store、缓存与曲线语义

**Files:**

- Modify: `src/api/record.ts`
- Modify: `src/store/record.ts`
- Modify: `src/store/srs.ts`
- Modify: `src/types/record.d.ts`
- Modify: `src/pages/curve/index.vue`

**Interfaces:**

- Consumes: `POST /records/:id/learn`、统一后的 `GET /records/due`。
- Produces: `learnRecord(id, curve): Promise<RecordItem>` API；`recordStore.learnRecord(id, curve)` 动作；详情页可读取 `srsStore.curve`。

- [ ] **Step 1: 增加学习 API 并清理 due query**

在 `src/api/record.ts` 增加：

```ts
/** 完成首次学习；curve 决定首次复习间隔和每日新学习上限 */
export function learnRecord(id: string, curve: CurveConfig): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/learn`, method: "POST", data: { curve } });
}
```

从 `getDueRecords` 的 `params` 类型删除 `newPerDay?: number`，删除装配 `data.newPerDay` 的两行。更新注释为「已学习且到期的复习队列，按主题块排好」。

- [ ] **Step 2: 在 record store 中同步学习结果与缓存**

导入时避免 API 与 store 动作同名，并扩充现有导入而不是新增重复导入语句：

```ts
import type { CurveConfig, Mastery, RecordForm, RecordItem, RecordQuery } from "@/types/record";
import {
  createRecord,
  deleteRecord,
  learnRecord as learnRecordRequest,
  listRecords,
  togglePinRecord,
  updateMastery,
  updateRecord,
} from "@/api/record";
```

在 `init()` 的归一化对象中增加；旧缓存若缺少 `reviewCount`，仍可用 `firstReviewedAt` 判断已学习：

```ts
learnedAt:
  item.learnedAt ??
  (item.reviewCount || item.firstReviewedAt ? item.firstReviewedAt ?? item.createdAt ?? null : null),
```

在 store 中增加动作并放入 return：

```ts
async function learnRecord(id: string, curve: CurveConfig): Promise<RecordItem> {
  const learned = await learnRecordRequest(id, curve);
  await fetchList();
  return learned;
}
```

请求失败时让 Promise reject，由 `request.ts` 提示；不要提前更新本地记录。

- [ ] **Step 3: 调整 srs store 请求与计数**

从 `fetchDue` 的 `getDueRecords` 参数中删除：

```ts
newPerDay: curve.value.newPerDay,
```

提交复习后按当前卡真实类型递减计数，替换原先「优先减 dueCount，否则减 freshCount」：

```ts
if (card?.reviewCount === 0) {
  if (freshCount.value > 0) freshCount.value -= 1;
} else if (dueCount.value > 0) {
  dueCount.value -= 1;
}
```

保留 `learnedToday += 1` 和标签角标递减。更新 store 头注：曲线除随评分携带外，也随完成学习请求携带；`newPerDay` 不再用于拉取队列。

- [ ] **Step 4: 更新共享类型注释和曲线页文案**

将 `CurveConfig.newPerDay` 注释改为「每日首次学习上限」。将 `DueSummary` 注释明确为：

```ts
/** 到期旧卡数（reviewCount > 0） */
dueCount: number;
/** 已学习且到期的首次复习卡数（reviewCount = 0） */
freshCount: number;
```

把 `DueTagStat.due` 与 `RecordStats.dueCount` 中「到期 + 新卡」统一改成「已学习且已到期」。把曲线页「每日新卡」改为「每日新学习」，不改变配置 key，避免旧 storage 失效。

- [ ] **Step 5: 前端静态验证**

Run:

```bash
pnpm exec eslint src/api/record.ts src/store/record.ts src/store/srs.ts src/types/record.d.ts src/pages/curve/index.vue
pnpm build:h5
```

Expected: ESLint 无错误，H5 构建 DONE。运行 `pnpm type-check` 时若仍只有 wot-design-uni 的 `node_modules` 既有错误，如实记录，不修改依赖源码。不主动 commit。

---

### Task 6: 在详情页完成首次学习并展示排期

**Files:**

- Modify: `src/pages/detail/index.vue`

**Interfaces:**

- Consumes: `recordStore.learnRecord(id, curve)`、`RecordItem.learnedAt/dueAt`、`srsStore.curve`、`formatDueLabel`。
- Produces: 详情页学习按钮、学习成功反馈和已学习排期展示。

- [ ] **Step 1: 增加学习状态展示**

在正文卡片之后、底部操作栏之前加入：

```vue
<view v-if="record" class="mx-30rpx mt-24rpx">
  <PsButton v-if="!record.learnedAt" size="lg" block :disabled="learning" @click="handleLearn">
    完成学习并加入复习
  </PsButton>
  <view v-else class="rounded-24rpx bg-[#F4F5F7] px-24rpx py-20rpx text-center">
    <text class="text-24rpx text-[#0D0D0D]">{{ learningStatus }}</text>
  </view>
</view>
```

按钮和状态块均在 `record` 存在时渲染；不使用动态 arbitrary-value `:class`。

- [ ] **Step 2: 接入曲线和 store**

增加导入：

```ts
import type { CurveConfig } from "@/types/record";
import { useSrsStore } from "@/store/srs";
import { formatDueLabel } from "@/utils/srs";
```

初始化：

```ts
const srsStore = useSrsStore() as unknown as { curve: CurveConfig };
const learning = ref(false);
```

增加计算状态：

```ts
const learningStatus = computed(() => {
  if (!record.value?.dueAt) return "已加入复习";
  const due = formatDueLabel(record.value.dueAt);
  return due === "已到期" ? "已到期，可前往复习" : `已加入复习，${due}到期`;
});
```

- [ ] **Step 3: 实现学习动作**

```ts
const handleLearn = async () => {
  if (!record.value || record.value.learnedAt || learning.value) return;
  learning.value = true;
  try {
    const learned = await recordStore.learnRecord(record.value.id, srsStore.curve);
    remoteRecord.value = learned;
    const dueText = learned.dueAt ? `，${formatDueLabel(learned.dueAt)}到期` : "";
    uni.showToast({ title: `已加入复习${dueText}`, icon: "none" });
  } catch {
    // request.ts 已统一 toast；learning 在 finally 复位，不伪装成功
  } finally {
    learning.value = false;
  }
};
```

`remoteRecord` 回写用于列表过滤导致 store 暂未包含当前记录的场景；正常场景由 `fetchList` 更新共享记录。

- [ ] **Step 4: 验证详情页编译与交互**

Run:

```bash
pnpm exec eslint src/pages/detail/index.vue
pnpm build:h5
```

Expected: 无 lint 错误，构建 DONE。

人工验收：

1. 新建笔记，详情显示「完成学习并加入复习」。
2. 点击后按钮不重复提交，出现实际到期提示；首页排序不变。
3. 立即打开复习页，该笔记尚不出现。
4. 重复进入详情不显示学习按钮。
5. 把每日新学习设为 1，再学习第二条时只出现一次统一错误提示，第一条重复学习仍不报错。

不主动 commit。

---

### Task 7: 复习页统一先回忆再显示答案

**Files:**

- Modify: `src/pages/review/index.vue`

**Interfaces:**

- Consumes: 现有 `current`、`segments`、`srsStore.submitReview`。
- Produces: 页面本地 `answerRevealed: Ref<boolean>`；只有揭示答案后才渲染正文和评分栏。

- [ ] **Step 1: 用 answerRevealed 替换 details 专用评分状态**

将：

```ts
const showGrade = ref(false);
```

替换为：

```ts
const answerRevealed = ref(false);
```

删除 `hasAnswerBlock` 和 `onAnswerToggle`，增加卡片切换复位：

```ts
watch(
  () => current.value?.id,
  () => {
    answerRevealed.value = false;
  },
);
```

逐一处理旧状态复位点：

- `skipCurrent`：删除原来的 `showGrade.value = false`，队首 id 改变会由 watch 复位。
- `submit`：删除请求前的 `showGrade.value = false`；评分失败时保留答案，成功后由下一张卡或空队列的 id 变化触发 watch。
- `pickTag` 和 `exitPalace`：在 `await srsStore.fetchDue(...)` 后执行 `answerRevealed.value = false`，即使筛选前后队首 id 相同也重新隐藏。
- `onShow`：末尾设置 `answerRevealed.value = false`，保证从详情返回时仍需重新回忆。

- [ ] **Step 2: 初始只显示回忆提示与显示答案按钮**

将当前正文 `v-for` 区域替换为：

```vue
<view v-if="!answerRevealed" class="flex flex-col items-center py-48rpx">
  <text class="text-26rpx text-[#67676C]">先在心里回忆，再查看完整内容</text>
  <view class="mt-24rpx w-full">
    <PsButton size="lg" block @click="answerRevealed = true">显示答案</PsButton>
  </view>
</view>
<template v-else>
  <view v-if="segments.length">
    <view v-for="(seg, index) in segments" :key="index">
      <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
      <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
    </view>
  </view>
  <view v-else class="py-32rpx text-center">
    <text class="text-24rpx text-[#67676C]">这条笔记暂无正文，可前往详情补充</text>
  </view>
</template>
```

将提示文案改为：

```vue
{{ answerRevealed ? "对照答案，给自己打个分" : "先回忆标题对应的知识点，再显示答案" }}
```

`MdContainer` 不再绑定 `@toggle="onAnswerToggle"`；内部 `:::details` 保持原折叠行为。

- [ ] **Step 3: 评分栏只由 answerRevealed 控制**

把评分栏条件统一为：

```vue
<view
  v-if="answerRevealed"
  class="fixed left-0 right-0 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx py-16rpx"
  :style="{ bottom: 'calc(102rpx + env(safe-area-inset-bottom))', zIndex: 61 }"></view>
```

删除 `showGrade || !hasAnswerBlock` 旧条件，不保留第二条评分渲染路径。

- [ ] **Step 4: 更新复习空态引导**

把 `nextDueText` 的无排期文案从「写一条新笔记就能开始复习」改为「去首页完成学习后即可开始复习」。空态主按钮文案改为「去首页学习」，仍调用现有 `goHome`，不新增路由。

- [ ] **Step 5: 验证复习页编译与完整交互**

Run:

```bash
pnpm exec eslint src/pages/review/index.vue
pnpm build:h5
```

Expected: 无 lint 错误，构建 DONE。

人工验收：

1. 到期卡初始只有标题/标签，不显示正文和评分栏。
2. 点击「显示答案」后完整 Markdown、表格和代码块正常显示，四档评分出现。
3. 无 `:::details` 的爬虫文章也必须经过同一步骤。
4. 空正文显示提示，不导致页面报错。
5. 跳过、切换主题、提交评分后，下一张卡恢复隐藏答案。
6. 复习接口失败时答案保持展开，且不重复 toast。

不主动 commit。

---

### Task 8: 更新项目契约并执行完整验收

**Files:**

- Modify: `CLAUDE.md`
- Verify: 本计划上述所有源码、迁移和测试文件

**Interfaces:**

- Consumes: Tasks 1-7 已完成行为。
- Produces: 与实现一致的项目开发约束和最终验证结果。

- [ ] **Step 1: 更新 CLAUDE.md 的记忆系统契约**

只编辑记忆系统相关段落，保留工作区已有其他改动。明确写入：

```md
- 首次学习与复习分离：`learnedAt = null` 表示未学习；详情页调用 `POST /records/:id/learn`，按当前曲线首间隔写首次 `dueAt`，不增加 `reviewCount`，也不改变掌握度和列表排序。
- `POST /records/:id/review` 拒绝未学习笔记（10006）；每日首次学习超限返回 10005。`newPerDay` 表示每日首次学习上限，不再由 due query 携带。
- 复习队列统一为 `learnedAt != null && dueAt <= now`；`freshCount` 只计其中 `reviewCount = 0` 的首次到期卡。`due/tags`、`stats.dueCount`、宫殿巡游必须使用同一口径。
- 复习页先只显示标题，点击「显示答案」后才渲染正文并解锁四档评分；不能依赖 :::details 才能评分。
```

同时删除旧「到期卡 + 定额新卡（所有 reviewCount=0）」描述，避免后续维护者恢复错误行为。

- [ ] **Step 2: 运行后端完整测试和构建**

先确认测试库环境，再运行：

```bash
cd server
npm test
npm run test:e2e -- --runInBand
npm run build
```

Expected: 单元/集成测试和 e2e 全部 PASS，Nest build 成功。任何失败都必须报告具体用例；不得把依赖或环境问题写成「测试通过」。

- [ ] **Step 3: 运行前端验证**

```bash
cd /d/Software/project/pass-scroll-mobile
pnpm exec eslint src/api/record.ts src/store/record.ts src/store/srs.ts src/pages/curve/index.vue src/pages/detail/index.vue src/pages/review/index.vue
pnpm type-check
pnpm build:h5
```

Expected: ESLint 和 H5 构建通过。`type-check` 若仍因 wot-design-uni `node_modules` 既有错误失败，列出该事实，并确认输出没有本次修改文件的错误；不要宣称类型检查通过。

- [ ] **Step 4: 执行端到端人工验收**

在开发数据库准备或选择一条未学习笔记，依次验证：

1. 首页可阅读未学习笔记，复习页、标签角标、我的统计和宫殿巡游均不计入它。
2. 详情点击「完成学习并加入复习」，首次 `dueAt` 与当前曲线首间隔一致。
3. 到期前复习页不出现；到期后作为新卡出现。
4. 复习初始隐藏正文；显示答案后评分；评分后 `reviewCount=1`，按现有 SRS 进入下一阶段。
5. 首页排序在所有学习/复习操作后保持不变。
6. 历史已复习笔记仍有 `learnedAt`，未复习历史笔记不进入复习队列。
7. 每日学习上限、未学习直接复习、他人记录 404、重复学习幂等符合设计。

- [ ] **Step 5: 检查最终 diff，不主动提交**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只修改本功能文件，保留用户已有的 `server/package.json`、`.impeccable/` 或其他无关改动，不暂存、不删除、不提交。最终汇报测试通过项、任何既有失败和尚未完成的浏览器/小程序实测项。
