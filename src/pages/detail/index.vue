<template>
  <view class="min-h-screen bg-white" :style="{ paddingBottom: 'calc(120rpx + env(safe-area-inset-bottom))' }">
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
          :style="{
            color: record.mastery === 'MASTERED' ? '#42B883' : '#F0B429',
            borderColor: record.mastery === 'MASTERED' ? '#42B883' : '#F0B429',
          }">
          {{ record.mastery === "MASTERED" ? "已掌握" : "复习中" }}
        </text>
        <text class="ml-16rpx shrink-0 font-mono text-20rpx tracking-[2rpx] text-[#67676C]">
          {{ formatTime(record.updatedAt) }}
        </text>
      </view>

      <view class="my-24rpx h-1rpx bg-[#E3E3E6]" />

      <!-- markdown 分段 -->
      <view v-for="(seg, index) in segments" :key="index">
        <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
        <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
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
import type { RecordItem } from "@/types/record";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { getRecord } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { formatTime } from "@/utils/format";
import { parseNote } from "@/utils/markdown";

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

const recordId = ref("");
const remoteRecord = ref<RecordItem | undefined>(undefined);
const loadFailed = ref(false);

// store 优先（离线可看，且置顶态随 store 自动响应）；store 未命中时用接口兜底数据
const record = computed<RecordItem | undefined>(() => recordStore.getRecordById(recordId.value) ?? remoteRecord.value);

const segments = computed(() => (record.value ? parseNote(record.value.content) : []));

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

const handleEdit = () => {
  if (!record.value) return;
  uni.navigateTo({ url: `/pages/editor/index?id=${record.value.id}` });
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

// onShow 重新读取：编辑器保存返回后可看到最新内容
onShow(() => {
  loadRecord();
});
</script>
