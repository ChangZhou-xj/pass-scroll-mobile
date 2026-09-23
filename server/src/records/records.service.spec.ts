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
