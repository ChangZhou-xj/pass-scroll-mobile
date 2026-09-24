/**
 * 笔记 API 层——每个函数对应后端 records.controller.ts 的一个路由
 * （路径与方法一一对应，后端注释里有完整路由表）。返回类型 RecordItem 等与
 * 后端 record.serializer.ts 的输出一一对应（见 src/types/record.d.ts）。
 */
import request from "@/utils/request";
import type {
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
