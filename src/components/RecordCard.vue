<template>
  <view class="mb-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-40rpx" @click="handleClick">
    <view class="flex items-center">
      <text v-if="record.isPinned" class="mr-8rpx text-32rpx">📌</text>
      <text class="truncate text-32rpx font-semibold tracking-[-1rpx] text-[#0D0D0D]">{{ record.title }}</text>
      <text
        v-if="record.mastery !== 'NONE'"
        class="ml-12rpx shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"
        :style="masteryStyle">
        {{ masteryText }}
      </text>
    </view>
    <text class="line-clamp-2 mt-12rpx text-26rpx text-[#0D0D0D]">{{ summary }}</text>
    <view class="mt-20rpx flex items-start justify-between">
      <view class="flex flex-1 flex-wrap">
        <text
          v-for="tag in record.tags"
          :key="tag"
          class="mr-12rpx mb-8rpx rounded-full bg-[#F4F5F7] px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
          {{ tag }}
        </text>
      </view>
      <text class="ml-16rpx shrink-0 font-mono text-20rpx tracking-[2rpx] text-[#67676C]">
        {{ formatTime(record.updatedAt) }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { T } from "@/theme/tokens";
import { formatTime, plainText } from "@/utils/format";

const props = defineProps<{ record: RecordItem }>();
const emit = defineEmits<{
  click: [record: RecordItem];
}>();

const summary = computed(() => plainText(props.record.content));

const masteryText = computed(() => (props.record.mastery === "MASTERED" ? "已掌握" : "复习中"));
const masteryStyle = computed(() => {
  const c = props.record.mastery === "MASTERED" ? T.masteryGreen : T.masteryAmber;
  return `border-color:${c};color:${c};`;
});

const handleClick = () => {
  emit("click", props.record);
};
</script>
