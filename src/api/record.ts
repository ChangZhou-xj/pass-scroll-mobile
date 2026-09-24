import request from "@/utils/request";
import type { RecordForm, RecordItem, RecordQuery } from "@/types/record";

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
