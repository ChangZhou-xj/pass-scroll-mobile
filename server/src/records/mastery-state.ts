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
