import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anchorToScrollTop,
  calcAnchorRatio,
  calcProgress,
  clearPosition,
  progressToScrollTop,
  readPosition,
  savePosition,
} from "./read-position";

describe("calcProgress / progressToScrollTop", () => {
  it("按内容高度与视口高度换算比例", () => {
    expect(calcProgress(500, 2000, 1000)).toBeCloseTo(0.5);
    expect(progressToScrollTop(0.5, 2000, 1000)).toBe(500);
  });

  it("越界时截断到 0~1", () => {
    expect(calcProgress(-100, 2000, 1000)).toBe(0);
    expect(calcProgress(99999, 2000, 1000)).toBe(1);
    expect(progressToScrollTop(2, 2000, 1000)).toBe(1000);
  });

  it("内容不满一屏时进度无意义，返回 undefined", () => {
    expect(calcProgress(100, 800, 1000)).toBeUndefined();
    expect(progressToScrollTop(0.5, 800, 1000)).toBeUndefined();
    expect(calcProgress(100, 1000, 1000)).toBeUndefined();
  });

  it("滚动位置与进度可往返", () => {
    const progress = calcProgress(320, 3000, 1000);
    expect(progress).toBeCloseTo(0.16);
    expect(progressToScrollTop(progress as number, 3000, 1000)).toBe(320);
  });
});

describe("calcAnchorRatio / anchorToScrollTop", () => {
  it("段首贴顶比例为 0，滚过一半为 0.5", () => {
    expect(calcAnchorRatio(0, 400)).toBe(0);
    expect(calcAnchorRatio(-200, 400)).toBeCloseTo(0.5);
    expect(calcAnchorRatio(-400, 400)).toBe(1);
  });

  it("段高非法时比例兜底为 0", () => {
    expect(calcAnchorRatio(-100, 0)).toBe(0);
    expect(calcAnchorRatio(-100, Number.NaN)).toBe(0);
  });

  it("段首对齐视口顶部时按当前 scrollTop 与段偏移换算", () => {
    // 视口里段首在 200 处，想让段首贴顶：需要再滚 200
    expect(anchorToScrollTop(500, 200, 400, 0)).toBe(700);
    // 段内已滚过一半：段首要落到视口上方 200 处，即再滚 400
    expect(anchorToScrollTop(500, 200, 400, 0.5)).toBe(900);
  });

  it("段已在视口上方时向上回滚", () => {
    expect(anchorToScrollTop(500, -300, 400, 0)).toBe(200);
    // 不允许滚到负数
    expect(anchorToScrollTop(100, -300, 400, 0)).toBe(0);
  });

  it("顶部有 sticky 栏时按栏高换算（记录与还原对称）", () => {
    const topInset = 60;
    // 段首在视口 50px 处、栏高 60px：段首进入栏下 10px，比例为 0.025
    expect(calcAnchorRatio(50, 400, topInset)).toBeCloseTo(0.025);
    // 还原后段首应落在栏下方：目标 = 500 + 50 - (60 - 0.025*400) = 500
    expect(anchorToScrollTop(500, 50, 400, calcAnchorRatio(50, 400, topInset), topInset)).toBe(500);
  });
});

describe("位置表", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearPosition("r1");
  });

  it("存取时补时间戳并截断进度", () => {
    savePosition("r1", { progress: 1.6 });
    const pos = readPosition("r1");
    expect(pos?.progress).toBe(1);
    expect(typeof pos?.at).toBe("number");
  });

  it("超过 TTL 后视为无记忆", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T10:00:00Z"));
    savePosition("r1", { progress: 0.3 });

    vi.setSystemTime(new Date("2026-11-13T10:20:00Z"));
    expect(readPosition("r1")?.progress).toBeCloseTo(0.3);

    vi.setSystemTime(new Date("2026-11-13T10:40:00Z"));
    expect(readPosition("r1")).toBeUndefined();
  });

  it("clearPosition 后读不到", () => {
    savePosition("r1", { progress: 0.3 });
    clearPosition("r1");
    expect(readPosition("r1")).toBeUndefined();
  });
});
