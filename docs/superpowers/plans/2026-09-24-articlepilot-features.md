# ArticlePilot 借鉴四项能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为「通关秘籍」增加编辑器实时预览、版本快照与历史回溯、掌握度状态机、改密+统计趋势四项能力。

**Architecture:** 后端 NestJS+Prisma 先演进 schema（Record.version/mastery + RecordSnapshot 表），再依次加快照 API、状态机 API、改密+stats API；前端在 API 就绪后逐页改造（编辑器→历史版本页→复习页/徽章→我的页+改密页）。

**Tech Stack:** NestJS 10 + Prisma 6 + MySQL 8（便携版 3307）；uni-app + Vue3 script setup + Pinia + UnoCSS + wot-design-uni；jest + supertest。

**Spec:** docs/superpowers/specs/2026-09-24-articlepilot-features-design.md

## Global Constraints

- 后端端口 3100；路由**无 /api 前缀**；统一响应 `{code, message, data}`，业务错误 = BusinessException（HTTP 200 + 业务码）
- 新业务码：`10409` 版本冲突、`10002` 掌握度非法流转、`10003` 旧密码错误、`10004` 密码强度不足（`10001` 用户名已存在已占用）
- 前端 baseURL 用 `import.meta.env.VITE_APP_API_URL`；401 强制登出逻辑在 request.ts，页面不重复处理；业务错误 request.ts 已统一 toast 并 `reject(body)`（页面 catch 里可读到 `body.code`）
- 时间戳序列化为毫秒 number（serializer `.getTime()` 现状沿用）
- Prisma 模型 `Record` 与 TS 工具类型冲突：一律 `import { Record as RecordModel } from "@prisma/client"`（serializer 现状沿用）
- 排序不变量：pin/mastery 变更**不得**刷新 updatedAt——显式回写旧值（togglePin 手法）；内容更新正常刷新
- 测试：集成 spec（`server/src/**/*.spec.ts`）+ e2e（`server/test/*.e2e-spec.ts`），共享测试库 `pass_scroll_test`，jest `maxWorkers:1`；测试库由 global-setup `prisma db push` 同步 schema，**无需手动迁移测试库**
- 迁移：开发库用 `cd server && npm run prisma:migrate -- --name <name>`
- 提交格式 `type(scope): 描述`（scope 必填）；文件 LF 换行；eslint 双引号+分号+2 空格；pre-commit 拒绝 CR
- **stylelint 禁止 `<style>` 块内 rpx 单位**：尺寸一律 unocss class；style 块只放 font-family 等无 rpx 声明
- **vue-tsc 基线：`npx vue-tsc --noEmit` src/ 零报错**，任何任务不得引入新报错
- 包管理器 **pnpm**（不要用 npm install 装包；本计划无新依赖）
- 前端消费 pinia setup store 须沿用页面内 `RecordStoreProxy`/`UserStoreProxy` unknown 转换模式（见 editor/detail/review/profile 页现状）
- 设计令牌：brand `#3E63DD`、正文 `#3C3C43`、次要 `#67676C`、页面底 `#F7F8FA`、危险 `#D9303E`、警告 `#F0B429`、分割线 `#EEEEEE`（沿用详情页既有值）、**新增** 掌握绿 `#42B883`；楷体仅用于笔记标题与"通关秘籍"品牌字

---

### Task B1: schema 迁移 + version/mastery 字段贯通

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_snapshot_mastery_version/`（由 migrate dev 生成）
- Modify: `server/test/reset-db.ts`
- Modify: `server/src/records/record.serializer.ts`
- Modify: `server/src/records/records.service.spec.ts`（断言增量）
- Modify: `src/types/record.d.ts`（前端契约，类型先行）

**Interfaces:**

- Produces:
  - Prisma `Record` 新增字段 `version: Int @default(1)`、`mastery: Mastery @default(NONE)`；`enum Mastery { NONE LEARNING MASTERED }`；`model RecordSnapshot { id, recordId, version, title, content, createdAt }`
  - `serializeRecord` 输出新增 `version: number`、`mastery: Mastery`
  - 前端 `RecordItem` 新增 `version: number; mastery: Mastery`；`export type Mastery = "NONE" | "LEARNING" | "MASTERED"`
- Consumes: 现有 serializer/DTO 结构

- [ ] **Step 1: 改 schema**

`server/prisma/schema.prisma` 的 `Record` model 内追加（放在 `tags RecordTag[]` 之前）：

```prisma
  version   Int              @default(1)
  mastery   Mastery          @default(NONE)
  snapshots RecordSnapshot[]
```

文件末尾追加：

```prisma
enum Mastery {
  NONE
  LEARNING
  MASTERED
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

- [ ] **Step 2: 生成并应用迁移（开发库）**

确认 MySQL 在 3307 运行后：

```bash
cd server && npm run prisma:migrate -- --name add_snapshot_mastery_version
```

预期：生成迁移目录并提示 applied；存量行 version=1、mastery=NONE。

- [ ] **Step 3: 改 reset-db（快照表先删，FK 顺序）**

`server/test/reset-db.ts` 第一行删除语句前插入：

```ts
await prisma.recordSnapshot.deleteMany();
```

（完整顺序：recordSnapshot → recordTag → record → tag → user）

- [ ] **Step 4: 写失败测试（serializer 贯通断言）**

`server/src/records/records.service.spec.ts` 的 `create 返回序列化记录` 用例中，`expect(record).toMatchObject({...})` 改为：

```ts
expect(record).toMatchObject({
  title: "第一条",
  content: "内容",
  isPinned: false,
  tags: ["面试", "hash"],
  version: 1,
  mastery: "NONE",
});
```

运行：`cd server && npx jest src/records/records.service.spec.ts`
预期：FAIL（`version`/`mastery` 不在序列化输出中）

- [ ] **Step 5: 改 serializer**

`server/src/records/record.serializer.ts`：

```ts
export function serializeRecord(record: RecordWithTags) {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    isPinned: record.isPinned,
    version: record.version,
    mastery: record.mastery,
    tags: record.tags.map((rt) => rt.tag.name),
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}
```

重跑 Step 4 测试：PASS。再跑全量 `cd server && npm test && npm run test:e2e`：全绿。

- [ ] **Step 6: 前端契约类型**

`src/types/record.d.ts` 顶部追加并在 `RecordItem` 中插入两个字段：

```ts
/** 掌握度（与后端 Mastery 枚举一致） */
export type Mastery = "NONE" | "LEARNING" | "MASTERED";
```

`RecordItem` 在 `isPinned` 后插入：

```ts
/** 内容版本号，乐观锁用 */
version: number;
mastery: Mastery;
```

验证：`npx vue-tsc --noEmit` 零报错（字段是新增的必填项——确认各页面构造 RecordItem 的地方只有后端数据，无手工构造，故零新报错；若有 mock 构造处报错则补齐字段）。

- [ ] **Step 7: Commit**

```bash
git add server/prisma server/test/reset-db.ts server/src/records/record.serializer.ts server/src/records/records.service.spec.ts src/types/record.d.ts
git commit -m "feat(records): 记录增加版本号与掌握度字段及快照表"
```

---

### Task B2: 快照 API（留存/列表/详情/恢复）+ 乐观锁

**Files:**

- Modify: `server/src/records/dto/record.dto.ts`
- Modify: `server/src/records/record.serializer.ts`
- Modify: `server/src/records/records.service.ts`
- Modify: `server/src/records/records.controller.ts`
- Test: `server/src/records/records.service.spec.ts`（追加用例）
- Test: `server/test/records.e2e-spec.ts`（追加用例）

**Interfaces:**

- Consumes: B1 的 `RecordSnapshot` 表、`record.version`、`RecordWithTags`
- Produces:

  - `export const VERSION_CONFLICT = 10409`（records.service.ts）
  - `RecordsService.snapshots(userId, id): Promise<SnapshotItem[]>`、`snapshot(userId, id, sid): Promise<SnapshotDetail>`、`restoreSnapshot(userId, id, sid): Promise<RecordItem 序列化>`
  - `serializeSnapshot(row)` → `{ id, version, title, createdAt }`；`serializeSnapshotDetail(row)` → 同上加 `content`
  - `UpdateRecordDto.expectedVersion?: number`
  - 路由：`GET /records/:id/snapshots`、`GET /records/:id/snapshots/:sid`、`POST /records/:id/snapshots/:sid/restore`

- [ ] **Step 1: 写失败测试（集成 spec 追加）**

`records.service.spec.ts` 追加 describe：

```ts
describe("版本快照与乐观锁", () => {
  it("内容变化时留存修改前快照且 version+1；tags-only 变化不留存", async () => {
    const record = await service.create(userId, { title: "A", content: "旧", tags: ["x"] });
    const updated = await service.update(userId, record.id, { content: "新" });
    expect(updated.version).toBe(2);
    const snaps = await service.snapshots(userId, record.id);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ version: 1, title: "A" });
    await service.update(userId, record.id, { tags: ["y"] });
    const after = await service.snapshots(userId, record.id);
    expect(after).toHaveLength(1);
  });

  it("togglePin 不留存快照", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    await service.togglePin(userId, record.id);
    expect(await service.snapshots(userId, record.id)).toHaveLength(0);
  });

  it("snapshot 详情含 content；他人/错配 sid 返回 404", async () => {
    const record = await service.create(userId, { title: "A", content: "旧", tags: [] });
    await service.update(userId, record.id, { content: "新" });
    const snaps = await service.snapshots(userId, record.id);
    const detail = await service.snapshot(userId, record.id, snaps[0].id);
    expect(detail.content).toBe("旧");
    const otherId = await createOtherUser();
    await expect(service.snapshot(otherId, record.id, snaps[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(service.snapshot(userId, record.id, "no-such")).rejects.toMatchObject({ status: 404 });
  });

  it("恢复：当前内容先存为快照，再写回旧内容且 version+1", async () => {
    const record = await service.create(userId, { title: "A", content: "v1", tags: [] });
    await service.update(userId, record.id, { content: "v2" });
    const snaps = await service.snapshots(userId, record.id);
    const restored = await service.restoreSnapshot(userId, record.id, snaps[0].id);
    expect(restored.content).toBe("v1");
    expect(restored.version).toBe(3);
    const after = await service.snapshots(userId, record.id);
    expect(after[0].version).toBe(2); // 恢复前的 v2 成为最新快照（降序第一）
  });

  it("expectedVersion 不匹配抛 10409；不带则跳过校验", async () => {
    const record = await service.create(userId, { title: "A", content: "v1", tags: [] });
    await expect(service.update(userId, record.id, { content: "v2", expectedVersion: 99 })).rejects.toMatchObject({
      businessCode: 10409,
    });
    const ok = await service.update(userId, record.id, { content: "v2" });
    expect(ok.version).toBe(2);
  });
});
```

运行：`cd server && npx jest src/records/records.service.spec.ts` → FAIL（方法不存在）

- [ ] **Step 2: DTO 增加 expectedVersion**

`record.dto.ts` 的 `UpdateRecordDto` 追加：

```ts
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
```

- [ ] **Step 3: serializer 加快照序列化**

`record.serializer.ts` 追加：

```ts
import type { RecordSnapshot } from "@prisma/client";

export function serializeSnapshot(row: RecordSnapshot) {
  return { id: row.id, version: row.version, title: row.title, createdAt: row.createdAt.getTime() };
}

export function serializeSnapshotDetail(row: RecordSnapshot) {
  return { ...serializeSnapshot(row), content: row.content };
}
```

（import 语句与文件头既有 import 合并为一行：`import { Record as RecordModel, RecordSnapshot } from "@prisma/client";`——注意 RecordSnapshot 仅作类型用，加 `type` 修饰须与 eslint 规则一致，直接写进同一 import 即可。）

- [ ] **Step 4: service 实现**

`records.service.ts`：顶部 import 增加 `BusinessException`、`serializeSnapshot`、`serializeSnapshotDetail`；类外导出：

```ts
export const VERSION_CONFLICT = 10409;
```

`update` 方法整体替换为：

```ts
  async update(userId: string, id: string, dto: UpdateRecordDto) {
    const owned = await this.findOwned(userId, id);
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== owned.version) {
      throw new BusinessException(VERSION_CONFLICT, "笔记已在其他设备修改，请刷新后重试");
    }
    const contentChanged =
      (dto.title !== undefined && dto.title !== owned.title) ||
      (dto.content !== undefined && dto.content !== owned.content);
    const data: Prisma.RecordUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.tags !== undefined) {
      data.tags = { deleteMany: {}, create: this.tagConnections(userId, dto.tags) };
    }
    if (contentChanged) data.version = owned.version + 1;
    const row = await this.prisma.$transaction(async (tx) => {
      if (contentChanged) {
        await tx.recordSnapshot.create({
          data: { recordId: owned.id, version: owned.version, title: owned.title, content: owned.content },
        });
      }
      return tx.record.update({ where: { id }, data, include: { tags: { include: { tag: true } } } });
    });
    return serializeRecord(row);
  }
```

追加三个方法：

```ts
  async snapshots(userId: string, id: string) {
    await this.findOwned(userId, id);
    const rows = await this.prisma.recordSnapshot.findMany({
      where: { recordId: id },
      orderBy: { version: "desc" },
    });
    return rows.map(serializeSnapshot);
  }

  async snapshot(userId: string, id: string, sid: string) {
    await this.findOwned(userId, id);
    const row = await this.prisma.recordSnapshot.findFirst({ where: { id: sid, recordId: id } });
    if (!row) throw new NotFoundException("版本快照不存在");
    return serializeSnapshotDetail(row);
  }

  async restoreSnapshot(userId: string, id: string, sid: string) {
    const owned = await this.findOwned(userId, id);
    const snap = await this.prisma.recordSnapshot.findFirst({ where: { id: sid, recordId: id } });
    if (!snap) throw new NotFoundException("版本快照不存在");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.recordSnapshot.create({
        data: { recordId: owned.id, version: owned.version, title: owned.title, content: owned.content },
      });
      return tx.record.update({
        where: { id },
        data: { title: snap.title, content: snap.content, version: owned.version + 1 },
        include: { tags: { include: { tag: true } } },
      });
    });
    return serializeRecord(row);
  }
```

- [ ] **Step 5: controller 加路由（插在 `@Get(":id")` 之后均可，段数不同无冲突）**

```ts
  @Get(":id/snapshots")
  snapshots(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.snapshots(user.userId, id);
  }

  @Get(":id/snapshots/:sid")
  snapshot(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.records.snapshot(user.userId, id, sid);
  }

  @Post(":id/snapshots/:sid/restore")
  restoreSnapshot(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.records.restoreSnapshot(user.userId, id, sid);
  }
```

- [ ] **Step 6: 跑通集成测试 + 追加 e2e**

`npx jest src/records/records.service.spec.ts` → PASS。

`server/test/records.e2e-spec.ts` 追加：

```ts
it("快照接口全链路：更新→列表→详情→恢复", async () => {
  const created = await authed(tokenA).post("/records").send({ title: "A", content: "v1", tags: [] }).expect(201);
  const id = created.body.data.id;
  await authed(tokenA).patch(`/records/${id}`).send({ content: "v2" }).expect(200);
  const list = await authed(tokenA).get(`/records/${id}/snapshots`).expect(200);
  expect(list.body.data).toHaveLength(1);
  expect(list.body.data[0].content).toBeUndefined();
  const sid = list.body.data[0].id;
  const detail = await authed(tokenA).get(`/records/${id}/snapshots/${sid}`).expect(200);
  expect(detail.body.data.content).toBe("v1");
  const restored = await authed(tokenA).post(`/records/${id}/snapshots/${sid}/restore`).expect(201);
  expect(restored.body.data.content).toBe("v1");
  expect(restored.body.data.version).toBe(3);
  // 他人不可见
  await authed(tokenB).get(`/records/${id}/snapshots`).expect(404);
});

it("expectedVersion 冲突返回业务码 10409（HTTP 200）", async () => {
  const created = await authed(tokenA).post("/records").send({ title: "A", content: "v1", tags: [] }).expect(201);
  const id = created.body.data.id;
  const res = await authed(tokenA).patch(`/records/${id}`).send({ content: "v2", expectedVersion: 99 }).expect(200);
  expect(res.body.code).toBe(10409);
});
```

`cd server && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 7: Commit**

```bash
git add server/src/records server/test/records.e2e-spec.ts
git commit -m "feat(records): 版本快照留存查询恢复与乐观锁"
```

---

### Task B3: 掌握度状态机 API

**Files:**

- Create: `server/src/records/mastery-state.ts`
- Modify: `server/src/records/dto/record.dto.ts`
- Modify: `server/src/records/records.service.ts`
- Modify: `server/src/records/records.controller.ts`
- Test: `server/src/records/records.service.spec.ts`

**Interfaces:**

- Consumes: B1 的 `Mastery` 枚举、`findOwned`、togglePin 的 updatedAt 回写手法
- Produces:

  - `export const INVALID_MASTERY_TRANSITION = 10002`；`assertMasteryTransition(from: Mastery, to: Mastery): void`
  - `UpdateMasteryDto { to: Mastery }`
  - `RecordsService.setMastery(userId, id, to): Promise<RecordItem 序列化>`（不刷新 updatedAt）
  - 路由：`POST /records/:id/mastery`

- [ ] **Step 1: 写失败测试**

`records.service.spec.ts` 追加 describe：

```ts
describe("掌握度状态机", () => {
  it("合法流转全部通过：NONE→LEARNING→MASTERED→LEARNING、NONE→MASTERED、LEARNING→NONE", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    expect((await service.setMastery(userId, record.id, "LEARNING")).mastery).toBe("LEARNING");
    expect((await service.setMastery(userId, record.id, "MASTERED")).mastery).toBe("MASTERED");
    expect((await service.setMastery(userId, record.id, "LEARNING")).mastery).toBe("LEARNING");
    const b = await service.create(userId, { title: "B", content: "", tags: [] });
    expect((await service.setMastery(userId, b.id, "MASTERED")).mastery).toBe("MASTERED");
    const c = await service.create(userId, { title: "C", content: "", tags: [] });
    await service.setMastery(userId, c.id, "LEARNING");
    expect((await service.setMastery(userId, c.id, "NONE")).mastery).toBe("NONE");
  });

  it("非法流转抛 10002：MASTERED→NONE、自迁移", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    await expect(service.setMastery(userId, record.id, "NONE")).rejects.toMatchObject({ businessCode: 10002 });
    await service.setMastery(userId, record.id, "MASTERED");
    await expect(service.setMastery(userId, record.id, "NONE")).rejects.toMatchObject({ businessCode: 10002 });
    await expect(service.setMastery(userId, record.id, "MASTERED")).rejects.toMatchObject({ businessCode: 10002 });
  });

  it("mastery 变更不刷新 updatedAt", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    const marked = await service.setMastery(userId, record.id, "LEARNING");
    expect(marked.updatedAt).toBe(record.updatedAt);
  });
});
```

运行 → FAIL（setMastery 不存在）

- [ ] **Step 2: 新建 mastery-state.ts**

```ts
import { Mastery } from "@prisma/client";
import { BusinessException } from "../common/exceptions/business.exception";

export const INVALID_MASTERY_TRANSITION = 10002;

const ALLOWED: Record<Mastery, Mastery[]> = {
  NONE: ["LEARNING", "MASTERED"],
  LEARNING: ["MASTERED", "NONE"],
  MASTERED: ["LEARNING"],
};

/** 掌握度状态机：集中校验流转，非法流转抛业务异常（对齐 spec 决策 6） */
export function assertMasteryTransition(from: Mastery, to: Mastery) {
  if (from === to || !ALLOWED[from].includes(to)) {
    throw new BusinessException(INVALID_MASTERY_TRANSITION, `掌握度状态非法流转: ${from} → ${to}`);
  }
}
```

- [ ] **Step 3: DTO**

`record.dto.ts` 顶部 import 增加 `IsEnum` 与 `import { Mastery } from "@prisma/client";`，文件末尾追加：

```ts
export class UpdateMasteryDto {
  @IsEnum(Mastery, { message: "掌握度取值非法" })
  to: Mastery;
}
```

- [ ] **Step 4: service 方法**

```ts
  async setMastery(userId: string, id: string, to: Mastery) {
    const owned = await this.findOwned(userId, id);
    assertMasteryTransition(owned.mastery, to);
    const row = await this.prisma.record.update({
      where: { id: owned.id },
      // 显式回写 updatedAt，避免掌握度标记改变列表排序（同 togglePin）
      data: { mastery: to, updatedAt: owned.updatedAt },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }
```

（import 增加 `Mastery`、`assertMasteryTransition`、`UpdateMasteryDto`。）

- [ ] **Step 5: controller**

```ts
  @Post(":id/mastery")
  setMastery(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateMasteryDto) {
    return this.records.setMastery(user.userId, id, dto.to);
  }
```

- [ ] **Step 6: 跑测试 + Commit**

`cd server && npm test && npm run test:e2e` → 全绿。

```bash
git add server/src/records
git commit -m "feat(records): 掌握度状态机接口"
```

---

### Task B4: 改密 + 密码强度 + 注册对齐 + stats API

**Files:**

- Create: `server/src/auth/password-policy.ts`
- Modify: `server/src/auth/dto/auth.dto.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/records/records.service.ts`（stats 方法）
- Modify: `server/src/records/records.controller.ts`（**stats 路由必须插在 `@Get(":id")` 之前**）
- Test: `server/src/auth/auth.service.spec.ts`（追加）
- Test: `server/src/records/records.service.spec.ts`（追加 stats 用例）
- Modify: `server/test/records.e2e-spec.ts`、`server/test/app.e2e-spec.ts`（**既有密码 "123456" 违反新策略，全部改为 "abc12345"**）

**Interfaces:**

- Consumes: BusinessException、JwtAuthGuard、CurrentUser/AuthUser、records service 既有结构
- Produces:

  - `export const WEAK_PASSWORD = 10004`；`assertPasswordStrength(password: string): void`（8~64 位且含字母与数字）
  - `export const WRONG_OLD_PASSWORD = 10003`；`AuthService.changePassword(userId, dto): Promise<null>`
  - `ChangePasswordDto { oldPassword: string; newPassword: string }`；路由 `POST /auth/password`（JWT 守卫）
  - `RecordsService.stats(userId): Promise<{ total: number; tagCount: number; pinnedCount: number; trend7d: number[]; mastery: { none: number; learning: number; mastered: number } }>`；路由 `GET /records/stats`

- [ ] **Step 1: 先修既有测试密码（策略生效前避免连锁红）**

全局 grep server 目录 `"123456"`，将测试中的注册/登录密码改为 `"abc12345"`（至少 `server/test/records.e2e-spec.ts` 的 `registerAndGetToken`、`server/test/app.e2e-spec.ts` 若有）。`auth.service.spec.ts` 中直接 prisma 建用户的不受影响。

- [ ] **Step 2: 写失败测试**

`auth.service.spec.ts` 追加（沿用该文件既有 module 装配）：

```ts
describe("密码策略与修改密码", () => {
  it("注册弱密码抛 10004（纯数字/纯字母/过短）", async () => {
    await expect(service.register({ username: "u1", password: "12345678" })).rejects.toMatchObject({
      businessCode: 10004,
    });
    await expect(service.register({ username: "u1", password: "abcdefgh" })).rejects.toMatchObject({
      businessCode: 10004,
    });
    await expect(service.register({ username: "u1", password: "a1b2c3" })).rejects.toMatchObject({
      businessCode: 10004,
    });
  });

  it("修改密码：旧密码错误 10003；新密码弱 10004；成功后新密码可登录旧密码不可", async () => {
    await service.register({ username: "u2", password: "old12345" });
    const user = await prisma.user.findUniqueOrThrow({ where: { username: "u2" } });
    await expect(
      service.changePassword(user.id, { oldPassword: "wrong", newPassword: "new12345" }),
    ).rejects.toMatchObject({ businessCode: 10003 });
    await expect(
      service.changePassword(user.id, { oldPassword: "old12345", newPassword: "weak" }),
    ).rejects.toMatchObject({ businessCode: 10004 });
    await service.changePassword(user.id, { oldPassword: "old12345", newPassword: "new12345" });
    await expect(service.login({ username: "u2", password: "old12345" })).rejects.toMatchObject({ status: 401 });
    const res = await service.login({ username: "u2", password: "new12345" });
    expect(res.token).toBeTruthy();
  });
});
```

`records.service.spec.ts` 追加：

```ts
describe("stats 统计", () => {
  it("返回总数/标签去重/置顶/掌握度分布/7 天趋势", async () => {
    await service.create(userId, { title: "A", content: "", tags: ["x", "y"] });
    const b = await service.create(userId, { title: "B", content: "", tags: ["y"] });
    await service.togglePin(userId, b.id);
    await service.setMastery(userId, b.id, "MASTERED");
    const stats = await service.stats(userId);
    expect(stats.total).toBe(2);
    expect(stats.tagCount).toBe(2);
    expect(stats.pinnedCount).toBe(1);
    expect(stats.mastery).toEqual({ none: 1, learning: 0, mastered: 1 });
    expect(stats.trend7d).toHaveLength(7);
    expect(stats.trend7d[6]).toBe(2); // 今日新增 2 条
    expect(stats.trend7d.slice(0, 6).every((n) => n === 0)).toBe(true);
  });
});
```

运行 → FAIL（方法不存在）

- [ ] **Step 3: password-policy.ts**

```ts
import { BusinessException } from "../common/exceptions/business.exception";

export const WEAK_PASSWORD = 10004;

/** 统一密码强度：8~64 位且同时包含字母与数字（注册与改密共用） */
export function assertPasswordStrength(password: string) {
  const ok = password.length >= 8 && password.length <= 64 && /[A-Za-z]/.test(password) && /\d/.test(password);
  if (!ok) throw new BusinessException(WEAK_PASSWORD, "密码需为 8-64 位且同时包含字母与数字");
}
```

- [ ] **Step 4: auth DTO/service/controller**

`auth.dto.ts`：`RegisterDto.password` 的 `@Length(6, 32, ...)` 删除（策略由 service 统一校验），保留 `@IsString()`；末尾追加：

```ts
export class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  newPassword: string;
}
```

`auth.service.ts`：`register` 在查重之前插入 `assertPasswordStrength(dto.password);`；导出常量与方法：

```ts
export const WRONG_OLD_PASSWORD = 10003;

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.oldPassword, user.password))) {
      throw new BusinessException(WRONG_OLD_PASSWORD, "旧密码错误");
    }
    assertPasswordStrength(dto.newPassword);
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return null;
  }
```

`auth.controller.ts` 追加（import 增加 `UseGuards`、`JwtAuthGuard`、`AuthUser, CurrentUser`）：

```ts
  @UseGuards(JwtAuthGuard)
  @Post("password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto);
  }
```

- [ ] **Step 5: records stats**

`records.service.ts` 追加方法：

```ts
  async stats(userId: string) {
    const [total, pinnedCount, tagCount, masteryGroups] = await this.prisma.$transaction([
      this.prisma.record.count({ where: { userId } }),
      this.prisma.record.count({ where: { userId, isPinned: true } }),
      this.prisma.tag.count({ where: { userId } }),
      this.prisma.record.groupBy({ by: ["mastery"], where: { userId }, _count: { _all: true } }),
    ]);
    const mastery = { none: 0, learning: 0, mastered: 0 };
    for (const group of masteryGroups) {
      mastery[group.mastery.toLowerCase() as "none" | "learning" | "mastered"] = group._count._all;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    // DATE_FORMAT 直接出字符串，避免 MySQL DATE 类型经驱动转成 Date 后的时区歧义（口径：数据库本地日期）
    const rows = await this.prisma.$queryRaw<{ day: string; cnt: bigint }[]>`
      SELECT DATE_FORMAT(\`createdAt\`, '%Y-%m-%d') AS day, COUNT(*) AS cnt
      FROM \`Record\`
      WHERE \`userId\` = ${userId} AND \`createdAt\` >= ${start}
      GROUP BY DATE_FORMAT(\`createdAt\`, '%Y-%m-%d')`;
    const countByDay = new Map(rows.map((row) => [row.day, Number(row.cnt)]));
    const trend7d: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      trend7d.push(countByDay.get(key) ?? 0);
    }
    return { total, tagCount, pinnedCount, trend7d, mastery };
  }
```

`records.controller.ts`：**在 `@Get(":id")` 之前**插入（同段数路由按注册顺序匹配，`:id` 会吃掉 "stats"）：

```ts
  @Get("stats")
  stats(@CurrentUser() user: AuthUser) {
    return this.records.stats(user.userId);
  }
```

- [ ] **Step 6: 跑测试 + e2e 增量**

`records.e2e-spec.ts` 追加：

```ts
it("GET /records/stats 返回聚合结构且不被 :id 路由吃掉", async () => {
  await authed(tokenA)
    .post("/records")
    .send({ title: "A", content: "", tags: ["x"] })
    .expect(201);
  const res = await authed(tokenA).get("/records/stats").expect(200);
  expect(res.body.data.total).toBe(1);
  expect(res.body.data.trend7d).toHaveLength(7);
  expect(res.body.data.mastery).toEqual({ none: 1, learning: 0, mastered: 0 });
});
```

`app.e2e-spec.ts`（或新建 `auth.e2e-spec.ts`，沿用 records.e2e 装配模式）追加改密链路：注册(abc12345) → 带 token POST /auth/password { oldPassword: "abc12345", newPassword: "new12345" } 期望 201 code 0 → 旧密码登录 401 → 新密码登录成功。

`cd server && npm test && npm run test:e2e` → 全绿。

- [ ] **Step 7: Commit**

```bash
git add server/src server/test
git commit -m "feat(auth): 修改密码与密码强度策略及记录统计接口"
```

---

### Task F1: 编辑器实时预览 + 保存乐观锁

**Files:**

- Modify: `src/types/record.d.ts`（RecordForm.expectedVersion）
- Modify: `src/api/record.ts`（updateRecord 透传 expectedVersion）
- Modify: `src/pages/editor/index.vue`

**Interfaces:**

- Consumes: `parseNote`/`MdContainer`（UI-2 既有）、`RecordItem.version`（B1）、后端 10409 冲突语义（B2）、request.ts 业务错误 `reject(body)` 且已统一 toast
- Produces: `RecordForm.expectedVersion?: number`；编辑器预览模式

- [ ] **Step 1: 类型与 api**

`src/types/record.d.ts` 的 `RecordForm` 追加：

```ts
  /** 编辑时携带的版本号（乐观锁），新建不带 */
  expectedVersion?: number;
```

`src/api/record.ts` 的 `updateRecord` data 改为：

```ts
    data: { title: form.title, content: form.content, tags: form.tags, expectedVersion: form.expectedVersion },
```

- [ ] **Step 2: 编辑器改造**

`src/pages/editor/index.vue`：

1. 新增状态：

```ts
const mode = ref<"edit" | "preview">("edit");
const version = ref<number>();
const previewSegments = computed(() => parseNote(content.value));
```

（import 增加 `parseNote`；`MdContainer` 经 easycom 自动注册直接用。）

2. `prefill` 中 `record` 赋值块追加 `version.value = record.version;`

3. 模板：表单卡片**之前**插入分段切换：

```html
<!-- 编辑/预览切换 -->
<view class="mx-30rpx mt-24rpx flex h-64rpx rounded-32rpx bg-[#EEEEEE] p-4rpx">
  <view class="flex-1 flex-center rounded-28rpx" :class="mode === 'edit' ? 'bg-[#3E63DD]' : ''" @click="mode = 'edit'">
    <text class="text-26rpx" :class="mode === 'edit' ? 'text-white' : 'text-[#67676C]'">编辑</text>
  </view>
  <view
    class="flex-1 flex-center rounded-28rpx"
    :class="mode === 'preview' ? 'bg-[#3E63DD]' : ''"
    @click="mode = 'preview'">
    <text class="text-26rpx" :class="mode === 'preview' ? 'text-white' : 'text-[#67676C]'">预览</text>
  </view>
</view>
```

4. 表单卡片整体包 `v-if="mode === 'edit'"`；其后新增预览卡片（楷体标题 scoped style 复用 `.note-title`，从详情页复制 style 块）：

```html
<!-- 预览卡片 -->
<view v-else class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
  <text class="note-title block text-40rpx font-bold text-[#3C3C43]">{{ title.trim() || "未命名" }}</text>
  <view v-if="tags.length" class="mt-20rpx flex flex-wrap">
    <text
      v-for="tag in tags"
      :key="tag"
      class="mr-12rpx mb-8rpx rounded-12rpx bg-[#3E63DD]/10 px-16rpx py-4rpx text-22rpx text-[#3E63DD]">
      {{ tag }}
    </text>
  </view>
  <view class="my-24rpx h-1rpx bg-[#EEEEEE]" />
  <template v-if="content.trim()">
    <view v-for="(seg, index) in previewSegments" :key="index">
      <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
      <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
    </view>
  </template>
  <view v-else class="flex-center py-60rpx">
    <text class="text-26rpx text-[#67676C]">暂无内容，切回编辑写点什么吧</text>
  </view>
</view>
```

5. `handleSave` 编辑分支传 version，并处理 10409（request.ts 已 toast 后端文案，这里只负责刷新表单到最新版）：

```ts
await recordStore.editRecord({
  id: editId.value,
  title: trimmedTitle,
  content: content.value,
  tags: tags.value,
  expectedVersion: version.value,
});
```

catch 改为：

```ts
  } catch (e) {
    // 乐观锁冲突：重新拉取最新内容与版本号，用户基于最新版继续编辑
    if ((e as { code?: number })?.code === 10409 && editId.value) {
      await prefill(editId.value);
    }
  } finally {
```

（注意保留原有 finally 的 `saving.value = false`。）

6. 文件末尾追加：

```html
<style scoped>
  .note-title {
    font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
  }
</style>
```

- [ ] **Step 3: 验证 + Commit**

`npx vue-tsc --noEmit` 零报错；`npm run lint:eslint` 零 error；`npm run dev:h5` 编译无错误。

```bash
git add src/types/record.d.ts src/api/record.ts src/pages/editor/index.vue
git commit -m "feat(pages): 编辑器实时预览与保存乐观锁"
```

---

### Task F2: 历史版本 UI（详情入口 + versions 页）

**Files:**

- Modify: `src/types/record.d.ts`
- Modify: `src/api/record.ts`
- Create: `src/pages/versions/index.vue`
- Modify: `src/pages/detail/index.vue`（操作栏加"历史"）
- Modify: `src/pages.json`

**Interfaces:**

- Consumes: B2 路由（`GET /records/:id/snapshots` 等）、`parseNote`/`MdContainer`、`formatTime`、detail 页操作栏结构
- Produces:

  - `SnapshotItem { id: string; version: number; title: string; createdAt: number }`、`SnapshotDetail extends SnapshotItem { content: string }`（types/record.d.ts）
  - `listSnapshots(id)`、`getSnapshot(id, sid)`、`restoreSnapshot(id, sid): Promise<RecordItem>`（api/record.ts）
  - 路由页 `pages/versions/index`（query: `id`）

- [ ] **Step 1: 类型 + api**

`src/types/record.d.ts` 末尾追加：

```ts
/** 版本快照列表项（不含正文） */
export interface SnapshotItem {
  id: string;
  version: number;
  title: string;
  /** 毫秒时间戳 */
  createdAt: number;
}

/** 版本快照详情（含正文） */
export interface SnapshotDetail extends SnapshotItem {
  content: string;
}
```

`src/api/record.ts` 追加：

```ts
export function listSnapshots(id: string): Promise<SnapshotItem[]> {
  return request<SnapshotItem[]>({ url: `/records/${id}/snapshots` });
}

export function getSnapshot(id: string, sid: string): Promise<SnapshotDetail> {
  return request<SnapshotDetail>({ url: `/records/${id}/snapshots/${sid}` });
}

export function restoreSnapshot(id: string, sid: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/snapshots/${sid}/restore`, method: "POST" });
}
```

（import type 增加 `SnapshotDetail, SnapshotItem`。）

- [ ] **Step 2: 新建 pages/versions/index.vue**

完整骨架（实现者照此成文，样式令牌同详情页）：

- script：`const recordId = ref(""); const snapshots = ref<SnapshotItem[]>([]); const current = ref<SnapshotDetail>(); const segments = computed(() => (current.value ? parseNote(current.value.content) : []));`
- `onLoad((query) => { recordId.value = (query?.id as string) ?? ""; uni.setNavigationBarTitle({ title: "历史版本" }); })`
- `onShow`：`if (!userStore.token) { uni.reLaunch({ url: "/pages/login/index" }); return; } if (!current.value) loadList();`（userStore 用 profile 页同款 UserStoreProxy 模式）
- `loadList`：`try { snapshots.value = await listSnapshots(recordId.value); } catch { /* request.ts 已 toast */ }`
- `openSnapshot(item)`：`try { current.value = await getSnapshot(recordId.value, item.id); } catch {}`
- `backToList`：`current.value = undefined; loadList();`（恢复后列表已变，返回时重拉）
- `handleRestore`：`uni.showModal({ title: "恢复此版本", content: "将以此版本覆盖当前内容，当前内容会留存为新的历史版本。", confirmColor: "#3E63DD", success: async (res) => { if (!res.confirm || !current.value) return; try { await restoreSnapshot(recordId.value, current.value.id); await recordStore.fetchList(); uni.showToast({ title: "已恢复", icon: "none" }); uni.navigateBack(); } catch {} } });`（recordStore 用 editor 页同款 RecordStoreProxy，仅需 records/fetchList 字段）
- 模板：

  - 列表态 `v-if="!current"`：白卡片列表项（`v-for="item in snapshots"`），每行：brand 色 `v{{ item.version }}` 徽章（`rounded-8rpx bg-[#3E63DD]/10 px-12rpx py-2rpx text-22rpx text-[#3E63DD]`）+ 标题 truncate（正文色）+ 右侧 `formatTime(item.createdAt)`（次要色小字）；空态居中："还没有历史版本" + 副文案"编辑保存后自动生成版本快照"
  - 预览态 `v-else`：白卡片：楷体标题 + meta 行（`v{{ current.version }}` 徽章 + formatTime）+ 分割线 + segments 渲染（同详情页）；底部固定双按钮：`返回列表`（白底 brand 描边）/ `恢复此版本`（brand 底白字），样式照抄复习页底部双按钮

- [ ] **Step 3: detail 页操作栏加"历史"**

`src/pages/detail/index.vue` 操作栏在"编辑"与"删除"之间插入：

```html
<view class="flex-1 flex-center border-l border-solid border-[#EEEEEE]" @click="handleHistory">
  <text class="text-28rpx text-[#3C3C43]">历史</text>
</view>
```

script 增加：

```ts
const handleHistory = () => {
  if (!record.value) return;
  uni.navigateTo({ url: `/pages/versions/index?id=${record.value.id}` });
};
```

- [ ] **Step 4: pages.json 注册**

`pages` 数组 detail 条目之后插入：

```json
    {
      "path": "pages/versions/index",
      "style": {
        "navigationBarTitleText": "历史版本",
        "backgroundColor": "#F7F8FA",
        "backgroundColorBottom": "#F7F8FA"
      }
    },
```

- [ ] **Step 5: 验证 + Commit**

vue-tsc 零报错；eslint 零 error；dev:h5 编译无错误（含新页面按需编译 200）。

```bash
git add src/types/record.d.ts src/api/record.ts src/pages/versions/index.vue src/pages/detail/index.vue src/pages.json
git commit -m "feat(pages): 历史版本列表预览与恢复"
```

---

### Task F3: 掌握度 UI（复习页标记/过滤 + 徽章）

**Files:**

- Modify: `src/api/record.ts`
- Modify: `src/store/record.ts`
- Modify: `src/components/MdContainer.vue`（details 展开事件）
- Modify: `src/pages/review/index.vue`
- Modify: `src/components/RecordCard.vue`
- Modify: `src/pages/detail/index.vue`（meta 徽章）

**Interfaces:**

- Consumes: B3 路由 `POST /records/:id/mastery`、`RecordItem.mastery`（B1）、review 页 pool/empty 结构（UI-3）
- Produces:

  - `updateMastery(id, to: Mastery): Promise<RecordItem>`（api）
  - `recordStore.setMastery(id, to)`（store action，成功后 fetchList）
  - MdContainer emits `(e: "toggle", open: boolean)`（仅 details kind 触发）

- [ ] **Step 1: api + store**

`src/api/record.ts` 追加：

```ts
export function updateMastery(id: string, to: Mastery): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/mastery`, method: "POST", data: { to } });
}
```

`src/store/record.ts`：import 增加 `updateMastery` 与 `import type { Mastery, ... }`；追加 action 并在 return 导出：

```ts
async function setMastery(id: string, to: Mastery) {
  await updateMastery(id, to);
  await fetchList();
}
```

- [ ] **Step 2: MdContainer 展开事件**

`src/components/MdContainer.vue`：`defineEmits<{ toggle: [open: boolean] }>()`；details 的点击处理在翻转 `isOpen` 后 `emit("toggle", isOpen)`（tip/warning/danger 无交互不触发）。不得改变既有默认折叠行为与样式。

- [ ] **Step 3: review 页改造**

1. 新增状态与 computed：

```ts
const includeMastered = ref(false);
const showMark = ref(false);
const pool = computed(() =>
  includeMastered.value ? recordStore.records : recordStore.records.filter((item) => item.mastery !== "MASTERED"),
);
const poolSize = computed(() => pool.value.length);
const allMastered = computed(() => recordStore.records.length > 0 && pool.value.length === 0 && !includeMastered.value);
```

2. `pickRandom` 的 `const pool = recordStore.records;` 改为 `const candidates0 = pool.value;`，后续逻辑以 `candidates0` 为池（变量改名避免与 computed 冲突，逻辑不变）。

3. 掌握度徽章（标题行，📌 之后）：

```html
<text
  v-if="current.mastery !== 'NONE'"
  class="ml-12rpx shrink-0 text-20rpx"
  :class="current.mastery === 'MASTERED' ? 'text-[#42B883]' : 'text-[#F0B429]'">
  {{ current.mastery === "MASTERED" ? "已掌握" : "复习中" }}
</text>
```

4. 标记按钮行：答案展开后浮现（MdContainer toggle 事件驱动），插在卡片内引导小字**之后**：

```html
<view v-if="showMark" class="mt-24rpx flex">
  <view
    class="mr-20rpx h-80rpx flex-1 flex-center rounded-40rpx border-2rpx border-solid border-[#F0B429] bg-white"
    @click="mark('LEARNING')">
    <text class="text-28rpx text-[#F0B429]">仍需复习</text>
  </view>
  <view class="h-80rpx flex-1 flex-center rounded-40rpx bg-[#42B883]" @click="mark('MASTERED')">
    <text class="text-28rpx text-white">已掌握</text>
  </view>
</view>
```

模板中 MdContainer 节点加 `@toggle="onAnswerToggle"`。

5. script：

```ts
const onAnswerToggle = (open: boolean) => {
  if (open) showMark.value = true;
};

const mark = async (to: Mastery) => {
  if (!current.value) return;
  try {
    await recordStore.setMastery(current.value.id, to);
    uni.showToast({ title: "已标记", icon: "none" });
    current.value = undefined;
    showMark.value = false;
    pickRandom();
  } catch {
    // request.ts 已统一 toast（如非法流转 10002）
  }
};

const toggleIncludeMastered = () => {
  includeMastered.value = !includeMastered.value;
  current.value = undefined;
  showMark.value = false;
  pickRandom();
};
```

import 增加 `import type { Mastery } from "@/types/record";`

6. 换题/切题时重置 showMark：在 `pickRandom` 末尾与 onShow 校验块末尾各加 `showMark.value = false;`（展开状态随题目重置）。

7. 池提示行追加开关（"重置为全部"链接之后）：

```html
<text class="ml-16rpx text-22rpx text-[#3E63DD]" @click="toggleIncludeMastered">
  {{ includeMastered ? "排除已掌握" : "包含已掌握" }}
</text>
```

8. 空态新增"全部已掌握"分支（`v-else-if="!recordStore.loading"` 的空态 view 内文案与按钮按条件区分）：

```html
<text class="text-64rpx">{{ allMastered ? "🎉" : "📭" }}</text>
<text class="mt-24rpx text-28rpx text-[#67676C]">
  {{ allMastered ? "全部已掌握，真不错" : hasFilter ? "当前筛选下没有笔记" : "还没有可复习的笔记" }}
</text>
<view class="mt-40rpx h-80rpx flex-center rounded-40rpx bg-[#3E63DD] px-48rpx" @click="handleEmptyAction">
  <text class="text-28rpx text-white">
    {{ allMastered ? "包含已掌握再复习" : hasFilter ? "重置为全部" : "去写第一条" }}
  </text>
</view>
```

`handleEmptyAction` 首部加 `if (allMastered.value) { toggleIncludeMastered(); return; }`。

注意：onShow 的池内校验 `recordStore.records.find(...)` 保持对**全量 records** 校验，但 `pickRandom` 从过滤池抽——当前题被标记为已掌握且不含已掌握时，onShow 会判定其仍在 records 而不重抽；因此 `mark` 内已显式 `current = undefined; pickRandom()`，onShow 无需改动（评审时核对此点）。

- [ ] **Step 4: RecordCard 徽章**

`src/components/RecordCard.vue` 标题行（📌 与标题之后）追加：

```html
<text
  v-if="record.mastery !== 'NONE'"
  class="ml-12rpx shrink-0 text-20rpx"
  :class="record.mastery === 'MASTERED' ? 'text-[#42B883]' : 'text-[#F0B429]'">
  {{ record.mastery === "MASTERED" ? "已掌握" : "复习中" }}
</text>
```

- [ ] **Step 5: detail 页 meta 徽章**

`src/pages/detail/index.vue` meta 行时间文本之前插入同款徽章（`record.mastery`）。

- [ ] **Step 6: 验证 + Commit**

vue-tsc 零报错；eslint 零 error；dev:h5 编译无错误。

```bash
git add src/api/record.ts src/store/record.ts src/components/MdContainer.vue src/components/RecordCard.vue src/pages/review/index.vue src/pages/detail/index.vue
git commit -m "feat(pages): 掌握度标记复习过滤与徽章"
```

---

### Task F4: 我的页 stats 切换 + 趋势图 + 改密

**Files:**

- Modify: `src/types/record.d.ts`
- Modify: `src/api/record.ts`
- Modify: `src/api/auth.ts`
- Create: `src/pages/password/index.vue`
- Modify: `src/pages/profile/index.vue`
- Modify: `src/pages/login/index.vue`（注册模式密码占位文案）
- Modify: `src/pages.json`

**Interfaces:**

- Consumes: B4 `GET /records/stats` 与 `POST /auth/password`、userStore.logout、profile 页既有 UserStoreProxy/RecordStoreProxy 模式
- Produces:

  - `RecordStats { total: number; tagCount: number; pinnedCount: number; trend7d: number[]; mastery: { none: number; learning: number; mastered: number } }`（types/record.d.ts）
  - `getStats(): Promise<RecordStats>`（api/record.ts）；`AuthAPI.changePassword(oldPassword, newPassword): Promise<null>`（api/auth.ts）
  - 路由页 `pages/password/index`

- [ ] **Step 1: 类型 + api**

`src/types/record.d.ts` 末尾追加：

```ts
/** 记录统计（GET /records/stats） */
export interface RecordStats {
  total: number;
  tagCount: number;
  pinnedCount: number;
  /** 近 7 天每日新增，下标 0 为 6 天前、6 为今日 */
  trend7d: number[];
  mastery: {
    none: number;
    learning: number;
    mastered: number;
  };
}
```

`src/api/record.ts` 追加：

```ts
export function getStats(): Promise<RecordStats> {
  return request<RecordStats>({ url: "/records/stats" });
}
```

`src/api/auth.ts` 的 AuthAPI 对象内追加：

```ts
  changePassword(oldPassword: string, newPassword: string): Promise<null> {
    return request<null>({ url: "/auth/password", method: "POST", data: { oldPassword, newPassword } });
  },
```

- [ ] **Step 2: 新建 pages/password/index.vue**

- 表单白卡片（样式同编辑器）：旧密码 input（`password` 属性）、新密码 input（placeholder "8-64位，含字母与数字"）、确认新密码 input；底部固定 brand 按钮"确认修改"
- 校验：新密码 !== 确认 → toast "两次输入的新密码不一致"；空值 → toast "请填写完整"
- 提交：`try { await AuthAPI.changePassword(oldPwd, newPwd); uni.showToast({ title: "已修改，请重新登录", icon: "none" }); userStore.logout(); uni.reLaunch({ url: "/pages/login/index" }); } catch { /* request.ts 已 toast（10003 旧密码错误 / 10004 强度不足） */ }`（import AuthAPI default；userStore 用 profile 同款 UserStoreProxy）
- `uni.setNavigationBarTitle({ title: "修改密码" })`（onLoad）；防重复提交 ref

- [ ] **Step 3: profile 页改造**

1. `stats` reactive 换型：

```ts
const stats = reactive<RecordStats>({
  total: 0,
  tagCount: 0,
  pinnedCount: 0,
  trend7d: [0, 0, 0, 0, 0, 0, 0],
  mastery: { none: 0, learning: 0, mastered: 0 },
});
```

2. `loadStats` 改为：

```ts
const loadStats = async () => {
  try {
    const res = await getStats();
    Object.assign(stats, res);
  } catch {
    // request.ts 已统一 toast；离线降级为本地缓存口径（趋势/分布无本地数据则置零）
    stats.total = recordStore.total;
    stats.tagCount = recordStore.allTags.length;
    stats.pinnedCount = recordStore.records.filter((item) => item.isPinned).length;
    stats.trend7d = [0, 0, 0, 0, 0, 0, 0];
    stats.mastery = { none: 0, learning: 0, mastered: 0 };
  }
};
```

（import 由 `listRecords` 换为 `getStats`；模板中 `stats.tags`/`stats.pinned` 引用改为 `stats.tagCount`/`stats.pinnedCount`。）

3. 统计卡下方新增趋势卡：

```html
<!-- 近 7 天趋势 -->
<view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
  <text class="text-28rpx font-bold text-[#3C3C43]">近 7 天新增</text>
  <view class="mt-24rpx flex h-200rpx items-end justify-between">
    <view v-for="(day, index) in trendDays" :key="index" class="flex flex-1 flex-col items-center">
      <text class="mb-8rpx text-20rpx text-[#67676C]">{{ day.count || "" }}</text>
      <view
        class="w-32rpx rounded-t-8rpx"
        :class="day.count ? 'bg-[#3E63DD]' : 'bg-[#EEEEEE]'"
        :style="{ height: day.height + 'px' }" />
      <text class="mt-8rpx text-20rpx text-[#67676C]">{{ day.label }}</text>
    </view>
  </view>
  <view class="mt-24rpx flex justify-center border-t border-solid border-[#EEEEEE] pt-24rpx">
    <view class="flex items-center">
      <view class="h-12rpx w-12rpx rounded-full bg-[#67676C]" />
      <text class="ml-8rpx text-22rpx text-[#67676C]">未掌握 {{ stats.mastery.none }}</text>
    </view>
    <view class="ml-32rpx flex items-center">
      <view class="h-12rpx w-12rpx rounded-full bg-[#F0B429]" />
      <text class="ml-8rpx text-22rpx text-[#67676C]">复习中 {{ stats.mastery.learning }}</text>
    </view>
    <view class="ml-32rpx flex items-center">
      <view class="h-12rpx w-12rpx rounded-full bg-[#42B883]" />
      <text class="ml-8rpx text-22rpx text-[#67676C]">已掌握 {{ stats.mastery.mastered }}</text>
    </view>
  </view>
</view>
```

script：

```ts
const trendDays = computed(() => {
  const max = Math.max(...stats.trend7d, 1);
  return stats.trend7d.map((count, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    return {
      count,
      // 满高 160px 约等于 320rpx 容器内视觉上限；0 值给 2px 底线
      height: count ? Math.max(Math.round((count / max) * 160), 8) : 2,
      label: `${day.getMonth() + 1}/${day.getDate()}`,
    };
  });
});
```

4. 退出登录按钮上方新增改密入口：

```html
<!-- 修改密码 -->
<view
  class="mx-30rpx mt-40rpx flex h-96rpx items-center justify-between rounded-24rpx bg-white px-30rpx"
  @click="goPassword">
  <text class="text-28rpx text-[#3C3C43]">修改密码</text>
  <text class="text-28rpx text-[#67676C]">›</text>
</view>
```

```ts
const goPassword = () => {
  uni.navigateTo({ url: "/pages/password/index" });
};
```

- [ ] **Step 4: 登录页注册占位文案**

`src/pages/login/index.vue` 密码框 placeholder 改为动态：`:placeholder="isLogin ? '密码' : '8-64位，含字母与数字'"`（变量名以该页现状为准）。

- [ ] **Step 5: pages.json 注册**

versions 条目之后插入：

```json
    {
      "path": "pages/password/index",
      "style": {
        "navigationBarTitleText": "修改密码",
        "backgroundColor": "#F7F8FA",
        "backgroundColorBottom": "#F7F8FA"
      }
    },
```

- [ ] **Step 6: 验证 + Commit**

vue-tsc 零报错；eslint 零 error；dev:h5 编译无错误（含新页面按需编译 200）。

```bash
git add src/types/record.d.ts src/api/record.ts src/api/auth.ts src/pages/password/index.vue src/pages/profile/index.vue src/pages/login/index.vue src/pages.json
git commit -m "feat(pages): 我的页趋势统计与修改密码"
```

---

## 收尾（全部任务完成后）

1. 后端全量：`cd server && npm test && npm run test:e2e` 全绿
2. 前端：`npx vue-tsc --noEmit` 零报错、`npm run lint:eslint` 零 error、`npm run dev:h5` 编译无错误
3. 派发最终评审（opus/独立评审代理）覆盖 B1-F4 全 diff
4. 更新 SDD 台账 `.superpowers/sdd/2026-09-24-articlepilot-features/progress.md`
5. 浏览器走查交用户目视验证（chrome-devtools MCP 可用则自动走查）

## Self-Review 记录

- Spec 覆盖：决策 1-5（快照/乐观锁）→ B2+F1；决策 6-9（状态机/配色/复习池）→ B3+F3；决策 10-11（改密）→ B4+F4；决策 12-13（stats/趋势图）→ B4+F4；决策 14（预览）→ F1。无缺口。
- 路由顺序陷阱（stats vs :id）已在 B4 Step 5 显式标注；reset-db FK 顺序已在 B1 Step 3 标注；既有测试密码与策略冲突已在 B4 Step 1 前置处理。
- 类型一致性：`SnapshotItem/SnapshotDetail/RecordStats/Mastery` 在 B1/B2/B4 定义处与 F1-F4 消费处拼写一致；`setMastery/updateMastery` 命名 store 用 setMastery、api 用 updateMastery（与 togglePin/togglePinRecord 既有分层一致）。
