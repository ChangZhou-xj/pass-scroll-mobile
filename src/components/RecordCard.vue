<template>
  <view class="rounded-24rpx bg-white p-30rpx mb-24rpx" @click="handleClick">
    <view class="flex items-center">
      <text v-if="record.isPinned" class="mr-8rpx text-32rpx">📌</text>
      <text class="truncate text-32rpx font-bold text-[#3C3C43]">{{ record.title }}</text>
    </view>
    <text class="line-clamp-2 mt-12rpx text-26rpx text-[#67676C]">{{ record.content }}</text>
    <view class="mt-20rpx flex items-start justify-between">
      <view class="flex flex-1 flex-wrap">
        <text
          v-for="tag in record.tags"
          :key="tag"
          class="mr-12rpx mb-8rpx rounded-12rpx bg-[#3E63DD]/10 px-16rpx py-4rpx text-22rpx text-[#3E63DD]">
          {{ tag }}
        </text>
      </view>
      <text class="ml-16rpx shrink-0 text-22rpx text-[#67676C]">{{ formatTime(record.updatedAt) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { formatTime } from "@/utils/format";

const props = defineProps<{ record: RecordItem }>();
const emit = defineEmits<{
  click: [record: RecordItem];
}>();

const handleClick = () => {
  emit("click", props.record);
};
</script>
