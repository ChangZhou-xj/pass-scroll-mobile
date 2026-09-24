<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-140rpx">
    <!-- 列表态 -->
    <template v-if="!current">
      <view v-if="snapshots.length" class="mx-30rpx mt-24rpx overflow-hidden rounded-24rpx bg-white px-30rpx">
        <view
          v-for="item in snapshots"
          :key="item.id"
          class="flex items-center border-b border-solid border-[#EEEEEE] py-24rpx"
          @click="openSnapshot(item)">
          <text class="mr-16rpx rounded-8rpx bg-[#3E63DD]/10 px-12rpx py-2rpx text-22rpx text-[#3E63DD]">
            v{{ item.version }}
          </text>
          <text class="flex-1 truncate text-28rpx text-[#3C3C43]">{{ item.title }}</text>
          <text class="ml-16rpx shrink-0 text-22rpx text-[#67676C]">{{ formatTime(item.createdAt) }}</text>
        </view>
      </view>

      <!-- 空态 -->
      <view v-else class="flex flex-col items-center pt-280rpx">
        <text class="text-28rpx text-[#67676C]">还没有历史版本</text>
        <text class="mt-12rpx text-24rpx text-[#67676C]">编辑保存后自动生成版本快照</text>
      </view>
    </template>

    <!-- 预览态 -->
    <template v-else>
      <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
        <text class="note-title block text-44rpx font-bold text-[#3C3C43]">{{ current.title }}</text>

        <view class="mt-20rpx flex items-center">
          <text class="mr-12rpx rounded-8rpx bg-[#3E63DD]/10 px-12rpx py-2rpx text-22rpx text-[#3E63DD]">
            v{{ current.version }}
          </text>
          <text class="text-22rpx text-[#67676C]">{{ formatTime(current.createdAt) }}</text>
        </view>

        <view class="my-24rpx h-1rpx bg-[#EEEEEE]" />

        <!-- markdown 分段 -->
        <view v-for="(seg, index) in segments" :key="index">
          <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
        </view>
      </view>

      <!-- 底部固定双按钮（样式照复习页） -->
      <view class="fixed bottom-0 left-0 right-0 border-t border-solid border-[#EEEEEE] bg-white px-30rpx py-16rpx">
        <view class="flex">
          <view
            class="mr-20rpx h-88rpx flex-1 flex-center rounded-44rpx border-2rpx border-solid border-[#3E63DD] bg-white"
            @click="backToList">
            <text class="text-28rpx text-[#3E63DD]">返回列表</text>
          </view>
          <view class="h-88rpx flex-1 flex-center rounded-44rpx bg-[#3E63DD]" @click="handleRestore">
            <text class="text-28rpx text-white">恢复此版本</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem, SnapshotDetail, SnapshotItem } from "@/types/record";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { getSnapshot, listSnapshots, restoreSnapshot } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { useUserStore } from "@/store/modules/user";
import { formatTime } from "@/utils/format";
import { parseNote } from "@/utils/markdown";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 profile 页同模式），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type UserStoreProxy = {
  token: string;
};

type RecordStoreProxy = Omit<ReturnType<typeof useRecordStore>, "records"> & {
  records: RecordItem[];
};

const userStore = useUserStore() as unknown as UserStoreProxy;
const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const recordId = ref("");
const snapshots = ref<SnapshotItem[]>([]);
const current = ref<SnapshotDetail>();

const segments = computed(() => (current.value ? parseNote(current.value.content) : []));

async function loadList() {
  try {
    snapshots.value = await listSnapshots(recordId.value);
  } catch {
    // request.ts 已统一 toast
  }
}

const openSnapshot = async (item: SnapshotItem) => {
  try {
    current.value = await getSnapshot(recordId.value, item.id);
  } catch {
    // request.ts 已统一 toast
  }
};

// 恢复后列表已变，返回时重拉
const backToList = () => {
  current.value = undefined;
  loadList();
};

const handleRestore = () => {
  uni.showModal({
    title: "恢复此版本",
    content: "将以此版本覆盖当前内容，当前内容会留存为新的历史版本。",
    confirmColor: "#3E63DD",
    success: async (res) => {
      if (!res.confirm || !current.value) return;
      const sid = current.value.id;
      try {
        await restoreSnapshot(recordId.value, sid);
        await recordStore.fetchList();
        uni.showToast({ title: "已恢复", icon: "none" });
        uni.navigateBack();
      } catch {
        // request.ts 已统一 toast
      }
    },
  });
};

onLoad((query) => {
  recordId.value = (query?.id as string) ?? "";
  uni.setNavigationBarTitle({ title: "历史版本" });
});

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  if (!current.value) loadList();
});
</script>

<style scoped>
.note-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
