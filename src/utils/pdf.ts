/**
 * pdf.ts——跨平台 PDF 打开（当前消费方：pages/resume/index.vue 简历预览）
 *
 * 分端原因（各端能力不一致，一套 API 无法通吃）：
 *   - 微信小程序 / App：uni.openDocument 支持 fileType: "pdf"，但只接受本地临时路径，
 *     因此先 uni.downloadFile 落到 tempFilePath 再打开（downloadFile 成功仅代表网络层
 *     OK，HTTP 状态码要单独看，404 也会走 success 回调）。
 *   - H5：uni-app 未实现 uni.openDocument，交给浏览器内置 PDF 阅读器（window.open）。
 */

export interface OpenPdfResult {
  ok: boolean;
  /** 失败时的用户提示文案（ok=false 时页面直接展示） */
  message?: string;
}

let isH5 = false;
// #ifdef H5
isH5 = true;
// #endif

/** 下载远端 PDF 到本地临时路径（小程序 / App 打开文档的前置步骤） */
function downloadPdf(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.tempFilePath);
        } else {
          reject(new Error(`简历下载失败(${res.statusCode})`));
        }
      },
      fail: () => reject(new Error("网络异常，请稍后重试")),
    });
  });
}

/** 打开本地临时路径的 PDF（微信端 showMenu 允许右上角转发/保存） */
function openLocalPdf(filePath: string): Promise<OpenPdfResult> {
  return new Promise((resolve) => {
    uni.openDocument({
      filePath,
      fileType: "pdf",
      showMenu: true,
      success: () => resolve({ ok: true }),
      fail: () => resolve({ ok: false, message: "当前环境无法预览 PDF" }),
    });
  });
}

/**
 * 打开远端 PDF：
 *   - H5：新窗口交给浏览器原生 PDF 阅读器；
 *   - 小程序 / App：下载到临时路径后调起系统文档预览页。
 * 不 reject（失败也 resolve，message 携带提示），页面按 ok 切换状态即可。
 */
export function openPdf(url: string): Promise<OpenPdfResult> {
  if (isH5) {
    window.open(url, "_blank");
    return Promise.resolve({ ok: true });
  }
  return downloadPdf(url)
    .then((filePath) => openLocalPdf(filePath))
    .catch((err: Error) => ({ ok: false, message: err.message }));
}
