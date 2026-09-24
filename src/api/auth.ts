/**
 * 认证 API 层。login/register 标 auth:false——它们是"获取 token"的请求，
 * 本身不带 token；且它们的 401（密码错误）只 toast 文案，不触发强制跳登录
 * （与 request.ts 的 401 分支配合）。changePassword 不标——必须带 token。
 */
import request from "@/utils/request";

export interface AuthUserInfo {
  id: string;
  username: string;
}

export interface AuthResult {
  token: string;
  user: AuthUserInfo;
}

const AuthAPI = {
  login(username: string, password: string): Promise<AuthResult> {
    return request<AuthResult>({ url: "/auth/login", method: "POST", data: { username, password }, auth: false });
  },
  register(username: string, password: string): Promise<AuthResult> {
    return request<AuthResult>({ url: "/auth/register", method: "POST", data: { username, password }, auth: false });
  },
  changePassword(oldPassword: string, newPassword: string): Promise<null> {
    return request<null>({ url: "/auth/password", method: "POST", data: { oldPassword, newPassword } });
  },
};

export default AuthAPI;
