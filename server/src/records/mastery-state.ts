/**
 * 掌握度状态机——"哪些状态能变成哪些状态"的唯一裁判
 *
 * 【状态机是什么】把状态流转规则集中写成一张表（ALLOWED），业务代码改状态前
 * 先过 assertMasteryTransition 校验，非法流转直接拒绝（业务码 10002）——
 * 规则只在这一个地方维护，不会散落在各个 if 里。
 *
 * 流转图（设计意图：掌握只能"挣来"，已掌握想退回必须重新经过复习中，防误点）：
 *   未掌握 NONE      → 复习中 / 已掌握
 *   复习中 LEARNING  → 已掌握 / 未掌握
 *   已掌握 MASTERED  → 复习中（不能直接回未掌握）
 */
import { Mastery } from "@prisma/client";
import { BusinessException } from "../common/exceptions/business.exception";

export const INVALID_MASTERY_TRANSITION = 10002;

const ALLOWED: Record<Mastery, Mastery[]> = {
  NONE: ["LEARNING", "MASTERED"],
  LEARNING: ["MASTERED", "NONE"],
  MASTERED: ["LEARNING"],
};

/** 掌握度状态机：集中校验流转，非法流转抛业务异常（对齐 spec 决策 6） */
export function assertMasteryTransition(from: Mastery, to: Mastery) {
  if (from === to || !ALLOWED[from].includes(to)) {
    throw new BusinessException(INVALID_MASTERY_TRANSITION, `掌握度状态非法流转: ${from} → ${to}`);
  }
}
