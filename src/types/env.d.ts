// src/types/env.d.ts
interface ImportMetaEnv {
  /**
   * 应用端口
   */
  VITE_APP_PORT: number;
  /**
   * API 基础路径
   */
  VITE_APP_BASE_API: string;
  /**
   * API 服务器的 URL
   */
  VITE_APP_API_URL: string;
  /**
   * 简历 PDF 的网络地址（简历预览页数据来源，见 src/config/resume.ts）
   */
  VITE_RESUME_PDF_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
