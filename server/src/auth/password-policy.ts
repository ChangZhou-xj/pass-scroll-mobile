/**
 * 密码强度策略——注册与改密共用的同一把尺子
 *
 * 规则：8~64 位，且必须同时含字母与数字（防 "12345678"、"abcdefgh" 这类弱密码）。
 * 强度不够的密码直接拒收（业务码 10004），不给入库机会——弱密码的哈希和明文一样危险。
 */
import { BusinessException } from "../common/exceptions/business.exception";

export const WEAK_PASSWORD = 10004;

/** 统一密码强度：8~64 位且同时包含字母与数字（注册与改密共用） */
export function assertPasswordStrength(password: string) {
  const ok = password.length >= 8 && password.length <= 64 && /[A-Za-z]/.test(password) && /\d/.test(password);
  if (!ok) throw new BusinessException(WEAK_PASSWORD, "密码需为 8-64 位且同时包含字母与数字");
}
