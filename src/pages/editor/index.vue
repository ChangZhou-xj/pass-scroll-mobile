<template>
  <!-- pb-40rpx：底部固定保存栏已删除（保存入口移入导航右插槽），不再需要为固定栏预留 160rpx 避让 -->
  <view class="min-h-screen bg-white pb-40rpx">
    <CustomNavBar :title="navTitle" show-back>
      <template #right>
        <PsButton size="sm" :disabled="saving" @click="handleSave">保存</PsButton>
      </template>
    </CustomNavBar>

    <!-- 编辑/预览切换（颜色走 :style：动态 class 中的 arbitrary value 不会被 transformerClass 转换） -->
    <view class="mx-30rpx mt-24rpx flex h-72rpx rounded-full bg-[#F4F5F7] p-6rpx">
      <view
        class="flex-1 flex-center rounded-full"
        :style="{ background: mode === 'edit' ? T.ink : 'transparent' }"
        @click="mode = 'edit'">
        <text class="text-26rpx" :style="{ color: mode === 'edit' ? T.onPrimary : T.ink }">编辑</text>
      </view>
      <view
        class="flex-1 flex-center rounded-full"
        :style="{ background: mode === 'preview' ? T.ink : 'transparent' }"
        @click="mode = 'preview'">
        <text class="text-26rpx" :style="{ color: mode === 'preview' ? T.onPrimary : T.ink }">预览</text>
      </view>
    </view>

    <!-- 表单卡片 -->
    <view
      v-if="mode === 'edit'"
      class="mx-30rpx mt-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-30rpx">
      <!-- 标题 -->
      <input
        v-model="title"
        class="h-80rpx w-full border-0 border-b-2rpx border-solid border-[#E3E3E6] text-32rpx text-[#0D0D0D]"
        placeholder="标题"
        placeholder-style="color: #67676C;" />

      <!-- 内容 -->
      <textarea
        v-model="content"
        class="mt-24rpx min-h-400rpx w-full text-28rpx leading-7 text-[#0D0D0D]"
        auto-height
        placeholder="支持 markdown 语法…"
        placeholder-style="color: #67676C;" />

      <!-- 标签区 -->
      <view class="mt-24rpx flex flex-wrap border-0 border-t-2rpx border-solid border-[#E3E3E6] pt-24rpx">
        <view
          v-for="(tag, index) in tags"
          :key="tag"
          class="mr-12rpx mb-8rpx flex items-center rounded-full bg-[#F4F5F7] px-16rpx py-4rpx">
          <text class="text-22rpx text-[#0D0D0D]">{{ tag }}</text>
          <text class="ml-8rpx text-22rpx text-[#0D0D0D]" @click="removeTag(index)">×</text>
        </view>
      </view>
      <input
        v-model="tagInput"
        class="mt-8rpx h-64rpx w-full text-26rpx text-[#0D0D0D]"
        placeholder="输入标签后确认添加"
        placeholder-style="color: #67676C;"
        confirm-type="done"
        @confirm="addTag" />
    </view>

    <!-- 预览卡片 -->
    <view v-else class="mx-30rpx mt-24rpx rounded-48rpx border-2rpx border-solid border-[#E3E3E6] bg-white p-30rpx">
      <text class="block text-40rpx font-extrabold tracking-[-1rpx] text-[#0D0D0D]">
        {{ title.trim() || "未命名" }}
      </text>
      <view v-if="tags.length" class="mt-20rpx flex flex-wrap">
        <text
          v-for="tag in tags"
          :key="tag"
          class="mr-12rpx mb-8rpx rounded-full bg-[#F4F5F7] px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
          {{ tag }}
        </text>
      </view>
      <view class="my-24rpx h-1rpx bg-[#E3E3E6]" />
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
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { onLoad } from "@dcloudio/uni-app";
import { getRecord } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { T } from "@/theme/tokens";
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

// 导航标题改由 CustomNavBar 渲染（原生标题栏已随 navigationStyle: custom 移除）
const navTitle = computed(() => (editId.value ? "编辑记录" : "新建记录"));

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
  if (id) {
    prefill(id);
  }
});
</script>
