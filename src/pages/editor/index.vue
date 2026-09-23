<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-160rpx">
    <!-- 表单卡片 -->
    <view class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
      <!-- 标题 -->
      <input
        v-model="title"
        class="h-80rpx w-full border-b border-solid border-[#EEEEEE] text-32rpx text-[#3C3C43]"
        placeholder="标题"
        placeholder-style="color: #67676C;" />

      <!-- 内容 -->
      <textarea
        v-model="content"
        class="mt-24rpx min-h-400rpx w-full text-28rpx leading-7 text-[#3C3C43]"
        auto-height
        placeholder="支持 markdown 语法…"
        placeholder-style="color: #67676C;" />

      <!-- 标签区 -->
      <view class="mt-24rpx flex flex-wrap border-t border-solid border-[#EEEEEE] pt-24rpx">
        <view
          v-for="(tag, index) in tags"
          :key="tag"
          class="mr-12rpx mb-8rpx flex items-center rounded-12rpx bg-[#3E63DD]/10 px-16rpx py-4rpx">
          <text class="text-22rpx text-[#3E63DD]">{{ tag }}</text>
          <text class="ml-8rpx text-22rpx text-[#3E63DD]" @click="removeTag(index)">×</text>
        </view>
      </view>
      <input
        v-model="tagInput"
        class="mt-8rpx h-64rpx w-full text-26rpx text-[#3C3C43]"
        placeholder="输入标签后确认添加"
        placeholder-style="color: #67676C;"
        confirm-type="done"
        @confirm="addTag" />
    </view>

    <!-- 底部保存按钮 -->
    <view class="fixed bottom-0 left-0 right-0 border-t border-solid border-[#EEEEEE] bg-white px-30rpx py-16rpx">
      <view class="h-88rpx flex-center rounded-44rpx bg-[#3E63DD]" @click="handleSave">
        <text class="text-30rpx text-white">保存</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { onLoad } from "@dcloudio/uni-app";
import { getRecord } from "@/api/record";
import { useRecordStore } from "@/store/record";

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见首页同模式），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type RecordStoreProxy = Omit<
  ReturnType<typeof useRecordStore>,
  "records" | "total" | "loading" | "keyword" | "activeTag" | "allTags" | "getRecordById"
> & {
  records: RecordItem[];
  total: number;
  loading: boolean;
  keyword: string;
  activeTag: string;
  allTags: string[];
  getRecordById: (id: string) => RecordItem | undefined;
};

const recordStore = useRecordStore() as unknown as RecordStoreProxy;

const MAX_TAGS = 10;

const editId = ref<string | undefined>(undefined);
const isEdit = computed(() => Boolean(editId.value));

const title = ref("");
const content = ref("");
const tags = ref<string[]>([]);
const tagInput = ref("");
const saving = ref(false);

async function prefill(id: string) {
  const existing = recordStore.getRecordById(id);
  let record: RecordItem | undefined = existing;
  if (!record) {
    try {
      record = await getRecord(id);
    } catch {
      // request.ts 已统一 toast
    }
  }
  if (record) {
    title.value = record.title;
    content.value = record.content;
    tags.value = [...record.tags];
  }
}

const addTag = () => {
  const tag = tagInput.value.trim();
  tagInput.value = "";
  if (!tag) return;
  if (tags.value.length >= MAX_TAGS) {
    uni.showToast({ title: "标签最多 10 个", icon: "none" });
    return;
  }
  if (tags.value.includes(tag)) return;
  tags.value.push(tag);
};

const removeTag = (index: number) => {
  tags.value.splice(index, 1);
};

const handleSave = async () => {
  if (saving.value) return;
  const trimmedTitle = title.value.trim();
  if (!trimmedTitle) {
    uni.showToast({ title: "请输入标题", icon: "none" });
    return;
  }
  saving.value = true;
  try {
    if (isEdit.value && editId.value) {
      await recordStore.editRecord({ id: editId.value, title: trimmedTitle, content: content.value, tags: tags.value });
    } else {
      await recordStore.addRecord({ title: trimmedTitle, content: content.value, tags: tags.value });
    }
    uni.showToast({ title: "已保存", icon: "none" });
    uni.navigateBack();
  } catch {
    // request.ts 已统一 toast
  } finally {
    saving.value = false;
  }
};

onLoad((query) => {
  const id = query?.id as string | undefined;
  editId.value = id;
  uni.setNavigationBarTitle({ title: id ? "编辑记录" : "新建记录" });
  if (id) {
    prefill(id);
  }
});
</script>
