<template>
  <view
    class="fixed bottom-0 left-0 right-0 z-50 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white"
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
import { activeTabPath, goToTab } from "@/utils/navigation";

const items = [
  { path: "pages/index/index", icon: "home", text: "首页" },
  { path: "pages/review/index", icon: "books", text: "复习" },
  { path: "pages/profile/index", icon: "user", text: "我的" },
];

// tab 页保活后本组件常驻不重建，高亮态必须响应式（tab 页 onShow 会同步它）
const activePath = activeTabPath;

const colorFor = (path: string) => (activePath.value === path ? T.ink : T.secondaryText);

const go = (path: string) => {
  if (activePath.value === path) return;
  goToTab(path);
};
</script>
