/**
 * 序列化器——"数据库行"与"前端契约"之间的翻译层
 *
 * 数据库存的原始行不适合直接发给前端：
 *   - tags 是嵌套的桥接结构 [{ tag: { name: "面试" } }]，前端只要 ["面试"]
 *   - 时间是 Date 对象（JSON 里会变成 ISO 字符串），前端统一要毫秒数字
 *   集中在这里转换，service 几十处返回点就不会各写一遍，字段调整也只改这一处。
 * 前端 src/types/record.d.ts 的 RecordItem/SnapshotItem 与本文件输出一一对应。
 *
 * 【为什么 import 里写 Record as RecordModel】Prisma 模型名 Record 与 TypeScript
 * 内置工具类型 Record<K, V> 撞名，起个别名避免冲突。
 */
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
    // 记忆卡片调度状态（见 records/srs.ts）：null 表示"从未排期/从未复习"
    stage: record.stage,
    ease: record.ease,
    lapses: record.lapses,
    reviewCount: record.reviewCount,
    dueAt: record.dueAt ? record.dueAt.getTime() : null,
    lastReviewedAt: record.lastReviewedAt ? record.lastReviewedAt.getTime() : null,
    firstReviewedAt: record.firstReviewedAt ? record.firstReviewedAt.getTime() : null,
    // 记忆宫殿位置（null = 未归档到任何宫殿）
    palaceId: record.palaceId,
    palaceOrder: record.palaceOrder,
  };
}

export function serializeSnapshot(row: RecordSnapshot) {
  return { id: row.id, version: row.version, title: row.title, createdAt: row.createdAt.getTime() };
}

export function serializeSnapshotDetail(row: RecordSnapshot) {
  return { ...serializeSnapshot(row), content: row.content };
}
