# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

「通关秘籍」——markdown 笔记 / 面试题库移动端 App。前端为 uni-app（Vue 3 + TS + Vite + Pinia + UnoCSS + wot-design-uni），后端为同仓库 `server/` 下的 NestJS + Prisma + MySQL 单体应用。产品动机与关键决策记录在 [docs/superpowers/specs/](docs/superpowers/specs/)（设计）与 [docs/superpowers/plans/](docs/superpowers/plans/)（实现计划）里，改动业务契约前先去查对应决策表。

## 双包根：包管理器不能混用

|        | 前端（仓库根）                   | 后端（`server/`）            |
| ------ | -------------------------------- | ---------------------------- |
| 锁文件 | `pnpm-lock.yaml` → **只用 pnpm** | `package-lock.json` → 用 npm |
| 安装   | `pnpm install`                   | `cd server && npm install`   |

根目录用 npm 会 ERESOLVE 失败并生成冲突的 `package-lock.json`。

## 命令

### 前端

```bash
pnpm dev:h5              # H5 开发，端口取 VITE_APP_PORT（5173），自动开浏览器
pnpm dev:mp-weixin       # 微信小程序开发（产物在 dist/dev/mp-weixin，用微信开发者工具打开）
pnpm build:h5            # 生产构建 H5；其他平台同理 build:mp-*
pnpm type-check          # vue-tsc --noEmit，只覆盖 src/**（root tsconfig 的 include 限定）
pnpm lint                # eslint --fix ./src（server/ 在 eslint ignores 中，不受影响）
pnpm lint:stylelint      # stylelint --fix，作用于 **/*.{css,scss,vue,html}
pnpm format              # prettier --write ./src
pnpm commit              # cz-git 交互式提交（推荐，见「提交规范」）
```

前端**没有测试框架**，UI 改动需起 dev server 在浏览器/开发者工具里实测。

### 后端（均在 `server/` 下执行）

```bash
npm run start:dev                       # nest start --watch，监听 3100
npm test                                # jest 单元测试（rootDir=src，匹配 *.spec.ts）
npx jest records.service                # 单个测试文件
npx jest -t "乐观锁"                     # 按用例名匹配
npm run test:e2e                        # supertest 端到端（test/*.e2e-spec.ts）
npm run prisma:migrate -- --name <名>    # 改 schema.prisma 后生成并应用迁移
npm run import:md -- --dir <docs目录> --user <用户名>   # markdown 批量导入
npm run crawl:github -- --user <用户名> [--dir "子目录"] # 抓 GitHub 目录 md 入库（按 userId+sourceUrl 幂等，见 docs/superpowers/specs/2026-10-27-github-doc-crawler-design.md）
```

`jest` 与 `test:e2e` 都强制 `maxWorkers: 1`（共享同一个测试库），且 `globalSetup` 会用 `prisma db push --accept-data-loss` **重建 `pass_scroll_test` 库**——跑测试前确认 DATABASE_URL 指向测试库而非开发库。

### 本地数据库

`server/docker-compose.yml` 声明 MySQL 8 映射到 **3307**，但本机没有 Docker，实际用便携版 MySQL 8 手动启动（详见记忆 `dev-environment-setup`）：

```bash
"D:/Software/mysql-8.0.40-winx64/bin/mysqld.exe" --port=3307 --basedir="D:/Software/mysql-8.0.40-winx64" --datadir="D:/Software/mysql-data-pass-scroll" --console
```

本机 3306 上另有 MySQL 5.7 服务在跑，别连错。`server/.env`（已 gitignore，从 `.env.example` 复制）提供 `DATABASE_URL` / `TEST_DATABASE_URL` / `JWT_SECRET` / `PORT`。`main.ts` 在生产模式下缺 `JWT_SECRET` 会直接拒绝启动。

## 前后端契约（最重要的整体架构）

**所有业务结果只看 `body.code`，HTTP 状态码只表达协议层。**

- 成功：[transform.interceptor.ts](server/src/common/interceptors/transform.interceptor.ts) 把 controller 返回值统一包装成 `{ code: 0, message: "ok", data }`，业务代码零样板。
- 失败：[http-exception.filter.ts](server/src/common/filters/http-exception.filter.ts) 翻译四类异常——`BusinessException` → **HTTP 200 + 业务码**；`HttpException` → 沿用其 HTTP 状态码（401/404/400）；Prisma `P2002` → 200 + 10001；其余 → 500 且只回「服务器内部错误」。
- 业务码登记表在 [business.exception.ts](server/src/common/exceptions/business.exception.ts) 顶部注释：10001 已存在 / 10002 掌握度非法流转 / 10003 旧密码错 / 10004 密码弱 / 10409 版本冲突。**新增码往后排，不复用。**
- 前端出口只有一个：[src/utils/request.ts](src/utils/request.ts)。`code === 0` 才 resolve `body.data`，其余一律 toast + reject(body)。401 且请求带 token（`auth !== false`）→ 清 token、重置用户态、`reLaunch` 登录页；登录/注册这类 `auth: false` 请求的 401 只 toast 后端 message。**因此页面里的 catch 通常故意留空——提示已在此统一弹过，不要在页面重复弹 toast。**

接口路径**无 `/api` 前缀**。`vite.config.ts` 里的 `/dev-api` proxy 是模板遗留、**未生效的死配置**：前端直连 `VITE_APP_API_URL`（`http://localhost:3100`）靠后端 `enableCors()`，改端口/域名请动 `.env` 而不是 proxy。

## 后端数据不变量

改 `records` 模块前先读这三条（代码里都有注释锚点）：

1. **归属校验**：controller 每个方法第一参数是 `@CurrentUser()`，userId 取自 JWT 而非请求体；service 里几乎每个方法第一行是 `findOwned(userId, id)`，查不到统一抛 404（不区分「不存在」与「是别人的」，防探测）。新增接口照此模式。
2. **排序不变量**：列表按 `isPinned desc, updatedAt desc`，而 Prisma `@updatedAt` 会在任何 UPDATE 时自动刷新。置顶、标记掌握度这类**不该改变排序**的操作必须显式回写旧 `updatedAt`。
3. **乐观锁 + 快照**：`Record.version` 只在标题/正文真变时 +1，并在同一事务里先写 `RecordSnapshot`（「修改前」快照）。前端编辑页 [editor/index.vue:184](src/pages/editor/index.vue#L184) 捕获 10409 后绕过 store 直拉远端最新内容续编；恢复旧版本本身也先存当前版快照，所以恢复可撤销。

掌握度流转规则集中在 [mastery-state.ts](server/src/records/mastery-state.ts) 的 `ALLOWED` 表（`MASTERED` 只能回 `LEARNING`），不要在页面或 service 里另写 if 分支。

**契约成对文件**：[record.serializer.ts](server/src/records/record.serializer.ts) 的输出与 [src/types/record.d.ts](src/types/record.d.ts) 一一对应（tags 拍平成 `string[]`、时间转毫秒）。后端动返回结构，必须同步改前端类型，再跑 `pnpm type-check`。

## 记忆系统：间隔重复 + 记忆宫殿

> 注：spec `2026-09-24-articlepilot-features-design.md` 曾把「掌握度复习算法（间隔重复）」列为不做，本功能已落地，以本节为准。

**一条笔记 = 一张记忆卡片**。`Record` 上新增调度字段：`stage/ease/lapses/reviewCount/dueAt/lastReviewedAt/firstReviewedAt`，
以及空间位置 `palaceId/palaceOrder`（`Palace` 表 = 一条熟悉的空间路径，卡片按 `palaceOrder` 当桩位摆上去——位置法/记忆宫殿）。

算法（艾宾浩斯梯度 + SM-2 难度因子）在 [server/src/records/srs.ts](server/src/records/srs.ts)，纯函数、`now` 由调用方传入便于钉死时间单测。
**⚠️ 前端 [src/utils/srs.ts](src/utils/srs.ts) 是它的同构副本**（复习页四个按钮要预显示「N 天后再见」、曲线页要预览轨迹，不能为此发请求）。**改一边必须改另一边**，否则按钮上的天数会与真正写入的 `dueAt` 不一致。

- 四档自评：`AGAIN` 打回 stage 0 且 `lapses+1`、`HARD` 停原阶段但间隔打折、`GOOD` stage+1、`EASY` stage+1 且间隔×`easyBonus`。
- 掌握度由评分推导（`stage >= curve.masteredStage` → `MASTERED`），但仍过 `mastery-state.ts` 状态机；**同值不调用** `assertMasteryTransition`（它对 `from===to` 也抛 10002）。
- 复习**不改列表排序**：`review()` 与 `setMastery()`/`togglePin()` 一样显式回写旧 `updatedAt`。
- **记忆曲线配置不落库**：它是这台设备上的个人偏好，存 storage `pass_scroll_curve`，每次 `POST /records/:id/review` 随 `grade` 带给后端（`normalizeCurve` 兜底清洗）；每日新卡上限另由 `GET /records/due?newPerDay=` 带入。换设备曲线不跟随，但 `dueAt/stage` 在服务端，复习进度不丢。
- 队列口径（`GET /records/due`）：到期卡（`dueAt <= now`，按 `dueAt` 升序 = 逾期最久在前）+ 定额新卡（`reviewCount = 0`），可传 `palaceId` 做宫殿巡游、传 `tag` 做主题聚焦。`stats` 里的 `dueCount` 用同一口径。
- **队列要按标签分块，不能混排**：排完序还要过 [records.service.ts](server/src/records/records.service.ts) 的 `orderByTagBlock`——同一标签的卡片连成一整块，块内到期优先，块间按"最逾期"排。混排会让 #游戏 和 #面试 交替出现，大脑反复换主题，学完拼不出整块知识（单测见 `due-block.spec.ts`）。返回里的 `blocks` 给前端显示"本组还剩几张"。
- 卡片的"主标签"= `tags[0]`（Prisma 不带 orderBy 时按桥接表主键返回，顺序稳定，前后端算出来必然一致）；没标签的归"未分类"块。
- `GET /records/due/tags` 给出「每个标签今日待复习数 + 笔记总数」，标签栏角标与复习页主题切换器都用它；首页标签栏的**展示顺序**也直接用它（有待复习的在前）。
- 路由顺序陷阱：`@Get("due")`、`@Get("due/tags")` 必须注册在 `@Get(":id")` **之前**（同 `"stats"`）。

前端入口：复习页（四档自评 + 进度）、[curve/index.vue](src/pages/curve/index.vue)（曲线可视化 + 自定义）、[palace/index.vue](src/pages/palace/index.vue)（宫殿与桩位编排）。队列状态在 [src/store/srs.ts](src/store/srs.ts)，与 `record` store 分工：前者管「卡片调度」，后者管「笔记本体」。

## 前端状态与页面结构

- **列表单一数据源**是 [src/store/record.ts](src/store/record.ts)：`records/total/keyword/activeTag` 由首页、详情页、宫殿页共享；所有增删改/置顶/掌握度动作成功后都 `fetchList()` 重新对齐。（复习页改由 `srs` store 的到期队列驱动，不再从这张列表里随机抽题）
- **缓存策略**：`App.vue` 的 `onLaunch` 先 `init()` 读 storage（冷启动秒开、离线只读），各页面 `onShow` 再 `fetchList()` 覆盖。缓存 key `pass_scroll_records` 按用户隔离，`logout()` 会连同 store 与 storage 一起清，避免下一账号看到上一账号数据。`init()` 里对旧缓存做字段归一化（补 `mastery`/`version`），新增字段时照此兼容。
- **登录守卫没有全局路由中间件**：每个受保护页面在自己的 `onShow` 里 `if (!userStore.token) uni.reLaunch({ url: "/pages/login/index" })`。新页面需要登录态时照此手写。
- `request.ts → store/modules/user.ts → api/auth.ts → request.ts` 存在循环依赖，401 处理里用**动态 import** 打破。
- **Pinia setup store 的 state/computed 在页面侧类型层不解包**（项目既有基线），所有消费它的页面都用 `RecordStoreProxy` 这个 `Omit<...> & {...}` + `as unknown` 转换拿到运行时形态（见 [index/index.vue:80](src/pages/index/index.vue#L80) 等 6 处）。新页面沿用同一写法，不要在 store 内部改类型来「修」它。
- `pages.json` 的 easycom 有一条兜底映射 `"^(.*)": "@/components/$1.vue"`：模板里任何未识别的标签都会被解析到 `src/components/<标签名>.vue`，组件名写错时表现为「找不到组件」而不是编译错误。`wd-*` 走 wot-design-uni。

## UnoCSS 陷阱（会静默失效）

本项目用 `unocss-preset-weapp`，其 `transformerClass` **只转换模板静态 `class="..."` 里的 arbitrary value**。`:class` 绑定的动态字符串（三元/computed/函数返回）中的 `[#3E63DD]`、`/10` 这类 arbitrary value 不生成任何 CSS，元素呈未着色默认态——编译与 a11y 快照都不报错，只有查计算样式才能发现。

规则：**尺寸/布局类可放 `:class`；任何需要动态切换的颜色/尺寸一律用 `:style` 内联**（见 [RecordCard.vue](src/components/RecordCard.vue) 的 mastery 徽章、[index/index.vue](src/pages/index/index.vue) 的 `chipStyle`）。评审含 `:class` 且值里有 `[` 的 diff 时列为必查项。

## Markdown 渲染管线

[src/utils/markdown.ts](src/utils/markdown.ts) 三段流水线：`parseNote` 按 `:::tip/warning/danger/details` 围栏切段 → 每段 `marked.parse` → `injectStyles` 注入**内联样式**（`rich-text` 只认 inline style，不认 class/外部 CSS）→ H5 端再 `adaptUnits` 把 style 里的 rpx 按 750 设计稿换算成 px（小程序原生支持 rpx，原样返回）。`details` 容器由 [MdContainer.vue](src/components/MdContainer.vue) 渲染成默认折叠的「答案」卡，是复习页的核心交互。消费方：详情页、复习页、版本预览页、编辑器预览。

## 提交与格式规范

- 提交经 husky：`commit-msg` 跑 commitlint（conventional，type 限 feat/fix/docs/style/refactor/perf/test/build/ci/revert/chore），`pre-commit` 跑 `pnpm run lint:lint-staged` 并**检测暂存文件里的 CR 字符**——出现 CRLF 会报「CR字符检测失败！请执行换行符规范化」并拦提交（`.gitattributes` 已设 `* text=auto eol=lf`）。中文 scope 惯用，如 `fix(pages): xxx`、`docs(server): xxx`。
- ESLint 强制双引号、分号、2 空格；`@typescript-eslint/no-explicit-any` 已关闭。
- Prettier 实际生效的是 [.prettierrc](.prettierrc)（`printWidth: 120`）；仓库根的 `prettier.config.mjs` 优先级更低、**不生效**，别在它上面调格式。
- `src/types/auto-imports.d.ts` 与 `.eslintrc-auto-import.json` 是 unplugin-auto-import 的生成物，不要手改；`dev`/`build` 后会出现在 git 改动里属正常。
