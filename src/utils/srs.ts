/**
 * srs.ts——间隔重复调度算法（前端副本）
 *
 * ⚠️ 这是 server/src/records/srs.ts 的【同构副本】。后端是权威（写入 dueAt 的是它），
 * 前端需要它做两件不能发请求的事：
 *   1. 复习页四个自评按钮上要预显示"下次间隔"（10 分钟 / 2 天 / 7 天…）——这是间隔重复产品的关键反馈；
 *   2. 记忆曲线页要预览"按这份曲线，一张卡在第 N 天会被复习几次"。
 * 因此两份实现必须逐行等价：改了后端这里要同步，改了这里后端也要同步。
 *
 * 算法本身的设计说明（艾宾浩斯梯度 + SM-2 难度因子）见后端文件顶部注释。
 */
import type { CurveConfig, Grade } from "@/types/record";

export const DEFAULT_CURVE: CurveConfig = {
  steps: [10, 1440, 2880, 5760, 10080, 21600, 43200, 86400],
  ease: 2.5,
  easyBonus: 1.3,
  hardFactor: 0.6,
  masteredStage: 6,
  newPerDay: 20,
};

export const PRESET_CURVES: Record<string, CurveConfig> = {
  classic: DEFAULT_CURVE,
  relaxed: {
    steps: [30, 2880, 5760, 10080, 21600, 43200, 86400, 129600],
    ease: 2.6,
    easyBonus: 1.35,
    hardFactor: 0.7,
    masteredStage: 5,
    newPerDay: 15,
  },
  intensive: {
    steps: [5, 60, 360, 1440, 2880, 5760, 10080, 21600],
    ease: 2.1,
    easyBonus: 1.2,
    hardFactor: 0.5,
    masteredStage: 5,
    newPerDay: 40,
  },
};

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.2;
export const MIN_STEP_MINUTES = 1;
export const MAX_STEP_MINUTES = 60 * 24 * 365;
export const MAX_STEPS = 12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 清洗任意来源的曲线配置（用户手填 / 旧缓存 / 脏数据），非法项回落默认值 */
export function normalizeCurve(input: Partial<CurveConfig> | null | undefined): CurveConfig {
  const raw = input ?? {};
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const steps = rawSteps
    .filter((n) => typeof n === "number" && Number.isFinite(n))
    .map((n) => Math.round(clamp(n, MIN_STEP_MINUTES, MAX_STEP_MINUTES)))
    .slice(0, MAX_STEPS);
  return {
    steps: steps.length ? steps : [...DEFAULT_CURVE.steps],
    ease: clamp(Number(raw.ease) || DEFAULT_CURVE.ease, MIN_EASE, MAX_EASE),
    easyBonus: clamp(Number(raw.easyBonus) || DEFAULT_CURVE.easyBonus, 1, 2),
    hardFactor: clamp(Number(raw.hardFactor) || DEFAULT_CURVE.hardFactor, 0.1, 1),
    masteredStage: clamp(
      Math.round(Number(raw.masteredStage) || DEFAULT_CURVE.masteredStage),
      1,
      (steps.length || DEFAULT_CURVE.steps.length) - 1,
    ),
    newPerDay: clamp(Math.round(Number(raw.newPerDay) || DEFAULT_CURVE.newPerDay), 1, 200),
  };
}

export interface SrsState {
  stage: number;
  ease: number;
  lapses: number;
  reviewCount: number;
}

export interface ScheduleResult extends SrsState {
  dueAt: number;
  intervalMinutes: number;
  mastery: "NONE" | "LEARNING" | "MASTERED";
}

/** 第 stage 阶段的基准间隔（分钟）；超出曲线长度后按 ease 指数外推 */
export function intervalForStage(stage: number, curve: CurveConfig, ease: number): number {
  const steps = curve.steps;
  const last = steps[steps.length - 1];
  if (stage < steps.length) return steps[stage];
  const overflow = stage - steps.length + 1;
  return Math.round(last * Math.pow(Math.max(ease, MIN_EASE), overflow));
}

export function schedule(
  state: SrsState,
  grade: Grade,
  curve: CurveConfig = DEFAULT_CURVE,
  now: number = Date.now(),
): ScheduleResult {
  const safeCurve = normalizeCurve(curve);
  let { stage, ease, lapses } = state;
  stage = Math.max(0, stage || 0);
  ease = clamp(Number(ease) || safeCurve.ease, MIN_EASE, MAX_EASE);

  let interval: number;
  switch (grade) {
    case "AGAIN":
      stage = 0;
      lapses = (lapses || 0) + 1;
      ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
      interval = intervalForStage(0, safeCurve, ease);
      break;
    case "HARD":
      ease = clamp(ease - 0.15, MIN_EASE, MAX_EASE);
      interval = Math.round(intervalForStage(stage, safeCurve, ease) * safeCurve.hardFactor);
      break;
    case "EASY":
      stage = stage + 1;
      ease = clamp(ease + 0.15, MIN_EASE, MAX_EASE);
      interval = Math.round(intervalForStage(stage, safeCurve, ease) * safeCurve.easyBonus);
      break;
    case "GOOD":
    default:
      stage = stage + 1;
      interval = intervalForStage(stage, safeCurve, ease);
      break;
  }

  return {
    stage,
    ease,
    lapses,
    reviewCount: (state.reviewCount || 0) + 1,
    intervalMinutes: Math.max(MIN_STEP_MINUTES, interval),
    dueAt: now + Math.max(MIN_STEP_MINUTES, interval) * 60_000,
    mastery: stage >= safeCurve.masteredStage ? "MASTERED" : "LEARNING",
  };
}

/** 遗忘曲线保持率 R = e^(-t/S)：S 为当前记忆强度（用当前阶段间隔近似） */
export function retention(elapsedMinutes: number, strengthMinutes: number): number {
  const s = Math.max(1, strengthMinutes);
  return Math.exp(-Math.max(0, elapsedMinutes) / s);
}

/** 把分钟间隔说成人话：45 分钟 / 6 小时 / 3 天 / 2 个月 */
export function formatInterval(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  if (m < 60 * 24) {
    const h = Math.round(m / 60);
    return `${h} 小时`;
  }
  const d = m / (60 * 24);
  if (d < 30) return `${Math.round(d)} 天`;
  if (d < 365) return `${Math.round(d / 30)} 个月`;
  return `${(d / 365).toFixed(1)} 年`;
}

/** 距离某个时刻还有多久（已过期返回"已到期"） */
export function formatDueLabel(target: number, now: number = Date.now()): string {
  const diff = target - now;
  if (diff <= 0) return "已到期";
  return `${formatInterval(Math.round(diff / 60_000))}后`;
}

/**
 * 记忆强度百分比（0-100）：距上次复习过去了多久 vs 当前阶段的记忆强度。
 * 用于宫殿格子与卡片上的"记忆强度"可视化——越接近 0 越该复习。
 */
export function strengthPercent(
  card: { stage: number; ease: number; lastReviewedAt: number | null },
  curve: CurveConfig = DEFAULT_CURVE,
): number {
  if (!card.lastReviewedAt) return 0;
  const elapsed = Math.max(0, (Date.now() - card.lastReviewedAt) / 60_000);
  const strength = intervalForStage(Math.max(0, card.stage), curve, card.ease);
  return Math.round(retention(elapsed, strength) * 100);
}
