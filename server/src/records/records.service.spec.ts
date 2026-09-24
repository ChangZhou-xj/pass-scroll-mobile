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
    expect(record).toMatchObject({
      title: "第一条",
      content: "内容",
      isPinned: false,
      tags: ["面试", "hash"],
      version: 1,
      mastery: "NONE",
    });
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
});
