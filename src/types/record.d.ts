/** 记录条目（与后端 record.serializer 输出一致） */
export interface RecordItem {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
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
