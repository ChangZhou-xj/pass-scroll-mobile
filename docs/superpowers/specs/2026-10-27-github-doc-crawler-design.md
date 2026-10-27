# 设计 spec：把 GitHub 上的 markdown 文档抓取进自己的数据库

日期：2026-10-27
来源：github.com/lm-rebooter/NuggetsBooklet 的 `TypeScript 入门教程` 目录（17 篇 md，扁平结构，文件名带序号，合计约 130KB）
目标：既把外部文档变成可复习的笔记，也顺便把「写一个批处理落库任务」的后端套路走一遍

## 背景

现有能力只有一条半：`scripts/import-markdown.ts`（`npm run import:md`）能把**本地目录**的 md 灌进去，但它吃不了远程数据源。需要一条新通路：给定 GitHub 仓库的一个目录，把这个目录下的 markdown 同步成 Record，且**重复执行不产生脏数据**。

## 关键决策表

| #   | 决策点            | 决定                                                                                           | 理由                                                                                        |
| --- | ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | 幂等主键          | 新增 `Record.sourceUrl` + `@@unique([userId, sourceUrl])`，**不用标题判重**                    | 标题判重三个坑：并发写会脏数据、用户改过标题后判不出、拿不到远端更新                        |
| 2   | sourceUrl 可空    | `String?`（nullable）                                                                          | MySQL 唯一索引允许多个 NULL，手写笔记（sourceUrl 为 null）不受约束污染                      |
| 3   | 代码分层          | 业务逻辑放 `src/crawl/github-doc-source.ts`，`scripts/crawl-github.ts` 只做薄外壳              | 脚本路径不在 jest 的 rootDir 内，写在一起就测不了；分层后将来包 Nest 服务无需改写           |
| 4   | 依赖注入换可测性  | fetch / sleep / log 全部走 `CrawlOptions` 注入，测试塞假实现                                   | 不需要 mock 全局对象，也不需要真连 MySQL，单测在 40ms 内跑完 40 个用例                      |
| 5   | HTTP 客户端       | 用全局 `fetch`，**零新增依赖**                                                                 | @types/node 22 自带类型、Node 18+ 原生可用；仓库内 axios/node-fetch 命中数均为 0            |
| 6   | 超时              | `AbortSignal.timeout(timeoutMs)`，默认 15s                                                     | 原生 fetch 没有默认超时，不设就会永久挂起                                                   |
| 7   | 取正文的通道      | 优先 `raw.githubusercontent.com`（不占 API 配额），**网络层失败时降级** Contents API 取 base64 | 实测本机 Node 访问 raw 被 `ECONNRESET`（中间件按 TLS 指纹拦），而 PowerShell 走系统代理却通 |
| 8   | 降级判定          | 只有「抛异常」才降级；HTTP 状态码错误（404/401）**不降级**                                     | 状态码已说明资源不可达，换通道是同一个答案，白白浪费一次配额                                |
| 9   | Contents API 解码 | `Buffer.from(base64.replace(/\s/g,""), "base64").toString("utf-8")`                            | GitHub 的 base64 带换行；必须走 Buffer 才能正确还原中文（atob+escape 会变 latin1 乱码）     |
| 10  | 内容更新的不变量  | 先写「修改前」快照，再 `version+1`，两步包进 `$transaction`                                    | 沿用 CLAUDE.md「后端数据不变量」第 3 条，不遵循会留下「版本前进但没快照」的半截状态         |
| 11  | 整批失败的姿态    | 单篇失败记入 `failures` 继续跑，退出码置 1                                                     | 17 篇里坏 1 篇不该让另外 16 篇陪葬                                                          |
| 12  | hasTitle 提取     | 正文第一个 H1 > 文件名去序号前缀；统一 `.slice(0, 200)`                                        | `Record.title` 是 VarChar(200)，超长直接 500；文件名形如 `1.为什么你需要 TypeScript.md`     |
| 13  | 排序              | 自然序（`10.x` 排在 `2.x` 之后），非序号项排最后并按 `zh-Hans-CN` 本地序                       | 字典序会把 `10` 排在 `2` 前面，阅读顺序全乱                                                 |
| 14  | 标签来源          | 取 docPath 最后一级目录名 + `--tags` 附加项，去重去空                                          | 目录即分类；`connectOrCreate` 依赖 `Tag.@@unique([userId, name])` 做用户隔离                |
| 15  | 配额              | 匿名 60 次/小时，`GITHUB_TOKEN` 提到 5000 次/小时                                              | 17 篇在匿名下勉强够（实测跑到一半被限流），配 token 才稳                                    |

## Schema 演进（迁移 `20261027032834_add_record_source_url`）

```prisma
model Record {
  sourceUrl String? @db.VarChar(512)   // 远程来源 URL；手写笔记为 null

  @@unique([userId, sourceUrl])
}
```

## 两条执行链路

```
syncDocs()
  ├─ listDirectory()      → GET /repos/{repo}/contents/{dir}?ref={branch}   一次拿到全部条目
  ├─ pickMarkdownFiles()  → 只留 .md 的 file，自然序
  ├─ 逐篇 fetchMarkdown()
  │    ├─ raw.githubusercontent.com  ← 优先，不占配额
  │    └─ Contents API (base64)      ← raw 网络层失败才降级
  └─ 逐篇 saveDoc()
       ├─ 查 (userId, sourceUrl)
       ├─ 无 → create                              → created
       ├─ 标题+正文都没变 → 什么都不做              → skipped
       └─ 有变化 → $transaction[快照, update v+1]   → updated
```

## 验收口径

| 项       | 期望                                          | 实测                            |
| -------- | --------------------------------------------- | ------------------------------- |
| 首次执行 | 17 篇全部 created                             | 分两次跑完（中途触发匿名限流）  |
| 重复执行 | created 0 / updated 0 / skipped 17 / failed 0 | ✅ 实测一致                     |
| 单测     | 全绿、行覆盖 ≥80%                             | 40/40，语句 98.4%、行 100%      |
| 全量回归 | 既有 spec 不受影响                            | 3 suites / 58 tests 全通过      |
| 标题     | 去序号前缀、≤200 字符                         | ✅（本文档无 H1，全部走文件名） |
| 标签     | 每条挂 `TypeScript 入门教程`                  | ✅                              |

## 已知遗留（本次未处理）

1. **开发库缺 3 条外键**：`prisma migrate diff` 显示 `recordtag`/`tag` 上的 FK 在数据库里不存在（prisma/schema.prisma 里有）。属既有漂移，与本次改动无关，后续若开 `migrate dev` 会试图生成补偿迁移。
2. **`@@unique([userId, sourceUrl])` 未暴露到前端**：serializer 与 `src/types/record.d.ts` 都未改动，`sourceUrl` 目前是纯落库字段。若要前端展示「来源」需同步改契约成对文件。
3. **Tag 可能残留孤儿行**：更新时 `deleteMany + create` 会留下无引用的 Tag，体量小暂不治理。

## 参考

- 实现计划：`docs/superpowers/plans/2026-10-27-github-doc-crawler.md`
- 既有本地导入脚本：`server/scripts/import-markdown.ts`（本 spec 的分层即照它改造）
