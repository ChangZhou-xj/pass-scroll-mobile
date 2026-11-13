import { describe, expect, it } from "vitest";
import { computeWindow, prefixSum } from "./render-window";

/** 高度 100 × 4 的列表，前缀和 [0,100,200,300,400] */
const prefix = prefixSum([100, 100, 100, 100]);

describe("prefixSum", () => {
  it("前缀和首项为 0，长度比原数组多 1", () => {
    expect(prefix).toEqual([0, 100, 200, 300, 400]);
  });

  it("空数组返回 [0]", () => {
    expect(prefixSum([])).toEqual([0]);
  });
});

describe("computeWindow", () => {
  it("视口落在中间时只渲染相交的卡片", () => {
    // 视口 [150, 250)：卡1 [100,200)、卡2 [200,300) 相交
    expect(computeWindow(prefix, 150, 100, 0, 4)).toEqual({ start: 1, end: 3 });
  });

  it("buffer 向上下两侧扩展渲染范围", () => {
    expect(computeWindow(prefix, 150, 100, 150, 4)).toEqual({ start: 0, end: 4 });
  });

  it("视口在顶部时从头渲染", () => {
    expect(computeWindow(prefix, 0, 100, 0, 4)).toEqual({ start: 0, end: 2 });
  });

  it("滚动超出文档末尾时窗口为空且 start 不越界", () => {
    expect(computeWindow(prefix, 500, 100, 0, 4)).toEqual({ start: 4, end: 4 });
  });

  it("空列表返回空窗口", () => {
    expect(computeWindow([0], 100, 100, 0, 0)).toEqual({ start: 0, end: 0 });
  });

  it("total 截断前缀和（高度表比当前列表长时）", () => {
    expect(computeWindow(prefix, 0, 100, 0, 2)).toEqual({ start: 0, end: 2 });
  });

  it("非均匀高度按实际边界计算", () => {
    const p = prefixSum([80, 240, 60]);
    // 视口 [100, 200)：卡1 [80,320) 相交；卡0 [0,80) 不相交；卡2 [320,380) 不相交
    expect(computeWindow(p, 100, 100, 0, 3)).toEqual({ start: 1, end: 2 });
  });
});
