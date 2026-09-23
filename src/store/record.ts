// src/store/record.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { RecordForm, RecordItem, RecordQuery } from "@/types/record";
import { createRecord, deleteRecord, listRecords, togglePinRecord, updateRecord } from "@/api/record";

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

  function persist() {
    uni.setStorageSync(CACHE_KEY, JSON.stringify(records.value));
  }

  /** 启动时先读缓存渲染，再由 fetchList 拉最新数据覆盖 */
  function init() {
    try {
      const cached = uni.getStorageSync(CACHE_KEY);
      if (cached) records.value = JSON.parse(cached);
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

  return {
    records,
    total,
    loading,
    keyword,
    activeTag,
    allTags,
    init,
    fetchList,
    addRecord,
    editRecord,
    removeRecord,
    togglePin,
  };
});
