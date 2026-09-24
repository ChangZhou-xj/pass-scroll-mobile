/**
 * 前端入口——创建 Vue 应用实例并全局注册 Pinia（页面状态管理，见 store/）。
 * uni-app 约定导出 createApp 工厂函数，框架在启动时调用它（H5/小程序共用此入口）。
 */
import { createSSRApp } from "vue";
import App from "./App.vue";
import "uno.css";
import { setupStore } from "@/store";
export function createApp() {
  const app = createSSRApp(App);
  // 全局注册 store
  setupStore(app);
  return {
    app,
  };
}
