<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-60rpx">
    <!-- 有当前题 -->
    <template v-if="current">
      <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
        <view class="flex items-center">
          <text v-if="current.isPinned" class="mr-8rpx text-32rpx">📌</text>
          <text class="note-title text-40rpx font-bold text-[#3C3C43]">{{ current.title }}</text>
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
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
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
    </template>

    <!-- 空态 -->
    <view v-else-if="!recordStore.loading" class="flex flex-col items-center pt-280rpx">
      <text class="text-64rpx">📭</text>
      <text class="mt-24rpx text-28rpx text-[#67676C]">
        {{ hasFilter ? "当前筛选下没有笔记" : "还没有可复习的笔记" }}
      </text>
      <view class="mt-40rpx h-80rpx flex-center rounded-40rpx bg-[#3E63DD] px-48rpx" @click="handleEmptyAction">
        <text class="text-28rpx text-white">{{ hasFilter ? "重置为全部" : "去写第一条" }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
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
const poolSize = computed(() => recordStore.records.length);
const hasFilter = computed(() => Boolean(recordStore.keyword) || Boolean(recordStore.activeTag));

/** 从池中均匀随机抽一条；池子 >1 条时不与当前题重复。抽题池尊重首页筛选（特性） */
const pickRandom = () => {
  const pool = recordStore.records;
  if (pool.length === 0) {
    current.value = undefined;
    return;
  }
  const excludeId = current.value?.id;
  const candidates = pool.length > 1 && excludeId ? pool.filter((item) => item.id !== excludeId) : pool;
  current.value = candidates[Math.floor(Math.random() * candidates.length)];
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

const handleEmptyAction = () => {
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
  if (!current.value) pickRandom();
});
</script>

<style scoped>
.note-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
