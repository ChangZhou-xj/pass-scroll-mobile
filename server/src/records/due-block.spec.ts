/**
 * due-block.spec.ts——复习队列"主题分块"排序的单元测试
 *
 * 这条规则是产品体验的地基：同一标签的卡片必须连成一整块，
 * 不能 #游戏 和 #面试 交替出现（大脑反复换主题，学完拼不出整块知识）。
 * 改 orderByTagBlock / tagBlocks 时先跑 npm test 确认这些断言仍成立。
 */
import { orderByTagBlock, tagBlocks } from "./records.service";

/** 造一行够用的假数据（两个函数只关心 tags[0] 与 dueAt） */
const row = (tag: string | null, dueAt: Date | null) => ({ tags: tag ? [{ tag: { name: tag } }] : [], dueAt }) as never;

type Shaped = { tags: { tag: { name: string } }[]; dueAt: Date | null };

const seqOf = (rows: never[]) => (orderByTagBlock(rows) as unknown as Shaped[]).map((r) => r.tags[0]?.tag.name ?? "");
const dueOf = (rows: never[]) => (orderByTagBlock(rows) as unknown as Shaped[]).map((r) => r.dueAt?.getTime() ?? null);
const blocksOf = (rows: never[]) => tagBlocks(orderByTagBlock(rows));

const MINUTE = 60_000;
const DAY = 60 * 24 * MINUTE;
const NOW = new Date("2026-10-27T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** 断言某个标签在序列里是连号的（没有和别的主题交替出现） */
const expectContiguous = (seq: string[], tag: string) => {
  const idx = seq.map((t, i) => (t === tag ? i : -1)).filter((i) => i >= 0);
  expect(idx[idx.length - 1] - idx[0]).toBe(idx.length - 1);
};

describe("复习队列的主题分块", () => {
  it("同一标签连成一整块，不再交替出现", () => {
    // 入参按到期时间混排：游戏 → 面试 → 游戏 → 面试（正是要避免的形态）
    const mixed = [
      row("游戏", ago(3 * DAY)),
      row("面试", ago(2 * DAY)),
      row("游戏", ago(2 * DAY)),
      row("面试", ago(1 * DAY)),
    ];
    const seq = seqOf(mixed);
    expect(seq.length).toBe(4);
    expectContiguous(seq, "游戏");
    expectContiguous(seq, "面试");
  });

  it("块间顺序：最逾期的一块先学", () => {
    const rows = [row("面试", ago(1 * DAY)), row("游戏", ago(5 * DAY)), row("算法", ago(3 * DAY))];
    expect(blocksOf(rows).map((b) => b.tag)).toEqual(["游戏", "算法", "面试"]);
  });

  it("同样紧急时卡片多的块先（一次啃透一块）", () => {
    const rows = [
      row("面试", ago(1 * DAY)),
      row("算法", ago(1 * DAY)),
      row("算法", ago(1 * DAY)),
      row("算法", ago(1 * DAY)),
    ];
    expect(blocksOf(rows)).toEqual([
      { tag: "算法", count: 3 },
      { tag: "面试", count: 1 },
    ]);
  });

  it("块内保持到期优先：逾期久的在前", () => {
    const rows = [row("面试", ago(1 * DAY)), row("面试", ago(4 * DAY)), row("面试", ago(2 * DAY))];
    expect(dueOf(rows)).toEqual([ago(4 * DAY).getTime(), ago(2 * DAY).getTime(), ago(1 * DAY).getTime()]);
  });

  it("纯新卡（dueAt 为 null）的块排在最后", () => {
    const rows = [row("新专题", null), row("面试", ago(2 * DAY))];
    expect(blocksOf(rows).map((b) => b.tag)).toEqual(["面试", "新专题"]);
  });

  it("没打标签的卡片归到未分类块", () => {
    const rows = [row(null, ago(1 * DAY)), row("面试", ago(2 * DAY))];
    expect(blocksOf(rows)).toEqual([
      { tag: "面试", count: 1 },
      { tag: "", count: 1 },
    ]);
  });

  it("tagBlocks 把相邻同标签合并成一块，总数守恒", () => {
    const rows = [row("面试", ago(1 * DAY)), row("面试", null), row("游戏", ago(1 * DAY))];
    expect(tagBlocks(rows)).toEqual([
      { tag: "面试", count: 2 },
      { tag: "游戏", count: 1 },
    ]);
    expect(tagBlocks(rows).reduce((n, b) => n + b.count, 0)).toBe(rows.length);
  });

  it("空队列不炸", () => {
    expect(orderByTagBlock([])).toEqual([]);
    expect(tagBlocks([])).toEqual([]);
  });
});
