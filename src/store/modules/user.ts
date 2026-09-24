/**
 * 用户 store——登录态的前端载体
 *
 * - token 持久化在 storage（"token"），应用重启仍在；userInfo 只在内存（首字符头像用）
 * - login/register 成功后 token+userInfo 一并落地（applyAuth）
 * - logout：清 token、清内存态、清笔记缓存（缓存按用户隔离，防止下一个账号看到上一个的数据）
 * - resetAuthState：401 强制登出时由 request.ts 动态导入调用（避免循环依赖）
 */
//  src/store/modules/user.ts
import { defineStore } from "pinia";
import AuthAPI, { AuthResult, AuthUserInfo } from "@/api/auth";
import { useRecordStore } from "@/store/record";

export const useUserStore = defineStore("user", () => {
  const token = ref<string>(uni.getStorageSync("token") || "");
  const userInfo = ref<AuthUserInfo | null>(null);

  const applyAuth = (result: AuthResult) => {
    token.value = result.token;
    userInfo.value = result.user;
    uni.setStorageSync("token", result.token);
  };

  // 重置内存中的鉴权态（401 强制登出复用），不触碰记录缓存
  const resetAuthState = () => {
    token.value = "";
    userInfo.value = null;
  };

  // 登录
  const login = async (username: string, password: string) => {
    applyAuth(await AuthAPI.login(username, password));
  };

  // 注册（成功后直接视为登录）
  const register = async (username: string, password: string) => {
    applyAuth(await AuthAPI.register(username, password));
  };

  // 登出：JWT 无状态，仅本地清除；同时清空按用户隔离的记录缓存
  const logout = () => {
    resetAuthState();
    uni.removeStorageSync("token");
    // 记录缓存按用户隔离，登出时清空内存态与 storage，避免下一账号冷启动看到上一用户数据。
    // 本项目 setup store 的 ref 在类型层未解包（已知基线异常），按运行时解包后的实际结构经 unknown 转换赋值。
    const recordStore = useRecordStore();
    (recordStore as unknown as { records: unknown[] }).records = [];
    uni.removeStorageSync("pass_scroll_records");
  };

  return {
    token,
    userInfo,
    login,
    register,
    logout,
    resetAuthState,
  };
});
