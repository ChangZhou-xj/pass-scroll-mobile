# GitHub 文档抓取入库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给定 GitHub 仓库的一个目录，把其中的 markdown 同步成本项目的 Record，重复执行幂等；借这个需求把「批处理任务的后端写法」走一遍。

**Architecture:** 先让 schema 长出幂等主键（`Record.sourceUrl` + 联合唯一约束）；业务逻辑放在 `server/src/crawl/`（可测、可被 Nest 复用），一次性 CLI 只做薄外壳；HTTP 层自带超时、限流退避与通道降级。

**Tech Stack:** NestJS 10 + Prisma 6 + MySQL 8（便携版 3307）；jest + ts-jest；运行时用 Node 22 全局 fetch（**无新增依赖**）。

**Spec:** docs/superpowers/specs/2026-10-27-github-doc-crawler-design.md

## Global Constraints

- 本特性不新增 HTTP 接口，只加 CLI 脚本 + 可复用模块（因此无路由/业务码变更）
- jest 配置 `rootDir=src`、`testRegex=.*\.spec\.ts$`：**测试必须放在 `src/` 下**，放 `scripts/` 不会被收集
- 脚本用 `tsx` 直跑 TS 源码，`tsconfig.json` 的 `include` 已含 `scripts/**` 与 `test/**`
- 脚本绕开 Nest：`new PrismaClient()` 直连，**必须手动 `$disconnect()`**（用 try/finally 兜住）
- `--user` 必须是已注册用户，脚本只 `findUnique` 查，不存在就报错退出
- 内容变更遵守既有不变量：快照 + version+1 同事务；title 必须 ≤200 字符（VarChar(200)）
- 测试 `maxWorkers:1`；globalSetup 会 `prisma db push` 重建**测试库** `pass_scroll_test`（业务数据在开发库，互不影响）
- 提交格式 `type(scope): 描述`；文件 LF 换行；pre-commit 拒绝 CR
- 包管理器：前端根用 pnpm、**后端 server 用 npm**

---

### Task C1: schema 长出幂等主键

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261027032834_add_record_source_url/migration.sql`

**Interfaces:**

- Produces: `Record.sourceUrl String? @db.VarChar(512)`、`@@unique([userId, sourceUrl])`
- Consumes: 既有 `Record` / `Tag` / `RecordTag` / `RecordSnapshot`

- [x] **Step 1: 追加字段与联合唯一约束**

```prisma
sourceUrl String? @db.VarChar(512)

@@unique([userId, sourceUrl])
```

MySQL 的唯一索引允许多个 NULL，因此手写笔记（sourceUrl 为 null）不受这条约束影响。

- [x] **Step 2: 生成并应用迁移**

```bash
cd server && npm run prisma:migrate -- --name add_record_source_url
```

- [x] **Step 3: 迁移受阻时的正确排查顺序（本次真实踩到，务必复述给后来人）**

遇到这段报错时：

```
The migration 20260924045313_snapshot_record_version_unique was modified after it was applied
We need to reset the MySQL database "pass_scroll"
```

**绝对不要**按提示跑 `prisma migrate reset`（会清空开发库里全部笔记）。正确顺序：

1. 先确认 Prisma 的 checksum 就是 `migration.sql` 文件的 SHA-256：拿两条正常记录，`Get-FileHash -Algorithm SHA256` 与库中 checksum 对照；
2. 查同名多行：`SELECT migration_name, checksum, started_at, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`；
3. 本次根因是一条 `finished_at IS NULL AND rolled_back_at IS NOT NULL` 的**孤儿行**（当初第一次尝试失败被回滚，改过迁移文件后重跑成功），而**已应用那行的 checksum 与当前文件完全一致**——所以不需要改任何校验和；
4. 删掉这条孤儿行即可恢复；
5. 本环境里 `migrate dev` 因缺 TTY 会报 non-interactive，改用「手写 migration.sql（索引名遵循 `Record_userId_sourceUrl_key` 约定）+ `prisma migrate deploy`」这条非交互路径，由 Prisma 自行计算并记录 checksum。

### Task C2: 抓取内核（可单测）

**Files:**

- Create: `server/src/crawl/github-doc-source.ts`

**Interfaces:**

- Produces: `naturalCompare` / `stripOrderPrefix` / `resolveTitle` / `pickMarkdownFiles` / `deriveTags` / `buildContentsUrl` / `buildRawUrl` / `HttpError` / `listDirectory` / `fetchMarkdown` / `fetchDocViaApi` / `saveDoc` / `syncDocs`
- Consumes: 全局 `fetch`、`@prisma/client` 的 `PrismaClient` 类型

- [x] **Step 1: 纯函数与 URL 构造**——逐段 `encodeURIComponent`，中文目录与空格都不会 404
- [x] **Step 2: HTTP 层**——`AbortSignal.timeout` 做超时、仅对限流（403/429 且 `X-RateLimit-Remaining=0`）退避重试、用 `HttpError` 区分「状态码错」与「网络错」
- [x] **Step 3: raw 优先 + Contents API 降级**——本机 Node 访问 `raw.githubusercontent.com` 被 `ECONNRESET`，降级后才跑通；降级仅限网络层失败
- [x] **Step 4: `saveDoc` 三态**——created / skipped / updated，其中 updated 走快照 + version+1 同事务
- [x] **Step 5: `syncDocs` 编排**——单篇失败不中断整批，汇总进 `failures`

### Task C3: CLI 薄外壳

**Files:**

- Create: `server/scripts/crawl-github.ts`
- Modify: `server/package.json`

**Interfaces:**

- Produces: `npm run crawl:github -- --user <用户名> [--repo owner/name] [--dir "子目录"] [--branch master] [--tags a,b]`

- [x] **Step 1: 读参数 → 查用户 → 调内核 → 打汇总**（在 `finally` 里 `$disconnect()`，有失败项时 `process.exitCode = 1`）
- [x] **Step 2: 注册 npm script**

```json
"crawl:github": "tsx scripts/crawl-github.ts"
```

### Task C4: 单元测试

**Files:**

- Create: `server/src/crawl/github-doc-source.spec.ts`

**Interfaces:**

- Consumes: jest + ts-jest（既有配置，无需改动；globalSetup 会重建测试库）

- [x] **Step 1: 脚手架**——`fakeFetch`（支持 `{ networkError }` 模拟断连）、`fakePrisma`（记录调用的假 Client）
- [x] **Step 2: 纯函数用例**——自然序（`10` 排在 `2` 之后）、序号剥离、标题提取与 200 字截断、标签派生、URL 编码
- [x] **Step 3: HTTP 用例**——正常列目录、目录不存在返回对象时抛错、限流退避重试、重试耗尽、**非限流错误不重试**、token 请求头、raw 失败降级、404 不降级、base64 中文解码
- [x] **Step 4: 落库用例**——created 的 tags 走 `connectOrCreate`、skipped 不产生任何写、updated 的快照 + version+1 同事务
- [x] **Step 5: 编排用例**——两篇全部新增、单篇失败不中断、空目录不报错

### Task C5: 端到端验收

- [x] **Step 1: 真实抓取**

```bash
cd server && npm run crawl:github -- --user <已注册用户名>
```

- [x] **Step 2: 幂等复查**——再跑一次必须是 `新增 0 / 更新 0 / 跳过 17 / 失败 0`（本次实测通过）
- [x] **Step 3: 全量回归**——`npm test`，3 suites / 58 tests 全通过
- [x] **Step 4: 类型检查**——`npx tsc --noEmit -p tsconfig.json` 对 src/scripts 零报错

---

### Task C6（未做，留给下一步练习）

包成真正的后端能力，按此顺序练手：

- [ ] Create: `server/src/crawl/crawl.module.ts` + `crawl.service.ts`——注入既有 `PrismaService` 替代裸 `PrismaClient`，体会 DI 与生命周期
- [ ] 加带 JWT Guard 的 `POST /crawl/sync`，userId 取自 `@CurrentUser()` 而非请求体
- [ ] 手写并发池（不装 p-limit），17 篇换 500 篇时才需要
- [ ] 补 `--dir` 递归子目录版本（当前只处理单级目录）
- [ ] 把 `sourceUrl` 暴露到 `record.serializer.ts` + 前端 `src/types/record.d.ts`（契约成对文件）
- [ ] 治理开发库缺失的 3 条外键（见 spec「已知遗留」）
