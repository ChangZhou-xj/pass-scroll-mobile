/**
 * 记忆 store（Pinia）——复习队列、记忆曲线配置、记忆宫殿
 *
 * 与 record.ts 的分工：record store 管"笔记本体"（增删改/置顶/掌握度/列表缓存），
 * 本 store 管"笔记作为记忆卡片的调度"——今天该复习谁、复习完排到什么时候、卡片摆在哪个空间位置。
 *
 * 【记忆曲线配置存在本地】曲线是用户的个人偏好（属于这台设备上的这个人），不是笔记数据：
 * 不下发到后端，每次提交评分时随 grade 一起带上（后端不持久化，见 records.service.review）。
 * 所以换设备时曲线不跟随，但卡片调度状态（dueAt/stage/ease）在服务端，换设备复习进度不丢。
 */
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getDueRecords, getDueTags, reviewRecord } from "@/api/record";
import {
  createPalace,
  deletePalace,
  listPalaces,
  removePalaceRecord,
  setPalaceRecords,
  updatePalace,
} from "@/api/palace";
import type { CurveConfig, DueBlock, DueSummary, DueTagStat, Grade, PalaceItem, RecordItem } from "@/types/record";
import { DEFAULT_CURVE, PRESET_CURVES, normalizeCurve } from "@/utils/srs";

const CURVE_KEY = "pass_scroll_curve";

export const useSrsStore = defineStore("srs", () => {
  /** 当前生效的记忆曲线（默认 = 艾宾浩斯经典） */
  const curve = ref<CurveConfig>({ ...DEFAULT_CURVE });
  /** 当前曲线来自哪个预设；用户手动改过后变 "custom" */
  const presetKey = ref<string>("classic");

  /** 今日复习队列（已按"到期优先"排好） */
  const queue = ref<RecordItem[]>([]);
  const dueCount = ref(0);
  const freshCount = ref(0);
  const learnedToday = ref(0);
  const nextDueAt = ref<number | null>(null);
  // 初值 true：页面首屏还没拉到队列时别闪一下"今日无事可做"的空态
  const loading = ref(true);

  /** 记忆宫殿列表 */
  const palaces = ref<PalaceItem[]>([]);

  /** 后端给的主题分块快照（进页面时一次；答题过程中以 currentBlock 实时算为准） */
  const blocks = ref<DueBlock[]>([]);
  /** 今日待复习按标签统计：标签栏角标 / 复习页主题切换器 */
  const dueTags = ref<DueTagStat[]>([]);
  /** 主题聚焦：非空 = 只复习这个标签（系统性啃一块） */
  const activeTag = ref<string>("");

  /** 卡片的主标签（第一个标签；没打标签 = "未分类"） */
  const primaryTag = (item: RecordItem) => item.tags[0] ?? "";

  /** 队列里第一张（复习页展示的当前卡） */
  const current = computed(() => queue.value[0]);
  /** 今日待办总数 */
  const totalToday = computed(() => queue.value.length);
  /** 队列里是否还有卡（不含已完成的） */
  const hasMore = computed(() => queue.value.length > 0);
  /**
   * 队首所在的主题块：tag + 该块还剩几张（从本地队列实时算，答完一张立刻同步）。
   * 队列本身已由后端按主题块排好，所以这里只需从队首往下数连续同标签的卡片。
   */
  const currentBlock = computed<DueBlock | null>(() => {
    const head = queue.value[0];
    if (!head) return null;
    const tag = primaryTag(head);
    let count = 0;
    for (const item of queue.value) {
      if (primaryTag(item) !== tag) break;
      count += 1;
    }
    return { tag, count };
  });

  function loadCurve() {
    try {
      const cached = uni.getStorageSync(CURVE_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached) as { presetKey?: string; curve?: Partial<CurveConfig> };
      presetKey.value = parsed.presetKey ?? "custom";
      curve.value = normalizeCurve(parsed.curve);
    } catch (e) {
      console.error("读取记忆曲线配置失败", e);
    }
  }

  function saveCurve() {
    uni.setStorageSync(CURVE_KEY, JSON.stringify({ presetKey: presetKey.value, curve: curve.value }));
  }

  /** 套用一个内置预设（经典 / 舒缓 / 密集） */
  function applyPreset(key: string) {
    const preset = PRESET_CURVES[key];
    if (!preset) return;
    presetKey.value = key;
    curve.value = normalizeCurve(preset);
    saveCurve();
  }

  /** 直接改某一项（曲线页的编辑器用），改完即为 custom */
  function patchCurve(patch: Partial<CurveConfig>) {
    curve.value = normalizeCurve({ ...curve.value, ...patch });
    presetKey.value = "custom";
    saveCurve();
  }

  function resetCurve() {
    applyPreset("classic");
  }

  /** 拉今日待复习的标签统计（标签栏角标、复习页主题切换器） */
  async function fetchDueTags() {
    try {
      dueTags.value = await getDueTags();
    } catch {
      // request.ts 已统一 toast；失败保留上一次
    }
  }

  /**
   * 拉今日复习队列（后端已按主题块排好：同标签连续，块内到期优先）
   * @param opts.palaceId 宫殿巡游；@param opts.tag 主题聚焦（只学这一个标签）
   */
  async function fetchDue(opts: { palaceId?: string; tag?: string; limit?: number } = {}) {
    const { palaceId, tag, limit = 50 } = opts;
    activeTag.value = tag ?? "";
    loading.value = true;
    try {
      const res: DueSummary = await getDueRecords({
        limit,
        palaceId: palaceId || undefined,
        tag: tag || undefined,
        newPerDay: curve.value.newPerDay,
      });
      queue.value = res.list;
      blocks.value = res.blocks ?? [];
      dueCount.value = res.dueCount;
      freshCount.value = res.freshCount;
      learnedToday.value = res.learnedToday;
      nextDueAt.value = res.nextDueAt;
    } catch {
      // request.ts 已统一 toast；失败保留上一次队列
    } finally {
      loading.value = false;
    }
  }

  /**
   * 提交一次自评：成功就把这张卡从本地队列摘掉（不论哪档，dueAt 都推到未来），
   * 不重新拉队列——省一次往返，也让"答完立刻进下一张"手感连贯。
   * 返回 nextTag：当这一张答完正好啃完一整块、下一块换了主题时给出新主题名，
   * 页面据此提示"主题切换"，让"系统性学完一块"这件事被明确感知到。
   */
  async function submitReview(id: string, grade: Grade): Promise<{ ok: boolean; nextTag?: string }> {
    try {
      await reviewRecord(id, grade, curve.value);
      const before = queue.value.length;
      const card = queue.value.find((item) => item.id === id);
      const tagBefore = queue.value[0] ? primaryTag(queue.value[0]) : "";
      queue.value = queue.value.filter((item) => item.id !== id);
      if (queue.value.length !== before) {
        learnedToday.value += 1;
        if (dueCount.value > 0) dueCount.value -= 1;
        else if (freshCount.value > 0) freshCount.value -= 1;
        // 标签角标同步减：答完一张，它所属主题的待复习数就该少一张
        card?.tags.forEach((name) => {
          const hit = dueTags.value.find((item) => item.name === name);
          if (hit) hit.due = Math.max(0, hit.due - 1);
        });
      }
      const next = queue.value[0];
      const tagAfter = next ? primaryTag(next) : "";
      return { ok: true, nextTag: next && tagAfter !== tagBefore ? tagAfter : undefined };
    } catch {
      return { ok: false };
    }
  }

  async function fetchPalaces() {
    try {
      palaces.value = await listPalaces();
    } catch {
      // request.ts 已统一 toast
    }
  }

  async function addPalace(name: string, emoji?: string, description?: string) {
    await createPalace({ name, emoji, description });
    await fetchPalaces();
  }

  async function renamePalace(id: string, form: { name?: string; emoji?: string; description?: string }) {
    await updatePalace(id, form);
    await fetchPalaces();
  }

  async function removePalace(id: string) {
    await deletePalace(id);
    await fetchPalaces();
  }

  /** 保存宫内卡片及桩位顺序：ids 的数组顺序即位置顺序 */
  async function savePalaceOrder(id: string, ids: string[]) {
    palaces.value = await setPalaceRecords(id, ids);
  }

  async function detachRecord(palaceId: string, recordId: string) {
    palaces.value = await removePalaceRecord(palaceId, recordId);
  }

  loadCurve();

  return {
    curve,
    presetKey,
    queue,
    dueCount,
    freshCount,
    learnedToday,
    nextDueAt,
    loading,
    palaces,
    blocks,
    dueTags,
    activeTag,
    current,
    currentBlock,
    totalToday,
    hasMore,
    loadCurve,
    applyPreset,
    patchCurve,
    resetCurve,
    fetchDue,
    fetchDueTags,
    submitReview,
    fetchPalaces,
    addPalace,
    renamePalace,
    removePalace,
    savePalaceOrder,
    detachRecord,
  };
});
