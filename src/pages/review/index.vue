<template>
  <view class="review-page min-h-screen bg-white pb-260rpx">
    <CustomNavBar title="复习" />

    <!-- 有当前题 -->
    <template v-if="current">
      <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#D6F0E3] p-48rpx">
        <view class="flex items-center">
          <text v-if="current.isPinned" class="mr-8rpx text-32rpx">📌</text>
          <text class="text-40rpx font-semibold tracking-[-1rpx] text-[#0D0D0D]">{{ current.title }}</text>
          <text
            v-if="current.mastery !== 'NONE'"
            class="ml-12rpx shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"
            :style="{
              color: current.mastery === 'MASTERED' ? '#42B883' : '#F0B429',
              borderColor: current.mastery === 'MASTERED' ? '#42B883' : '#F0B429',
            }">
            {{ current.mastery === "MASTERED" ? "已掌握" : "复习中" }}
          </text>
        </view>

        <view v-if="current.tags.length" class="mt-20rpx flex flex-wrap">
          <text
            v-for="tag in current.tags"
            :key="tag"
            class="mr-12rpx mb-8rpx rounded-full bg-[#F4F5F7] px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
            {{ tag }}
          </text>
        </view>

        <view class="my-24rpx h-1rpx bg-[#A9DCC3]" />

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
          <text class="ml-8rpx text-22rpx font-semibold text-[#0D0D0D]" @click="resetFilter">重置为全部</text>
        </template>
        <text class="ml-16rpx text-22rpx font-semibold text-[#0D0D0D]" @click="toggleIncludeMastered">
          {{ includeMastered ? "排除已掌握" : "包含已掌握" }}
        </text>
      </view>

      <!-- 底部双按钮 -->
      <view class="mx-30rpx mt-30rpx flex">
        <view class="mr-20rpx flex-1">
          <PsButton variant="secondary" size="lg" block @click="goDetail">查看详情</PsButton>
        </view>
        <view class="flex-1">
          <PsButton size="lg" block @click="pickRandom">换一题</PsButton>
        </view>
      </view>

      <!-- 掌握度标记：答案展开后浮现，固定底部双大按钮 -->
      <!-- 上浮避让改用自绘栏高常量：--tab-bar-height 在 H5 被 uni 框架定义为 0px，原 fallback 50px 永不生效；
           bottom/zIndex 走 inline style（rpx 由 uni 归一化换算，同首页 FAB），并压过同为 z-50 的 CustomTabBar -->
      <view
        v-if="showMark"
        class="review-mark-bar fixed left-0 right-0 border-t border-solid border-[#E3E3E6] bg-white px-30rpx py-16rpx"
        :style="{ bottom: 'calc(100rpx + env(safe-area-inset-bottom))', zIndex: 61 }">
        <view class="flex">
          <view class="mr-20rpx flex-1">
            <PsButton variant="secondary" size="lg" block @click="mark('LEARNING')">仍需复习</PsButton>
          </view>
          <view class="flex-1">
            <PsButton size="lg" block @click="mark('MASTERED')">已掌握</PsButton>
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
      <view class="mt-40rpx">
        <PsButton size="lg" @click="handleEmptyAction">
          {{ allMastered ? "包含已掌握再复习" : hasFilter ? "重置为全部" : "去写第一条" }}
        </PsButton>
      </view>
    </view>

    <CustomTabBar />
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
    uni.reLaunch({ url: "/pages/index/index" });
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
