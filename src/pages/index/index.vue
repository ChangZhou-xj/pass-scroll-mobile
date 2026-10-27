<template>
  <!-- 底衬随 safe-area 增长，与 FAB（bottom:180rpx+inset，高 120rpx → 顶缘 300rpx+inset）保持设计基线对齐：
       260rpx 底衬 + 末张卡片的 p-40rpx 内衬 = 300rpx，卡片底部 tag/日期行正好擦着 FAB 上缘 -->
  <view
    class="min-h-screen bg-white px-30rpx"
    :style="{
      paddingTop: statusBarPx + 'px',
      paddingBottom: 'calc(260rpx + env(safe-area-inset-bottom))',
    }">
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

    <!-- 今日复习入口：间隔重复队列（到期卡 + 定额新卡），没待办时不占位。
         主题 chips 点了直接进"只啃这一块"的复习——学习曲线按标签分块，不把游戏和面试混着学 -->
    <view v-if="dueTotal > 0" class="mt-24rpx rounded-24rpx bg-[#F7F2E7] px-32rpx py-24rpx" @click="goReview">
      <view class="flex items-center justify-between">
        <view>
          <text class="block text-26rpx font-semibold text-[#0D0D0D]">今日待复习 {{ dueTotal }} 张</text>
          <text class="mt-6rpx block text-22rpx text-[#67676C]">
            到期 {{ srsStore.dueCount }} · 新卡 {{ srsStore.freshCount }}
            <text v-if="dueTagChips.length">· {{ dueTagChips.length }} 个主题</text>
          </text>
        </view>
        <text class="text-32rpx text-[#0D0D0D]">›</text>
      </view>
      <scroll-view v-if="dueTagChips.length" scroll-x :show-scrollbar="false" class="mt-16rpx">
        <view class="flex">
          <text
            v-for="item in dueTagChips"
            :key="item.name"
            class="mr-12rpx shrink-0 whitespace-nowrap rounded-full bg-white px-20rpx py-8rpx text-20rpx text-[#0D0D0D]"
            @click.stop="goReviewTag(item.name)">
            #{{ item.name }} {{ item.due }}
          </text>
        </view>
      </scroll-view>
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

    <!-- 标签筛选栏：尺寸走 unocss class，颜色走 :style（transformerClass 不转换动态 class 中的 arbitrary value）
         展示顺序 = 今日待复习多的在前（tagBar 来自 GET /records/due/tags），
         待复习数做成 chip 内的角标——标签栏不只是过滤器，也是"哪个主题今天该学"的入口 -->
    <scroll-view scroll-x :show-scrollbar="false" class="mt-24rpx">
      <view class="flex">
        <view :class="chipClass" :style="chipStyle(recordStore.activeTag === '')" @click="selectTag('')">全部</view>
        <view
          v-for="item in tagBar"
          :key="item.name"
          :class="chipClass"
          :style="chipStyle(recordStore.activeTag === item.name)"
          @click="selectTag(item.name)">
          <text :style="{ color: recordStore.activeTag === item.name ? '#FFFFFF' : '#0D0D0D' }">#</text>
          {{ item.name }}
          <text v-if="item.due > 0" :style="dueBadgeStyle(recordStore.activeTag === item.name)">{{ item.due }}</text>
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
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";
import { getStatusBarPx } from "@/utils/system";

// 本页无 NavBar，需自行避让状态栏
const statusBarPx = getStatusBarPx();

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
// 首页只要"今日待复习几条"这个数字，limit=1 拉最小队列即可（统计字段是全量口径）
const srsStore = useSrsStore() as unknown as {
  dueCount: number;
  freshCount: number;
  dueTags: import("@/types/record").DueTagStat[];
  fetchDue: (opts?: { palaceId?: string; tag?: string; limit?: number }) => Promise<void>;
  fetchDueTags: () => Promise<void>;
};

const dueTotal = computed(() => srsStore.dueCount + srsStore.freshCount);
/** 今日有卡要复习的标签（后端已按待复习数排好序） */
const dueTagChips = computed(() => srsStore.dueTags.filter((item) => item.due > 0));
/**
 * 标签栏数据源：优先用"/今日待复习按标签统计"（全量、带待复习数、已排好序）；
 * 它还没拉到时退回从列表聚合的 allTags（此时没有待复习数，角标显示 0 不显示）
 */
const tagBar = computed<{ name: string; due: number }[]>(() => {
  if (srsStore.dueTags.length > 0) return srsStore.dueTags;
  return recordStore.allTags.map((name) => ({ name, due: 0 }));
});

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

/** 待复习角标：选中态是墨底，得换成半透明白才看得见 */
const dueBadgeStyle = (active: boolean) => `color:${active ? "rgba(255,255,255,0.72)" : T.secondaryText};`;

const goDetail = (record: RecordItem) => {
  uni.navigateTo({ url: `/pages/detail/index?id=${record.id}` });
};

const goCreate = () => {
  uni.navigateTo({ url: "/pages/editor/index" });
};

const goReview = () => {
  uni.reLaunch({ url: "/pages/review/index" });
};

/** 点主题 chip 直接进"只啃这一个标签"的复习（学习曲线按标签分块） */
const goReviewTag = (tag: string) => {
  uni.reLaunch({ url: `/pages/review/index?tag=${encodeURIComponent(tag)}` });
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  recordStore.fetchList();
  srsStore.fetchDue({ limit: 1 });
  srsStore.fetchDueTags();
});

onPullDownRefresh(async () => {
  await Promise.all([recordStore.fetchList(), srsStore.fetchDue({ limit: 1 }), srsStore.fetchDueTags()]);
  uni.stopPullDownRefresh();
});
</script>
