# pass-scroll-server 后端全栈设计

- 日期：2026-09-23
- 状态：已确认
- 背景：pass-scroll（VitePress 笔记/面试题库站点）维护成本高，需一个可随时随地编辑文本记录的移动 App。前端 pass-scroll-mobile（uni-app + Vue3 + TS + Pinia + UnoCSS + wot-design-uni）已存在，本设计为其补齐后端并打通全链路。

## 关键决策

| 决策点       | 结论                                                                       |
| ------------ | -------------------------------------------------------------------------- |
| 用户体系     | 多用户注册/登录，记录按用户隔离                                            |
| 鉴权         | 方案 A：单 JWT access token（7 天有效），无 refresh token / Redis          |
| 数据库       | MySQL 8，Docker Compose 本地/服务器运行                                    |
| 仓库结构     | monorepo：当前仓库新增 `server/` 子目录，独立 package.json，不用 workspace |
| 前端数据策略 | API 为主 + 本地 storage 只读缓存（断网可看不能改）                         |
| 后端端口     | 3100，后端开启 CORS，前端经 `VITE_APP_API_URL` 直连，不走 vite proxy       |

## 1. 项目结构

```
pass-scroll-mobile/
├── server/                    # NestJS 后端，独立 package.json
│   ├── src/
│   │   ├── main.ts / app.module.ts
│   │   ├── common/            # 统一响应拦截器 + 全局异常过滤器
│   │   ├── prisma/            # PrismaModule（全局）+ PrismaService
│   │   ├── auth/              # 注册/登录/JWT Guard，bcrypt
│   │   └── records/           # 记录 CRUD + 置顶
│   ├── prisma/schema.prisma
│   ├── scripts/import-markdown.ts
│   ├── test/                  # e2e
│   ├── docker-compose.yml     # MySQL 8
│   └── .env                   # DATABASE_URL / JWT_SECRET / PORT=3100
└── src/                       # 现有前端（uni-app）
```

- 根 `.gitignore` 增加 `server/node_modules`、`server/.env`、`server/dist`
- 前端 eslint / tsconfig 排除 `server/`，避免互相干扰

## 2. 数据模型（Prisma）

```prisma
model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String   // bcrypt hash
  createdAt DateTime @default(now())
  records   Record[]
  tags      Tag[]
}

model Record {
  id        String     @id @default(cuid())
  title     String     @db.VarChar(200)
  content   String     @db.Text
  isPinned  Boolean    @default(false)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  userId    String
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  tags      RecordTag[]

  @@index([userId, updatedAt])
}

model Tag {
  id      String      @id @default(cuid())
  name    String
  userId  String
  user    User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  records RecordTag[]

  @@unique([userId, name])
}

model RecordTag {
  recordId String
  tagId    String
  record   Record @relation(fields: [recordId], references: [id], onDelete: Cascade)
  tag      Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([recordId, tagId])
}
```

- 标签规范化 m-n（非 JSON 列）：按标签过滤走索引 join
- API 序列化层将 DateTime 转毫秒时间戳，与前端 `RecordItem.createdAt: number` 对齐

## 3. API 设计

统一响应 `{ code: 0, message: 'ok', data: T }`；非 0 即业务错误。

| 方法   | 路径             | 说明                                                                                             |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------ |
| POST   | /auth/register   | `{username, password}` → `{token, user}`                                                         |
| POST   | /auth/login      | 同上                                                                                             |
| GET    | /records         | `keyword`（title/content 模糊）、`tag`、`page`（默认 1）、`pageSize`（默认 20）→ `{list, total}` |
| POST   | /records         | `{title, content, tags[]}`                                                                       |
| GET    | /records/:id     | 单条详情                                                                                         |
| PATCH  | /records/:id     | `{title?, content?, tags?}`                                                                      |
| DELETE | /records/:id     | 删除                                                                                             |
| POST   | /records/:id/pin | 切换置顶                                                                                         |

- 路径无全局前缀；后端开启 CORS，前端经 `VITE_APP_API_URL` 直连，不走 vite proxy

- 列表排序：`isPinned` desc → `updatedAt` desc（与现有前端 store 一致）
- `/records` 全部走 JwtAuthGuard，按 userId 隔离；访问他人记录返回 404（不泄露存在性）

## 4. 前端改造

- 新增 `src/utils/request.ts`：封装 `uni.request`，baseURL 取 env，自动带 `Authorization: Bearer <token>`；401 清 token 跳登录页；非 0 code 统一 toast
- 新增 `src/api/auth.ts`；填充 `src/api/record.ts`（当前为空文件）：纯接口函数
- 改造现有 `src/store/modules/user.ts`：token/user 状态，登录/注册/登出（复用模板已有 store，删除对模板残留 `@/api/user` 的依赖）
- 改造 `src/store/record.ts`：actions 全部 async 调 API；成功后写 storage 作只读缓存；`init()` 先读缓存渲染再拉 API 刷新；断网保留缓存并 toast
- 新增登录/注册页 `src/pages/login/`，`pages.json` 注册路由，首页 `onShow` 检查 token，未登录跳登录页
- 删除 `src/store/record.ts` 中重复定义的 `RecordItem/RecordForm`，统一引用 `src/types/record.d.ts`

## 5. 错误处理

- 后端全局异常过滤器归一化为 `{ code, message, data: null }`
- Prisma P2002 唯一约束 → 业务码 10001（用户名已存在）
- class-validator DTO 校验失败 → 400 + 字段级 message
- 前端 request 层拦截非 0 code 统一 toast，页面层不各自处理

## 6. 测试策略

- 后端 Jest 单测：`auth.service`（哈希、签发）、`records.service`（CRUD、归属隔离、置顶排序）
- supertest e2e：注册 → 登录 → 增删改查 → 越权访问 404 全链路，用 docker-compose 独立 test 库
- 前端：手动验证（H5 + 微信开发者工具），本次不补 vitest

## 7. Markdown 迁移脚本

`server/scripts/import-markdown.ts`：

```
npm run import:md -- --dir ../pass-scroll/docs --user admin
```

- 遍历 .md：首个 H1（无则文件名）→ title，全文 → content，相对 docs 的目录路径 → tags
- 直接走 Prisma 写库，按 `(userId, title)` 判重，幂等可重跑
- 本地 storage 旧记录不在本次范围（量小手动补）
