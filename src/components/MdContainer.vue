<template>
  <!-- tip / warning / danger：左侧色条 + 标题 + 容器体 -->
  <view
    v-if="kind !== 'details'"
    class="my-16rpx flex overflow-hidden rounded-16rpx"
    :style="{ backgroundColor: theme.bg }">
    <view class="w-8rpx shrink-0" :style="{ backgroundColor: theme.color }" />
    <view class="flex-1 p-24rpx">
      <view class="mb-12rpx">
        <text class="text-28rpx font-bold" :style="{ color: theme.color }">{{ title }}</text>
      </view>
      <rich-text :nodes="html" />
    </view>
  </view>

  <!-- details：默认折叠的描边卡片，点按头部展开/收起 -->
  <view v-else class="my-16rpx rounded-16rpx border-2rpx border-solid border-[#3E63DD] bg-white p-24rpx">
    <view class="flex items-center justify-between" @click="toggleOpen">
      <text class="text-28rpx font-bold text-[#3E63DD]">{{ title }}</text>
      <text class="ml-16rpx text-24rpx text-[#3E63DD]">{{ isOpen ? "▼" : "▶" }}</text>
    </view>
    <rich-text v-if="isOpen" :nodes="html" class="mt-16rpx" />
  </view>
</template>

<script setup lang="ts">
import type { ContainerKind } from "@/utils/markdown";
import { ref, computed } from "vue";

const props = defineProps<{ kind: ContainerKind; title: string; html: string }>();

const THEMES: Record<Exclude<ContainerKind, "details">, { color: string; bg: string }> = {
  tip: { color: "#3E63DD", bg: "rgba(62,99,221,0.08)" },
  warning: { color: "#F0B429", bg: "rgba(240,180,41,0.12)" },
  danger: { color: "#D9303E", bg: "rgba(217,48,62,0.08)" },
};

const theme = computed(() => THEMES[props.kind as Exclude<ContainerKind, "details">]);

const isOpen = ref(false);

const toggleOpen = () => {
  isOpen.value = !isOpen.value;
};
</script>
