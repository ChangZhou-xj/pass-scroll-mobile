<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-160rpx">
    <!-- 有当前题 -->
    <template v-if="current">
      <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx shadow-[0_4rpx_24rpx_rgba(62,99,221,0.06)]">
        <view class="flex items-center">
          <text v-if="current.isPinned" class="mr-8rpx text-32rpx">📌</text>
          <text class="note-title text-40rpx font-bold text-[#3C3C43]">{{ current.title }}</text>
          <text
            v-if="current.mastery !== 'NONE'"
            class="ml-12rpx shrink-0 text-20rpx"
            :style="{ color: current.mastery === 'MASTERED' ? '#42B883' : '#F0B429' }">
            {{ current.mastery === "MASTERED" ? "已掌握" : "复习中" }}
          </text>
        </view>

        <view v-if="current.tags.length" class="mt-20rpx flex flex-wrap">
          <text
            v-for="tag in current.tags"
            :key="tag"
            class="mr-12rpx mb-8rpx rounded-12rpx bg-[#3E63DD]/10 px-16rpx py-4rpx text-22rpx text-[#3E63DD]">
            {{ tag }}
          </text>
        </view>

        <view class="my-24rpx h-1rpx bg-[#EEEEEE]" />

        <!-- markdown 分段；details 容器默认折叠，点按揭示答案 -->
        <view v-for="(seg, index) in segments" :key="index">
          <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" @toggle="onAnswerToggle" />
        </view>

        <view class="mt-24rpx flex justify-center">
          <text class="text-22rpx text-[#67676C]">先自己作答，点开「答案」对照</text>
        </view>
      </view>

      <!-- 池大小提示 -->
      <view class="mt-24rpx flex items-center justify-center">
        <text class="text-22rpx text-[#67676C]">从 {{ poolSize }} 条笔记中随机抽取</text>
        <template v-if="hasFilter">
          <text class="text-22rpx text-[#67676C]">（已按首页筛选）</text>
          <text class="ml-8rpx text-22rpx text-[#3E63DD]" @click="resetFilter">重置为全部</text>
        </template>
        <text class="ml-16rpx text-22rpx text-[#3E63DD]" @click="toggleIncludeMastered">
          {{ includeMastered ? "排除已掌握" : "包含已掌握" }}
        </text>
      </view>

      <!-- 底部双按钮 -->
      <view class="mx-30rpx mt-30rpx flex">
        <view
          class="mr-20rpx h-88rpx flex-1 flex-center rounded-44rpx border-2rpx border-solid border-[#3E63DD] bg-white"
          @click="goDetail">
          <text class="text-28rpx text-[#3E63DD]">查看详情</text>
        </view>
        <view class="h-88rpx flex-1 flex-center rounded-44rpx bg-[#3E63DD]" @click="pickRandom">
          <text class="text-28rpx text-white">换一题</text>
        </view>
      </view>

      <!-- 掌握度标记：答案展开后浮现，固定底部双大按钮 -->
      <view
        v-if="showMark"
        class="fixed bottom-0 left-0 right-0 z-50 border-t border-solid border-[#EEEEEE] bg-white px-30rpx py-16rpx">
        <view class="flex">
          <view
            class="mr-20rpx h-96rpx flex-1 flex-center rounded-48rpx border-2rpx border-solid border-[#F0B429] bg-white"
            @click="mark('LEARNING')">
            <text class="text-28rpx text-[#F0B429]">仍需复习</text>
          </view>
          <view class="h-96rpx flex-1 flex-center rounded-48rpx bg-[#42B883]" @click="mark('MASTERED')">
            <text class="text-28rpx text-white">已掌握</text>
          </view>
        </view>
      </view>
    </template>

    <!-- 空态 -->
    <view v-else-if="!recordStore.loading" class="flex flex-col items-center pt-280rpx">
      <text class="text-64rpx">{{ allMastered ? "🎉" : "📭" }}</text>
      <text class="mt-24rpx text-28rpx text-[#67676C]">
        {{ allMastered ? "全部已掌握，真不错" : hasFilter ? "当前筛选下没有笔记" : "还没有可复习的笔记" }}
      </text>
      <view class="mt-40rpx h-80rpx flex-center rounded-40rpx bg-[#3E63DD] px-48rpx" @click="handleEmptyAction">
        <text class="text-28rpx text-white">
          {{ allMastered ? "包含已掌握再复习" : hasFilter ? "重置为全部" : "去写第一条" }}
        </text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Mastery, RecordItem } from "@/types/record";
import { onShow } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";
import { useUserStore } from "@/store/modules/user";
import { parseNote } from "@/utils/markdown";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见首页同模式），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type RecordStoreProxy = Omit<
  ReturnType<typeof useRecordStore>,
  "records" | "total" | "loading" | "keyword" | "activeTag"
> & {
  records: RecordItem[];
  total: number;
  loading: boolean;
  keyword: string;
  activeTag: string;
};

const userStore = useUserStore();
const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const current = ref<RecordItem>();

const segments = computed(() => (current.value ? parseNote(current.value.content) : []));

const includeMastered = ref(false);
const showMark = ref(false);
const pool = computed(() =>
  includeMastered.value ? recordStore.records : recordStore.records.filter((item) => item.mastery !== "MASTERED"),
);
const poolSize = computed(() => pool.value.length);
const allMastered = computed(() => recordStore.records.length > 0 && pool.value.length === 0 && !includeMastered.value);
const hasFilter = computed(() => Boolean(recordStore.keyword) || Boolean(recordStore.activeTag));

/** 从池中均匀随机抽一条；池子 >1 条时不与当前题重复。抽题池尊重首页筛选（特性） */
const pickRandom = () => {
  const candidates0 = pool.value;
  if (candidates0.length === 0) {
    current.value = undefined;
    showMark.value = false;
    return;
  }
  const excludeId = current.value?.id;
  const candidates =
    candidates0.length > 1 && excludeId ? candidates0.filter((item) => item.id !== excludeId) : candidates0;
  current.value = candidates[Math.floor(Math.random() * candidates.length)];
  showMark.value = false;
};

const resetFilter = async () => {
  recordStore.keyword = "";
  recordStore.activeTag = "";
  await recordStore.fetchList();
  current.value = undefined;
  pickRandom();
};

const goDetail = () => {
  if (!current.value) return;
  uni.navigateTo({ url: `/pages/detail/index?id=${current.value.id}` });
};

const onAnswerToggle = (open: boolean) => {
  if (open) showMark.value = true;
};

const mark = async (to: Mastery) => {
  if (!current.value) return;
  try {
    await recordStore.setMastery(current.value.id, to);
    uni.showToast({ title: "已标记", icon: "none" });
    current.value = undefined;
    showMark.value = false;
    pickRandom();
  } catch {
    // request.ts 已统一 toast（如非法流转 10002）
  }
};

const toggleIncludeMastered = () => {
  includeMastered.value = !includeMastered.value;
  current.value = undefined;
  showMark.value = false;
  pickRandom();
};

const handleEmptyAction = () => {
  if (allMastered.value) {
    toggleIncludeMastered();
    return;
  }
  if (hasFilter.value) {
    resetFilter();
  } else {
    uni.switchTab({ url: "/pages/index/index" });
  }
};

onShow(async () => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  if (recordStore.records.length === 0) {
    await recordStore.fetchList();
  }
  // 校验当前题池内有效性：删除/编辑/筛选变化后 current 可能已过期，用池中同 id 对象刷新或重抽
  const currentId = current.value?.id;
  current.value = currentId ? recordStore.records.find((item) => item.id === currentId) : undefined;
  if (!current.value) pickRandom();
  showMark.value = false;
});
</script>

<style scoped>
.note-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
