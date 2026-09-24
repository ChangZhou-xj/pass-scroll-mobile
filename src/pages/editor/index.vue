<template>
  <view class="min-h-screen bg-[#F7F8FA] pb-160rpx">
    <!-- 编辑/预览切换 -->
    <view class="mx-30rpx mt-24rpx flex h-64rpx rounded-32rpx bg-[#EEEEEE] p-4rpx">
      <view
        class="flex-1 flex-center rounded-28rpx"
        :class="mode === 'edit' ? 'bg-[#3E63DD]' : ''"
        @click="mode = 'edit'">
        <text class="text-26rpx" :class="mode === 'edit' ? 'text-white' : 'text-[#67676C]'">编辑</text>
      </view>
      <view
        class="flex-1 flex-center rounded-28rpx"
        :class="mode === 'preview' ? 'bg-[#3E63DD]' : ''"
        @click="mode = 'preview'">
        <text class="text-26rpx" :class="mode === 'preview' ? 'text-white' : 'text-[#67676C]'">预览</text>
      </view>
    </view>

    <!-- 表单卡片 -->
    <view v-if="mode === 'edit'" class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
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

    <!-- 预览卡片 -->
    <view v-else class="mx-30rpx mt-24rpx rounded-24rpx bg-white p-30rpx">
      <text class="note-title block text-40rpx font-bold text-[#3C3C43]">{{ title.trim() || "未命名" }}</text>
      <view v-if="tags.length" class="mt-20rpx flex flex-wrap">
        <text
          v-for="tag in tags"
          :key="tag"
          class="mr-12rpx mb-8rpx rounded-12rpx bg-[#3E63DD]/10 px-16rpx py-4rpx text-22rpx text-[#3E63DD]">
          {{ tag }}
        </text>
      </view>
      <view class="my-24rpx h-1rpx bg-[#EEEEEE]" />
      <template v-if="content.trim()">
        <view v-for="(seg, index) in previewSegments" :key="index">
          <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" />
        </view>
      </template>
      <view v-else class="flex-center py-60rpx">
        <text class="text-26rpx text-[#67676C]">暂无内容，切回编辑写点什么吧</text>
      </view>
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
import { parseNote } from "@/utils/markdown";

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

const mode = ref<"edit" | "preview">("edit");
const version = ref<number>();
const previewSegments = computed(() => parseNote(content.value));

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
    version.value = record.version;
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
      await recordStore.editRecord({
        id: editId.value,
        title: trimmedTitle,
        content: content.value,
        tags: tags.value,
        expectedVersion: version.value,
      });
    } else {
      await recordStore.addRecord({ title: trimmedTitle, content: content.value, tags: tags.value });
    }
    uni.showToast({ title: "已保存", icon: "none" });
    uni.navigateBack();
  } catch (e) {
    // 乐观锁冲突：绕过 store 直拉远端最新内容与版本号，用户基于最新版继续编辑
    if ((e as { code?: number })?.code === 10409 && editId.value) {
      try {
        const fresh = await getRecord(editId.value);
        title.value = fresh.title;
        content.value = fresh.content;
        tags.value = [...fresh.tags];
        version.value = fresh.version;
        mode.value = "edit";
      } catch {
        // request.ts 已统一 toast
      }
    }
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

<style scoped>
.note-title {
  font-family: "STKaiti", "KaiTi", "Kaiti SC", "SimSun", serif;
}
</style>
