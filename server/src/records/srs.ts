/**
 * srs.ts——间隔重复（Spaced Repetition）调度算法，项目里"什么时候该再复习一次"的唯一裁判
 *
 * 设计立场：本项目不是纯 SM-2（Anki 那套），而是【艾宾浩斯遗忘曲线梯度 + SM-2 难度因子】的混合：
 *   - 梯度（curve.steps）来自艾宾浩斯经典复习点：10 分钟 / 1 天 / 2 天 / 4 天 / 7 天 / 15 天 / 30 天 / 60 天。
 *     前几轮之所以越来越长，是因为每成功回忆一次，记忆的"半衰期"就被拉长一次——这条曲线
 *     正是对遗忘曲线 R=e^(-t/S) 的离散近似：在即将跌破回忆阈值的那一刻把它捞回来。
 *   - 难度因子（ease）来自 SM-2：同一阶段，记得越轻松（EASY）下一次隔得越远，越吃力（HARD）就越短，
 *     忘了（AGAIN）则打回起点。同一张卡和同一份曲线，每个人拿到的间隔因此不同。
 *
 * 【本文件是纯函数，不碰数据库、不碰时间以外的全局状态】——now 由调用方传入，单测可以钉死时间。
 *
 * ⚠️ 前端 src/utils/srs.ts 是本文件的同构副本（前端要在按钮上预显示"下次间隔"，不能为此发一次请求）。
 *    改了这里必须同步改那边，否则按钮上写的天数会和真正写入的 dueAt 不一致。
 */
import { Mastery } from "@prisma/client";

/** 复习自评档位：主动回忆后对照答案给自己的四档评分 */
export type Grade = "AGAIN" | "HARD" | "GOOD" | "EASY";

export const GRADES: Grade[] = ["AGAIN", "HARD", "GOOD", "EASY"];

/** 一份记忆曲线配置（用户可自定制，见 DEFAULT_CURVE 与 PRESET_CURVES） */
export interface CurveConfig {
  /** 各记忆阶段的间隔，单位【分钟】。下标 0 = 刚学完的重温间隔；答对一次 stage+1，取下一档 */
  steps: number[];
  /** 初始难度系数（SM-2 经典初值 2.5）。越大间隔膨胀越快 */
  ease: number;
  /** EASY 档的间隔加成倍数 */
  easyBonus: number;
  /** HARD 档的间隔折扣倍数（<1，卡在当前阶段但缩短间隔） */
  hardFactor: number;
  /** 达到第几个阶段算"已掌握"（驱动 mastery 联动） */
  masteredStage: number;
  /** 每日新卡上限（防止一天灌进几百张新卡） */
  newPerDay: number;
}

/** 默认曲线：艾宾浩斯经典复习点 */
export const DEFAULT_CURVE: CurveConfig = {
  // 10min / 1d / 2d / 4d / 7d / 15d / 30d / 60d
  steps: [10, 1440, 2880, 5760, 10080, 21600, 43200, 86400],
  ease: 2.5,
  easyBonus: 1.3,
  hardFactor: 0.6,
  masteredStage: 6, // 走到 30 天这一档（下标 6）视为长期记忆
  newPerDay: 20,
};

/** 内置预设：覆盖三种典型用法，用户可在此基础上改自定义 */
export const PRESET_CURVES: Record<string, CurveConfig> = {
  // 经典：艾宾浩斯原始复习点，长期记忆优先
  classic: DEFAULT_CURVE,
  // 舒缓：每个阶段都拉长，复习负担小、遗忘风险略高
  relaxed: {
    steps: [30, 2880, 5760, 10080, 21600, 43200, 86400, 129600],
    ease: 2.6,
    easyBonus: 1.35,
    hardFactor: 0.7,
    masteredStage: 5,
    newPerDay: 15,
  },
  // 密集：考前突击，短时间内反复撞击
  intensive: {
    steps: [5, 60, 360, 1440, 2880, 5760, 10080, 21600],
    ease: 2.1,
    easyBonus: 1.2,
    hardFactor: 0.5,
    masteredStage: 5,
    newPerDay: 40,
  },
};

export const MIN_EASE = 1.3; // 再难也别把间隔压到 0，否则"同一张卡一天弹十次"会劝退
export const MAX_EASE = 3.2;
export const MIN_STEP_MINUTES = 1;
export const MAX_STEP_MINUTES = 60 * 24 * 365; // 单个阶段封顶一年
export const MAX_STEPS = 12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * 把任意来源（前端/请求体/旧缓存）的曲线配置洗成合法值——用户能在界面上乱填，这里兜底。
 * 非法字段回落到默认曲线对应字段，而不是整体丢弃：用户只改了一项时不至于把其他项也弄丢。
 */
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

/** 卡片当前所处的调度状态（数据库里的那几个字段） */
export interface SrsState {
  stage: number;
  ease: number;
  lapses: number;
  reviewCount: number;
}

export interface ScheduleResult extends SrsState {
  /** 下次复习时刻 */
  dueAt: Date;
  /** 本次实际采用的间隔（分钟），前端用来在按钮上预显示"3 天后" */
  intervalMinutes: number;
  /** 由本次评分推导出的掌握度（走 mastery-state 的合法流转） */
  mastery: Mastery;
}

/**
 * 第 stage 个阶段的基准间隔（分钟）。
 * 超出曲线长度后不再封顶，而是按 ease 指数继续外推（学得好的卡可以一路推到几年后）。
 */
export function intervalForStage(stage: number, curve: CurveConfig, ease: number): number {
  const steps = curve.steps;
  const last = steps[steps.length - 1];
  if (stage < steps.length) return steps[stage];
  const overflow = stage - steps.length + 1;
  return Math.round(last * Math.pow(Math.max(ease, MIN_EASE), overflow));
}

/**
 * 核心：给定卡片当前状态与本次评分，算出下一次的调度。
 *
 * 四档的语义（复习页就是按这四档问用户的）：
 *   AGAIN 忘了     → stage 归零、lapses+1、ease 下调，立刻回到最短间隔重新来过
 *   HARD  想起来了但很吃力 → 停在原阶段，间隔打折 ease 略降（不惩罚进度，但缩短下次间隔）
 *   GOOD  正常回忆出来 → stage+1，走曲线的下一档
 *   EASY  毫不费力   → stage+1，间隔再乘 easyBonus，ease 上调（这张卡对你太简单了）
 */
export function schedule(
  state: SrsState,
  grade: Grade,
  curve: CurveConfig = DEFAULT_CURVE,
  now: Date = new Date(),
): ScheduleResult {
  const safeCurve = normalizeCurve(curve);
  let { stage, ease, lapses } = state;
  stage = Math.max(0, stage || 0);
  ease = clamp(Number(ease) || safeCurve.ease, MIN_EASE, MAX_EASE);

  let interval: number;
  switch (grade) {
    case "AGAIN":
      // 忘了：打回起点（不是退一阶——记忆宫殿里"想不起来"意味着这条路径要重建）
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
    dueAt: new Date(now.getTime() + Math.max(MIN_STEP_MINUTES, interval) * 60_000),
    mastery: stage >= safeCurve.masteredStage ? "MASTERED" : "LEARNING",
  };
}

/**
 * 遗忘曲线保持率 R = e^(-t/S)：给定"上次复习至今的时长 t"与"当前记忆强度 S"，估算还记得多少。
 * S 用当前阶段的间隔近似（间隔越长 = 记忆越稳固 = 衰减越慢），用于曲线图与卡片"记忆强度"可视化。
 */
export function retention(elapsedMinutes: number, strengthMinutes: number): number {
  const s = Math.max(1, strengthMinutes);
  return Math.exp(-Math.max(0, elapsedMinutes) / s);
}
