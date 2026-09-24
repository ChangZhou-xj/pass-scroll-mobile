import { Record as RecordModel, RecordSnapshot } from "@prisma/client";

export type RecordWithTags = RecordModel & { tags: { tag: { name: string } }[] };

export function serializeRecord(record: RecordWithTags) {
  return {
    id: record.id,
    title: record.title,
    content: record.content,
    isPinned: record.isPinned,
    version: record.version,
    mastery: record.mastery,
    tags: record.tags.map((rt) => rt.tag.name),
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };
}

export function serializeSnapshot(row: RecordSnapshot) {
  return { id: row.id, version: row.version, title: row.title, createdAt: row.createdAt.getTime() };
}

export function serializeSnapshotDetail(row: RecordSnapshot) {
  return { ...serializeSnapshot(row), content: row.content };
}
