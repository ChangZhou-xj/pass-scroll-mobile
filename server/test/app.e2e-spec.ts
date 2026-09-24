import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";
import { TransformInterceptor } from "../src/common/interceptors/transform.interceptor";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./reset-db";

describe("App (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  it("修改密码全链路：改密 201 → 旧密码登录 401 → 新密码登录成功", async () => {
    const registered = await request(app.getHttpServer())
      .post("/auth/register")
      .send({ username: "alice", password: "abc12345" })
      .expect(201);
    const token = registered.body.data.token;

    const changed = await request(app.getHttpServer())
      .post("/auth/password")
      .set("Authorization", `Bearer ${token}`)
      .send({ oldPassword: "abc12345", newPassword: "new12345" })
      .expect(201);
    expect(changed.body.code).toBe(0);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "alice", password: "abc12345" })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ username: "alice", password: "new12345" })
      .expect(201);
    expect(login.body.code).toBe(0);
    expect(login.body.data.token).toBeTruthy();
  });
});
