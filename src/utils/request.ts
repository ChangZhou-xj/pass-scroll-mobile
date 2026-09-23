/** 后端统一响应结构 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  data?: Record<string, unknown>;
  /** 是否携带 token，默认 true */
  auth?: boolean;
}

const BASE_URL = import.meta.env.VITE_APP_API_URL as string;

let redirecting = false;

function toLogin() {
  if (redirecting) return;
  redirecting = true;
  uni.removeStorageSync("token");
  uni.showToast({ title: "登录已过期，请重新登录", icon: "none" });
  setTimeout(() => {
    uni.navigateTo({
      url: "/pages/login/index",
      complete: () => {
        redirecting = false;
      },
    });
  }, 800);
}

export default function request<T = unknown>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { "Content-Type": "application/json" };
    if (options.auth !== false) {
      const token = uni.getStorageSync("token");
      if (token) header.Authorization = `Bearer ${token}`;
    }
    uni.request({
      url: BASE_URL + options.url,
      // @dcloudio/types 的 method 类型缺少 PATCH（H5/App 运行时实际支持），此处断言以通过类型检查
      method: (options.method || "GET") as UniApp.RequestOptions["method"],
      data: options.data,
      header,
      success: (res) => {
        const body = res.data as ApiResponse<T>;
        if (res.statusCode === 401) {
          if (options.auth !== false) {
            toLogin();
          } else {
            // 登录/注册等免鉴权请求的 401（如密码错误）展示后端 message，不触发强制登出
            uni.showToast({ title: body?.message || "登录失败", icon: "none" });
          }
          reject(body);
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.code === 0) {
          resolve(body.data);
          return;
        }
        uni.showToast({ title: body?.message || `请求失败(${res.statusCode})`, icon: "none" });
        reject(body);
      },
      fail: (err) => {
        uni.showToast({ title: "网络异常，请稍后重试", icon: "none" });
        reject(err);
      },
    });
  });
}
