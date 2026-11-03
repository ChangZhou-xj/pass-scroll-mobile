// RecordsService 集成测试——直接调 service 打真实测试库（机制说明见 auth.service.spec.ts 头注）。
// 覆盖：CRUD、排序不变量、归属 404、版本快照留存/恢复、乐观锁 10409、掌握度状态机、stats 聚合。
import { Test } from "@nestjs/testing";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    expect(record.learnedAt).toBeNull();
  });

  it("迁移只回填已复习记录的 learnedAt", async () => {
    const reviewed = await service.create(userId, { title: "已复习", content: "", tags: [] });
    const fresh = await service.create(userId, { title: "未学习", content: "", tags: [] });
    const firstReviewedAt = new Date("2026-10-01T08:00:00.000Z");
    await prisma.record.update({
      where: { id: reviewed.id },
      data: { reviewCount: 1, firstReviewedAt, learnedAt: null },
    });

    // 直接执行真实迁移文件里的回填 SQL，避免测试一份与迁移不一致的副本
    const migration = readFileSync(
      join(__dirname, "../../prisma/migrations/20261103090000_add_record_learned_at/migration.sql"),
      "utf8",
    );
    const backfill = migration.match(/UPDATE `Record`[\s\S]*?;/)?.[0];
    expect(backfill).toBeDefined();
    await prisma.$executeRawUnsafe(backfill!);

    const reviewedRow = await prisma.record.findUniqueOrThrow({ where: { id: reviewed.id } });
    const freshRow = await prisma.record.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(reviewedRow.learnedAt).toEqual(firstReviewedAt);
    expect(freshRow.learnedAt).toBeNull();
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

  it("list 按 tag 过滤时按 sourceOrder 升序排（小册章节顺序），无序号的手写笔记排最后", async () => {
    // 故意按乱序创建，模拟爬虫导入时间与章节顺序无关
    const c3 = await service.create(userId, { title: "第三章", content: "", tags: ["小册"] });
    const c1 = await service.create(userId, { title: "第一章", content: "", tags: ["小册"] });
    const c2 = await service.create(userId, { title: "第二章", content: "", tags: ["小册"] });
    await service.create(userId, { title: "手写笔记", content: "", tags: ["小册"] });
    await prisma.record.update({ where: { id: c3.id }, data: { sourceOrder: 2 } });
    await prisma.record.update({ where: { id: c1.id }, data: { sourceOrder: 0 } });
    await prisma.record.update({ where: { id: c2.id }, data: { sourceOrder: 1 } });

    const { list } = await service.list(userId, { tag: "小册", page: 1, pageSize: 20 });

    expect(list.map((r) => r.title)).toEqual(["第一章", "第二章", "第三章", "手写笔记"]);
    expect(list[0].sourceOrder).toBe(0);
  });

  it("tag 过滤下置顶仍优先于章节顺序", async () => {
    const c1 = await service.create(userId, { title: "第一章", content: "", tags: ["小册"] });
    const c2 = await service.create(userId, { title: "第二章", content: "", tags: ["小册"] });
    await prisma.record.update({ where: { id: c1.id }, data: { sourceOrder: 0 } });
    await prisma.record.update({ where: { id: c2.id }, data: { sourceOrder: 1 } });
    await service.togglePin(userId, c2.id);

    const { list } = await service.list(userId, { tag: "小册", page: 1, pageSize: 20 });

    expect(list.map((r) => r.title)).toEqual(["第二章", "第一章"]);
  });

  it("不带 tag 时排序不变量不变：sourceOrder 不影响混合列表", async () => {
    const c1 = await service.create(userId, { title: "第一章", content: "", tags: ["小册"] });
    const c2 = await service.create(userId, { title: "第二章", content: "", tags: ["小册"] });
    await prisma.record.update({ where: { id: c1.id }, data: { sourceOrder: 0 } });
    await prisma.record.update({ where: { id: c2.id }, data: { sourceOrder: 1 } });

    const { list } = await service.list(userId, { page: 1, pageSize: 20 });

    // 混合列表仍按 updatedAt 倒序：后创建的"第二章"在前
    expect(list.map((r) => r.title)).toEqual(["第二章", "第一章"]);
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

  describe("首次学习", () => {
    it("按曲线首间隔排期且不改变复习与排序状态", async () => {
      const record = await service.create(userId, { title: "A", content: "正文", tags: [] });
      const learned = await service.learn(userId, record.id, { curve: { steps: [15, 1440] } });

      expect(learned.learnedAt).not.toBeNull();
      expect(learned.dueAt! - learned.learnedAt!).toBe(15 * 60_000);
      expect(learned.reviewCount).toBe(0);
      expect(learned.stage).toBe(0);
      expect(learned.mastery).toBe("NONE");
      expect(learned.updatedAt).toBe(record.updatedAt);
    });

    it("重复学习幂等，且已学习记录在配额用完后仍可返回", async () => {
      const first = await service.create(userId, { title: "A", content: "", tags: [] });
      const second = await service.create(userId, { title: "B", content: "", tags: [] });
      const learned = await service.learn(userId, first.id, { curve: { steps: [10], newPerDay: 1 } });

      const repeated = await service.learn(userId, first.id, { curve: { steps: [99], newPerDay: 1 } });
      expect(repeated.dueAt).toBe(learned.dueAt);
      expect(repeated.learnedAt).toBe(learned.learnedAt);

      await expect(service.learn(userId, second.id, { curve: { steps: [10], newPerDay: 1 } })).rejects.toMatchObject({
        businessCode: 10005,
      });
    });

    it("同一记录并发学习只接受首次写入，两个调用返回持久化后的同一调度", async () => {
      const record = await service.create(userId, { title: "A", content: "", tags: [] });

      const [first, second] = await Promise.all([
        service.learn(userId, record.id, { curve: { steps: [10] } }),
        service.learn(userId, record.id, { curve: { steps: [20] } }),
      ]);
      const persisted = await service.detail(userId, record.id);

      expect(second.learnedAt).toBe(first.learnedAt);
      expect(second.dueAt).toBe(first.dueAt);
      expect(persisted.learnedAt).toBe(first.learnedAt);
      expect(persisted.dueAt).toBe(first.dueAt);
      expect(first.reviewCount).toBe(0);
      expect(second.reviewCount).toBe(0);
      expect(persisted.reviewCount).toBe(0);
    });

    it("不能学习他人的记录", async () => {
      const otherId = await createOtherUser();
      const record = await service.create(userId, { title: "A", content: "", tags: [] });
      await expect(service.learn(otherId, record.id, {})).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("复习前置守卫", () => {
    it("未学习记录不能评分，完成学习后可以首次评分", async () => {
      const record = await service.create(userId, { title: "A", content: "", tags: [] });
      await expect(service.review(userId, record.id, { grade: "GOOD" })).rejects.toMatchObject({
        businessCode: 10006,
      });

      await service.learn(userId, record.id, { curve: { steps: [10] } });
      const reviewed = await service.review(userId, record.id, { grade: "GOOD", curve: { steps: [10, 1440] } });
      expect(reviewed.reviewCount).toBe(1);
      expect(reviewed.firstReviewedAt).not.toBeNull();
    });
  });

  describe("到期队列统一口径", () => {
    it("复习队列只含已学习且到期卡片，所有统计使用同一口径", async () => {
      const unlearned = await service.create(userId, { title: "未学习", content: "", tags: ["MySQL"] });
      const future = await service.create(userId, { title: "未到期", content: "", tags: ["MySQL"] });
      const fresh = await service.create(userId, { title: "首次到期", content: "", tags: ["MySQL"] });
      const old = await service.create(userId, { title: "旧卡到期", content: "", tags: ["MySQL"] });
      const now = new Date();
      const past = new Date(now.getTime() - 60_000);
      const later = new Date(now.getTime() + 60 * 60_000);

      await prisma.record.update({ where: { id: unlearned.id }, data: { dueAt: past } });
      await prisma.record.update({ where: { id: future.id }, data: { learnedAt: now, dueAt: later } });
      await prisma.record.update({ where: { id: fresh.id }, data: { learnedAt: now, dueAt: past } });
      await prisma.record.update({
        where: { id: old.id },
        data: { learnedAt: now, dueAt: past, reviewCount: 2, lastReviewedAt: now },
      });

      const due = await service.due(userId, { limit: 50 });
      expect(new Set(due.list.map((item) => item.id))).toEqual(new Set([fresh.id, old.id]));
      expect(due.dueCount).toBe(1);
      expect(due.freshCount).toBe(1);
      expect(due.nextDueAt).toBe(later.getTime());

      const tags = await service.dueTags(userId);
      expect(tags.find((item) => item.name === "MySQL")).toMatchObject({ due: 2, total: 4 });
      expect((await service.stats(userId)).dueCount).toBe(2);
    });

    it("宫殿巡游同样排除未学习卡片", async () => {
      const palace = await prisma.palace.create({ data: { userId, name: "回家路线", emoji: "🏠" } });
      const unlearned = await service.create(userId, { title: "未学习", content: "", tags: [] });
      const dueCard = await service.create(userId, { title: "已到期", content: "", tags: [] });
      const now = new Date();
      await prisma.record.update({
        where: { id: unlearned.id },
        data: { palaceId: palace.id, dueAt: new Date(now.getTime() - 60_000) },
      });
      await prisma.record.update({
        where: { id: dueCard.id },
        data: { palaceId: palace.id, learnedAt: now, dueAt: new Date(now.getTime() - 60_000) },
      });

      const result = await service.due(userId, { limit: 50, palaceId: palace.id });
      expect(result.list.map((item) => item.id)).toEqual([dueCard.id]);
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
