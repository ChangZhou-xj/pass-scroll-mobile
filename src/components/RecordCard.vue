<template>
  <view class="rounded-24rpx bg-white p-30rpx mb-24rpx shadow-[0_4rpx_24rpx_rgba(62,99,221,0.06)]" @click="handleClick">
    <view class="flex items-center">
      <text v-if="record.isPinned" class="mr-8rpx text-32rpx">📌</text>
      <text class="truncate text-32rpx font-bold text-[#3C3C43]">{{ record.title }}</text>
      <text
        v-if="record.mastery !== 'NONE'"
        class="ml-12rpx shrink-0 text-20rpx"
        :style="{ color: record.mastery === 'MASTERED' ? '#42B883' : '#F0B429' }">
        {{ record.mastery === "MASTERED" ? "已掌握" : "复习中" }}
      </text>
    </view>
    <text class="line-clamp-2 mt-12rpx text-26rpx text-[#67676C]">{{ summary }}</text>
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
import { formatTime, plainText } from "@/utils/format";

const props = defineProps<{ record: RecordItem }>();
const emit = defineEmits<{
  click: [record: RecordItem];
}>();

const summary = computed(() => plainText(props.record.content));

const handleClick = () => {
  emit("click", props.record);
};
</script>
