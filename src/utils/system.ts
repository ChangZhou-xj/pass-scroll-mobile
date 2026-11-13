/**
 * 系统信息工具——目前只有状态栏占位高度，供无 NavBar 的页面与自定义导航栏共用（DESIGN spec §6）
 */

/** 缓存状态栏高度：每个页面/导航栏实例 setup 时都会调，小程序端 getSystemInfoSync 是同步桥调用 */
let cachedStatusBarPx: number | undefined;

/** 状态栏占位高度（px）。H5 无原生状态栏恒 0；App/MP 端 statusBarHeight 异常为 0 时兜底 20。
 * 条件编译只写赋值语句（不写 return），避免不可达分支（同 markdown.ts 的 isH5 写法）。 */
export function getStatusBarPx(): number {
  if (cachedStatusBarPx !== undefined) return cachedStatusBarPx;
  let px = 0;
  // #ifndef H5
  px = uni.getSystemInfoSync().statusBarHeight || 20;
  // #endif
  cachedStatusBarPx = px;
  return px;
}
