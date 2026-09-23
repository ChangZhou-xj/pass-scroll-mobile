import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
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
