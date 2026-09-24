import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
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
      .send({ username, password: "abc12345" })
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
});
