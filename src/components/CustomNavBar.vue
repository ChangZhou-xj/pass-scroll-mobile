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

const props = withDefaults(defineProps<{ title?: string; showBack?: boolean; transparent?: boolean }>(), {
  title: "",
  showBack: false,
  transparent: false,
});

// H5 无原生状态栏恒 0；App/MP 端 statusBarHeight 异常为 0 时兜底 20px
let statusBarPx = 0;
// #ifndef H5
statusBarPx = uni.getSystemInfoSync().statusBarHeight || 20;
// #endif

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
