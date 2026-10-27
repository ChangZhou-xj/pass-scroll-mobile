<template>
  <view class="min-h-screen bg-white" :style="{ paddingBottom: 'calc(220rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar title="我的" />

    <template v-if="isLoggedIn">
      <!-- 用户卡：白卡 + hairline 描边（DESIGN.md feature-card-light） -->
      <view
        class="mx-30rpx mt-24rpx flex items-center rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-30rpx">
        <view class="h-96rpx w-96rpx shrink-0 flex-center rounded-full bg-[#0D0D0D]">
          <text class="text-40rpx text-white">{{ avatarText }}</text>
        </view>
        <text class="ml-24rpx text-32rpx font-bold text-[#0D0D0D]">{{ userInfo?.username }}</text>
      </view>

      <!-- lime 签名块：统计 + 近 7 天趋势 + 掌握度分布（原两张白卡合并） -->
      <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#D9F2B4] p-48rpx">
        <text class="block font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">STATS</text>
        <view class="mt-24rpx flex">
          <view class="flex-1 flex-col flex-center">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.total }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">笔记</text>
          </view>
          <view class="flex-1 flex-col flex-center">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.tagCount }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">标签</text>
          </view>
          <view class="flex-1 flex-center flex-col">
            <text class="text-56rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">{{ stats.pinnedCount }}</text>
            <text class="mt-4rpx font-mono text-20rpx uppercase tracking-[2rpx] text-[#0D0D0D]">置顶</text>
          </view>
        </view>

        <view class="mt-32rpx h-2rpx bg-[#A9DCC3]" />

        <text class="mt-24rpx block text-22rpx text-[#0D0D0D]">今日待复习 {{ stats.dueCount }} 张</text>

        <view class="mt-32rpx flex h-200rpx items-end justify-between">
          <view v-for="(day, index) in trendDays" :key="index" class="flex flex-1 flex-col items-center">
            <text class="mb-8rpx text-20rpx text-[#0D0D0D]">{{ day.count || "" }}</text>
            <view
              class="w-32rpx rounded-t-8rpx"
              :style="{ height: day.height + 'rpx', background: day.count ? T.ink : T.hairline }" />
            <text class="mt-8rpx font-mono text-20rpx tracking-[2rpx] text-[#0D0D0D]">{{ day.label }}</text>
          </view>
        </view>

        <view class="mt-32rpx flex items-center justify-between">
          <view class="flex items-center">
            <view class="h-120rpx w-120rpx flex-center rounded-full" :style="{ background: masteryRing }">
              <view class="h-88rpx w-88rpx flex-center rounded-full bg-white">
                <text class="text-28rpx font-bold text-[#42B883]">{{ masteryRate }}%</text>
              </view>
            </view>
            <view class="ml-20rpx flex flex-col">
              <text class="text-26rpx font-semibold text-[#0D0D0D]">掌握率</text>
              <text class="mt-4rpx text-22rpx text-[#0D0D0D]">
                {{ stats.mastery.mastered }}/{{ stats.total }} 条已掌握
              </text>
            </view>
          </view>
          <view class="flex flex-col">
            <text class="text-22rpx text-[#0D0D0D]">未掌握 {{ stats.mastery.none }}</text>
            <text class="mt-8rpx text-22rpx text-[#0D0D0D]">复习中 {{ stats.mastery.learning }}</text>
            <text class="mt-8rpx text-22rpx text-[#0D0D0D]">已掌握 {{ stats.mastery.mastered }}</text>
          </view>
        </view>
      </view>

      <!-- 品牌关于区 -->
      <view class="mt-60rpx flex flex-col items-center">
        <text class="text-40rpx font-extrabold tracking-[-1rpx] text-[#0D0D0D]">通关秘籍</text>
        <text class="mt-12rpx text-24rpx text-[#0D0D0D]">分享知识，随笔</text>
        <text class="mt-8rpx font-mono text-22rpx text-[#67676C]">v0.1.0</text>
      </view>

      <!-- 记忆宫殿 + 记忆曲线 + 我的简历 + 修改密码 + 退出登录：一张白卡五行（退出为红字行） -->
      <view class="mx-30rpx mt-40rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx">
        <view
          class="h-100rpx flex items-center justify-between border-0 border-b-2rpx border-solid border-[#EFEFF1]"
          @click="goPalace">
          <text class="text-28rpx text-[#0D0D0D]">🏛 记忆宫殿</text>
          <view class="flex items-center">
            <text class="font-mono text-20rpx tracking-[2rpx] text-[#67676C]">位置法</text>
            <text class="ml-8rpx text-28rpx text-[#67676C]">›</text>
          </view>
        </view>
        <view
          class="h-100rpx flex items-center justify-between border-0 border-b-2rpx border-solid border-[#EFEFF1]"
          @click="goCurve">
          <text class="text-28rpx text-[#0D0D0D]">📈 记忆曲线</text>
          <view class="flex items-center">
            <text class="font-mono text-20rpx tracking-[2rpx] text-[#67676C]">{{ curveName }}</text>
            <text class="ml-8rpx text-28rpx text-[#67676C]">›</text>
          </view>
        </view>
        <view
          class="h-100rpx flex items-center justify-between border-0 border-b-2rpx border-solid border-[#EFEFF1]"
          @click="goResume">
          <text class="text-28rpx text-[#0D0D0D]">我的简历</text>
          <view class="flex items-center">
            <text class="font-mono text-20rpx tracking-[2rpx] text-[#67676C]">PDF</text>
            <text class="ml-8rpx text-28rpx text-[#67676C]">›</text>
          </view>
        </view>
        <view
          class="h-100rpx flex items-center justify-between border-0 border-b-2rpx border-solid border-[#EFEFF1]"
          @click="goPassword">
          <text class="text-28rpx text-[#0D0D0D]">修改密码</text>
          <text class="text-28rpx text-[#67676C]">›</text>
        </view>
        <view class="h-100rpx flex items-center" @click="handleLogout">
          <text class="text-28rpx text-[#D9303E]">退出登录</text>
        </view>
      </view>
    </template>

    <!-- 未登录兜底态（守卫已拦，极少出现） -->
    <view v-else class="flex flex-col items-center pt-280rpx">
      <text class="text-28rpx text-[#67676C]">您还未登录</text>
      <view class="mt-40rpx">
        <PsButton size="lg" @click="goLogin">去登录</PsButton>
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
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";

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
const srsStore = useSrsStore() as unknown as { presetKey: string };

/** 当前使用的记忆曲线名（自定义时不叫"自定义"，直接显示用户实际改过的配置更直观） */
const CURVE_NAMES: Record<string, string> = { classic: "经典", relaxed: "舒缓", intensive: "密集", custom: "自定义" };
const curveName = computed(() => CURVE_NAMES[srsStore.presetKey] ?? "自定义");

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
  dueCount: 0,
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
  () => `conic-gradient(${T.masteryGreen} 0% ${masteryRate.value}%, ${T.hairline} ${masteryRate.value}% 100%)`,
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

const goPalace = () => {
  uni.navigateTo({ url: "/pages/palace/index" });
};

const goCurve = () => {
  uni.navigateTo({ url: "/pages/curve/index" });
};

// 简历预览页自行处理登录守卫与 PDF 打开
const goResume = () => {
  uni.navigateTo({ url: "/pages/resume/index" });
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  loadStats();
});
</script>
