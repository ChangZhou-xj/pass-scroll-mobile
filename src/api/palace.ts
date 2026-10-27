/**
 * 记忆宫殿 API——对应后端 palaces.controller.ts
 * 宫殿是"空间路径"，卡片是路径上的桩位：复习时按 palaceOrder 走位回忆（位置法）。
 */
import request from "@/utils/request";
import type { PalaceItem } from "@/types/record";

export function listPalaces(): Promise<PalaceItem[]> {
  return request<PalaceItem[]>({ url: "/palaces" });
}

export function createPalace(form: { name: string; emoji?: string; description?: string }): Promise<PalaceItem> {
  return request<PalaceItem>({ url: "/palaces", method: "POST", data: { ...form } });
}

export function updatePalace(
  id: string,
  form: { name?: string; emoji?: string; description?: string },
): Promise<PalaceItem> {
  return request<PalaceItem>({ url: `/palaces/${id}`, method: "PATCH", data: { ...form } });
}

export function deletePalace(id: string): Promise<null> {
  return request<null>({ url: `/palaces/${id}`, method: "DELETE" });
}

/** 设定宫内卡片与桩位顺序：recordIds 的数组顺序即位置顺序（整体覆盖） */
export function setPalaceRecords(id: string, recordIds: string[]): Promise<PalaceItem[]> {
  return request<PalaceItem[]>({ url: `/palaces/${id}/records`, method: "POST", data: { recordIds } });
}

/** 把某张卡移出宫殿 */
export function removePalaceRecord(id: string, recordId: string): Promise<PalaceItem[]> {
  return request<PalaceItem[]>({ url: `/palaces/${id}/records/${recordId}`, method: "DELETE" });
}
