import { BusinessException } from "../common/exceptions/business.exception";

export const WEAK_PASSWORD = 10004;

/** 统一密码强度：8~64 位且同时包含字母与数字（注册与改密共用） */
export function assertPasswordStrength(password: string) {
  const ok = password.length >= 8 && password.length <= 64 && /[A-Za-z]/.test(password) && /\d/.test(password);
  if (!ok) throw new BusinessException(WEAK_PASSWORD, "密码需为 8-64 位且同时包含字母与数字");
}
