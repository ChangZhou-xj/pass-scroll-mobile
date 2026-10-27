/**
 * 笔记 API 层——每个函数对应后端 records.controller.ts 的一个路由
 * （路径与方法一一对应，后端注释里有完整路由表）。返回类型 RecordItem 等与
 * 后端 record.serializer.ts 的输出一一对应（见 src/types/record.d.ts）。
 */
import request from "@/utils/request";
import type {
  CurveConfig,
  DueSummary,
  DueTagStat,
  Grade,
  Mastery,
  RecordForm,
  RecordItem,
  RecordQuery,
  RecordStats,
  SnapshotDetail,
  SnapshotItem,
} from "@/types/record";

export interface RecordListResult {
  list: RecordItem[];
  total: number;
}

export function listRecords(query: RecordQuery): Promise<RecordListResult> {
  return request<RecordListResult>({ url: "/records", method: "GET", data: { ...query } });
}

export function getRecord(id: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}` });
}

export function createRecord(form: RecordForm): Promise<RecordItem> {
  return request<RecordItem>({
    url: "/records",
    method: "POST",
    data: { title: form.title, content: form.content, tags: form.tags },
  });
}

export function updateRecord(id: string, form: RecordForm): Promise<RecordItem> {
  return request<RecordItem>({
    url: `/records/${id}`,
    method: "PATCH",
    data: { title: form.title, content: form.content, tags: form.tags, expectedVersion: form.expectedVersion },
  });
}

export function deleteRecord(id: string): Promise<null> {
  return request<null>({ url: `/records/${id}`, method: "DELETE" });
}

export function togglePinRecord(id: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/pin`, method: "POST" });
}

export function updateMastery(id: string, to: Mastery): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/mastery`, method: "POST", data: { to } });
}

/**
 * 今日复习队列（到期卡 + 定额新卡），按主题块排好
 * @param params.palaceId 宫殿巡游模式；@param params.tag 主题聚焦（只学这一个标签）
 */
export function getDueRecords(
  params: { limit?: number; palaceId?: string; newPerDay?: number; tag?: string } = {},
): Promise<DueSummary> {
  // 只装配有值的查询项：uni.request 的 GET 参数里带 undefined 会被拼成 palaceId=undefined 这种字面量
  const data: Record<string, string | number> = {};
  if (params.limit) data.limit = params.limit;
  if (params.palaceId) data.palaceId = params.palaceId;
  if (params.newPerDay) data.newPerDay = params.newPerDay;
  if (params.tag) data.tag = params.tag;
  return request<DueSummary>({ url: "/records/due", method: "GET", data });
}

/** 今日待复习按标签统计（标签栏角标 / 复习页主题切换器） */
export function getDueTags(): Promise<DueTagStat[]> {
  return request<DueTagStat[]>({ url: "/records/due/tags", method: "GET" });
}

/** 提交一次复习自评；curve 是用户自定义的记忆曲线（后端不持久化，随评分带入） */
export function reviewRecord(id: string, grade: Grade, curve: CurveConfig): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/review`, method: "POST", data: { grade, curve } });
}

export function listSnapshots(id: string): Promise<SnapshotItem[]> {
  return request<SnapshotItem[]>({ url: `/records/${id}/snapshots` });
}

export function getSnapshot(id: string, sid: string): Promise<SnapshotDetail> {
  return request<SnapshotDetail>({ url: `/records/${id}/snapshots/${sid}` });
}

export function restoreSnapshot(id: string, sid: string): Promise<RecordItem> {
  return request<RecordItem>({ url: `/records/${id}/snapshots/${sid}/restore`, method: "POST" });
}

export function getStats(): Promise<RecordStats> {
  return request<RecordStats>({ url: "/records/stats" });
}
