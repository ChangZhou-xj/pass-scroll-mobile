<template>
  <view :style="wrapStyle">
    <view class="h-88rpx flex items-center px-24rpx" :style="rowStyle">
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

// 微信右上角胶囊按钮避让量：right 插槽不能压在胶囊下，预留「屏幕宽 - 胶囊左缘 + 8px 间距」。
// 其他端为 0，此时不写内联，右内衬沿用 class 的 px-24rpx（内联只覆盖 paddingRight，左侧 class 不受影响）。
let capsuleReservePx = 0;
// #ifdef MP-WEIXIN
capsuleReservePx = uni.getSystemInfoSync().windowWidth - uni.getMenuButtonBoundingClientRect().left;
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

// 仅 MP-WEIXIN 下有值；空串在其他端不产生任何内联样式，class 的 24rpx 左右内衬保持不变
const rowStyle = computed(() => (capsuleReservePx > 0 ? `padding-right:${capsuleReservePx + 8}px;` : ""));
</script>
