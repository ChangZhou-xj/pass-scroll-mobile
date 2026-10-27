<template>
  <!-- 底衬需同时避让 tabBar(102rpx+inset) 与其上的评分栏(≈220rpx)，且随 inset 同步增长，
       否则刘海机型答案末段会被固定栏永久盖住（同 detail/versions/password 的复合底衬） -->
  <view
    class="review-page min-h-screen bg-white"
    :style="{ paddingBottom: 'calc(380rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar title="复习">
      <template #right>
        <view class="flex">
          <text class="mr-24rpx text-24rpx font-semibold text-[#0D0D0D]" @click="goPalace">🏛 宫殿</text>
          <text class="text-24rpx font-semibold text-[#0D0D0D]" @click="goCurve">📈 曲线</text>
        </view>
      </template>
    </CustomNavBar>

    <!-- 今日进度：mint 签名色块 -->
    <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#D6F0E3] p-40rpx">
      <view class="flex items-end justify-between">
        <view>
          <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">SPACED REPETITION</text>
          <text class="mt-8rpx block text-48rpx font-extrabold tracking-[-2rpx] text-[#0D0D0D]">
            今日 {{ srsStore.totalToday }} 张
          </text>
        </view>
        <text class="text-24rpx text-[#0D0D0D]">已复习 {{ srsStore.learnedToday }}</text>
      </view>
      <view class="mt-24rpx h-8rpx w-full rounded-full bg-white">
        <view class="h-8rpx rounded-full bg-[#0D0D0D]" :style="{ width: progressPercent + '%' }" />
      </view>
      <view class="mt-20rpx flex">
        <text class="text-22rpx text-[#67676C]">到期 {{ srsStore.dueCount }} · 新卡 {{ srsStore.freshCount }}</text>
        <text v-if="palaceName" class="ml-16rpx text-22rpx font-semibold text-[#0D0D0D]" @click="exitPalace">
          {{ palaceName }} ✕
        </text>
      </view>

      <!-- 主题切换器：学习曲线按标签分块，选一个主题 = 今天只啃这一块。
           不混着复习"游戏 + 面试"，一块啃完再换下一块（系统性学习 + 主题内复现） -->
      <scroll-view scroll-x :show-scrollbar="false" class="mt-20rpx">
        <view class="flex">
          <view :class="tagChipClass" :style="tagChipStyle(srsStore.activeTag === '')" @click="pickTag('')">
            全部主题
          </view>
          <view
            v-for="item in focusableTags"
            :key="item.name"
            :class="tagChipClass"
            :style="tagChipStyle(srsStore.activeTag === item.name)"
            @click="pickTag(item.name)">
            <text>#{{ item.name }}</text>
            <text :style="dueBadgeStyle(srsStore.activeTag === item.name)">{{ item.due }}</text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- 有当前卡 -->
    <template v-if="current">
      <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#E7E3FA] p-48rpx">
        <view class="flex items-center justify-between">
          <text class="font-mono text-22rpx tracking-[2rpx] text-[#67676C]">
            {{ current.reviewCount === 0 ? "新卡片" : `第 ${current.stage + 1} 阶段` }} · 已复习
            {{ current.reviewCount }} 次
          </text>
          <text
            v-if="current.mastery !== 'NONE'"
            class="shrink-0 rounded-full border-2rpx border-solid px-16rpx py-2rpx text-20rpx"
            :style="masteryStyle(current.mastery)">
            {{ current.mastery === "MASTERED" ? "已掌握" : "复习中" }}
          </text>
        </view>

        <view class="mt-16rpx flex items-center">
          <text v-if="current.isPinned" class="mr-8rpx text-32rpx">📌</text>
          <text class="text-40rpx font-semibold tracking-[-1rpx] text-[#0D0D0D]">{{ current.title }}</text>
        </view>

        <view v-if="current.tags.length" class="mt-20rpx flex flex-wrap">
          <text
            v-for="tag in current.tags"
            :key="tag"
            class="mr-12rpx mb-8rpx rounded-full bg-white px-16rpx py-4rpx text-22rpx text-[#0D0D0D]">
            {{ tag }}
          </text>
        </view>

        <!-- 主题块进度：这一块还剩几张——"连着把 #面试 啃完"的进度反馈 -->
        <view v-if="currentBlock" class="mt-12rpx">
          <text class="rounded-full bg-white px-16rpx py-6rpx text-20rpx text-[#0D0D0D]">
            {{ currentBlock.tag ? `主题 ${currentBlock.tag}` : "未分类" }} · 本组还剩 {{ currentBlock.count }} 张
          </text>
        </view>

        <view class="my-24rpx h-1rpx bg-[#C4B8EE]" />

        <!-- markdown 分段；details 容器默认折叠，点开才对照答案——主动回忆的关键一跳 -->
        <view v-for="(seg, index) in segments" :key="index">
          <rich-text v-if="seg.type === 'html'" :nodes="seg.html" />
          <MdContainer v-else :kind="seg.kind" :title="seg.title" :html="seg.html" @toggle="onAnswerToggle" />
        </view>

        <view class="mt-24rpx flex justify-center">
          <text class="text-22rpx text-[#67676C]">
            {{ showGrade ? "对照答案，给自己打个分" : "先在心里默答一遍，再点开「答案」" }}
          </text>
        </view>
      </view>

      <view class="mx-30rpx mt-24rpx flex">
        <view class="mr-20rpx flex-1">
          <PsButton variant="secondary" size="lg" block @click="goDetail">查看详情</PsButton>
        </view>
        <view class="flex-1">
          <PsButton variant="secondary" size="lg" block @click="skipCurrent">先跳过</PsButton>
        </view>
      </view>

      <!-- 四档自评：答案展开后浮现（没有 :::details 答案块的笔记直接给分，否则会卡死在"无法揭示"），
           固定底部。按钮上写明"下次什么时候再见"——间隔重复产品最关键的反馈：
           让用户知道每一次选择都在改写自己的遗忘曲线 -->
      <view
        v-if="showGrade || !hasAnswerBlock"
        class="fixed left-0 right-0 border-0 border-t-2rpx border-solid border-[#E3E3E6] bg-white px-30rpx py-16rpx"
        :style="{ bottom: 'calc(102rpx + env(safe-area-inset-bottom))', zIndex: 61 }">
        <view class="mb-12rpx flex justify-center">
          <text class="text-20rpx text-[#67676C]">还记得吗？选一档，决定它下次何时出现</text>
        </view>
        <view class="flex flex-wrap">
          <view
            v-for="opt in gradeOptions"
            :key="opt.grade"
            class="mb-12rpx w-1/2 px-6rpx box-border"
            @click="submit(opt.grade)">
            <view class="rounded-full px-12rpx py-16rpx" :style="{ background: opt.bg }">
              <text class="block text-center text-26rpx font-semibold text-[#0D0D0D]">{{ opt.label }}</text>
              <text class="mt-4rpx block text-center text-20rpx text-[#67676C]">{{ opt.interval }}后再见</text>
            </view>
          </view>
        </view>
      </view>
    </template>

    <!-- 空态：今日复习完成 -->
    <view v-else-if="!srsStore.loading" class="flex flex-col items-center pt-240rpx">
      <text class="text-64rpx">{{ srsStore.learnedToday > 0 ? "🎉" : "🌤" }}</text>
      <text class="mt-24rpx text-28rpx text-[#67676C]">
        {{ srsStore.learnedToday > 0 ? "今日复习完成，记忆已加固" : "暂时没有到期的卡片" }}
      </text>
      <text v-if="nextDueText" class="mt-12rpx text-24rpx text-[#0D0D0D]">{{ nextDueText }}</text>
      <view class="mt-40rpx flex">
        <view class="mr-20rpx">
          <PsButton variant="secondary" size="lg" @click="goPalace">去记忆宫殿</PsButton>
        </view>
        <PsButton size="lg" @click="goHome">回首页</PsButton>
      </view>
    </view>

    <CustomTabBar />
  </view>
</template>

<script setup lang="ts">
import type { Grade, RecordItem } from "@/types/record";
import { onLoad, onShow } from "@dcloudio/uni-app";
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T, masteryStyle } from "@/theme/tokens";
import { parseNote } from "@/utils/markdown";
import { formatDueLabel, formatInterval, schedule } from "@/utils/srs";

// 本页 srs store 的 state/computed 在外部类型层未解包（项目既有基线，见 store/record.ts 顶部注释），
// 经 unknown 转换为运行时实际的解包形态后消费。
type SrsStoreProxy = Omit<
  ReturnType<typeof useSrsStore>,
  | "curve"
  | "queue"
  | "dueCount"
  | "freshCount"
  | "learnedToday"
  | "nextDueAt"
  | "loading"
  | "palaces"
  | "blocks"
  | "dueTags"
  | "activeTag"
  | "current"
  | "currentBlock"
  | "totalToday"
  | "hasMore"
> & {
  curve: import("@/types/record").CurveConfig;
  queue: RecordItem[];
  dueCount: number;
  freshCount: number;
  learnedToday: number;
  nextDueAt: number | null;
  loading: boolean;
  palaces: import("@/types/record").PalaceItem[];
  blocks: import("@/types/record").DueBlock[];
  dueTags: import("@/types/record").DueTagStat[];
  activeTag: string;
  current: RecordItem | undefined;
  currentBlock: import("@/types/record").DueBlock | null;
  totalToday: number;
  hasMore: boolean;
};

const userStore = useUserStore();
const srsStore = useSrsStore() as unknown as SrsStoreProxy;

const palaceId = ref<string>("");
/** 主题聚焦（"今天只啃这一个标签"），由 ?tag= 带入或主题切换器点选 */
const focusTag = ref<string>("");
const showGrade = ref(false);

const current = computed<RecordItem | undefined>(() => srsStore.current);
const currentBlock = computed(() => srsStore.currentBlock);
/** 主题切换器只列"今天有得学"的标签（+ 当前聚焦的那个，避免它复习完就消失） */
const focusableTags = computed(() =>
  srsStore.dueTags.filter((item) => item.due > 0 || item.name === srsStore.activeTag),
);
const segments = computed(() => (current.value ? parseNote(current.value.content) : []));
// 有 :::details 答案块的笔记靠"展开答案"解锁打分；没有的（题干即全部内容）直接可打分
const hasAnswerBlock = computed(() => segments.value.some((seg) => seg.type === "container" && seg.kind === "details"));
const palaceName = computed(() => {
  if (!palaceId.value) return "";
  const hit = srsStore.palaces.find((item) => item.id === palaceId.value);
  return hit ? `🏛 ${hit.name} 巡游中` : "";
});
const nextDueText = computed(() =>
  srsStore.nextDueAt ? `下一张 ${formatDueLabel(srsStore.nextDueAt)}到期` : "写一条新笔记就能开始复习",
);
const progressPercent = computed(() => {
  const done = srsStore.learnedToday;
  const todo = srsStore.totalToday;
  const total = done + todo;
  return total === 0 ? 100 : Math.min(100, Math.round((done / total) * 100));
});

const GRADE_META: Record<Grade, { label: string; bg: string }> = {
  AGAIN: { label: "忘了", bg: T.blockPink },
  HARD: { label: "很吃力", bg: T.blockCream },
  GOOD: { label: "想起来了", bg: T.blockMint },
  EASY: { label: "太简单", bg: T.blockLime },
};

/** 四档按钮：标签 + "多久后再见"（用前端同构算法预演，不为此发请求） */
const gradeOptions = computed(() => {
  const card = current.value;
  if (!card) return [];
  return (["AGAIN", "HARD", "GOOD", "EASY"] as Grade[]).map((grade) => {
    const next = schedule(
      { stage: card.stage, ease: card.ease, lapses: card.lapses, reviewCount: card.reviewCount },
      grade,
      srsStore.curve,
    );
    return {
      grade,
      label: GRADE_META[grade].label,
      bg: GRADE_META[grade].bg,
      interval: formatInterval(next.intervalMinutes),
    };
  });
});

// 主题 chip 与首页标签栏同一套写法：尺寸走 class、颜色走 :style
// （unocss-preset-weapp 的 transformerClass 不转换动态 :class 里的 arbitrary value）
const tagChipClass = "mr-16rpx shrink-0 whitespace-nowrap rounded-full px-24rpx py-8rpx text-22rpx";
const tagChipStyle = (active: boolean) =>
  active ? `background:${T.ink};color:${T.onPrimary};` : `background:${T.surfaceSoft};color:${T.ink};`;
/** 待复习角标：选中态是墨底，得换成半透明白才看得见 */
const dueBadgeStyle = (active: boolean) => `color:${active ? "rgba(255,255,255,0.72)" : T.secondaryText};`;

const onAnswerToggle = (open: boolean) => {
  if (open) showGrade.value = true;
};

/** 跳过：把当前卡挪到队尾，不改动它的调度（改天再见） */
const skipCurrent = () => {
  if (srsStore.queue.length < 2) return;
  const [head, ...rest] = srsStore.queue;
  srsStore.queue = [...rest, head];
  showGrade.value = false;
};

const submit = async (grade: Grade) => {
  const card = current.value;
  if (!card) return;
  showGrade.value = false;
  const res = await srsStore.submitReview(card.id, grade);
  if (!res.ok) return;
  // 啃完一整块换主题时明确提示一下：让"系统性学完一块"这件事被感知到
  if (res.nextTag) uni.showToast({ title: `本组完成，进入 #${res.nextTag}`, icon: "none" });
  else uni.showToast({ title: "已排入下次复习", icon: "none" });
};

const goDetail = () => {
  if (!current.value) return;
  uni.navigateTo({ url: `/pages/detail/index?id=${current.value.id}` });
};

const goCurve = () => uni.navigateTo({ url: "/pages/curve/index" });
const goPalace = () => uni.reLaunch({ url: "/pages/palace/index" });
const goHome = () => uni.reLaunch({ url: "/pages/index/index" });

/** 主题切换器：换主题 = 重新拉该标签的队列（宫殿巡游与主题聚焦互不影响） */
const pickTag = async (name: string) => {
  if (srsStore.activeTag === name) return;
  focusTag.value = name;
  await srsStore.fetchDue({ palaceId: palaceId.value || undefined, tag: name || undefined });
  showGrade.value = false;
};

/** 宫殿页点「开始巡游」会带 ?palace=<id>；首页点主题块会带 ?tag=<name> */
onLoad((options) => {
  const query = (options ?? {}) as { palace?: string; tag?: string };
  palaceId.value = query.palace ?? "";
  focusTag.value = query.tag ?? "";
});

const exitPalace = async () => {
  palaceId.value = "";
  await srsStore.fetchDue({ tag: focusTag.value || undefined });
  showGrade.value = false;
};

onShow(async () => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
    return;
  }
  await Promise.all([
    srsStore.fetchPalaces(),
    srsStore.fetchDueTags(),
    srsStore.fetchDue({ palaceId: palaceId.value || undefined, tag: focusTag.value || undefined }),
  ]);
  showGrade.value = false;
});
</script>
