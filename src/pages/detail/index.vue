<template>
  <view
    id="detail-page"
    class="min-h-screen bg-white"
    :style="{ paddingBottom: 'calc(120rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar title="详情" show-back />

    <!-- 正文卡片：白卡 + hairline 描边（DESIGN.md feature-card-light） -->
    <view
      v-if="record"
      class="mx-30rpx mt-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-30rpx">
      <text class="block text-44rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ record.title }}</text>
      <view class="mt-16rpx h-6rpx w-64rpx rounded-3rpx bg-[#0D0D0D]" />

      <!-- meta：标签 + 更新时间 -->
      <view class="mt-20rpx flex items-start justify-between">
        <view class="flex flex-1 flex-wrap">
          <text
            v-for="tag in record.tags"
            :key="tag"
            class="mr-12rpx mb-8rpx rounded-full bg-[#F4F5F7] px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
            {{ tag }}
          </text>
        </view>
        <text
          v-if="record.mastery !== 'NONE'"
          class="ml-12rpx shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"
          :style="masteryStyle(record.mastery)">
          {{ record.mastery === "MASTERED" ? "已掌握" : "复习中" }}
        </text>
        <text class="ml-16rpx shrink-0 font-mono text-20rpx tracking-[2rpx] text-[#67676C]">
          {{ formatTime(record.updatedAt) }}
        </text>
      </view>

      <view class="my-24rpx h-1rpx bg-[#E3E3E6]" />

      <!-- markdown 分段：原生组件渲染，全部文字 selectable 可长按/拖选复制 -->
      <view v-for="(seg, index) in segments" :id="`detail-page-seg-${index}`" :key="index" class="md-seg">
        <MdBlocks v-if="seg.type === 'blocks'" :blocks="seg.blocks" />
        <MdContainer v-else :kind="seg.kind" :title="seg.title" :blocks="seg.blocks" />
      </view>
    </view>

    <!-- 学习状态：未学习显示入口按钮，已学习显示排期 -->
    <view v-if="record" class="mx-30rpx mt-24rpx">
      <PsButton v-if="!record.learnedAt" size="lg" block :disabled="learning" @click="handleLearn">
        完成学习并加入复习
      </PsButton>
      <view v-else class="rounded-24rpx bg-[#F4F5F7] px-24rpx py-20rpx text-center">
        <text class="text-24rpx text-[#0D0D0D]">{{ learningStatus }}</text>
      </view>
    </view>

    <!-- 空态 -->
    <view v-else-if="loadFailed" class="flex flex-col items-center pt-280rpx">
      <text class="text-28rpx text-[#67676C]">记录不存在或已删除</text>
    </view>

    <!-- 底部操作栏 -->
    <view
      v-if="record"
      class="fixed bottom-0 left-0 right-0 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white"
      :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }">
      <view class="flex h-100rpx">
        <view class="flex-1 flex-center" @click="handleTogglePin">
          <text class="text-28rpx text-[#0D0D0D]">{{ record.isPinned ? "取消置顶" : "置顶" }}</text>
        </view>
        <view class="flex-1 flex-center border-0 border-l-2rpx border-solid border-[#E3E3E6]" @click="handleEdit">
          <text class="text-28rpx text-[#0D0D0D]">编辑</text>
        </view>
        <view class="flex-1 flex-center border-0 border-l-2rpx border-solid border-[#E3E3E6]" @click="handleHistory">
          <text class="text-28rpx text-[#0D0D0D]">历史</text>
        </view>
        <view class="flex-1 flex-center border-0 border-l-2rpx border-solid border-[#E3E3E6]" @click="handleDelete">
          <text class="text-28rpx text-[#D9303E]">删除</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CurveConfig, RecordItem } from "@/types/record";
import { onHide, onLoad, onPageScroll, onShow } from "@dcloudio/uni-app";
import { getRecord } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { useSrsStore } from "@/store/srs";
import { masteryStyle } from "@/theme/tokens";
import { formatTime } from "@/utils/format";
import { parseNote } from "@/utils/markdown";
import {
  clearPosition,
  measurePosition,
  progressFromScrollTop,
  queryContentHeight,
  readPosition,
  restorePosition,
  savePosition,
} from "@/utils/read-position";
import { formatDueLabel } from "@/utils/srs";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见首页同模式），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type RecordStoreProxy = Omit<
  ReturnType<typeof useRecordStore>,
  "records" | "total" | "loading" | "keyword" | "activeTag" | "allTags" | "getRecordById"
> & {
  records: RecordItem[];
  total: number;
  loading: boolean;
  keyword: string;
  activeTag: string;
  allTags: string[];
  getRecordById: (id: string) => RecordItem | undefined;
};

const recordStore = useRecordStore() as unknown as RecordStoreProxy;
const srsStore = useSrsStore() as unknown as { curve: CurveConfig };

const learning = ref(false);
const recordId = ref("");
const remoteRecord = ref<RecordItem | undefined>(undefined);
const loadFailed = ref(false);

// store 优先（离线可看，且置顶态随 store 自动响应）；store 未命中时用接口兜底数据
const record = computed<RecordItem | undefined>(() => recordStore.getRecordById(recordId.value) ?? remoteRecord.value);

const segments = computed(() => (record.value ? parseNote(record.value.content) : []));

/* ── 阅读位置保持：离开前存进度，返回时按同一 recordId 恢复（见 utils/read-position.ts） ── */
const PAGE_ID = "detail-page";

let pageScrollTop = 0;
/** 缓存文档高度：内容渲染完成后量一次，之后换算进度不再查 DOM（滚动路径零成本） */
let pageHeight = 0;
let pageVisible = true;
let hiddenOnce = false;
let restoreConsumed = false;
let pendingRestore = false;

/** 完整测量（含块锚点），只在页面可见且需要精确记录时调用 */
async function persistPosition() {
  if (!pageVisible || !recordId.value || !segments.value.length) return;
  const pos = await measurePosition(PAGE_ID, pageScrollTop, {
    preview: true,
    version: record.value?.version,
  });
  if (pos) savePosition(recordId.value, pos);
}

/** 离开时零成本落库：用缓存的文档高度换算，不查 DOM（onHide 里查选择器在小程序端可能不回调） */
function saveProgressNow() {
  const key = recordId.value;
  if (!key || pageHeight <= 0) return;
  const progress = progressFromScrollTop(pageScrollTop, pageHeight);
  if (progress !== undefined) savePosition(key, { progress });
}

async function applyRestore() {
  const pos = recordId.value ? readPosition(recordId.value) : undefined;
  if (!pos) return;
  await restorePosition(PAGE_ID, pos, {
    preview: true,
    version: record.value?.version,
    getScrollTop: () => pageScrollTop,
  });
}

/** 每次重新显示只恢复一次：保存返回、置顶等引起的重渲染不应反复把用户拉回原位置 */
function requestRestore() {
  if (restoreConsumed) return;
  if (!segments.value.length) {
    pendingRestore = true;
    return;
  }
  restoreConsumed = true;
  nextTick(applyRestore);
}

// 数据可能来自异步 getRecord：等分段渲染完成后量一次文档高度缓存下来，并补一次恢复
watch(
  segments,
  async (list) => {
    if (!list.length) return;
    pageHeight = (await queryContentHeight(PAGE_ID)) ?? pageHeight;
    if (!pendingRestore) return;
    pendingRestore = false;
    restoreConsumed = true;
    nextTick(applyRestore);
  },
  { flush: "post" },
);

// 滚动路径只做一次变量赋值：不查 DOM、不落库、不打日志
onPageScroll((e) => {
  pageScrollTop = e.scrollTop;
});

const learningStatus = computed(() => {
  if (!record.value?.dueAt) return "已加入复习";
  const due = formatDueLabel(record.value.dueAt);
  return due === "已到期" ? "已到期，可前往复习" : `已加入复习，${due}到期`;
});

const handleLearn = async () => {
  if (!record.value || record.value.learnedAt || learning.value) return;
  learning.value = true;
  try {
    const learned = await recordStore.learnRecord(record.value.id, srsStore.curve);
    // store 未含当前记录（列表过滤）时靠 remoteRecord 兜底回写；正常场景由 fetchList 对齐
    remoteRecord.value = learned;
    const dueText = learned.dueAt ? `，${formatDueLabel(learned.dueAt)}到期` : "";
    uni.showToast({ title: `已加入复习${dueText}`, icon: "none" });
  } catch {
    // request.ts 已统一 toast；learning 在 finally 复位，不伪装成功
  } finally {
    learning.value = false;
  }
};

async function loadRecord() {
  if (!recordId.value) {
    loadFailed.value = true;
    return;
  }
  if (recordStore.getRecordById(recordId.value)) {
    loadFailed.value = false;
    return;
  }
  try {
    remoteRecord.value = await getRecord(recordId.value);
    loadFailed.value = false;
  } catch {
    remoteRecord.value = undefined;
    loadFailed.value = true;
  }
}

const handleTogglePin = async () => {
  if (!record.value) return;
  try {
    await recordStore.togglePin(record.value.id);
  } catch {
    // request.ts 已统一 toast
  }
};

const handleEdit = async () => {
  if (!record.value) return;
  const id = record.value.id;
  // 跳转前补存一次：此时页面可见，能顺带记下块锚点（编辑页预览态用得上）
  await persistPosition();
  const pos = readPosition(id);
  const suffix = pos ? `&pos=${pos.progress.toFixed(4)}` : "";
  uni.navigateTo({ url: `/pages/editor/index?id=${id}${suffix}` });
};

const handleHistory = () => {
  if (!record.value) return;
  uni.navigateTo({ url: `/pages/versions/index?id=${record.value.id}` });
};

const handleDelete = () => {
  if (!record.value) return;
  const id = record.value.id;
  uni.showModal({
    title: "删除记录",
    content: "删除后不可恢复，确定删除？",
    confirmColor: "#D9303E",
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await recordStore.removeRecord(id);
        clearPosition(id);
        uni.showToast({ title: "已删除", icon: "none" });
        uni.navigateBack();
      } catch {
        // request.ts 已统一 toast
      }
    },
  });
};

onLoad((query) => {
  recordId.value = (query?.id as string) ?? "";
});

onHide(() => {
  pageVisible = false;
  hiddenOnce = true;
  // 离开时用缓存高度换算落库（零 DOM 查询）；handleEdit 会额外做一次含锚点的完整测量
  saveProgressNow();
  // 每次离开后重置，保证再次返回（详情→编辑→返回 可反复）都能恢复一次
  restoreConsumed = false;
  pendingRestore = false;
});

// onShow 重新读取：编辑器保存返回后可看到最新内容；首次进入不恢复（hiddenOnce 仍为 false）
onShow(() => {
  pageVisible = true;
  loadRecord();
  if (hiddenOnce) requestRestore();
});
</script>
