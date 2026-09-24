/** 掌握度（与后端 Mastery 枚举一致） */
export type Mastery = "NONE" | "LEARNING" | "MASTERED";

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
}
