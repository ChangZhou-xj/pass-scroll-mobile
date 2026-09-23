<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-60rpx">
    <template v-if="isLoggedIn">
      <!-- 用户卡 -->
      <view class="mx-30rpx mt-24rpx flex items-center rounded-24rpx bg-white p-30rpx">
        <view class="h-96rpx w-96rpx shrink-0 flex-center rounded-full bg-[#3E63DD]">
          <text class="text-40rpx text-white">{{ avatarText }}</text>
        </view>
        <text class="ml-24rpx text-32rpx font-bold text-[#3C3C43]">{{ userInfo?.username }}</text>
      </view>

      <!-- 数据统计卡 -->
      <view class="mx-30rpx mt-24rpx flex rounded-24rpx bg-white p-30rpx">
        <view class="flex-1 flex-col flex-center">
          <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.total }}</text>
          <text class="mt-8rpx text-24rpx text-[#67676C]">笔记</text>
        </view>
        <view class="flex-1 flex-col flex-center">
          <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.tags }}</text>
          <text class="mt-8rpx text-24rpx text-[#67676C]">标签</text>
        </view>
        <view class="flex-1 flex-col flex-center">
          <text class="text-44rpx font-bold text-[#3E63DD]">{{ stats.pinned }}</text>
          <text class="mt-8rpx text-24rpx text-[#67676C]">置顶</text>
        </view>
      </view>

      <!-- 品牌关于区 -->
      <view class="mt-60rpx flex flex-col items-center">
        <text class="brand-title text-44rpx text-[#3E63DD]">通关秘籍</text>
        <text class="mt-12rpx text-24rpx text-[#67676C]">分享知识，随笔</text>
        <text class="mt-8rpx text-22rpx text-[#67676C]">v0.1.0</text>
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
  </view>
</template>

<script setup lang="ts">
import type { AuthUserInfo } from "@/api/auth";
import type { RecordItem } from "@/types/record";
import { onShow } from "@dcloudio/uni-app";
import { listRecords } from "@/api/record";
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

// 统计不走 recordStore（避免被首页筛选污染）；接口失败时降级为本地缓存口径
const stats = reactive({ total: 0, tags: 0, pinned: 0 });

const loadStats = async () => {
  try {
    const res = await listRecords({ page: 1, pageSize: 50 });
    const tagSet = new Set<string>();
    res.list.forEach((item) => item.tags.forEach((tag) => tagSet.add(tag)));
    stats.total = res.total;
    stats.tags = tagSet.size;
    stats.pinned = res.list.filter((item) => item.isPinned).length;
  } catch {
    // request.ts 已统一 toast
    stats.total = recordStore.total;
    stats.tags = recordStore.allTags.length;
    stats.pinned = recordStore.records.filter((item) => item.isPinned).length;
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
