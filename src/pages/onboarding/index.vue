<template>
  <view class="relative box-border min-h-screen bg-white" :style="{ paddingTop: statusBarPx + 'px' }">
    <!-- 跳过 -->
    <view class="absolute right-40rpx z-50" :style="{ top: statusBarPx + 20 + 'px' }" @click="finish">
      <text class="text-26rpx text-[#67676C]">跳过</text>
    </view>

    <swiper
      class="h-screen"
      :style="{ height: 'calc(100vh - ' + statusBarPx + 'px)' }"
      :indicator-dots="true"
      indicator-color="rgba(13,13,13,0.15)"
      indicator-active-color="#0D0D0D"
      @change="currentIndex = $event.detail.current">
      <swiper-item v-for="(screen, index) in screens" :key="index">
        <view class="h-full flex flex-col items-center justify-center">
          <text class="text-120rpx">{{ screen.emoji }}</text>
          <text class="mt-24rpx text-56rpx font-extrabold tracking-[-1rpx]" :style="{ color: screen.color }">
            {{ screen.title }}
          </text>
          <text class="mt-20rpx text-28rpx text-[#67676C]">{{ screen.desc }}</text>
        </view>
      </swiper-item>
    </swiper>

    <!-- 最后一屏：开始通关 -->
    <view v-if="currentIndex === screens.length - 1" class="absolute bottom-80rpx left-0 right-0 flex justify-center">
      <view class="h-88rpx w-400rpx flex-center rounded-44rpx bg-[#0D0D0D]" @click="finish">
        <text class="text-28rpx text-white">开始通关</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { getStatusBarPx } from "@/utils/system";

// 本页无 NavBar（引导页设计如此），App/MP 端需自行避让状态栏
const statusBarPx = getStatusBarPx();

const screens = [
  { emoji: "📝", title: "随手记", desc: "面试题、知识点，markdown 全支持", color: "#0D0D0D" },
  { emoji: "🎯", title: "随机复习", desc: "答案默认折叠，先自己作答再对照", color: "#0D0D0D" },
  { emoji: "🏆", title: "看得见掌握", desc: "标记掌握度，复习进度一目了然", color: "#0D0D0D" },
];

const currentIndex = ref(0);

const finish = () => {
  uni.setStorageSync("pass_scroll_onboarded_v1", "1");
  uni.reLaunch({ url: "/pages/login/index" });
};
</script>
