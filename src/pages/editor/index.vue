<template>
  <!-- pb：为底部固定操作栏预留避让（栏高 96rpx + 内衬 + safe-area），见下方 :style -->
  <view
    id="editor-page"
    class="min-h-screen bg-white"
    :style="{ paddingBottom: 'calc(200rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar :title="navTitle" show-back />

    <!-- 编辑/预览切换（颜色走 :style：动态 class 中的 arbitrary value 不会被 transformerClass 转换）。
         sticky 在 uni-app H5（body 有 overflow-x:hidden）与部分小程序 webview 下不生效，改用「页内条 + 浮动条」两套：
         页内条随页面滚走，滚出屏幕后由右上角浮动条接管，保证正文中下部也能切模式 -->
    <view id="editor-mode-bar" class="bg-white" :style="{ paddingTop: '12px', paddingBottom: '12px' }">
      <view class="mx-30rpx flex h-72rpx rounded-full bg-[#F4F5F7] p-6rpx">
        <view
          class="flex-1 flex-center rounded-full"
          :style="{ background: mode === 'edit' ? T.ink : 'transparent' }"
          @click="switchMode('edit')">
          <text class="text-26rpx" :style="{ color: mode === 'edit' ? T.onPrimary : T.ink }">编辑</text>
        </view>
        <view
          class="flex-1 flex-center rounded-full"
          :style="{ background: mode === 'preview' ? T.ink : 'transparent' }"
          @click="switchMode('preview')">
          <text class="text-26rpx" :style="{ color: mode === 'preview' ? T.onPrimary : T.ink }">预览</text>
        </view>
      </view>
    </view>

    <!-- 浮动切换条：页内条滚出屏幕后出现（fixed 不受祖先 overflow 影响，跨端可靠） -->
    <view
      v-show="floatSwitcherVisible"
      class="fixed z-30 flex rounded-full border-2rpx border-solid border-[#E3E3E6] bg-white p-4rpx"
      :style="{ top: `${statusBarPx + 6}px`, right: '24rpx' }">
      <view
        class="rounded-full px-18rpx py-6rpx"
        :style="{ background: mode === 'edit' ? T.ink : 'transparent' }"
        @click="switchMode('edit')">
        <text class="text-22rpx" :style="{ color: mode === 'edit' ? T.onPrimary : T.ink }">编辑</text>
      </view>
      <view
        class="rounded-full px-18rpx py-6rpx"
        :style="{ background: mode === 'preview' ? T.ink : 'transparent' }"
        @click="switchMode('preview')">
        <text class="text-22rpx" :style="{ color: mode === 'preview' ? T.onPrimary : T.ink }">预览</text>
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
        placeholder-style="color: #67676C;"
        @focus="onInputFocus"
        @blur="onInputBlur" />

      <!-- 内容：浅灰卡片 + 等宽字体 + 大行距，markdown 原文更易读 -->
      <textarea
        v-model="content"
        class="mt-24rpx min-h-400rpx w-full rounded-24rpx bg-[#F4F5F7] p-24rpx font-mono text-26rpx leading-[1.9] text-[#0D0D0D]"
        auto-height
        placeholder="支持 markdown 语法…"
        placeholder-style="color: #9A9AA0;"
        @focus="onInputFocus"
        @blur="onInputBlur" />

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
        @confirm="addTag"
        @focus="onInputFocus"
        @blur="onInputBlur" />
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
        <!-- 原生组件渲染，全部文字 selectable 可长按/拖选复制 -->
        <view v-for="(seg, index) in previewSegments" :id="`editor-page-seg-${index}`" :key="index" class="md-seg">
          <MdBlocks v-if="seg.type === 'blocks'" :blocks="seg.blocks" />
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :blocks="seg.blocks" />
        </view>
      </template>
      <view v-else class="flex-center py-60rpx">
        <text class="text-26rpx text-[#67676C]">暂无内容，切回编辑写点什么吧</text>
      </view>
    </view>

    <!-- 底部固定操作栏：保存/返回全程拇指可达，不用拉回页面顶部（设计见 specs/2026-11-13-editor-bottom-action-bar.md）。
         底栏常驻；键盘弹起时由 barStyle 抬到键盘上方（H5 iOS）/ 页面整体上推（小程序 adjust-position） -->
    <view
      class="fixed bottom-0 left-0 right-0 z-30 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx pt-16rpx"
      :style="barStyle">
      <view class="flex items-center justify-between">
        <PsButton variant="secondary" size="md" @click="goBack">返回</PsButton>
        <PsButton size="md" :disabled="saving" @click="handleSave">保存</PsButton>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { onHide, onLoad, onPageScroll, onShow } from "@dcloudio/uni-app";
import { getRecord } from "@/api/record";
import { useRecordStore } from "@/store/record";
import { T } from "@/theme/tokens";
import { parseNote } from "@/utils/markdown";
import { getStatusBarPx } from "@/utils/system";
import { clamp01, debugLog, measurePosition, readPosition, restorePosition, savePosition } from "@/utils/read-position";

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

/* ── 底部操作栏键盘让位（成熟做法：底栏常驻 + 骑在键盘上方，聊天输入栏同款；不做 focus 隐藏） ──
 * MP/App：输入框默认 adjust-position 把页面连同 fixed 底栏整体推到键盘上方，无需处理。
 * H5 Android：键盘收缩 layout viewport，fixed 底栏自动上移。
 * H5 iOS：键盘不收缩视口，只能用 visualViewport 的视口差算出键盘高度，把底栏抬上去。 */
const inputFocused = ref(false);
const keyboardLift = ref(0);
const barStyle = computed(() => ({
  paddingBottom: "calc(16rpx + env(safe-area-inset-bottom))",
  transform: keyboardLift.value > 0 ? `translateY(-${keyboardLift.value}px)` : "",
}));

function onInputFocus() {
  inputFocused.value = true;
  // #ifdef H5
  updateKeyboardLift();
  // #endif
}

function onInputBlur() {
  inputFocused.value = false;
  keyboardLift.value = 0;
}

// #ifdef H5
/** 键盘高度 = layout 视口 - visual 视口：键盘收起/页面滚动时差值≈0，不受滚动 offset 影响 */
function updateKeyboardLift() {
  const vv = window.visualViewport;
  if (!vv || !inputFocused.value) {
    keyboardLift.value = 0;
    return;
  }
  keyboardLift.value = Math.max(0, Math.round(window.innerHeight - vv.height));
}

onMounted(() => {
  window.visualViewport?.addEventListener("resize", updateKeyboardLift);
});
onUnmounted(() => {
  window.visualViewport?.removeEventListener("resize", updateKeyboardLift);
});
// #endif

/* ── 阅读位置保持：编辑态与预览态共用同一 recordId 的进度（见 utils/read-position.ts） ── */
const PAGE_ID = "editor-page";
const statusBarPx = getStatusBarPx();
/** 页内切换条底边的页面坐标 = 状态栏 + 导航行 88rpx + 上内衬 12 + 条身 72rpx + 下内衬 12 */
const MODE_BAR_BOTTOM = statusBarPx + Math.round(uni.upx2px(88)) + 24 + Math.round(uni.upx2px(72));
/** 浮动切换条占用高度（状态栏 + 6px 间距 + 条身）：锚点对齐时避开它，否则内容被压在条下面 */
const TOP_INSET = statusBarPx + 44;
/** 页内切换条滚出屏幕后显示浮动条；40px 迟滞避免边界抖动 */
const floatSwitcherVisible = ref(false);

let pageScrollTop = 0;
let pageVisible = true;

/**
 * 只在此刻落库：切换模式前、离开页面时。
 * 不在滚动过程中测量——measurePosition 每次要做 2 次 selectorQuery，
 * 拖动时每 200ms 触发一次会明显拖慢滚动（小程序还要跨线程通信）。
 */
async function persistPosition() {
  if (!pageVisible || !editId.value) {
    debugLog("persist:skip", { pageVisible, editId: editId.value ?? null });
    return;
  }
  const pos = await measurePosition(PAGE_ID, pageScrollTop, {
    preview: mode.value === "preview",
    version: version.value,
    topInset: TOP_INSET,
  });
  if (pos) savePosition(editId.value, pos);
}

/** 编辑/预览切换：先存旧视图进度，等新视图渲染完再按同一进度还原 */
const switchMode = async (next: "edit" | "preview") => {
  if (next === mode.value) return;
  debugLog("switch", { from: mode.value, to: next, pageScrollTop, editId: editId.value ?? null });
  await persistPosition();
  mode.value = next;
  await nextTick();
  const pos = editId.value ? readPosition(editId.value) : undefined;
  debugLog("switch:pos", { hasPos: Boolean(pos), progress: pos?.progress ?? null });
  if (pos) {
    await restorePosition(PAGE_ID, pos, {
      preview: next === "preview",
      version: version.value,
      topInset: TOP_INSET,
      getScrollTop: () => pageScrollTop,
    });
  }
  updateFloatSwitcher();
};

/** 保存成功后正文可能已变：块锚点索引不可信，只保留进度，避免返回详情丢阅读位置 */
function keepProgressOnly() {
  const key = editId.value;
  if (!key) return;
  const pos = readPosition(key);
  if (pos) savePosition(key, { progress: pos.progress });
}

function updateFloatSwitcher() {
  if (pageScrollTop > MODE_BAR_BOTTOM) {
    if (!floatSwitcherVisible.value) floatSwitcherVisible.value = true;
  } else if (pageScrollTop < MODE_BAR_BOTTOM - 40) {
    if (floatSwitcherVisible.value) floatSwitcherVisible.value = false;
  }
}

// 滚动路径只做一次变量赋值 + 一次阈值比较，不查 DOM、不落库、不打日志
onPageScroll((e) => {
  pageScrollTop = e.scrollTop;
  updateFloatSwitcher();
});

onShow(() => {
  pageVisible = true;
});

onHide(() => {
  // 离开时补存一次：滚动期间不再实时测量，这里把最终位置固定下来（每次离开仅 2 次 selectorQuery）
  void persistPosition();
  pageVisible = false;
});

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

/** 底部操作栏的返回：与 CustomNavBar 同语义（editor 由 navigateTo 进入，栈内必有来源页） */
const goBack = () => {
  if (getCurrentPages().length > 1) uni.navigateBack();
  else uni.reLaunch({ url: "/pages/index/index" });
};

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
    keepProgressOnly();
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
        keepProgressOnly();
      } catch {
        // request.ts 已统一 toast
      }
    }
  } finally {
    saving.value = false;
  }
};

onLoad(async (query) => {
  const id = query?.id as string | undefined;
  editId.value = id;
  if (!id) return;

  await prefill(id);

  const posParam = Number(query?.pos);
  const pos =
    readPosition(id) ?? (Number.isFinite(posParam) ? { progress: clamp01(posParam), at: Date.now() } : undefined);
  debugLog("onload:pos", { id, hasPos: Boolean(pos), posParam, pageScrollTop });
  if (!pos) return;
  // 数据晚到期间用户已经自己滚过，就不要抢位置
  if (pageScrollTop > 48) {
    debugLog("onload:skip", { pageScrollTop });
    return;
  }

  // 必须等 content 赋值后的首次渲染完成，否则文档高度还是初始值，还原必然错位
  await nextTick();
  await restorePosition(PAGE_ID, pos, {
    preview: mode.value === "preview",
    version: version.value,
    topInset: TOP_INSET,
    getScrollTop: () => pageScrollTop,
  });
  updateFloatSwitcher();
});
</script>
