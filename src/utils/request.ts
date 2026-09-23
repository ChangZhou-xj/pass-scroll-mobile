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

async function toLogin() {
  if (redirecting) return;
  redirecting = true;
  uni.removeStorageSync("token");
  // 同步重置 Pinia 用户态，避免 store token 与 storage 不一致导致首页守卫弹跳循环。
  // request.ts → store/modules/user.ts → api/auth.ts → request.ts 存在循环依赖，须用动态导入打破。
  try {
    const { useUserStore } = await import("@/store/modules/user");
    // 经 store action 重置：本项目 setup store 的 ref 在类型层未解包（已知基线异常），直接赋值会报类型错误
    useUserStore().resetAuthState();
  } catch (e) {
    console.error("重置用户态失败", e);
  }
  uni.showToast({ title: "登录已过期，请重新登录", icon: "none" });
  setTimeout(() => {
    // reLaunch 清空页面栈，防止返回键回到过期页面再次触发 401 造成页面堆叠
    uni.reLaunch({
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
