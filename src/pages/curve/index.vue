<template>
  <view class="min-h-screen bg-white" :style="{ paddingBottom: 'calc(160rpx + env(safe-area-inset-bottom))' }">
    <CustomNavBar title="记忆曲线" show-back />

    <!-- 曲线预览：锯齿状遗忘曲线——每次复习把保持率拉回 1，然后按 e^(-t/S) 再次衰减 -->
    <view class="mx-30rpx mt-24rpx rounded-48rpx bg-[#E7E3FA] p-40rpx">
      <text class="block font-mono text-22rpx uppercase tracking-[2rpx] text-[#67676C]">FORGETTING CURVE</text>
      <text class="mt-12rpx block text-40rpx font-extrabold tracking-[-1rpx] text-[#0D0D0D]">
        {{ totalSpanLabel }}内复习 {{ plan.length }} 次
      </text>

      <view class="relative mt-32rpx h-220rpx">
        <!-- 回忆阈值参考线（保持率 60%：低于它大概率想不起来） -->
        <view class="absolute left-0 right-0 border-0 border-t-2rpx border-dashed" :style="thresholdStyle" />
        <view class="h-full flex items-end">
          <view v-for="(bar, index) in bars" :key="index" class="flex-1 flex items-end" :style="{ height: '100%' }">
            <view class="w-full rounded-4rpx bg-[#0D0D0D]" :style="{ height: bar + '%' }" />
          </view>
        </view>
      </view>
      <view class="mt-12rpx flex justify-between">
        <text class="text-20rpx text-[#67676C]">现在</text>
        <text class="text-20rpx text-[#67676C]">{{ totalSpanLabel }}后</text>
      </view>
      <text class="mt-16rpx block text-22rpx text-[#67676C]">
        每次回忆成功，记忆的半衰期被拉长——下一次就能隔得更久才复习。
      </text>
    </view>

    <!-- 预设 -->
    <view class="mx-30rpx mt-32rpx">
      <text class="text-26rpx font-semibold text-[#0D0D0D]">选择一套曲线</text>
      <view class="mt-16rpx flex">
        <view
          v-for="item in presets"
          :key="item.key"
          class="mr-16rpx flex-1 rounded-24rpx px-16rpx py-20rpx"
          :style="presetStyle(item.key)"
          @click="pickPreset(item.key)">
          <text class="block text-center text-24rpx font-semibold" :style="presetLabelStyle(item.key)">
            {{ item.label }}
          </text>
          <text class="mt-6rpx block text-center text-20rpx" :style="presetDescStyle(item.key)">{{ item.desc }}</text>
        </view>
      </view>
    </view>

    <!-- 阶段编辑 -->
    <view class="mx-30rpx mt-40rpx">
      <view class="flex items-center justify-between">
        <text class="text-26rpx font-semibold text-[#0D0D0D]">
          复习间隔（{{ srsStore.curve.steps.length }} 个阶段）
        </text>
        <text v-if="srsStore.curve.steps.length < 12" class="text-24rpx font-semibold text-[#0D0D0D]" @click="addStage">
          + 加一阶
        </text>
      </view>
      <view
        v-for="(step, index) in srsStore.curve.steps"
        :key="index"
        class="mt-16rpx flex items-center rounded-24rpx bg-[#F4F5F7] px-24rpx py-20rpx">
        <text class="w-140rpx text-24rpx text-[#67676C]">{{ index === 0 ? "首次重温" : `第 ${index + 1} 次` }}</text>
        <view class="h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bump(index, -1)">
          <text class="text-30rpx leading-none text-[#0D0D0D]">−</text>
        </view>
        <text class="flex-1 text-center text-28rpx font-semibold text-[#0D0D0D]">{{ formatInterval(step) }}后</text>
        <view class="h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bump(index, 1)">
          <text class="text-30rpx leading-none text-[#0D0D0D]">+</text>
        </view>
        <text
          v-if="srsStore.curve.steps.length > 2"
          class="ml-16rpx text-24rpx text-[#D9303E]"
          @click="removeStage(index)">
          删除
        </text>
      </view>
    </view>

    <!-- 难度系数与每日新卡 -->
    <view class="mx-30rpx mt-40rpx rounded-24rpx bg-[#F7F2E7] p-32rpx">
      <view class="flex items-center justify-between">
        <view>
          <text class="block text-26rpx font-semibold text-[#0D0D0D]">
            难度系数 {{ srsStore.curve.ease.toFixed(1) }}
          </text>
          <text class="mt-6rpx block text-22rpx text-[#67676C]">记得越轻松，间隔膨胀越快</text>
        </view>
        <view class="flex">
          <view class="h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpEase(-0.1)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">−</text>
          </view>
          <view class="ml-12rpx h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpEase(0.1)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">+</text>
          </view>
        </view>
      </view>

      <view class="mt-28rpx flex items-center justify-between">
        <view>
          <text class="block text-26rpx font-semibold text-[#0D0D0D]">每日新卡 {{ srsStore.curve.newPerDay }}</text>
          <text class="mt-6rpx block text-22rpx text-[#67676C]">防止一天灌进太多新卡</text>
        </view>
        <view class="flex">
          <view class="h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpNewPerDay(-5)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">−</text>
          </view>
          <view class="ml-12rpx h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpNewPerDay(5)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">+</text>
          </view>
        </view>
      </view>

      <view class="mt-28rpx flex items-center justify-between">
        <view>
          <text class="block text-26rpx font-semibold text-[#0D0D0D]">
            第 {{ srsStore.curve.masteredStage + 1 }} 阶段算掌握
          </text>
          <text class="mt-6rpx block text-22rpx text-[#67676C]">走到这一档自动标为已掌握</text>
        </view>
        <view class="flex">
          <view class="h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpMastered(-1)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">−</text>
          </view>
          <view class="ml-12rpx h-64rpx w-64rpx flex-center rounded-full bg-white" @click="bumpMastered(1)">
            <text class="text-30rpx leading-none text-[#0D0D0D]">+</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 复习轨迹预览 -->
    <view class="mx-30rpx mt-40rpx mb-40rpx">
      <text class="text-26rpx font-semibold text-[#0D0D0D]">一张新卡的复习轨迹（都答"想起来了"）</text>
      <view class="mt-16rpx rounded-24rpx bg-[#F4F5F7] p-24rpx">
        <view v-for="(item, index) in plan" :key="index" class="flex items-center justify-between py-8rpx">
          <text class="text-24rpx text-[#67676C]">第 {{ index + 1 }} 次复习</text>
          <text class="text-24rpx font-semibold text-[#0D0D0D]">{{ item.label }}</text>
        </view>
      </view>
    </view>

    <!-- 底部操作 -->
    <view
      class="fixed left-0 right-0 flex bg-white px-30rpx py-16rpx border-0 border-t-2rpx border-solid border-[#E3E3E6]"
      :style="{ bottom: 'env(safe-area-inset-bottom)' }">
      <view class="mr-20rpx flex-1">
        <PsButton variant="secondary" size="lg" block @click="resetDefault">恢复默认</PsButton>
      </view>
      <view class="flex-1">
        <PsButton size="lg" block @click="saveAndBack">完成</PsButton>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { useSrsStore } from "@/store/srs";
import { useUserStore } from "@/store/modules/user";
import { T } from "@/theme/tokens";
import { MAX_EASE, MIN_EASE, formatInterval, retention, schedule } from "@/utils/srs";
import type { CurveConfig } from "@/types/record";

type SrsStoreProxy = Omit<ReturnType<typeof useSrsStore>, "curve" | "presetKey"> & {
  curve: CurveConfig;
  presetKey: string;
};

const userStore = useUserStore();
const srsStore = useSrsStore() as unknown as SrsStoreProxy;

const presets = [
  { key: "classic", label: "经典", desc: "艾宾浩斯" },
  { key: "relaxed", label: "舒缓", desc: "少复习" },
  { key: "intensive", label: "密集", desc: "考前突击" },
];

/** 间隔档位阶梯：−/+ 在这些"人话间隔"之间跳，避免用户手工输入分钟数 */
const STEP_LADDER = [
  5, 10, 20, 30, 60, 120, 360, 720, 1440, 2880, 4320, 5760, 10080, 14400, 21600, 43200, 64800, 86400, 129600, 259200,
  525600,
];

// 选中态是墨底，文字色必须跟着切（动态色一律走 :style——unocss 的 transformerClass 不转换动态 class）
const presetStyle = (key: string) =>
  srsStore.presetKey === key ? `background:${T.ink};` : `background:${T.canvas};border:2rpx solid ${T.hairline};`;

const presetLabelStyle = (key: string) => `color:${srsStore.presetKey === key ? T.onPrimary : T.ink};`;

const presetDescStyle = (key: string) =>
  `color:${srsStore.presetKey === key ? "rgba(255,255,255,0.72)" : T.secondaryText};`;

const pickPreset = (key: string) => srsStore.applyPreset(key);

/**
 * 模拟一张新卡一路答 GOOD 的复习轨迹：累加每次的间隔得到复习时点。
 * 它同时喂给上方的锯齿曲线图和底部的轨迹列表——改曲线时两处一起动。
 */
const plan = computed(() => {
  const curve = srsStore.curve;
  const out: { t: number; interval: number; label: string }[] = [];
  let stage = 0;
  let ease = curve.ease;
  let t = 0;
  // 只演示到曲线本身覆盖的阶段（不把 ease 外推的远期尾巴画进来，否则横轴被最后一段撑爆）
  while (out.length < curve.steps.length) {
    const next = schedule({ stage, ease, lapses: 0, reviewCount: out.length }, "GOOD", curve, 0);
    t += next.intervalMinutes;
    stage = next.stage;
    ease = next.ease;
    out.push({ t, interval: next.intervalMinutes, label: formatInterval(next.intervalMinutes) + "后" });
    if (out.length > 12) break;
  }
  return out;
});

const totalSpanLabel = computed(() => formatInterval(plan.value[plan.value.length - 1]?.t ?? 0));

/** 锯齿遗忘曲线的采样：每次复习后保持率回到 1，再按新的记忆强度衰减 */
const bars = computed(() => {
  const curve = srsStore.curve;
  const points = plan.value;
  const horizon = points[points.length - 1]?.t ?? 1;
  const count = 40;
  const out: number[] = [];
  let idx = 0;
  let lastT = 0;
  let strength = curve.steps[0] ?? 60;
  for (let i = 0; i < count; i++) {
    const t = (horizon * i) / (count - 1);
    while (idx < points.length && points[idx].t <= t) {
      lastT = points[idx].t;
      strength = points[idx].interval;
      idx++;
    }
    out.push(Math.round(retention(t - lastT, strength) * 100));
  }
  return out;
});

// 60% 参考线：距底部 60%（容器高 220rpx）
const thresholdStyle = computed(() => `bottom:132rpx;border-top-color:${T.lilacStroke};`);

const bump = (index: number, dir: number) => {
  const steps = [...srsStore.curve.steps];
  const current = steps[index];
  const next =
    dir < 0
      ? ([...STEP_LADDER].reverse().find((v) => v < current) ?? STEP_LADDER[0])
      : (STEP_LADDER.find((v) => v > current) ?? STEP_LADDER[STEP_LADDER.length - 1]);
  steps[index] = next;
  srsStore.patchCurve({ steps });
};

const addStage = () => {
  const steps = [...srsStore.curve.steps];
  const last = steps[steps.length - 1] ?? 1440;
  steps.push(STEP_LADDER.find((v) => v > last) ?? last * 2);
  srsStore.patchCurve({ steps });
};

const removeStage = (index: number) => {
  const steps = srsStore.curve.steps.filter((_, i) => i !== index);
  srsStore.patchCurve({ steps });
};

const bumpEase = (delta: number) => {
  const next = Math.round((srsStore.curve.ease + delta) * 10) / 10;
  srsStore.patchCurve({ ease: Math.min(MAX_EASE, Math.max(MIN_EASE, next)) });
};

const bumpNewPerDay = (delta: number) => {
  srsStore.patchCurve({ newPerDay: Math.min(200, Math.max(1, srsStore.curve.newPerDay + delta)) });
};

const bumpMastered = (delta: number) => {
  const max = srsStore.curve.steps.length - 1;
  srsStore.patchCurve({
    masteredStage: Math.min(max, Math.max(1, srsStore.curve.masteredStage + delta)),
  });
};

const resetDefault = () => {
  srsStore.resetCurve();
  uni.showToast({ title: "已恢复艾宾浩斯默认曲线", icon: "none" });
};

const saveAndBack = () => {
  uni.navigateBack();
};

onShow(() => {
  if (!userStore.token) {
    uni.reLaunch({ url: "/pages/login/index" });
  }
});
</script>
