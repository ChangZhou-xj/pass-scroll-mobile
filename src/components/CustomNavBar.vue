<template>
  <view :style="wrapStyle">
    <view class="h-88rpx flex items-center px-24rpx">
      <view
        v-if="showBack && canGoBack"
        class="mr-16rpx h-72rpx w-72rpx shrink-0 flex-center rounded-full"
        :style="{ background: T.surfaceSoft }"
        @click="goBack">
        <wd-icon name="chevron-left" size="20" :color="T.ink" />
      </view>
      <text v-if="title" class="font-mono text-22rpx uppercase tracking-[2rpx] text-[#0D0D0D]">{{ title }}</text>
      <view class="flex-1" />
      <slot name="right" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { T } from "@/theme/tokens";
import { getStatusBarPx } from "@/utils/system";

const props = withDefaults(defineProps<{ title?: string; showBack?: boolean; transparent?: boolean }>(), {
  title: "",
  showBack: false,
  transparent: false,
});

const statusBarPx = getStatusBarPx();

const canGoBack = getCurrentPages().length > 1;

const goBack = () => {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
  } else {
    uni.reLaunch({ url: "/pages/index/index" });
  }
};

const wrapStyle = computed(
  () => `padding-top:${statusBarPx}px;background:${props.transparent ? "transparent" : T.canvas};`,
);
</script>
