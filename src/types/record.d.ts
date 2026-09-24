/** 掌握度（与后端 Mastery 枚举一致） */
export type Mastery = "NONE" | "LEARNING" | "MASTERED";

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
}

/** 记录列表查询参数 */
export interface RecordQuery {
  keyword?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}
