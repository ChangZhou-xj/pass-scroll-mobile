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
import type { Mastery, RecordForm, RecordItem, RecordQuery } from "@/types/record";
import { createRecord, deleteRecord, listRecords, togglePinRecord, updateMastery, updateRecord } from "@/api/record";

const CACHE_KEY = "pass_scroll_records";

export const useRecordStore = defineStore("record", () => {
  const records = ref<RecordItem[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const keyword = ref("");
  const activeTag = ref("");

  const allTags = computed(() => {
    const tagSet = new Set<string>();
    records.value.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet);
  });

  const getRecordById = computed(() => (id: string) => records.value.find((r) => r.id === id));

  function persist() {
    uni.setStorageSync(CACHE_KEY, JSON.stringify(records.value));
  }

  /** 启动时先读缓存渲染，再由 fetchList 拉最新数据覆盖 */
  function init() {
    try {
      const cached = uni.getStorageSync(CACHE_KEY);
      if (cached) {
        // 归一化旧版缓存：补齐新增字段，避免徽章误报与首次保存跳过乐观锁
        const parsed = JSON.parse(cached) as Partial<RecordItem>[];
        records.value = parsed.map((item) => ({
          ...item,
          mastery: item.mastery ?? "NONE",
          version: item.version ?? 1,
        })) as RecordItem[];
      }
    } catch (e) {
      console.error("读取本地存储失败", e);
    }
  }

  async function fetchList() {
    loading.value = true;
    try {
      const query: RecordQuery = { page: 1, pageSize: 50 };
      if (keyword.value) query.keyword = keyword.value;
      if (activeTag.value) query.tag = activeTag.value;
      const res = await listRecords(query);
      records.value = res.list;
      total.value = res.total;
      persist();
    } catch {
      // request.ts 已统一 toast；失败时保留缓存数据（离线只读）
    } finally {
      loading.value = false;
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

  return {
    records,
    total,
    loading,
    keyword,
    activeTag,
    allTags,
    getRecordById,
    init,
    fetchList,
    addRecord,
    editRecord,
    removeRecord,
    togglePin,
    setMastery,
  };
});
