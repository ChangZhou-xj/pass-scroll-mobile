/** 掌握度（与后端 Mastery 枚举一致） */
export type Mastery = "NONE" | "LEARNING" | "MASTERED";

/**
 * 复习自评档位（主动回忆后对照答案给自己打分）
 * AGAIN 忘了 / HARD 很吃力 / GOOD 想起来了 / EASY 毫不费力
 */
export type Grade = "AGAIN" | "HARD" | "GOOD" | "EASY";

/** 一份记忆曲线配置（用户可自定制，见 utils/srs.ts 的 DEFAULT_CURVE / PRESET_CURVES） */
export interface CurveConfig {
  /** 各记忆阶段的间隔，单位【分钟】 */
  steps: number[];
  /** 初始难度系数（SM-2 经典 2.5） */
  ease: number;
  easyBonus: number;
  hardFactor: number;
  /** 走到第几个阶段算"已掌握" */
  masteredStage: number;
  /** 每日新卡上限 */
  newPerDay: number;
}

/** 记忆宫殿（与后端 palaces.service.ts 输出一致） */
export interface PalaceItem {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  recordCount: number;
  createdAt: number;
}

/**
 * 前后端共享的数据契约（TypeScript 类型）——与后端 server/src/records/record.serializer.ts
 * 的输出一一对应。后端改了返回结构，这里必须同步改（编译器会帮你找出所有受影响的地方）。
 */

/** 记录条目（与后端 record.serializer 输出一致） */
export interface RecordItem {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  /** 内容版本号，乐观锁用 */
  version: number;
  mastery: Mastery;
  tags: string[];
  /** 毫秒时间戳 */
  createdAt: number;
  /** 毫秒时间戳 */
  updatedAt: number;
  // ── 记忆卡片：间隔重复调度状态（与后端 records/srs.ts 一一对应）──
  /** 记忆阶段：连续答对 +1，忘了归零 */
  stage: number;
  /** 难度系数，越大间隔膨胀越快 */
  ease: number;
  /** 累计遗忘次数 */
  lapses: number;
  /** 累计复习次数（0 = 新卡） */
  reviewCount: number;
  /** 下次复习时刻（毫秒）；null = 从未排期 */
  dueAt: number | null;
  /** 上次复习时刻；null = 从未复习 */
  lastReviewedAt: number | null;
  /** 首次复习时刻；null = 还没学第一次 */
  firstReviewedAt: number | null;
  // ── 记忆宫殿位置 ──
  /** 所属宫殿 id；null = 未归档 */
  palaceId: string | null;
  /** 宫殿内的桩位序号 */
  palaceOrder: number;
}

/** 队列里的一个"主题块"：同一标签的卡片连在一起复习 */
export interface DueBlock {
  /** 标签名；空串 = 未打标签的卡片 */
  tag: string;
  count: number;
}

/** GET /records/due/tags 的单项：某个标签今天还有多少要复习 */
export interface DueTagStat {
  name: string;
  /** 今日待复习数（到期 + 新卡，与队列同口径） */
  due: number;
  /** 该标签下笔记总数 */
  total: number;
}

/** GET /records/due 的返回：今日复习队列 + 统计 */
export interface DueSummary {
  /**
   * 已排好序的队列：按【主题块】排——同一标签的卡片连成一整块，一块啃完再进下一块，
   * 避免 #游戏 和 #面试 交替出现。块内仍是到期优先（逾期最久在前）→ 新卡在后。
   */
  list: RecordItem[];
  /** 与 list 对应的主题分块（顺序一致，count 之和 = list.length） */
  blocks: DueBlock[];
  dueCount: number;
  freshCount: number;
  /** 今日已复习卡片数 */
  learnedToday: number;
  /** 队列清空后下一张到期的时刻；null = 没有待排期的卡 */
  nextDueAt: number | null;
}

/** 记录表单（创建/编辑提交参数） */
export interface RecordForm {
  id?: string;
  title: string;
  content: string;
  tags: string[];
  /** 编辑时携带的版本号（乐观锁），新建不带 */
  expectedVersion?: number;
}

/** 记录列表查询参数 */
export interface RecordQuery {
  keyword?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

/** 版本快照列表项（不含正文） */
export interface SnapshotItem {
  id: string;
  version: number;
  title: string;
  /** 毫秒时间戳 */
  createdAt: number;
}

/** 版本快照详情（含正文） */
export interface SnapshotDetail extends SnapshotItem {
  content: string;
}

/** 记录统计（GET /records/stats） */
export interface RecordStats {
  total: number;
  tagCount: number;
  pinnedCount: number;
  /** 近 7 天每日新增，下标 0 为 6 天前、6 为今日 */
  trend7d: number[];
  mastery: {
    none: number;
    learning: number;
    mastered: number;
  };
  /** 今日待复习卡片数（到期 + 新卡，与 GET /records/due 口径一致） */
  dueCount: number;
}
