import { Record as RecordModel } from "@prisma/client";

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
