<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-200rpx">
    <CustomNavBar title="我的" />

    <template v-if="isLoggedIn">
      <!-- 用户卡 -->
      <view class="mx-30rpx mt-24rpx flex items-center rounded-24rpx bg-white p-30rpx">
        <view class="h-96rpx w-96rpx shrink-0 flex-center rounded-full bg-[#3E63DD]">
          <text class="text-40rpx text-white">{{ avatarText }}</text>
        </view>
        <text class="ml-24rpx text-32rpx font-bold text-[#3C3C43]">{{ userInfo?.username }}</text>
      </view>

      <!-- 数据统计卡 -->
      <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx shadow-[0_4rpx_24rpx_rgba(62,99,221,0.06)]">
        <view class="flex">
          <view class="flex-1 flex-col flex-center">
            <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.total }}</text>
            <text class="mt-8rpx text-24rpx text-[#67676C]">笔记</text>
          </view>
          <view class="flex-1 flex-col flex-center">
            <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.tagCount }}</text>
            <text class="mt-8rpx text-24rpx text-[#67676C]">标签</text>
          </view>
          <view class="flex-1 flex-col flex-center">
            <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.pinnedCount }}</text>
            <text class="mt-8rpx text-24rpx text-[#67676C]">置顶</text>
          </view>
        </view>

        <!-- 掌握率环 -->
        <view class="mt-24rpx flex items-center justify-center border-t border-solid border-[#EEEEEE] pt-24rpx">
          <view class="h-120rpx w-120rpx flex-center rounded-full" :style="{ background: masteryRing }">
            <view class="h-88rpx w-88rpx flex-center rounded-full bg-white">
              <text class="text-28rpx font-bold text-[#42B883]">{{ masteryRate }}%</text>
            </view>
          </view>
          <view class="ml-24rpx flex flex-col">
            <text class="text-26rpx font-bold text-[#3C3C43]">掌握率</text>
            <text class="mt-8rpx text-22rpx text-[#67676C]">
              {{ stats.mastery.mastered }}/{{ stats.total }} 条已掌握
            </text>
          </view>
        </view>
      </view>

      <!-- 近 7 天趋势 -->
      <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx shadow-[0_4rpx_24rpx_rgba(62,99,221,0.06)]">
        <text class="text-28rpx font-bold text-[#3C3C43]">近 7 天新增</text>
        <view class="mt-24rpx flex h-200rpx items-end justify-between">
          <view v-for="(day, index) in trendDays" :key="index" class="flex flex-1 flex-col items-center">
            <text class="mb-8rpx text-20rpx text-[#67676C]">{{ day.count || "" }}</text>
            <view
              class="w-32rpx rounded-t-8rpx"
              :style="{ height: day.height + 'rpx', background: day.count ? '#3E63DD' : '#EEEEEE' }" />
            <text class="mt-8rpx text-20rpx text-[#67676C]">{{ day.label }}</text>
          </view>
        </view>
        <view class="mt-24rpx flex justify-center border-t border-solid border-[#EEEEEE] pt-24rpx">
          <view class="flex items-center">
            <view class="h-12rpx w-12rpx rounded-full bg-[#67676C]" />
            <text class="ml-8rpx text-22rpx text-[#67676C]">未掌握 {{ stats.mastery.none }}</text>
          </view>
          <view class="ml-32rpx flex items-center">
            <view class="h-12rpx w-12rpx rounded-full bg-[#F0B429]" />
            <text class="ml-8rpx text-22rpx text-[#67676C]">复习中 {{ stats.mastery.learning }}</text>
          </view>
          <view class="ml-32rpx flex items-center">
            <view class="h-12rpx w-12rpx rounded-full bg-[#42B883]" />
            <text class="ml-8rpx text-22rpx text-[#67676C]">已掌握 {{ stats.mastery.mastered }}</text>
          </view>
        </view>
      </view>

      <!-- 品牌关于区 -->
      <view class="mt-60rpx flex flex-col items-center">
        <text class="brand-title text-44rpx text-[#3E63DD]">通关秘籍</text>
        <text class="mt-12rpx text-24rpx text-[#67676C]">分享知识，随笔</text>
        <text class="mt-8rpx text-22rpx text-[#67676C]">v0.1.0</text>
      </view>

      <!-- 修改密码 -->
      <view
        class="mx-30rpx mt-40rpx flex h-96rpx items-center justify-between rounded-24rpx bg-white px-30rpx"
        @click="goPassword">
        <text class="text-28rpx text-[#3C3C43]">修改密码</text>
        <text class="text-28rpx text-[#67676C]">›</text>
      </view>

      <!-- 退出登录 -->
      <view
        class="mx-30rpx mt-40rpx h-88rpx flex-center rounded-44rpx border-2rpx border-solid border-[#D9303E] bg-white"
        @click="handleLogout">
        <text class="text-28rpx text-[#D9303E]">退出登录</text>
      </view>
    </template>

    <!-- 未登录兜底态（守卫已拦，极少出现） -->
    <view v-else class="flex flex-col items-center pt-280rpx">
      <text class="text-28rpx text-[#67676C]">您还未登录</text>
      <view class="mt-40rpx h-80rpx flex-center rounded-40rpx bg-[#3E63DD] px-48rpx" @click="goLogin">
        <text class="text-28rpx text-white">去登录</text>
      </view>
    </view>

    <CustomTabBar />
  </view>
</template>

<script setup lang="ts">
import type { AuthUserInfo } from "@/api/auth";
import type { RecordItem, RecordStats } from "@/types/record";
import { onShow } from "@dcloudio/uni-app";
import { getStats } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { useUserStore } from "@/store/modules/user";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 user.ts 基线注释），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type UserStoreProxy = {
  token: string;
  userInfo: AuthUserInfo | null;
  logout: () => void;
};

type RecordStoreProxy = Omit<ReturnType<typeof useRecordStore>, "records" | "total" | "allTags"> & {
  records: RecordItem[];
  total: number;
  allTags: string[];
};

const userStore = useUserStore() as unknown as UserStoreProxy;
const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const isLoggedIn = computed(() => Boolean(userStore.token));
const userInfo = computed(() => userStore.userInfo);
const avatarText = computed(() => userInfo.value?.username?.charAt(0) || "我");

// 统计走 GET /records/stats；接口失败时降级为本地缓存口径（趋势/分布无本地数据则置零）
const stats = reactive<RecordStats>({
  total: 0,
  tagCount: 0,
  pinnedCount: 0,
  trend7d: [0, 0, 0, 0, 0, 0, 0],
  mastery: { none: 0, learning: 0, mastered: 0 },
});

const trendDays = computed(() => {
  const max = Math.max(...stats.trend7d, 1);
  return stats.trend7d.map((count, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    return {
      count,
      // 满高 140rpx，给柱顶数字与柱底标签留约 56rpx（容器 h-200rpx）；0 值给 4rpx 底线
      height: count ? Math.max(Math.round((count / max) * 140), 16) : 4,
      label: `${day.getMonth() + 1}/${day.getDate()}`,
    };
  });
});

const masteryRate = computed(() => (stats.total ? Math.round((stats.mastery.mastered / stats.total) * 100) : 0));
const masteryRing = computed(
  () => `conic-gradient(#42B883 0% ${masteryRate.value}%, #EEEEEE ${masteryRate.value}% 100%)`,
);

const loadStats = async () => {
  try {
    const res = await getStats();
    Object.assign(stats, res);
  } catch {
    // request.ts 已统一 toast；离线降级为本地缓存口径（趋势/分布无本地数据则置零）
    stats.total = recordStore.total;
    stats.tagCount = recordStore.allTags.length;
    stats.pinnedCount = recordStore.records.filter((item) => item.isPinned).length;
    stats.trend7d = [0, 0, 0, 0, 0, 0, 0];
    stats.mastery = { none: 0, learning: 0, mastered: 0 };
  }
};

const handleLogout = () => {
  uni.showModal({
    title: "退出登录",
    content: "退出后需重新登录，确定退出？",
    confirmColor: "#D9303E",
    success: (res) => {
      if (!res.confirm) return;
      userStore.logout();
      uni.showToast({ title: "已退出登录", icon: "success" });
      uni.reLaunch({ url: "/pages/login/index" });
    },
  });
};

const goLogin = () => {
  uni.reLaunch({ url: "/pages/login/index" });
};

const goPassword = () => {
  uni.navigateTo({ url: "/pages/password/index" });
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  loadStats();
});
</script>

<style scoped>
.brand-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
