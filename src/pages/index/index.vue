<template>
  <!-- 底衬随 safe-area 增长，与 FAB（bottom:180rpx+inset，高 120rpx → 顶缘 300rpx+inset）保持设计基线对齐：
       260rpx 底衬 + 末张卡片的 p-40rpx 内衬 = 300rpx，卡片底部 tag/日期行正好擦着 FAB 上缘 -->
  <view
    class="min-h-screen bg-white px-30rpx"
    :style="{
      paddingTop: statusBarPx + 'px',
      paddingBottom: 'calc(260rpx + env(safe-area-inset-bottom))',
    }">
    <!-- 品牌 hero：lilac 签名色块 -->
    <view class="mt-24rpx rounded-48rpx bg-[#E7E3FA] px-48rpx pb-40rpx pt-56rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">PASS SCROLL · NOTES</text>
      <text class="mt-12rpx block text-64rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">通关秘籍</text>
      <text class="mt-12rpx block text-26rpx text-[#0D0D0D]">分享知识，随笔</text>
      <text
        v-if="recordStore.records.length > 0"
        class="mt-24rpx block font-mono text-22rpx tracking-[2rpx] text-[#0D0D0D]">
        已掌握 {{ masteredCount }}/{{ recordStore.total }}
      </text>
    </view>

    <!-- 今日复习入口：已学习且到期的卡片（首次复习卡与旧卡统一排序），没待办时不占位。
         主题 chips 点了直接进"只啃这一块"的复习——学习曲线按标签分块，不把游戏和面试混着学 -->
    <view v-if="dueTotal > 0" class="mt-24rpx rounded-24rpx bg-[#F7F2E7] px-32rpx py-24rpx" @click="goReview">
      <view class="flex items-center justify-between">
        <view>
          <text class="block text-26rpx font-semibold text-[#0D0D0D]">今日待复习 {{ dueTotal }} 张</text>
          <text class="mt-6rpx block text-22rpx text-[#67676C]">
            到期 {{ srsStore.dueCount }} · 新卡 {{ srsStore.freshCount }}
            <text v-if="dueTagChips.length">· {{ dueTagChips.length }} 个主题</text>
          </text>
        </view>
        <text class="text-32rpx text-[#0D0D0D]">›</text>
      </view>
      <scroll-view v-if="dueTagChips.length" scroll-x :show-scrollbar="false" class="mt-16rpx">
        <view class="flex">
          <text
            v-for="item in dueTagChips"
            :key="item.name"
            class="mr-12rpx shrink-0 whitespace-nowrap rounded-full bg-white px-20rpx py-8rpx text-20rpx text-[#0D0D0D]"
            @click.stop="goReviewTag(item.name)">
            #{{ item.name }} {{ item.due }}
          </text>
        </view>
      </scroll-view>
    </view>

    <!-- 搜索区 -->
    <view
      class="mt-32rpx h-80rpx flex items-center rounded-16rpx border-2rpx border-solid border-[#E3E3E6] bg-white px-28rpx">
      <input
        v-model="searchInput"
        class="h-72rpx flex-1 text-28rpx text-[#0D0D0D]"
        type="text"
        confirm-type="search"
        placeholder="搜索标题或内容"
        placeholder-style="color: #67676C;"
        @confirm="handleSearch" />
      <view v-if="searchInput" class="ml-12rpx flex h-48rpx w-48rpx items-center justify-center" @click="clearKeyword">
        <text class="text-28rpx leading-none text-[#67676C]">✕</text>
      </view>
    </view>

    <!-- 标签筛选栏：尺寸走 unocss class，颜色走 :style（transformerClass 不转换动态 class 中的 arbitrary value）
         展示顺序 = 今日待复习多的在前（tagBar 来自 GET /records/due/tags），
         待复习数做成 chip 内的角标——标签栏不只是过滤器，也是"哪个主题今天该学"的入口 -->
    <scroll-view scroll-x :show-scrollbar="false" class="mt-24rpx">
      <view class="flex">
        <view :class="chipClass" :style="chipStyle(recordStore.activeTag === '')" @click="selectTag('')">全部</view>
        <view
          v-for="item in tagBar"
          :key="item.name"
          :class="chipClass"
          :style="chipStyle(recordStore.activeTag === item.name)"
          @click="selectTag(item.name)">
          <text :style="{ color: recordStore.activeTag === item.name ? '#FFFFFF' : '#0D0D0D' }">#</text>
          {{ item.name }}
          <text v-if="item.due > 0" :style="dueBadgeStyle(recordStore.activeTag === item.name)">{{ item.due }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 记录列表：窗口化渲染（utils/render-window.ts），窗口外用等高占位顶住总文档高度，滚动不跳。
         record-card 包一层页面自有节点：小程序端页面级 selectorQuery 查不到子组件内部节点 -->
    <view class="mt-24rpx">
      <view v-if="topPad > 0" :style="{ height: topPad + 'px' }" />
      <view v-for="item in visibleRecords" :key="item.id" class="record-card pb-24rpx">
        <RecordCard :record="item" @click="goDetail" />
      </view>
      <view v-if="bottomPad > 0" :style="{ height: bottomPad + 'px' }" />
    </view>

    <!-- 空态 -->
    <view v-if="!recordStore.loading && recordStore.records.length === 0" class="flex flex-col items-center pt-240rpx">
      <text class="text-28rpx text-[#67676C]">{{ emptyText }}</text>
    </view>

    <!-- 底部：分页状态（上滑触底自动加载下一页） -->
    <view v-if="recordStore.records.length > 0" class="flex justify-center pt-8rpx pb-8rpx">
      <text class="text-22rpx text-[#67676C]">
        {{ recordStore.loadingMore ? "加载中…" : recordStore.hasMore ? "上滑加载更多" : `共 ${recordStore.total} 条` }}
      </text>
    </view>

    <!-- 浮动新建按钮 -->
    <view
      class="fixed right-40rpx z-50 h-120rpx w-120rpx flex-center rounded-full bg-[#0D0D0D]"
      :style="{ bottom: 'calc(180rpx + env(safe-area-inset-bottom))' }"
      @click="goCreate">
      <text class="text-56rpx leading-none text-white">+</text>
    </view>

    <CustomTabBar />
  </view>
</template>

<script setup lang="ts">
import type { RecordItem } from "@/types/record";
import { onPageScroll, onPullDownRefresh, onReachBottom, onShow } from "@dcloudio/uni-app";
import { useRecordStore } from "@/store/record";
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";
import { goToTab, syncActiveTab } from "@/utils/navigation";
import { computeWindow, prefixSum } from "@/utils/render-window";
import { getStatusBarPx } from "@/utils/system";

// 本页无 NavBar，需自行避让状态栏
const statusBarPx = getStatusBarPx();

// 本项目 pinia setup store 的 state/computed 在外部类型层未解包（见 user.ts 基线注释），
// 经 unknown 转换为运行时实际的解包形态，页面内按运行时结构消费。
type RecordStoreProxy = Omit<
  ReturnType<typeof useRecordStore>,
  | "records"
  | "total"
  | "loading"
  | "keyword"
  | "activeTag"
  | "allTags"
  | "page"
  | "loadingMore"
  | "hasMore"
  | "masteredTotal"
> & {
  records: RecordItem[];
  total: number;
  loading: boolean;
  keyword: string;
  activeTag: string;
  page: number;
  loadingMore: boolean;
  hasMore: boolean;
  masteredTotal: number | null;
  allTags: string[];
  loadMore: () => Promise<void>;
  fetchStats: () => Promise<void>;
};

const userStore = useUserStore();
const recordStore = useRecordStore() as unknown as RecordStoreProxy;
// 首页只要"今日待复习几条"这个数字，limit=1 拉最小队列即可（统计字段是全量口径）
const srsStore = useSrsStore() as unknown as {
  dueCount: number;
  freshCount: number;
  dueTags: import("@/types/record").DueTagStat[];
  pendingReviewTag: string | undefined;
  fetchDue: (opts?: { palaceId?: string; tag?: string; limit?: number }) => Promise<void>;
  fetchDueTags: () => Promise<void>;
};

/** 搜索框绑本地值：直接 v-model 到 store 会让每次按键都写 pinia state、触发全页重渲染 */
const searchInput = ref(recordStore.keyword);

const dueTotal = computed(() => srsStore.dueCount + srsStore.freshCount);
/** 今日有卡要复习的标签（后端已按待复习数排好序） */
const dueTagChips = computed(() => srsStore.dueTags.filter((item) => item.due > 0));
/**
 * 标签栏数据源：优先用"/今日待复习按标签统计"（全量、带待复习数、已排好序）；
 * 它还没拉到时退回从列表聚合的 allTags（此时没有待复习数，角标显示 0 不显示）
 */
const tagBar = computed<{ name: string; due: number }[]>(() => {
  if (srsStore.dueTags.length > 0) return srsStore.dueTags;
  return recordStore.allTags.map((name) => ({ name, due: 0 }));
});

const emptyText = computed(() =>
  Boolean(recordStore.keyword) || Boolean(recordStore.activeTag) ? "没有匹配的记录" : "还没有记录，点右下角 + 写第一条",
);

/** hero 的「已掌握 x/y」用服务端口径（分页后本地只有已加载页，本地计数会偏小）；统计未到时退回本地口径 */
const masteredCount = computed(
  () => recordStore.masteredTotal ?? recordStore.records.filter((r) => r.mastery === "MASTERED").length,
);

/* ── 长列表虚拟化：实测高度 + 渲染窗口（纯函数见 utils/render-window.ts） ── */

/** 未实测卡片的兜底高度（px）：宁可偏大（多渲染）也不偏小（露白），首屏全量渲染后会全部实测 */
const FALLBACK_CARD_HEIGHT = 160;
/** 视口上下各多渲染的余量（px），防快速滑动露白 */
const RENDER_BUFFER = 600;

/** 每张卡实测高度，按 id 缓存（卡片无图片、标签静态，高度稳定） */
const heightsById = new Map<string, number>();
/** 高度表版本号：measureCards 写入后 bump，驱动 prefix 重算 */
const heightVersion = ref(0);
/** 当前渲染窗口 [start, end)，与 Array.slice 对齐 */
const win = ref({ start: 0, end: 0 });
let lastScrollTop = 0;
let viewHeight = 0;

const prefix = computed(() => {
  void heightVersion.value;
  void recordStore.records;
  return prefixSum(recordStore.records.map((r) => heightsById.get(r.id) ?? FALLBACK_CARD_HEIGHT));
});

const visibleRecords = computed(() => recordStore.records.slice(win.value.start, win.value.end));
const topPad = computed(() => prefix.value[win.value.start] ?? 0);
const bottomPad = computed(() => (prefix.value[recordStore.records.length] ?? 0) - (prefix.value[win.value.end] ?? 0));

function ensureViewHeight(): number {
  if (!viewHeight) viewHeight = uni.getSystemInfoSync().windowHeight || 667;
  return viewHeight;
}

/** 窗口变化才写 ref：滚动路径只有算术 + 一次比较，无渲染 */
function updateWindow(scrollTop: number): void {
  const total = recordStore.records.length;
  if (!total) return;
  const next = computeWindow(prefix.value, scrollTop, ensureViewHeight(), RENDER_BUFFER, total);
  if (next.start !== win.value.start || next.end !== win.value.end) win.value = next;
}

/** 批量实测当前渲染出的卡片高度（一次 selectorQuery，按 DOM 顺序对齐渲染切片） */
function measureCards(): void {
  nextTick(() => {
    uni
      .createSelectorQuery()
      .selectAll(".record-card")
      .boundingClientRect((rects) => {
        const list = (rects ?? []) as { height: number }[];
        const slice = recordStore.records.slice(win.value.start, win.value.end);
        let changed = false;
        list.forEach((rect, index) => {
          const record = slice[index];
          if (!record || !rect?.height) return;
          if (heightsById.get(record.id) !== rect.height) {
            heightsById.set(record.id, rect.height);
            changed = true;
          }
        });
        if (changed) heightVersion.value++;
        // 无论高度是否有更新都重算窗口：列表刚变化时用估算高度缩窗可能露白，实测后再缩才可靠
        updateWindow(lastScrollTop);
      })
      .exec();
  });
}

// 列表变化：重置到第 1 页说明数据整体换血（筛选/刷新/增删改），高度表作废；
// 追加页保持窗口起点、把终点扩到列表末尾让新卡片渲染出来参与实测。
// 这里不缩窗——收缩统一等 measureCards 实测后做，避免估算高度导致露白
watch(
  () => [recordStore.records, recordStore.page] as const,
  () => {
    if (recordStore.page === 1) heightsById.clear();
    win.value = { start: Math.min(win.value.start, recordStore.records.length), end: recordStore.records.length };
    measureCards();
  },
  { flush: "post" },
);

const handleSearch = () => {
  const keyword = searchInput.value.trim();
  if (keyword !== recordStore.keyword) recordStore.keyword = keyword;
  recordStore.fetchList();
};

const clearKeyword = () => {
  searchInput.value = "";
  recordStore.keyword = "";
  recordStore.fetchList();
};

const selectTag = (tag: string) => {
  if (recordStore.activeTag === tag) return;
  recordStore.activeTag = tag;
  recordStore.fetchList();
};

// chips 布局类全状态一致（shrink-0 + nowrap 防止 flex 挤压换行变形）；颜色必须走 :style——
// unocss-preset-weapp 的 transformerClass 只转换模板静态 class 属性中的 arbitrary value，动态 :class 不生成对应 CSS
const chipClass = "mr-16rpx shrink-0 whitespace-nowrap rounded-full px-28rpx py-10rpx text-24rpx";

const chipStyle = (active: boolean) =>
  active ? `background:${T.ink};color:${T.onPrimary};` : `background:${T.surfaceSoft};color:${T.ink};`;

/** 待复习角标：选中态是墨底，得换成半透明白才看得见 */
const dueBadgeStyle = (active: boolean) => `color:${active ? "rgba(255,255,255,0.72)" : T.secondaryText};`;

const goDetail = (record: RecordItem) => {
  uni.navigateTo({ url: `/pages/detail/index?id=${record.id}` });
};

const goCreate = () => {
  uni.navigateTo({ url: "/pages/editor/index" });
};

// 进入复习页：显式清空主题聚焦（复现旧 reLaunch 的重置语义），带参走 store 换手
const goReview = () => {
  srsStore.pendingReviewTag = "";
  goToTab("pages/review/index");
};

/** 点主题 chip 直接进"只啃这一个标签"的复习（学习曲线按标签分块） */
const goReviewTag = (tag: string) => {
  srsStore.pendingReviewTag = tag;
  goToTab("pages/review/index");
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  syncActiveTab();
  // 别处可能改过筛选条件（如宫殿页进入前清空 keyword），回到首页时把输入框对齐
  searchInput.value = recordStore.keyword;
  recordStore.fetchList();
  recordStore.fetchStats();
  srsStore.fetchDue({ limit: 1 });
  srsStore.fetchDueTags();
});

onPullDownRefresh(async () => {
  await Promise.all([recordStore.fetchList(), srsStore.fetchDue({ limit: 1 }), srsStore.fetchDueTags()]);
  uni.stopPullDownRefresh();
});

/** 上滑到底加载下一页 */
onReachBottom(() => {
  recordStore.loadMore();
});

/** 滚动路径只做算术与窗口比较，不查 DOM、不落库 */
onPageScroll((e) => {
  lastScrollTop = e.scrollTop;
  updateWindow(e.scrollTop);
});
</script>
