//  src/store/modules/user.ts
import { defineStore } from "pinia";
import AuthAPI, { AuthResult, AuthUserInfo } from "@/api/auth";

export const useUserStore = defineStore("user", () => {
  const token = ref<string>(uni.getStorageSync("token") || "");
  const userInfo = ref<AuthUserInfo | null>(null);

  const applyAuth = (result: AuthResult) => {
    token.value = result.token;
    userInfo.value = result.user;
    uni.setStorageSync("token", result.token);
  };

  // 登录
  const login = async (username: string, password: string) => {
    applyAuth(await AuthAPI.login(username, password));
  };

  // 注册（成功后直接视为登录）
  const register = async (username: string, password: string) => {
    applyAuth(await AuthAPI.register(username, password));
  };

  // 登出：JWT 无状态，仅本地清除
  const logout = () => {
    token.value = "";
    userInfo.value = null;
    uni.removeStorageSync("token");
  };

  return {
    token,
    userInfo,
    login,
    register,
    logout,
  };
});
