/**
 * 阅读位置保持——详情预览、编辑页编辑态、编辑页预览态三个视图共用一条按 recordId 索引的位置记录。
 *
 * 设计（见 docs/superpowers/specs/2026-11-13-read-position-restore-design.md）：
 *   1. progress（0~1 页面滚动比例）是唯一必须记录的字段，任何视图切换都靠它；
 *   2. anchor（可见分段索引 + 段内比例）只在「预览态 → 预览态」之间记录并生效，
 *      用于把位置精确对齐到同一个 markdown 分段；条件不满足时静默退回 progress；
 *   3. 记录放内存表（带 TTL），不落 storage、不同步后端：页面栈内的连续切换已经够用；
 *   4. 还原必须重试——textarea 的 auto-height、markdown 块、图片高度都是异步确定的。
 *
 * 消费方：详情页（预览）、编辑页（编辑态 / 预览态）。
 */

/** 位置记忆有效期：超过视为没有记忆（冷启动重进详情页本就应该从顶部读） */
const TTL = 30 * 60 * 1000;

/** 还原重试节奏：每次重试都重新测量，覆盖异步布局变化 */
const RETRY_DELAYS = [0, 80, 240];

/** 默认「视口顶端」偏移；顶部有 sticky 栏（如编辑页的编辑/预览切换条）时由调用方通过 topInset 传入栏高 */
const VISIBLE_TOP = 0;

/**
 * 临时排查开关：默认关闭，正常运行零输出。
 * 只在「切模式 / 离开页面」时打点，滚动路径不再打日志。
 * 定位完问题请删除本段与所有 debugLog 调用（项目规范禁止遗留 console.log）。
 */
const DEBUG = false;

export function debugLog(label: string, data: Record<string, unknown>): void {
  if (!DEBUG) return;
  console.log(`[read-position] ${label}`, JSON.stringify(data));
}

/** 预览态记录的块锚点：当前占据视口顶部的分段 + 段内已滚过的比例 */
export interface ReadAnchor {
  seg: number;
  ratio: number;
}

export interface ReadPosition {
  /** 页面滚动比例 0~1 */
  progress: number;
  /** 记录时的记录版本号；正文变了锚点即失效 */
  version?: number;
  /** 仅预览态记录 */
  anchor?: ReadAnchor;
  /** 记录时刻，TTL 用 */
  at: number;
}

export interface MeasureOptions {
  /** 当前是否预览态：只有预览态才记录锚点 */
  preview?: boolean;
  /** 记录版本号（锚点校验用） */
  version?: number;
  /** 底部被固定栏遮挡的高度（px），参与「可视高度」计算 */
  viewInset?: number;
  /** 顶部被 sticky 栏遮挡的高度（px），作为锚点的「视口顶端」基准，记录与还原必须一致 */
  topInset?: number;
}

export interface RestoreOptions extends MeasureOptions {
  /** 读取当前页面 scrollTop；缺省则跳过锚点、只用 progress 还原 */
  getScrollTop?: () => number;
}

const positions = new Map<string, ReadPosition>();

/** 存位置（自动补时间戳）；key 用 recordId */
export function savePosition(key: string, pos: Omit<ReadPosition, "at">): void {
  positions.set(key, { ...pos, progress: clamp01(pos.progress), at: Date.now() });
}

/** 读位置；过期即删 */
export function readPosition(key: string): ReadPosition | undefined {
  const hit = positions.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL) {
    positions.delete(key);
    return undefined;
  }
  return hit;
}

/** 清位置：删除记录、退出登录等场景 */
export function clearPosition(key: string): void {
  positions.delete(key);
}

/* ── 纯计算部分（可单测，不触碰 DOM） ── */

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 1);
}

/** 滚动位置 → 进度；内容不满一屏（max <= 0）返回 undefined，进度无意义 */
export function calcProgress(scrollTop: number, contentHeight: number, viewHeight: number): number | undefined {
  const max = contentHeight - viewHeight;
  if (!Number.isFinite(max) || max <= 0) return undefined;
  return clamp01((scrollTop || 0) / max);
}

/** 进度 → 目标滚动位置；内容不满一屏返回 undefined */
export function progressToScrollTop(progress: number, contentHeight: number, viewHeight: number): number | undefined {
  const max = contentHeight - viewHeight;
  if (!Number.isFinite(max) || max <= 0) return undefined;
  return Math.max(0, Math.round(clamp01(progress) * max));
}

/**
 * 用缓存的文档高度换算进度（不查 DOM）：滚动过程中/离开页面时可以零成本落库。
 * 文档高度由调用方在内容渲染完成后量一次缓存下来。
 */
export function progressFromScrollTop(scrollTop: number, contentHeight: number, viewInset = 0): number | undefined {
  return calcProgress(scrollTop, contentHeight, getViewHeight() - viewInset);
}

/** 分段顶部相对视口的位置 → 段内已滚过的比例 */
export function calcAnchorRatio(segTop: number, segHeight: number, visibleTop = VISIBLE_TOP): number {
  if (!Number.isFinite(segHeight) || segHeight <= 0) return 0;
  return clamp01((visibleTop - segTop) / segHeight);
}

/** 由「当前 scrollTop + 分段在视口里的位置」算出把该段按 ratio 对齐到视口顶部的绝对 scrollTop */
export function anchorToScrollTop(
  scrollTop: number,
  segTop: number,
  segHeight: number,
  ratio: number,
  visibleTop = VISIBLE_TOP,
): number {
  const offset = visibleTop - clamp01(ratio) * Math.max(0, segHeight);
  return Math.max(0, Math.round((scrollTop || 0) + segTop - offset));
}

/* ── 端上测量与还原 ── */

interface RectInfo {
  top: number;
  height: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 视口高度在进程内不变，缓存起来：还原链路一次最多重试 3 轮，
 * 每轮都同步调 getSystemInfoSync 在小程序端是跨线程桥调用。
 */
let cachedViewHeight = 0;
let resizeHooked = false;

function getViewHeight(): number {
  if (!cachedViewHeight) {
    cachedViewHeight = uni.getSystemInfoSync().windowHeight || 0;
    // 横竖屏切换会改变 windowHeight，注册一次监听把缓存打回初始态
    if (!resizeHooked && typeof uni.onWindowResize === "function") {
      resizeHooked = true;
      uni.onWindowResize(() => {
        cachedViewHeight = 0;
      });
    }
  }
  return cachedViewHeight;
}

/** 页面不可见时 selectorQuery 回调可能永远不触发，超时兜底避免整条链路卡死 */
const QUERY_TIMEOUT = 200;

function queryWithTimeout<T>(exec: (done: (value: T) => void) => void, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(fallback), QUERY_TIMEOUT);
    function finish(value: T): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
    exec(finish);
  });
}

function queryRect(selector: string): Promise<RectInfo | null> {
  return queryWithTimeout<RectInfo | null>((done) => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((res) => {
        const rect = res as unknown as RectInfo | null;
        done(rect && rect.height > 0 ? rect : null);
      })
      .exec();
  }, null);
}

/** 只量文档高度（不取锚点）：渲染完成后量一次缓存，之后换算进度就不再碰 DOM */
export async function queryContentHeight(rootId: string): Promise<number | undefined> {
  const rect = await queryRect(`#${rootId}`);
  return rect?.height;
}

function queryRects(selector: string): Promise<RectInfo[]> {
  return queryWithTimeout<RectInfo[]>((done) => {
    uni
      .createSelectorQuery()
      .selectAll(selector)
      .boundingClientRect((res) => {
        const rects = res as unknown as RectInfo[] | null;
        // 不按高度过滤：锚点索引必须与 v-for 的 index 严格对齐
        done(Array.isArray(rects) ? rects.filter((r): r is RectInfo => Boolean(r)) : []);
      })
      .exec();
  }, []);
}

/** 读取页面真实 scrollTop：页面显示/隐藏切换后，页面内缓存的变量可能已过期 */
export function queryScrollTop(): Promise<number | undefined> {
  return queryWithTimeout<number | undefined>((done) => {
    uni
      .createSelectorQuery()
      .selectViewport()
      .scrollOffset((res) => {
        const info = res as unknown as { scrollTop?: number } | null;
        done(info && typeof info.scrollTop === "number" ? info.scrollTop : undefined);
      })
      .exec();
  }, undefined);
}

/** 记录当前位置；测不到有效高度（页面不可见 / 内容不满一屏）返回 undefined */
export async function measurePosition(
  rootId: string,
  fallbackScrollTop = 0,
  opts: MeasureOptions = {},
): Promise<ReadPosition | undefined> {
  const rect = await queryRect(`#${rootId}`);
  if (!rect) {
    debugLog("measure:no-rect", { rootId });
    return undefined;
  }
  // scrollTop 以 selectorQuery 实测为准：onPageScroll 的缓存值在切视图/切端时可能滞后或漏帧
  const scrollTop = (await queryScrollTop()) ?? fallbackScrollTop;
  const viewHeight = getViewHeight() - (opts.viewInset ?? 0);
  const progress = calcProgress(scrollTop, rect.height, viewHeight);
  debugLog("measure", { rootId, scrollTop, fallbackScrollTop, height: rect.height, viewHeight, progress });
  if (progress === undefined) return undefined;

  const pos: ReadPosition = { progress, at: Date.now() };
  if (opts.version !== undefined) pos.version = opts.version;
  if (opts.preview) {
    const anchor = await measureAnchor(rootId, opts.topInset ?? VISIBLE_TOP);
    if (anchor) pos.anchor = anchor;
  }
  return pos;
}

/**
 * 当前占据视口顶部的分段：倒序找最后一个「顶部已越过视口顶端」的段。
 * 没有任何分段越过视口顶端（还在标题区）时返回 undefined——此时用 progress 更准，
 * 否则会把首段顶到屏幕顶部，反而跳过标题和标签。
 */
async function measureAnchor(rootId: string, visibleTop = VISIBLE_TOP): Promise<ReadAnchor | undefined> {
  const rects = await queryRects(`#${rootId} .md-seg`);
  if (!rects.length) return undefined;
  for (let i = rects.length - 1; i >= 0; i--) {
    const rect = rects[i];
    if (rect.height <= 0) continue;
    if (rect.top <= visibleTop) {
      return { seg: i, ratio: calcAnchorRatio(rect.top, rect.height, visibleTop) };
    }
  }
  return undefined;
}

/** 锚点是否可用于本次还原：目标必须是预览态、版本一致、且记录时确实采到了锚点 */
function resolveAnchor(pos: ReadPosition, opts: RestoreOptions): ReadAnchor | undefined {
  if (!opts.preview || !pos.anchor) return undefined;
  if (pos.version === undefined || opts.version === undefined || pos.version !== opts.version) return undefined;
  return pos.anchor;
}

/** 按锚点滚动；分段取不到（索引越界 / 高度为 0）返回 undefined 让调用方退回 progress */
async function scrollToAnchor(
  rootId: string,
  anchor: ReadAnchor,
  reference: number,
  visibleTop = VISIBLE_TOP,
): Promise<number | undefined> {
  const rects = await queryRects(`#${rootId} .md-seg`);
  if (!rects.length) return undefined;
  const seg = rects[Math.min(Math.max(anchor.seg, 0), rects.length - 1)];
  if (!seg || seg.height <= 0) return undefined;
  const target = anchorToScrollTop(reference, seg.top, seg.height, anchor.ratio, visibleTop);
  uni.pageScrollTo({ scrollTop: target, duration: 0 });
  return target;
}

/** 只按比例还原（一期路径，也是锚点不可用时的兜底） */
export async function restoreProgress(rootId: string, progress: number, opts: MeasureOptions = {}): Promise<void> {
  for (const delay of RETRY_DELAYS) {
    if (delay) await sleep(delay);
    const rect = await queryRect(`#${rootId}`);
    if (!rect) continue;
    const target = progressToScrollTop(progress, rect.height, getViewHeight() - (opts.viewInset ?? 0));
    if (target === undefined) continue;
    uni.pageScrollTo({ scrollTop: target, duration: 0 });
  }
}

/**
 * 统一还原入口：锚点可用且成功则逐次对齐到同一分段，否则退回比例还原。
 * duration 必须为 0——动画滚动会和 nextTick 后的渲染竞争。
 */
export async function restorePosition(rootId: string, pos: ReadPosition, opts: RestoreOptions = {}): Promise<void> {
  const anchor = resolveAnchor(pos, opts);

  for (const delay of RETRY_DELAYS) {
    if (delay) await sleep(delay);
    if (anchor) {
      // 每次重试都重新读真实 scrollTop 与分段位置：页面显示切换后页面内缓存的 scrollTop 可能过期，
      // 折叠容器展开、图片加载也会改变分段高度
      const reference = (await queryScrollTop()) ?? opts.getScrollTop?.();
      if (reference !== undefined) {
        const landed = await scrollToAnchor(rootId, anchor, reference, opts.topInset ?? VISIBLE_TOP);
        if (landed !== undefined) continue;
      }
    }
    const rect = await queryRect(`#${rootId}`);
    if (!rect) {
      debugLog("restore:no-rect", { attempt: delay });
      continue;
    }
    const target = progressToScrollTop(pos.progress, rect.height, getViewHeight() - (opts.viewInset ?? 0));
    debugLog("restore", { attempt: delay, progress: pos.progress, height: rect.height, target });
    if (target === undefined) continue;
    uni.pageScrollTo({ scrollTop: target, duration: 0 });
    void queryScrollTop().then((actual) => debugLog("restore:after", { attempt: delay, target, actual }));
  }
}
