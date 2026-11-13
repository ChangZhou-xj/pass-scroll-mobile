/**
 * 笔记 store（Pinia）——笔记列表的前端单一数据源
 *
 * 职责：
 *   - records/total：列表数据（首页/复习页/详情页共享，改一处全联动）
 *   - keyword/activeTag：首页搜索与标签筛选条件（fetchList 会带上）
 *   - 本地缓存策略：init 先读 storage 缓存（离线可看、冷启动秒开），
 *     fetchList 成功后覆盖并回写缓存；失败保留缓存（request.ts 已 toast）
 *   - 所有变更动作（增删改/置顶/掌握度）成功后都重新 fetchList 保持视图一致
 *
 * 注意：本项目 setup store 的 state 在页面侧类型层不解包（既有基线），
 * 页面通过 RecordStoreProxy 的 unknown 转换消费（见各页面顶部注释）。
 */
// src/store/record.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { CurveConfig, Mastery, RecordForm, RecordItem, RecordQuery } from "@/types/record";
import {
  createRecord,
  deleteRecord,
  getStats,
  learnRecord as learnRecordRequest,
  listRecords,
  togglePinRecord,
  updateMastery,
  updateRecord,
} from "@/api/record";

const CACHE_KEY = "pass_scroll_records";

/** 列表分页大小（后端 DTO 封顶 100） */
const PAGE_SIZE = 20;

export const useRecordStore = defineStore("record", () => {
  const records = ref<RecordItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const keyword = ref("");
  const activeTag = ref("");
  /** 已加载到第几页（fetchList 恒重置为 1） */
  const page = ref(1);
  const loadingMore = ref(false);
  /** 已掌握总数（服务端口径）：分页后本地只有已加载页，计数必须来自 /records/stats */
  const masteredTotal = ref<number | null>(null);

  /** 是否还有下一页可加载 */
  const hasMore = computed(() => records.value.length < total.value);

  const allTags = computed(() => {
    const tagSet = new Set<string>();
    records.value.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  });

  const getRecordById = computed(() => (id: string) => records.value.find((r) => r.id === id));

  /**
   * 缓存回写走异步 uni.setStorage：列表含 50 篇正文，同步写盘会与首屏渲染抢同一帧。
   * 缓存只用于冷启动/离线兜底，异步失败不影响内存数据（下次 fetchList 会再写一次）。
   */
  function persist() {
    try {
      uni.setStorage({ key: CACHE_KEY, data: JSON.stringify(records.value) });
    } catch (e) {
      console.error("写入本地存储失败", e);
    }
  }

  /** 启动时先读缓存渲染，再由 fetchList 拉最新数据覆盖 */
  function init() {
    try {
      const cached = uni.getStorageSync(CACHE_KEY);
      if (cached) {
        // 归一化旧版缓存：补齐新增字段，避免徽章误报与首次保存跳过乐观锁
        // （记忆卡片字段同理：旧缓存没有 stage/dueAt，不补会让复习页读到 undefined）
        const parsed = JSON.parse(cached) as Partial<RecordItem>[];
        records.value = parsed.map((item) => ({
          ...item,
          mastery: item.mastery ?? "NONE",
          version: item.version ?? 1,
          sourceOrder: item.sourceOrder ?? null,
          stage: item.stage ?? 0,
          ease: item.ease ?? 2.5,
          lapses: item.lapses ?? 0,
          reviewCount: item.reviewCount ?? 0,
          // 旧缓存没有 learnedAt：有复习痕迹（reviewCount/firstReviewedAt）说明已学习，用最早的时间兜底
          learnedAt:
            item.learnedAt ??
            (item.reviewCount || item.firstReviewedAt ? (item.firstReviewedAt ?? item.createdAt ?? null) : null),
          dueAt: item.dueAt ?? null,
          lastReviewedAt: item.lastReviewedAt ?? null,
          firstReviewedAt: item.firstReviewedAt ?? null,
          palaceId: item.palaceId ?? null,
          palaceOrder: item.palaceOrder ?? 0,
        })) as RecordItem[];
      }
    } catch (e) {
      console.error("读取本地存储失败", e);
    }
  }

  /** 列表请求序号：快速切换筛选/连点置顶时，先发的旧响应不得覆盖后发的新结果 */
  let fetchSeq = 0;

  function buildQuery(targetPage: number): RecordQuery {
    const query: RecordQuery = { page: targetPage, pageSize: PAGE_SIZE };
    if (keyword.value) query.keyword = keyword.value;
    if (activeTag.value) query.tag = activeTag.value;
    return query;
  }

  /** 重置到第 1 页（进入页面 / 下拉刷新 / 搜索 / 切标签 / 任何增删改后） */
  async function fetchList() {
    const seq = ++fetchSeq;
    loading.value = true;
    try {
      const res = await listRecords(buildQuery(1));
      if (seq !== fetchSeq) return; // 已有更新的请求在飞，丢弃本次结果
      records.value = res.list;
      total.value = res.total;
      page.value = 1;
      persist();
    } catch {
      // request.ts 已统一 toast；失败时保留缓存数据（离线只读）
    } finally {
      if (seq === fetchSeq) loading.value = false;
    }
  }

  /** 加载下一页并追加（首页 onReachBottom）；期间发生 fetchList 则丢弃结果 */
  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return;
    const seq = fetchSeq;
    loadingMore.value = true;
    try {
      const res = await listRecords(buildQuery(page.value + 1));
      if (seq !== fetchSeq) return; // 期间发生了筛选/重置，过期分页直接丢弃
      records.value = [...records.value, ...res.list];
      total.value = res.total;
      page.value += 1;
      persist();
    } catch {
      // request.ts 已统一 toast；失败保留当前列表，下次触底重试
    } finally {
      loadingMore.value = false;
    }
  }

  /** 服务端统计（首页 hero 的「已掌握 x/y」口径）；失败保留上次值 */
  async function fetchStats() {
    try {
      const stats = await getStats();
      masteredTotal.value = stats.mastery.mastered;
    } catch {
      // request.ts 已统一 toast
    }
  }

  async function addRecord(form: RecordForm) {
    await createRecord(form);
    await fetchList();
  }

  async function editRecord(form: RecordForm) {
    if (!form.id) return;
    await updateRecord(form.id, form);
    await fetchList();
  }

  async function removeRecord(id: string) {
    await deleteRecord(id);
    await fetchList();
  }

  async function togglePin(id: string) {
    await togglePinRecord(id);
    await fetchList();
  }

  async function setMastery(id: string, to: Mastery) {
    await updateMastery(id, to);
    await fetchList();
  }

  /** 完成首次学习：失败时 Promise 直接 reject（request.ts 已 toast），不提前动本地数据 */
  async function learnRecord(id: string, curve: CurveConfig): Promise<RecordItem> {
    const learned = await learnRecordRequest(id, curve);
    // 先同步已存在的同 id 项，避免列表刷新失败时详情页继续读到旧缓存；不新增过滤列表成员。
    records.value = records.value.map((item) => (item.id === id ? learned : item));
    persist();
    await fetchList();
    return learned;
  }

  return {
    records,
    total,
    loading,
    keyword,
    activeTag,
    page,
    loadingMore,
    hasMore,
    masteredTotal,
    allTags,
    getRecordById,
    init,
    fetchList,
    loadMore,
    fetchStats,
    addRecord,
    editRecord,
    removeRecord,
    togglePin,
    setMastery,
    learnRecord,
  };
});
