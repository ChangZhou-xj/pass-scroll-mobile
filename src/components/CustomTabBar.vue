<template>
  <view
    class="fixed bottom-0 left-0 right-0 z-50 border-t-2rpx border-solid border-[#E3E3E6] bg-white"
    :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }">
    <view class="h-100rpx flex">
      <view
        v-for="item in items"
        :key="item.path"
        class="flex-1 flex flex-col items-center justify-center"
        @click="go(item.path)">
        <wd-icon :name="item.icon" :size="activePath === item.path ? '22' : '20'" :color="colorFor(item.path)" />
        <text class="mt-4rpx text-20rpx" :style="{ color: colorFor(item.path) }">{{ item.text }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";

// eslint globals 只注册了 uni，未含 uni 的另一全局 API getCurrentPages（类型由 @dcloudio/types 提供），
// 此处按实际用到的字段做局部 ambient 声明，避免 no-undef 误报
declare const getCurrentPages: () => Array<{ route?: string }>;

const items = [
  { path: "pages/index/index", icon: "home", text: "首页" },
  { path: "pages/review/index", icon: "books", text: "复习" },
  { path: "pages/profile/index", icon: "user", text: "我的" },
];

const pages = getCurrentPages();
const activePath = pages.length ? pages[pages.length - 1].route : "";

const colorFor = (path: string) => (activePath === path ? T.ink : T.secondaryText);

const go = (path: string) => {
  if (activePath === path) return;
  uni.reLaunch({ url: `/${path}` });
};
</script>
