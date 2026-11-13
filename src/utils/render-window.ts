/**
 * 页级滚动虚拟列表的窗口计算（纯函数，供首页等长列表使用）。
 *
 * 思路：所有卡片高度实测后求前缀和，滚动时只渲染与「视口 ± buffer」相交的卡片，
 * 窗口外的卡片用等高占位 view 顶住——总文档高度不变，滚动位置不会跳。
 */

/** 高度数组的前缀和：prefix[i] = 第 i 张卡顶边到列表顶部的距离，长度 = heights.length + 1 */
export function prefixSum(heights: number[]): number[] {
  const prefix = new Array<number>(heights.length + 1);
  prefix[0] = 0;
  for (let i = 0; i < heights.length; i++) prefix[i + 1] = prefix[i] + heights[i];
  return prefix;
}

export interface RenderWindow {
  start: number;
  /** 渲染区间右开边界，与 Array.slice(start, end) 对齐 */
  end: number;
}

/**
 * 计算需要渲染的卡片区间 [start, end)。
 * @param prefix  prefixSum 的结果
 * @param scrollTop 页面滚动位置（px）
 * @param viewHeight 视口高度（px）
 * @param buffer 视口上下各多渲染的像素余量（防快速滑动露白）
 * @param total 卡片总数（高度表可能比当前列表长，用 total 截断）
 */
export function computeWindow(
  prefix: number[],
  scrollTop: number,
  viewHeight: number,
  buffer: number,
  total: number,
): RenderWindow {
  if (total <= 0 || prefix.length <= 1) return { start: 0, end: 0 };
  const top = scrollTop - buffer;
  const bottom = scrollTop + Math.max(0, viewHeight) + buffer;

  // start：第一个「底边 > top」的卡片（二分找 prefix[i+1] > top 的最小 i）
  let lo = 0;
  let hi = total - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid + 1] > top) hi = mid;
    else lo = mid + 1;
  }
  const start = prefix[lo + 1] > top ? lo : total;

  // end：第一个「顶边 > bottom」的卡片下标（exclusive）。边界用 >：与视口底边相切的卡片仍渲染
  lo = 0;
  hi = total;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prefix[mid] > bottom) hi = mid;
    else lo = mid + 1;
  }
  const end = lo;

  return { start: Math.min(start, end), end };
}
