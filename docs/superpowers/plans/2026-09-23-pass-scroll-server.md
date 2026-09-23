# pass-scroll-server 全栈实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 monorepo 的 `server/` 子目录搭建 NestJS + Prisma + MySQL 后端（多用户 JWT、记录 CRUD、置顶、标签），并把前端 records 功能从本地存储切换为 API + 本地只读缓存。

**Architecture:** 后端为独立 package.json 的 NestJS 10 应用（无 workspace），MySQL 8 用 Docker Compose 运行；鉴权为单 JWT access token（7 天）；统一响应 `{ code, message, data }`。前端新增 `utils/request.ts` 封装 `uni.request`，store 层全部 async 化调 API，storage 仅作只读缓存。

**Tech Stack:** NestJS 10 / Prisma 6 / MySQL 8 (Docker) / JWT (@nestjs/jwt) / bcryptjs / Jest 29 + supertest；前端 uni-app + Vue3 + TS + Pinia。

**Spec:** [docs/superpowers/specs/2026-09-23-pass-scroll-server-design.md](../specs/2026-09-23-pass-scroll-server-design.md)

## Global Constraints

- 后端端口 **3100**；**不设全局路由前缀**（实际路径 `/auth/login`、`/records`，非 spec 表格中的 `/api/...`）；`app.enableCors()` 全开，前端直连 `VITE_APP_API_URL`，不走 vite proxy
- MySQL 容器端口映射 **3307:3306**（本机 3306 已被占用），root 密码 `pass_scroll_dev`，库 `pass_scroll` / `pass_scroll_test`
- 统一响应：成功 `{ code: 0, message: "ok", data }`；业务错误 HTTP 200 + `code` 非 0（如 10001 用户名已存在）；鉴权失败 HTTP 401；校验失败 HTTP 400
- 密码哈希用 **bcryptjs**（纯 JS，避免 Windows 下 bcrypt 的 node-gyp 编译问题）
- Prisma DateTime 在 API 层序列化为**毫秒时间戳 number**，与前端 `RecordItem.createdAt: number` 对齐
- Prisma 模型名 `Record` 与 TS 工具类型冲突，引用时一律 `import { Record as RecordModel }` 别名
- 前端 token 存 storage key `"token"`，值为**原始 JWT**（不带 Bearer 前缀），`request.ts` 统一拼 `Bearer `
- 所有新文件必须 **LF 换行**（pre-commit 钩子检测 CR 并拒绝提交）
- 提交信息格式 `type(scope): 描述`，scope 必填，type ∈ feat/fix/docs/style/refactor/chore/perf/test/revert/build
- 后端测试统一使用 `pass_scroll_test` 库，每个用例前清库，测试之间不共享数据

---

### Task 1: server 脚手架 + MySQL 容器 + 根仓库 wiring

**Files:**

- Create: `server/package.json`、`server/tsconfig.json`、`server/tsconfig.build.json`、`server/nest-cli.json`、`server/.env`、`server/.env.example`、`server/docker-compose.yml`、`server/docker/mysql/init.sql`、`server/src/main.ts`、`server/src/app.module.ts`、`server/src/app.controller.ts`
- Modify: `.gitignore`（追加 server/.env）、`eslint.config.mjs:45`（ignores 追加 `"/server"`）、`package.json`（lint-staged glob 收窄到 src/，避免 server 文件被前端 eslint 处理）

**Interfaces:**

- Consumes: 无（首个任务）
- Produces: `GET http://localhost:3100/health` → `{ code: 0, message: "ok", data: { status: "ok" } }`（注意：本任务尚无拦截器，health 先返回原始 `{ status: "ok" }`，Task 3 加拦截器后变为统一格式）；MySQL 容器 `pass-scroll-mysql`（localhost:3307）

- [ ] **Step 1: 编写 server/package.json 与配置文件**

`server/package.json`：

```json
{
  "name": "pass-scroll-server",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "start": "nest start",
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "prisma:migrate": "prisma migrate dev",
    "import:md": "tsx scripts/import-markdown.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/platform-express": "^10.4.15",
    "@prisma/client": "^6.2.1",
    "bcryptjs": "^2.4.3",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "dotenv": "^16.4.7",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "@nestjs/testing": "^10.4.15",
    "@types/bcryptjs": "^2.4.6",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@types/node": "^22.10.2",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^6.2.1",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsx": "^4.19.2",
    "typescript": "^5.5.4"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node",
    "setupFiles": ["../test/set-env.ts"],
    "globalSetup": "../test/global-setup.ts"
  }
}
```

`server/tsconfig.json`：

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "test/**/*", "scripts/**/*"]
}
```

`server/tsconfig.build.json`：

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "scripts", "dist", "**/*spec.ts"]
}
```

`server/nest-cli.json`：

```json
{
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`server/.env`（同内容复制为 `.env.example`，仅 JWT_SECRET 值替换为 `"change-me"`）：

```
DATABASE_URL="mysql://root:pass_scroll_dev@localhost:3307/pass_scroll"
TEST_DATABASE_URL="mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test"
JWT_SECRET="pass-scroll-dev-secret-2026"
PORT=3100
```

- [ ] **Step 2: 编写 docker-compose 与数据库初始化脚本**

`server/docker-compose.yml`：

```yaml
services:
  mysql:
    image: mysql:8.0
    container_name: pass-scroll-mysql
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: pass_scroll_dev
      TZ: Asia/Shanghai
    ports:
      - "3307:3306"
    volumes:
      - mysql-data:/var/lib/mysql
      - ./docker/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

volumes:
  mysql-data:
```

`server/docker/mysql/init.sql`（注意：init.sql 只在容器首次初始化时执行；若 volume 已存在需 `docker compose down -v` 后重建）：

```sql
CREATE DATABASE IF NOT EXISTS pass_scroll DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS pass_scroll_test DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- [ ] **Step 3: 编写最小应用代码（main/app module/health）**

`server/src/main.ts`（第一行必须是 `import "dotenv/config";`，保证后续模块读取到环境变量）：

```ts
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`server running at http://localhost:${port}`);
}
bootstrap();
```

`server/src/app.module.ts`：

```ts
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";

@Module({
  controllers: [AppController],
})
export class AppModule {}
```

`server/src/app.controller.ts`：

```ts
import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
```

- [ ] **Step 4: 根仓库 wiring（gitignore / eslint / lint-staged）**

`.gitignore` 末尾追加一行：

```
/server/.env
```

`eslint.config.mjs` 的 `ignores` 数组追加 `"/server"`（与 `"/dist"` 等并列）。

根 `package.json` 的 `lint-staged` 改为（server 的 ts 只用 prettier，不跑前端 eslint；根级 vite.config.ts 保留原校验）：

```json
"lint-staged": {
  "src/**/*.{js,ts}": ["eslint --fix", "prettier --write"],
  "vite.config.ts": ["eslint --fix", "prettier --write"],
  "server/**/*.ts": ["prettier --write"],
  "*.{cjs,json}": ["prettier --write"],
  "src/**/*.{vue,html}": ["eslint --fix", "prettier --write", "stylelint --fix"],
  "src/**/*.{scss,css}": ["stylelint --fix", "prettier --write"],
  "*.md": ["prettier --write"]
}
```

- [ ] **Step 5: 安装依赖并启动验证**

```bash
cd server && npm install
docker compose up -d
npm run start:dev
```

另开终端验证：

```bash
curl http://localhost:3100/health
```

Expected: `{"status":"ok"}`；`docker ps` 可见 `pass-scroll-mysql`

- [ ] **Step 6: Commit**

```bash
git add server .gitignore eslint.config.mjs package.json
git commit -m "feat(server): NestJS 脚手架与 MySQL Docker 环境"
```

---

### Task 2: Prisma schema + 迁移 + PrismaModule

**Files:**

- Create: `server/prisma/schema.prisma`、`server/src/prisma/prisma.module.ts`、`server/src/prisma/prisma.service.ts`
- Modify: `server/src/app.module.ts`（imports 加 PrismaModule）

**Interfaces:**

- Consumes: Task 1 的 MySQL 容器与 `DATABASE_URL`
- Produces: `PrismaService extends PrismaClient`（全局可用，Task 4/5/6/7 依赖）；数据库表 `User`/`Record`/`Tag`/`RecordTag`；Prisma 复合唯一 where 输入 `userId_name`（Task 5/7 的 connectOrCreate 依赖）

- [ ] **Step 1: 编写 schema.prisma**

`server/prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  username  String   @unique
  password  String
  createdAt DateTime @default(now())
  records   Record[]
  tags      Tag[]
}

model Record {
  id        String      @id @default(cuid())
  title     String      @db.VarChar(200)
  content   String      @db.Text
  isPinned  Boolean     @default(false)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
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

- [ ] **Step 2: 执行迁移并验证表结构**

```bash
cd server
npx prisma migrate dev --name init
docker exec pass-scroll-mysql mysql -uroot -ppass_scroll_dev -e "SHOW TABLES IN pass_scroll;"
```

Expected: 输出包含 `Record`/`RecordTag`/`Tag`/`User`/`_prisma_migrations`

- [ ] **Step 3: 编写 PrismaModule/PrismaService 并挂到 AppModule**

`server/src/prisma/prisma.service.ts`：

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`server/src/prisma/prisma.module.ts`：

```ts
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`server/src/app.module.ts` 改为：

```ts
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 4: 启动验证**

```bash
npm run start:dev
```

Expected: 启动无报错，日志无 Prisma 连接错误（连接失败会抛 `Can't reach database server`）

- [ ] **Step 5: Commit**

```bash
git add server/prisma server/src
git commit -m "feat(server): Prisma 数据模型与全局 PrismaModule"
```

---

### Task 3: 统一响应/异常 common 层

**Files:**

- Create: `server/src/common/interceptors/transform.interceptor.ts`、`server/src/common/filters/http-exception.filter.ts`、`server/src/common/exceptions/business.exception.ts`
- Modify: `server/src/main.ts`（加全局 pipe/interceptor/filter）

**Interfaces:**

- Consumes: Task 1/2 的应用骨架
- Produces:

  - `BusinessException(businessCode: number, message: string)` — Task 4 抛 10001 用
  - 全局响应包装：所有成功响应 → `{ code: 0, message: "ok", data }`；`BusinessException` → HTTP 200 `{ code: businessCode, message, data: null }`；`HttpException` → 对应状态码 `{ code: status, message, data: null }`；Prisma P2002 → HTTP 200 `{ code: 10001, ... }`；未知错误 → 500

- [ ] **Step 1: 编写 BusinessException**

`server/src/common/exceptions/business.exception.ts`：

```ts
export class BusinessException extends Error {
  constructor(
    public readonly businessCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessException";
  }
}
```

- [ ] **Step 2: 编写 TransformInterceptor**

`server/src/common/interceptors/transform.interceptor.ts`：

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ code: 0, message: "ok", data: (data ?? null) as T })));
  }
}
```

- [ ] **Step 3: 编写 HttpExceptionFilter**

`server/src/common/filters/http-exception.filter.ts`：

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { BusinessException } from "../exceptions/business.exception";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof BusinessException) {
      res.status(HttpStatus.OK).json({ code: exception.businessCode, message: exception.message, data: null });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join(";")
            : (body as { message?: string }).message || exception.message;
      res.status(status).json({ code: status, message, data: null });
      return;
    }
    if (typeof exception === "object" && exception !== null && (exception as { code?: string }).code === "P2002") {
      res.status(HttpStatus.OK).json({ code: 10001, message: "数据已存在（唯一约束冲突）", data: null });
      return;
    }
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 500, message: "服务器内部错误", data: null });
  }
}
```

- [ ] **Step 4: main.ts 挂全局 pipe/interceptor/filter**

`server/src/main.ts` 完整内容改为：

```ts
import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`server running at http://localhost:${port}`);
}
bootstrap();
```

- [ ] **Step 5: 手动验证响应格式**

```bash
npm run start:dev
curl http://localhost:3100/health
curl http://localhost:3100/not-exist
```

Expected: health → `{"code":0,"message":"ok","data":{"status":"ok"}}`；not-exist → 404 且 body 为 `{"code":404,"message":"Cannot GET /not-exist","data":null}`

- [ ] **Step 6: Commit**

```bash
git add server/src
git commit -m "feat(server): 统一响应拦截器与全局异常过滤器"
```

---

### Task 4: Auth 模块（注册/登录/JWT）+ 集成测试

**Files:**

- Create: `server/src/auth/auth.module.ts`、`server/src/auth/auth.controller.ts`、`server/src/auth/auth.service.ts`、`server/src/auth/dto/auth.dto.ts`、`server/src/auth/jwt-auth.guard.ts`、`server/src/common/decorators/current-user.decorator.ts`
- Create: `server/test/set-env.ts`、`server/test/global-setup.ts`、`server/test/reset-db.ts`、`server/src/auth/auth.service.spec.ts`
- Modify: `server/src/app.module.ts`（imports 加 AuthModule）

**Interfaces:**

- Consumes: `PrismaService`（Task 2）、`BusinessException`（Task 3）
- Produces:

  - `POST /auth/register`、`POST /auth/login` → `{ token: string, user: { id: string, username: string } }`（被拦截器包一层 code/message）
  - `JwtAuthGuard`（canActivate，校验 `Authorization: Bearer <jwt>`，挂 `request.user = { userId, username }`）— Task 5 records 路由使用
  - `@CurrentUser()` 参数装饰器，返回 `AuthUser { userId: string; username: string }`
  - 测试基建：`test/set-env.ts`（测试环境变量）、`test/global-setup.ts`（prisma db push 到测试库）、`resetDatabase(prisma)`（清库，Task 5/6 测试复用）

- [ ] **Step 1: 编写测试基建（先建测试环境）**

`server/test/set-env.ts`（jest setupFiles，每个测试进程最先执行）：

```ts
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || "mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
```

`server/test/global-setup.ts`：

```ts
import { execSync } from "child_process";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL || "mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test";
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
```

`server/test/reset-db.ts`：

```ts
import { PrismaClient } from "@prisma/client";

export async function resetDatabase(prisma: PrismaClient) {
  await prisma.recordTag.deleteMany();
  await prisma.record.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.user.deleteMany();
}
```

- [ ] **Step 2: 编写失败的集成测试**

`server/src/auth/auth.service.spec.ts`：

```ts
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "./auth.module";
import { AuthService } from "./auth.service";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { resetDatabase } from "../../test/reset-db";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AuthModule, PrismaModule] }).compile();
    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("注册成功返回可用 token 与用户信息", async () => {
    const result = await service.register({ username: "alice", password: "123456" });
    expect(result.user).toEqual({ id: expect.any(String), username: "alice" });
    const payload = jwt.verify(result.token);
    expect(payload.sub).toBe(result.user.id);
    // 密码不落明文
    const user = await prisma.user.findUnique({ where: { username: "alice" } });
    expect(user?.password).not.toBe("123456");
  });

  it("重复注册抛 BusinessException 10001", async () => {
    await service.register({ username: "alice", password: "123456" });
    await expect(service.register({ username: "alice", password: "654321" })).rejects.toMatchObject({
      name: "BusinessException",
      businessCode: 10001,
    });
  });

  it("密码错误抛 UnauthorizedException", async () => {
    await service.register({ username: "alice", password: "123456" });
    await expect(service.login({ username: "alice", password: "wrong" })).rejects.toMatchObject({ status: 401 });
  });

  it("登录成功返回 token", async () => {
    await service.register({ username: "alice", password: "123456" });
    const result = await service.login({ username: "alice", password: "123456" });
    expect(jwt.verify(result.token).sub).toBe(result.user.id);
  });
});
```

- [ ] **Step 3: 运行测试确认失败（AuthModule 不存在）**

```bash
cd server && npm test -- auth.service.spec
```

Expected: 编译失败 `Cannot find module './auth.module'`

- [ ] **Step 4: 编写 DTO / Service / Guard / 装饰器 / Module / Controller**

`server/src/auth/dto/auth.dto.ts`：

```ts
import { IsString, Length } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 20, { message: "用户名长度需为 3-20 位" })
  username: string;

  @IsString()
  @Length(6, 32, { message: "密码长度需为 6-32 位" })
  password: string;
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
```

`server/src/auth/auth.service.ts`：

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

export const USERNAME_EXISTS = 10001;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BusinessException(USERNAME_EXISTS, "用户名已存在");
    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({ data: { username: dto.username, password: hash } });
    return this.buildAuthResult(user.id, user.username);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException("用户名或密码错误");
    }
    return this.buildAuthResult(user.id, user.username);
  }

  private buildAuthResult(userId: string, username: string) {
    return {
      token: this.jwt.sign({ sub: userId, username }),
      user: { id: userId, username },
    };
  }
}
```

`server/src/auth/jwt-auth.guard.ts`：

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("未登录或登录已过期");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token);
      request.user = { userId: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException("未登录或登录已过期");
    }
  }
}
```

`server/src/common/decorators/current-user.decorator.ts`：

```ts
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  userId: string;
  username: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
```

`server/src/auth/auth.module.ts`（JwtModule 注册为 global，Task 5 的 guard 才能注入 JwtService）：

```ts
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev-secret",
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
```

`server/src/auth/auth.controller.ts`：

```ts
import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
```

`server/src/app.module.ts` 的 `imports` 改为 `[PrismaModule, AuthModule]`（顶部加 `import { AuthModule } from "./auth/auth.module";`）。

- [ ] **Step 5: 运行测试确认通过**

```bash
npm test -- auth.service.spec
```

Expected: 4 个用例全部 PASS（首次会先跑 globalSetup 的 prisma db push）

- [ ] **Step 6: Commit**

```bash
git add server/src server/test
git commit -m "feat(server): JWT 注册登录与认证守卫"
```

---

### Task 5: Records 模块（CRUD + 置顶 + 标签）+ 集成测试

**Files:**

- Create: `server/src/records/records.module.ts`、`server/src/records/records.controller.ts`、`server/src/records/records.service.ts`、`server/src/records/dto/record.dto.ts`、`server/src/records/record.serializer.ts`、`server/src/records/records.service.spec.ts`
- Modify: `server/src/app.module.ts`（imports 加 RecordsModule）

**Interfaces:**

- Consumes: `PrismaService`、`JwtAuthGuard`、`@CurrentUser()/AuthUser`、`resetDatabase`
- Produces:

  - `GET /records?keyword&tag&page&pageSize` → `{ list: SerializedRecord[], total: number }`
  - `POST /records`、`GET/PATCH/DELETE /records/:id`、`POST /records/:id/pin`
  - `SerializedRecord = { id, title, content, isPinned, tags: string[], createdAt: number, updatedAt: number }`（前端 `RecordItem` 的同构体）
  - 排序规则：`isPinned` desc → `updatedAt` desc；`togglePin` **不改变** `updatedAt`

- [ ] **Step 1: 编写失败的集成测试**

`server/src/records/records.service.spec.ts`：

```ts
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { resetDatabase } from "../../test/reset-db";
import { RecordsService } from "./records.service";

describe("RecordsService", () => {
  let service: RecordsService;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ providers: [RecordsService, PrismaService] }).compile();
    service = module.get(RecordsService);
    prisma = module.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const user = await prisma.user.create({ data: { username: "alice", password: "hash" } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOtherUser() {
    const other = await prisma.user.create({ data: { username: "bob", password: "hash" } });
    return other.id;
  }

  it("create 返回序列化记录（tags 为字符串数组，时间为毫秒 number）", async () => {
    const record = await service.create(userId, { title: "第一条", content: "内容", tags: ["面试", "hash"] });
    expect(record).toMatchObject({ title: "第一条", content: "内容", isPinned: false, tags: ["面试", "hash"] });
    expect(typeof record.createdAt).toBe("number");
    expect(typeof record.updatedAt).toBe("number");
  });

  it("list 排序：置顶优先，其余按 updatedAt 倒序", async () => {
    const a = await service.create(userId, { title: "A", content: "", tags: [] });
    await service.create(userId, { title: "B", content: "", tags: [] });
    await service.togglePin(userId, a.id);
    const { list, total } = await service.list(userId, { page: 1, pageSize: 20 });
    expect(total).toBe(2);
    expect(list[0].title).toBe("A");
    expect(list[0].isPinned).toBe(true);
    expect(list[1].title).toBe("B");
  });

  it("list keyword 命中 title 或 content", async () => {
    await service.create(userId, { title: "两数之和", content: "哈希表", tags: [] });
    await service.create(userId, { title: "二叉树", content: "递归遍历", tags: [] });
    const byTitle = await service.list(userId, { keyword: "两数", page: 1, pageSize: 20 });
    expect(byTitle.total).toBe(1);
    const byContent = await service.list(userId, { keyword: "递归", page: 1, pageSize: 20 });
    expect(byContent.total).toBe(1);
  });

  it("list 按 tag 过滤", async () => {
    await service.create(userId, { title: "A", content: "", tags: ["hash"] });
    await service.create(userId, { title: "B", content: "", tags: ["tree"] });
    const { total, list } = await service.list(userId, { tag: "hash", page: 1, pageSize: 20 });
    expect(total).toBe(1);
    expect(list[0].title).toBe("A");
  });

  it("list 分页：pageSize 限制条数，total 为全量", async () => {
    for (let i = 0; i < 5; i++) await service.create(userId, { title: `T${i}`, content: "", tags: [] });
    const { list, total } = await service.list(userId, { page: 2, pageSize: 2 });
    expect(total).toBe(5);
    expect(list).toHaveLength(2);
  });

  it("update 替换标签并更新内容", async () => {
    const record = await service.create(userId, { title: "A", content: "旧", tags: ["x"] });
    const updated = await service.update(userId, record.id, { content: "新", tags: ["y", "z"] });
    expect(updated.content).toBe("新");
    expect(updated.tags.sort()).toEqual(["y", "z"]);
  });

  it("操作他人记录返回 NotFound（不泄露存在性）", async () => {
    const otherId = await createOtherUser();
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    await expect(service.detail(otherId, record.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.update(otherId, record.id, { title: "hack" })).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(otherId, record.id)).rejects.toMatchObject({ status: 404 });
  });

  it("togglePin 翻转置顶且不改变 updatedAt", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    const pinned = await service.togglePin(userId, record.id);
    expect(pinned.isPinned).toBe(true);
    expect(pinned.updatedAt).toBe(record.updatedAt);
    const unpinned = await service.togglePin(userId, record.id);
    expect(unpinned.isPinned).toBe(false);
  });

  it("remove 删除本人记录", async () => {
    const record = await service.create(userId, { title: "A", content: "", tags: [] });
    await service.remove(userId, record.id);
    const { total } = await service.list(userId, { page: 1, pageSize: 20 });
    expect(total).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败（RecordsService 不存在）**

```bash
npm test -- records.service.spec
```

Expected: 编译失败 `Cannot find module './records.service'`

- [ ] **Step 3: 编写 DTO / 序列化器**

`server/src/records/dto/record.dto.ts`：

```ts
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class CreateRecordDto {
  @IsString()
  @Length(1, 200, { message: "标题长度需为 1-200 字" })
  title: string;

  @IsString()
  content: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10, { message: "标签最多 10 个" })
  @IsString({ each: true })
  tags: string[];
}

export class UpdateRecordDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}

export class QueryRecordDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`server/src/records/record.serializer.ts`（`Record` 是 Prisma 生成的模型类型，与 TS 工具类型同名，必须别名导入）：

```ts
import { Record as RecordModel } from "@prisma/client";

export type RecordWithTags = RecordModel & { tags: { tag: { name: string } }[] };

export function serializeRecord(record: RecordWithTags) {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    isPinned: record.isPinned,
    tags: record.tags.map((rt) => rt.tag.name),
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}
```

- [ ] **Step 4: 编写 RecordsService**

`server/src/records/records.service.ts`：

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordDto, QueryRecordDto, UpdateRecordDto } from "./dto/record.dto";
import { serializeRecord } from "./record.serializer";

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: QueryRecordDto) {
    const where: Prisma.RecordWhereInput = { userId };
    if (query.keyword) {
      where.OR = [{ title: { contains: query.keyword } }, { content: { contains: query.keyword } }];
    }
    if (query.tag) {
      where.tags = { some: { tag: { name: query.tag } } };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.record.count({ where }),
      this.prisma.record.findMany({
        where,
        include: { tags: { include: { tag: true } } },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { list: rows.map(serializeRecord), total };
  }

  async detail(userId: string, id: string) {
    const row = await this.prisma.record.findFirst({
      where: { id, userId },
      include: { tags: { include: { tag: true } } },
    });
    if (!row) throw new NotFoundException("记录不存在");
    return serializeRecord(row);
  }

  async create(userId: string, dto: CreateRecordDto) {
    const row = await this.prisma.record.create({
      data: {
        title: dto.title,
        content: dto.content,
        userId,
        tags: { create: this.tagConnections(userId, dto.tags) },
      },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  async update(userId: string, id: string, dto: UpdateRecordDto) {
    await this.findOwned(userId, id);
    const data: Prisma.RecordUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.tags !== undefined) {
      data.tags = { deleteMany: {}, create: this.tagConnections(userId, dto.tags) };
    }
    const row = await this.prisma.record.update({
      where: { id },
      data,
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.record.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException("记录不存在");
  }

  async togglePin(userId: string, id: string) {
    const owned = await this.findOwned(userId, id);
    const row = await this.prisma.record.update({
      where: { id: owned.id },
      // 显式回写 updatedAt，避免 @updatedAt 自动刷新导致置顶改变列表排序
      data: { isPinned: !owned.isPinned, updatedAt: owned.updatedAt },
      include: { tags: { include: { tag: true } } },
    });
    return serializeRecord(row);
  }

  private tagConnections(userId: string, tags: string[]) {
    return tags.map((name) => ({
      tag: {
        connectOrCreate: {
          where: { userId_name: { userId, name } },
          create: { userId, name },
        },
      },
    }));
  }

  private async findOwned(userId: string, id: string) {
    const row = await this.prisma.record.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException("记录不存在");
    return row;
  }
}
```

- [ ] **Step 5: 编写 Controller / Module 并挂到 AppModule**

`server/src/records/records.controller.ts`：

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateRecordDto, QueryRecordDto, UpdateRecordDto } from "./dto/record.dto";
import { RecordsService } from "./records.service";

@UseGuards(JwtAuthGuard)
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRecordDto) {
    return this.records.list(user.userId, query);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.detail(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordDto) {
    return this.records.create(user.userId, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRecordDto) {
    return this.records.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.remove(user.userId, id);
  }

  @Post(":id/pin")
  togglePin(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.togglePin(user.userId, id);
  }
}
```

`server/src/records/records.module.ts`：

```ts
import { Module } from "@nestjs/common";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
```

`server/src/app.module.ts` 的 `imports` 改为 `[PrismaModule, AuthModule, RecordsModule]`（顶部加 `import { RecordsModule } from "./records/records.module";`）。

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test
```

Expected: auth.service.spec 4 例 + records.service.spec 9 例全部 PASS

- [ ] **Step 7: Commit**

```bash
git add server/src
git commit -m "feat(server): 记录 CRUD、置顶切换与标签管理"
```

---

### Task 6: e2e 全链路测试

**Files:**

- Create: `server/test/jest-e2e.json`、`server/test/app.e2e-spec.ts`、`server/test/records.e2e-spec.ts`

**Interfaces:**

- Consumes: 全部后端模块、`resetDatabase`（Task 4）
- Produces: e2e 验证契约——`npm run test:e2e` 全绿即代表后端满足 spec 的 API/错误处理/越权要求

- [ ] **Step 1: 编写 jest-e2e 配置**

`server/test/jest-e2e.json`：

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "setupFiles": ["./set-env.ts"],
  "globalSetup": "./global-setup.ts"
}
```

- [ ] **Step 2: 编写 e2e 测试**

`server/test/app.e2e-spec.ts`（应用级行为：统一响应、404、校验 400）：

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { TransformInterceptor } from "../src/common/interceptors/transform.interceptor";

describe("App (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /health 返回统一响应", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200);
    expect(res.body).toEqual({ code: 0, message: "ok", data: { status: "ok" } });
  });

  it("未知路由返回 404 统一格式", async () => {
    const res = await request(app.getHttpServer()).get("/not-exist").expect(404);
    expect(res.body.code).toBe(404);
    expect(res.body.data).toBeNull();
  });

  it("注册缺字段返回 400 字段级提示", async () => {
    const res = await request(app.getHttpServer()).post("/auth/register").send({ username: "ab" }).expect(400);
    expect(res.body.code).toBe(400);
    expect(res.body.message).toContain("用户名长度");
  });
});
```

`server/test/records.e2e-spec.ts`（业务全链路：注册→登录→CRUD→越权）：

```ts
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { TransformInterceptor } from "../src/common/interceptors/transform.interceptor";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("Records (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    tokenA = await registerAndGetToken("alice");
    tokenB = await registerAndGetToken("bob");
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndGetToken(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ username, password: "123456" })
      .expect(201);
    expect(res.body.code).toBe(0);
    return res.body.data.token;
  }

  function authed(token: string) {
    const server = app.getHttpServer();
    return {
      get: (url: string) => request(server).get(url).set("Authorization", `Bearer ${token}`),
      post: (url: string) => request(server).post(url).set("Authorization", `Bearer ${token}`),
      patch: (url: string) => request(server).patch(url).set("Authorization", `Bearer ${token}`),
      delete: (url: string) => request(server).delete(url).set("Authorization", `Bearer ${token}`),
    };
  }

  it("未带 token 访问 /records 返回 401", async () => {
    const res = await request(app.getHttpServer()).get("/records").expect(401);
    expect(res.body.code).toBe(401);
  });

  it("CRUD 全链路", async () => {
    const created = await authed(tokenA)
      .post("/records")
      .send({ title: "两数之和", content: "哈希表一遍遍历", tags: ["面试", "hash"] })
      .expect(201);
    expect(created.body.data.tags).toEqual(["面试", "hash"]);
    const id = created.body.data.id;

    const list = await authed(tokenA).get("/records").expect(200);
    expect(list.body.data.total).toBe(1);

    const keywordList = await authed(tokenA).get("/records?keyword=哈希").expect(200);
    expect(keywordList.body.data.total).toBe(1);

    const updated = await authed(tokenA).patch(`/records/${id}`).send({ content: "更新后的内容" }).expect(200);
    expect(updated.body.data.content).toBe("更新后的内容");

    const pinned = await authed(tokenA).post(`/records/${id}/pin`).expect(201);
    expect(pinned.body.data.isPinned).toBe(true);

    await authed(tokenA).delete(`/records/${id}`).expect(200);
    const afterDelete = await authed(tokenA).get("/records").expect(200);
    expect(afterDelete.body.data.total).toBe(0);
  });

  it("越权访问他人记录返回 404", async () => {
    const created = await authed(tokenA).post("/records").send({ title: "私密", content: "", tags: [] }).expect(201);
    const id = created.body.data.id;
    await authed(tokenB).get(`/records/${id}`).expect(404);
    await authed(tokenB).patch(`/records/${id}`).send({ title: "hack" }).expect(404);
    await authed(tokenB).delete(`/records/${id}`).expect(404);
  });
});
```

- [ ] **Step 3: 运行 e2e**

```bash
npm run test:e2e
```

Expected: app.e2e 3 例 + records.e2e 3 例全部 PASS

- [ ] **Step 4: Commit**

```bash
git add server/test
git commit -m "test(server): e2e 全链路测试"
```

---

### Task 7: Markdown 迁移脚本

**Files:**

- Create: `server/scripts/import-markdown.ts`、`server/scripts/fixtures/docs/interview/hash/1.两数之和.md`、`server/scripts/fixtures/docs/note.md`

**Interfaces:**

- Consumes: `User` 表（目标用户须已通过注册接口创建）、`Tag` 的 `userId_name` connectOrCreate（同 Task 5）
- Produces: 命令 `cd server && npm run import:md -- --dir <docs目录> --user <用户名>`；幂等（按 `(userId, title)` 判重）

- [ ] **Step 1: 编写测试 fixture**

`server/scripts/fixtures/docs/note.md`：

```markdown
# 根目录笔记

这是一条没有目录标签的笔记。
```

`server/scripts/fixtures/docs/interview/hash/1.两数之和.md`：

```markdown
# 1. 两数之和

## 题目描述

给定一个整数数组 nums 和一个整数目标值 target。

## 解题思路

哈希表一遍遍历。
```

- [ ] **Step 2: 编写迁移脚本**

`server/scripts/import-markdown.ts`：

```ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

interface Args {
  dir: string;
  user: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (key: string) => {
    const index = argv.indexOf(`--${key}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const dir = get("dir");
  const user = get("user");
  if (!dir || !user) {
    console.error("用法: npm run import:md -- --dir <docs目录> --user <用户名>");
    process.exit(1);
  }
  return { dir: path.resolve(dir), user };
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return (match ? match[1].trim() : path.basename(filename, ".md")).slice(0, 200);
}

async function main() {
  const { dir, user } = parseArgs();
  const prisma = new PrismaClient();
  const target = await prisma.user.findUnique({ where: { username: user } });
  if (!target) {
    console.error(`用户 ${user} 不存在，请先通过注册接口创建`);
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;
  for (const file of walk(dir)) {
    const content = fs.readFileSync(file, "utf-8");
    const title = extractTitle(content, file);
    const rel = path.relative(dir, path.dirname(file));
    const tags = rel ? rel.split(path.sep).filter(Boolean) : [];

    const exists = await prisma.record.findFirst({ where: { userId: target.id, title }, select: { id: true } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.record.create({
      data: {
        title,
        content,
        userId: target.id,
        tags: {
          create: tags.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { userId_name: { userId: target.id, name } },
                create: { userId: target.id, name },
              },
            },
          })),
        },
      },
    });
    imported++;
  }
  console.log(`完成：导入 ${imported} 条，跳过 ${skipped} 条（按标题判重）`);
  await prisma.$disconnect();
}

main();
```

- [ ] **Step 3: 用 fixture 验证脚本（含幂等）**

先确保有测试用户（用 curl 或已有账号）：

```bash
curl -X POST http://localhost:3100/auth/register -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"123456\"}"
cd server
npm run import:md -- --dir scripts/fixtures/docs --user admin
npm run import:md -- --dir scripts/fixtures/docs --user admin
docker exec pass-scroll-mysql mysql -uroot -ppass_scroll_dev -e "SELECT title FROM pass_scroll.Record; SELECT name FROM pass_scroll.Tag;"
```

Expected: 第一次输出 `导入 2 条，跳过 0 条`；第二次 `导入 0 条，跳过 2 条`；DB 中 `1. 两数之和` 带标签 `interview`、`hash`，`根目录笔记` 无标签

- [ ] **Step 4: Commit**

```bash
git add server/scripts
git commit -m "feat(server): VitePress markdown 迁移脚本"
```

---

### Task 8: 前端 request 封装 + env 修正 + api 层

**Files:**

- Create: `src/utils/request.ts`
- Modify: `src/api/auth.ts`（整体重写）、`src/api/record.ts`（空文件填充）、`.env.development:10`（VITE_APP_API_URL 改为 `http://localhost:3100`）
- Delete: `src/api/user.ts`（模板残留，引用的 `/api/v1/users/me` 在新后端不存在；profile 页在 Task 9 改为使用登录响应里的用户信息）

**Interfaces:**

- Consumes: 后端 `POST /auth/register|login`（Task 4）、`GET/POST/PATCH/DELETE /records*`（Task 5）
- Produces:

  - `request<T>(options: { url: string; method?: "GET"|"POST"|"PATCH"|"DELETE"|"PUT"; data?: Record<string, unknown>; auth?: boolean }): Promise<T>` — 成功 resolve `data`（已拆包）；业务错误/网络错误 toast 后 reject；401 清 token 跳登录页
  - `AuthAPI.login/register(username, password): Promise<{ token: string; user: { id: string; username: string } }>`
  - records api：`listRecords(query: RecordQuery): Promise<{ list: RecordItem[]; total: number }>`、`getRecord(id)`、`createRecord(form)`、`updateRecord(id, form)`、`deleteRecord(id)`、`togglePinRecord(id)`（Task 10 的 store 依赖这些签名）

- [ ] **Step 1: 编写 request.ts**

`src/utils/request.ts`：

```ts
/** 后端统一响应结构 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  data?: Record<string, unknown>;
  /** 是否携带 token，默认 true */
  auth?: boolean;
}

const BASE_URL = import.meta.env.VITE_APP_API_URL as string;

let redirecting = false;

function toLogin() {
  if (redirecting) return;
  redirecting = true;
  uni.removeStorageSync("token");
  uni.showToast({ title: "登录已过期，请重新登录", icon: "none" });
  setTimeout(() => {
    uni.navigateTo({
      url: "/pages/login/index",
      complete: () => {
        redirecting = false;
      },
    });
  }, 800);
}

export default function request<T = unknown>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { "Content-Type": "application/json" };
    if (options.auth !== false) {
      const token = uni.getStorageSync("token");
      if (token) header.Authorization = `Bearer ${token}`;
    }
    uni.request({
      url: BASE_URL + options.url,
      method: options.method || "GET",
      data: options.data,
      header,
      success: (res) => {
        const body = res.data as ApiResponse<T>;
        if (res.statusCode === 401) {
          toLogin();
          reject(body);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data);
          return;
        }
        uni.showToast({ title: body?.message || `请求失败(${res.statusCode})`, icon: "none" });
        reject(body);
      },
      fail: (err) => {
        uni.showToast({ title: "网络异常，请稍后重试", icon: "none" });
        reject(err);
      },
    });
  });
}
```

- [ ] **Step 2: 重写 api/auth.ts、填充 api/record.ts、删除 api/user.ts、修正 env**

`src/api/auth.ts`（整体替换，删除模板残留的 `LoginResult`/logout DELETE 接口——JWT 无状态，登出仅本地清 token）：

```ts
import request from "@/utils/request";

export interface AuthUserInfo {
  id: string;
  username: string;
}

export interface AuthResult {
  token: string;
  user: AuthUserInfo;
}

const AuthAPI = {
  login(username: string, password: string): Promise<AuthResult> {
    return request<AuthResult>({ url: "/auth/login", method: "POST", data: { username, password }, auth: false });
  },
  register(username: string, password: string): Promise<AuthResult> {
    return request<AuthResult>({ url: "/auth/register", method: "POST", data: { username, password }, auth: false });
  },
};

export default AuthAPI;
```

`src/api/record.ts`（当前为空文件，填入）：

```ts
import request from "@/utils/request";
import type { RecordForm, RecordItem, RecordQuery } from "@/types/record";

export interface RecordListResult {
  list: RecordItem[];
  total: number;
}

export function listRecords(query: RecordQuery): Promise<RecordListResult> {
  return request<RecordListResult>({ url: "/records", method: "GET", data: { ...query } });
}

export function getRecord(id: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}` });
}

export function createRecord(form: RecordForm): Promise<RecordItem> {
  return request<RecordItem>({
    url: "/records",
    method: "POST",
    data: { title: form.title, content: form.content, tags: form.tags },
  });
}

export function updateRecord(id: string, form: RecordForm): Promise<RecordItem> {
  return request<RecordItem>({
    url: `/records/${id}`,
    method: "PATCH",
    data: { title: form.title, content: form.content, tags: form.tags },
  });
}

export function deleteRecord(id: string): Promise<null> {
  return request<null>({ url: `/records/${id}`, method: "DELETE" });
}

export function togglePinRecord(id: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/pin`, method: "POST" });
}
```

删除 `src/api/user.ts`：`git rm src/api/user.ts`

`.env.development` 第 10 行改为（`https://api.moxun.cn` 是模板残留，本机联调指向本地后端）：

```
VITE_APP_API_URL = http://localhost:3100
```

- [ ] **Step 3: 类型检查验证**

```bash
npx vue-tsc --noEmit
```

Expected: 报错中不再有 `@/utils/request`、`@/api/user` 相关（`src/store/modules/user.ts` 引用旧 `AuthAPI.logout`/`UserAPI` 的报错会在 Task 9 消除，本任务允许暂时存在这两条）

- [ ] **Step 4: Commit**

```bash
git add src/utils/request.ts src/api .env.development
git commit -m "feat(api): 统一 request 封装与 auth/record 接口层"
```

---

### Task 9: user store 改造 + 登录/我的页面适配

**Files:**

- Modify: `src/store/modules/user.ts`（整体重写）、`src/pages/login/index.vue`（整体重写）、`src/pages/profile/index.vue`（用户信息展示与登出）

**Interfaces:**

- Consumes: `AuthAPI.login/register`（Task 8）
- Produces:

  - `useUserStore()`：`token: Ref<string>`、`userInfo: Ref<AuthUserInfo | null>`、`login(username, password)`、`register(username, password)`、`logout()`（同步，纯本地清除）
  - 登录页路径 `/pages/login/index`（pages.json 已注册，无需改路由）

- [ ] **Step 1: 重写 user store**

`src/store/modules/user.ts`（整体替换；token 存原始 JWT，不再拼 `Bearer ` 前缀——前缀由 request.ts 统一添加；删除对 `@/api/user` 的依赖）：

```ts
//  src/store/modules/user.ts
import { defineStore } from "pinia";
import AuthAPI, { AuthResult, AuthUserInfo } from "@/api/auth";

export const useUserStore = defineStore("user", () => {
  const token = ref<string>(uni.getStorageSync("token") || "");
  const userInfo = ref<AuthUserInfo | null>(null);

  const applyAuth = (result: AuthResult) => {
    token.value = result.token;
    userInfo.value = result.user;
    uni.setStorageSync("token", result.token);
  };

  // 登录
  const login = async (username: string, password: string) => {
    applyAuth(await AuthAPI.login(username, password));
  };

  // 注册（成功后直接视为登录）
  const register = async (username: string, password: string) => {
    applyAuth(await AuthAPI.register(username, password));
  };

  // 登出：JWT 无状态，仅本地清除
  const logout = () => {
    token.value = "";
    userInfo.value = null;
    uni.removeStorageSync("token");
  };

  return {
    token,
    userInfo,
    login,
    register,
    logout,
  };
});
```

- [ ] **Step 2: 重写登录页**

`src/pages/login/index.vue`（整体替换；支持登录/注册切换）：

```vue
<template>
  <view class="flex flex-col items-center p-40rpx">
    <text class="text-36rpx font-bold mt-60rpx mb-40rpx">{{ isLogin ? "登录" : "注册" }}</text>
    <input v-model="username" class="form-input" placeholder="请输入用户名（3-20位）" />
    <input v-model="password" class="form-input" placeholder="请输入密码（6-32位）" type="password" />
    <wd-button block custom-class="mt-40rpx" @click="handleSubmit">{{ isLogin ? "登录" : "注册并登录" }}</wd-button>
    <view class="mt-30rpx" @click="isLogin = !isLogin">
      <text class="text-26rpx text-blue-500">{{ isLogin ? "没有账号？去注册" : "已有账号？去登录" }}</text>
    </view>
  </view>
</template>

<script lang="ts" setup>
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();
const isLogin = ref(true);
const username = ref("");
const password = ref("");

const handleSubmit = async () => {
  if (!username.value || !password.value) {
    uni.showToast({ title: "请输入用户名和密码", icon: "none" });
    return;
  }
  try {
    if (isLogin.value) {
      await userStore.login(username.value, password.value);
    } else {
      await userStore.register(username.value, password.value);
    }
    uni.showToast({ title: "登录成功", icon: "success" });
    setTimeout(() => uni.switchTab({ url: "/pages/index/index" }), 800);
  } catch {
    // request.ts 已统一 toast 错误信息
  }
};
</script>

<style scoped>
.form-input {
  box-sizing: border-box;
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  margin-top: 24rpx;
  font-size: 28rpx;
  border: 1rpx solid #dcdfe6;
  border-radius: 12rpx;
}
</style>
```

- [ ] **Step 3: 改造我的页面**

`src/pages/profile/index.vue`（整体替换；`UserInfo` 只有 `username`，删除模板残留的 nickname/avatar/roles 展示；`logout` 已改为同步）：

```vue
<template>
  <view class="flex-center flex-col p-40rpx">
    <text class="text-blue font-bold text-lg mb-30rpx">我的</text>
    <template v-if="isLoggedIn">
      <text class="text-lg font-bold">{{ userInfo?.username }}</text>
      <button class="mt-5" @click="handleLogout">退出登录</button>
    </template>
    <template v-else>
      <text>您还未登录，请先登录</text>
      <button class="mt-5" @click="goToLoginPage">去登录</button>
    </template>
  </view>
</template>

<script lang="ts" setup>
import { useUserStore } from "@/store/modules/user";

const userStore = useUserStore();

const isLoggedIn = computed(() => !!userStore.token);
const userInfo = computed(() => userStore.userInfo);

const goToLoginPage = () => {
  uni.navigateTo({ url: "/pages/login/index" });
};

const handleLogout = () => {
  userStore.logout();
  uni.showToast({ title: "已退出登录", icon: "success" });
};
</script>
```

- [ ] **Step 4: 类型检查验证**

```bash
npx vue-tsc --noEmit
```

Expected: 无 `@/api/auth`、`@/api/user`、`AuthAPI.logout` 相关报错

- [ ] **Step 5: Commit**

```bash
git add src/store/modules/user.ts src/pages/login src/pages/profile
git commit -m "feat(pages): 登录注册页与用户信息对接真实后端"
```

---

### Task 10: record store API 化 + 类型收敛 + 入口初始化 + 首页守卫

**Files:**

- Modify: `src/store/record.ts`（整体重写）、`src/App.vue`（onLaunch 初始化 recordStore）、`src/pages/index/index.vue`（script 中加登录守卫）

**Interfaces:**

- Consumes: records api 函数（Task 8）、`useUserStore().token`（Task 9）
- Produces:

  - `useRecordStore()`：`records: Ref<RecordItem[]>`、`total: Ref<number>`、`loading: Ref<boolean>`、`keyword: Ref<string>`、`activeTag: Ref<string>`、`allTags: ComputedRef<string[]>`、`init()`、`fetchList()`、`addRecord(form)`、`editRecord(form)`、`removeRecord(id)`、`togglePin(id)`
  - 删除旧接口：`filteredRecords`、`getRecordById`、本地 `generateId`（id 由后端 cuid 生成）；**注意** `src/utils/storage.ts` 里的 `generateId` 也不再被引用，一并删除该函数（`formatTime`/`truncateText` 保留给后续列表 UI）

- [ ] **Step 1: 重写 record store**

`src/store/record.ts`（整体替换；类型统一从 `@/types/record` 导入，删除文件内重复定义）：

```ts
// src/store/record.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { RecordForm, RecordItem, RecordQuery } from "@/types/record";
import { createRecord, deleteRecord, listRecords, togglePinRecord, updateRecord } from "@/api/record";

const CACHE_KEY = "pass_scroll_records";

export const useRecordStore = defineStore("record", () => {
  const records = ref<RecordItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const keyword = ref("");
  const activeTag = ref("");

  const allTags = computed(() => {
    const tagSet = new Set<string>();
    records.value.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  });

  function persist() {
    uni.setStorageSync(CACHE_KEY, JSON.stringify(records.value));
  }

  /** 启动时先读缓存渲染，再由 fetchList 拉最新数据覆盖 */
  function init() {
    try {
      const cached = uni.getStorageSync(CACHE_KEY);
      if (cached) records.value = JSON.parse(cached);
    } catch (e) {
      console.error("读取本地存储失败", e);
    }
  }

  async function fetchList() {
    loading.value = true;
    try {
      const query: RecordQuery = { page: 1, pageSize: 50 };
      if (keyword.value) query.keyword = keyword.value;
      if (activeTag.value) query.tag = activeTag.value;
      const res = await listRecords(query);
      records.value = res.list;
      total.value = res.total;
      persist();
    } catch {
      // request.ts 已统一 toast；失败时保留缓存数据（离线只读）
    } finally {
      loading.value = false;
    }
  }

  async function addRecord(form: RecordForm) {
    await createRecord(form);
    await fetchList();
  }

  async function editRecord(form: RecordForm) {
    if (!form.id) return;
    await updateRecord(form.id, form);
    await fetchList();
  }

  async function removeRecord(id: string) {
    await deleteRecord(id);
    await fetchList();
  }

  async function togglePin(id: string) {
    await togglePinRecord(id);
    await fetchList();
  }

  return {
    records,
    total,
    loading,
    keyword,
    activeTag,
    allTags,
    init,
    fetchList,
    addRecord,
    editRecord,
    removeRecord,
    togglePin,
  };
});
```

同时修改 `src/utils/storage.ts`：删除 `generateId` 函数（第 1-4 行）。

- [ ] **Step 2: App.vue 启动时初始化缓存**

`src/App.vue` 整体替换为：

```vue
<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";

onLaunch(() => {
  const recordStore = useRecordStore();
  recordStore.init();
});
</script>
<style></style>
```

- [ ] **Step 3: 首页加登录守卫**

`src/pages/index/index.vue` 的 `<script setup lang="ts">` 替换为（模板部分保持现状不动，列表 UI 属后续迭代）：

```vue
<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import { useUserStore } from "@/store/modules/user";
import { useRecordStore } from "@/store/record";

const title = ref("UniApp 模板应用");
const userStore = useUserStore();
const recordStore = useRecordStore();

onShow(() => {
  if (!userStore.token) {
    uni.navigateTo({ url: "/pages/login/index" });
    return;
  }
  recordStore.fetchList();
});
</script>
```

- [ ] **Step 4: 类型检查 + lint 验证**

```bash
npx vue-tsc --noEmit
npm run lint:eslint
```

Expected: 无 `generateId`、`filteredRecords`、`getRecordById` 相关报错；eslint 无新增 error

- [ ] **Step 5: Commit**

```bash
git add src/store/record.ts src/utils/storage.ts src/App.vue src/pages/index/index.vue
git commit -m "refactor(store): record store 切换为 API + 本地只读缓存"
```

---

### Task 11: 全链路手动联调

**Files:**

- 无新增/修改（纯验证任务；发现问题回到对应任务修复）

**Interfaces:**

- Consumes: 全部前序任务
- Produces: 可演示的全链路：注册 → 登录 → 记录增删改查/置顶 → 离线缓存兜底

- [ ] **Step 1: 启动全部服务**

```bash
cd server && docker compose up -d && npm run start:dev
# 另开终端
cd .. && npm run dev:h5
```

- [ ] **Step 2: 走查 checklist（H5 浏览器 + DevTools Console）**

按顺序验证，每项不通过则回到对应任务修复：

1. 打开首页 → 未登录自动跳 `/pages/login/index`
2. 切到注册，注册 `admin/123456` → toast 登录成功，跳回首页，storage 有 `token`
3. DevTools Console 执行（验证 store 全链路）：

```js
const rs = (await import("/src/store/record.ts")).useRecordStore();
await rs.addRecord({ title: "联调记录", content: "hello", tags: ["test"] });
rs.records[0].title; // "联调记录"
await rs.togglePin(rs.records[0].id);
rs.records[0].isPinned; // true，且列表顺序置顶
await rs.editRecord({ id: rs.records[0].id, title: "改标题", content: "hello2", tags: ["test", "edit"] });
await rs.removeRecord(rs.records[0].id);
rs.records.length; // 0
```

4. 停掉后端（Ctrl+C），刷新页面 → 列表展示缓存数据，toast 网络异常
5. 重启后端，「我的」页退出登录 → storage token 清除，回首页再次跳登录
6. 用错误密码登录 → toast「用户名或密码错误」

- [ ] **Step 3: 跑全量后端测试收尾**

```bash
cd server && npm test && npm run test:e2e
```

Expected: 13 例单测/集成 + 6 例 e2e 全部 PASS

- [ ] **Step 4: Commit（如有联调修复）**

```bash
git add -p   # 逐个确认修复内容
git commit -m "fix(server): 联调问题修复"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §1 项目结构 → Task 1/2；§2 数据模型 → Task 2；§3 API → Task 3/4/5（路径前缀差异见 Global Constraints 第 1 条）；§4 前端改造 → Task 8/9/10；§5 错误处理 → Task 3/8；§6 测试 → Task 4/5/6；§7 迁移脚本 → Task 7
- **已知范围裁剪**（与 spec 一致，不属于缺漏）：首页记录列表 UI / RecordCard / EmptyState / detail / editor / settings 页面属下一迭代；本地 storage 旧记录迁移不处理
- **类型一致性**：`SerializedRecord`（Task 5）↔ `RecordItem`（src/types/record.d.ts）字段一一对应；`AuthUser`（Task 4）↔ request.user；前端 `AuthResult`（Task 8）↔ 后端 `buildAuthResult` 返回值
