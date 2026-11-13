/**
 * Tab 页保活导航——用页面栈内的 navigateBack / navigateTo 替代 reLaunch。
 *
 * 背景：三个 tab 页（index/review/profile）此前互相切换用 uni.reLaunch，每次都是
 * 整页冷启动（销毁全部页面实例 + 重建目标页 + onShow 全量重拉）。改为栈内跳转后，
 * 目标页复用既有实例（不冷启动、滚动与筛选状态保留），onShow 照常触发刷新。
 *
 * 为什么不用原生 tabBar + switchTab：
 *   - 现有自定义 tabbar（wd-icon + 设计色）无法用 pages.json 配置复刻，图标必须换 PNG；
 *   - switchTab 不支持 URL 传参（?tag= / ?palace=），一样要 store 换手；
 *   - tabBar.custom 仅微信小程序支持，H5 会出现双 tabbar。
 * 本方案在各端行为一致，性能收益与 switchTab 相同。
 */
import { ref } from "vue";

/** 当前高亮的 tab 页路径；CustomTabBar 渲染用，tab 页 onShow 时同步 */
export const activeTabPath = ref("");

/** uni-app 页面栈上限 10，接近时改用 reLaunch 清栈兜底 */
const MAX_STACK = 9;

/** 把栈顶页面路径同步到高亮态（tab 页 onShow / 深链直达时调用） */
export function syncActiveTab(): void {
  const pages = getCurrentPages();
  activeTabPath.value = pages.length ? String(pages[pages.length - 1].route ?? "") : "";
}

/**
 * 切到某个 tab 页：
 *   - 目标已在栈中且不在栈顶 → navigateBack 保活返回（栈顶到目标的距离即 delta）；
 *   - 目标就是栈顶 → 不动，仅同步高亮；
 *   - 不在栈中 → navigateTo 新开（可带 URL 参数）；
 *   - 栈深接近上限 → reLaunch 清栈兜底。
 */
export function goToTab(path: string): void {
  const pages = getCurrentPages();
  const index = pages.findIndex((page) => String(page.route ?? "") === path);
  if (index === pages.length - 1) {
    activeTabPath.value = path;
    return;
  }
  if (index >= 0) {
    activeTabPath.value = path;
    uni.navigateBack({ delta: pages.length - 1 - index });
    return;
  }
  if (pages.length >= MAX_STACK) {
    uni.reLaunch({ url: `/${path}` });
    activeTabPath.value = path;
    return;
  }
  uni.navigateTo({ url: `/${path}` });
  activeTabPath.value = path;
}
