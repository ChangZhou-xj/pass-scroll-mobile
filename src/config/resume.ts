/**
 * 简历配置——PDF 来源唯一入口（消费方：pages/resume/index.vue）
 *
 * 约定：
 *   - 地址必须是网络地址：微信小程序 uni.downloadFile 只支持 https 域名
 *     （且域名需在小程序后台配置为 downloadFile 合法域名），包内 static 文件在小程序端无法预览。
 *   - H5 无此限制，也可指向本项目静态目录（把 resume.pdf 放进 src/static 后填 /static/resume.pdf）。
 *   - 未配置时简历页展示「尚未配置」兜底态，不报错。
 */
export const RESUME_PDF_URL: string = (import.meta.env.VITE_RESUME_PDF_URL as string) || "";
