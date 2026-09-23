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
};

export default AuthAPI;
