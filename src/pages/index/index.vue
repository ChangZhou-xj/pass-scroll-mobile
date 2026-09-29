<template>
  <view class="min-h-screen bg-white px-30rpx pb-260rpx" :style="{ paddingTop: statusBarPx + 'px' }">
    <!-- 品牌 hero：lilac 签名色块 -->
    <view class="mt-24rpx rounded-48rpx bg-[#E7E3FA] px-48rpx pb-40rpx pt-56rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">PASS SCROLL · NOTES</text>
      <text class="mt-12rpx block text-64rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">通关秘籍</text>
      <text class="mt-12rpx block text-26rpx text-[#0D0D0D]">分享知识，随笔</text>
      <text
        v-if="recordStore.records.length > 0"
        class="mt-24rpx block font-mono text-22rpx tracking-[2rpx] text-[#0D0D0D]">
        已掌握 {{ masteredCount }}/{{ recordStore.total }}
      </text>
    </view>

    <!-- 搜索区 -->
    <view
      class="mt-32rpx h-80rpx flex items-center rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx">
      <input
        v-model="recordStore.keyword"
        class="h-72rpx flex-1 text-28rpx text-[#0D0D0D]"
        type="text"
        confirm-type="search"
        placeholder="搜索标题或内容"
        placeholder-style="color: #67676C;"
        @confirm="handleSearch" />
      <view
        v-if="recordStore.keyword"
        class="ml-12rpx flex h-48rpx w-48rpx items-center justify-center"
        @click="clearKeyword">
        <text class="text-28rpx leading-none text-[#67676C]">✕</text>
      </view>
    </view>

    <!-- 标签筛选栏：尺寸走 unocss class，颜色走 :style（transformerClass 不转换动态 class 中的 arbitrary value） -->
    <scroll-view scroll-x :show-scrollbar="false" class="mt-24rpx">
      <view class="flex">
        <view :class="chipClass" :style="chipStyle(recordStore.activeTag === '')" @click="selectTag('')">全部</view>
        <view
          v-for="tag in recordStore.allTags"
          :key="tag"
          :class="chipClass"
          :style="chipStyle(recordStore.activeTag === tag)"
          @click="selectTag(tag)">
          <text :style="{ color: recordStore.activeTag === tag ? '#FFFFFF' : '#0D0D0D' }">#</text>
          {{ tag }}
        </view>
      </view>
    </scroll-view>

    <!-- 记录列表 -->
    <view class="mt-24rpx">
      <RecordCard v-for="item in recordStore.records" :key="item.id" :record="item" @click="goDetail" />
    </view>

    <!-- 空态 -->
    <view v-if="!recordStore.loading && recordStore.records.length === 0" class="flex flex-col items-center pt-240rpx">
      <text class="text-28rpx text-[#67676C]">{{ emptyText }}</text>
    </view>

    <!-- 底部统计 -->
    <view v-if="recordStore.records.length > 0" class="flex justify-center pt-8rpx">
      <text class="text-22rpx text-[#67676C]">共 {{ recordStore.total }} 条</text>
    </view>

    <!-- 浮动新建按钮 -->
    <view
      class="fixed right-40rpx z-50 h-120rpx w-120rpx flex-center rounded-full bg-[#0D0D0D]"
      :style="{ bottom: 'calc(180rpx + env(safe-area-inset-bottom))' }"
      @click="goCreate">
      <text class="text-56rpx leading-none text-white">+</text>
    </view>

    <CustomTabBar />
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";

// H5 无原生状态栏恒 0；App/MP 端 statusBarHeight 异常为 0 时兜底 20px（本页无 NavBar，需自行避让）
let statusBarPx = 0;
// #ifndef H5
statusBarPx = uni.getSystemInfoSync().statusBarHeight || 20;
// #endif

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 user.ts 基线注释），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type RecordStoreProxy = Omit<
  ReturnType<typeof useRecordStore>,
  "records" | "total" | "loading" | "keyword" | "activeTag" | "allTags"
> & {
  records: RecordItem[];
  total: number;
  loading: boolean;
  keyword: string;
  activeTag: string;
  allTags: string[];
};

const userStore = useUserStore();
const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const emptyText = computed(() =>
  Boolean(recordStore.keyword) || Boolean(recordStore.activeTag) ? "没有匹配的记录" : "还没有记录，点右下角 + 写第一条",
);

const masteredCount = computed(() => recordStore.records.filter((r) => r.mastery === "MASTERED").length);

const handleSearch = () => {
  recordStore.fetchList();
};

const clearKeyword = () => {
  recordStore.keyword = "";
  recordStore.fetchList();
};

const selectTag = (tag: string) => {
  if (recordStore.activeTag === tag) return;
  recordStore.activeTag = tag;
  recordStore.fetchList();
};

// chips 布局类全状态一致（shrink-0 + nowrap 防止 flex 挤压换行变形）；颜色必须走 :style——
// unocss-preset-weapp 的 transformerClass 只转换模板静态 class 属性中的 arbitrary value，动态 :class 不生成对应 CSS
const chipClass = "mr-16rpx shrink-0 whitespace-nowrap rounded-full px-28rpx py-10rpx text-24rpx";

const chipStyle = (active: boolean) =>
  active ? `background:${T.ink};color:${T.onPrimary};` : `background:${T.surfaceSoft};color:${T.ink};`;

const goDetail = (record: RecordItem) => {
  uni.navigateTo({ url: `/pages/detail/index?id=${record.id}` });
};

const goCreate = () => {
  uni.navigateTo({ url: "/pages/editor/index" });
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  recordStore.fetchList();
});

onPullDownRefresh(async () => {
  await recordStore.fetchList();
  uni.stopPullDownRefresh();
});
</script>
