import { marked } from "marked";

export type ContainerKind = "tip" | "warning" | "danger" | "details";

export type NoteSegment =
  | { type: "html"; html: string }
  | { type: "container"; kind: ContainerKind; title: string; html: string };

const CONTAINER_DEFAULT_TITLES: Record<ContainerKind, string> = {
  tip: "提示",
  warning: "警告",
  danger: "危险",
  details: "答案",
};

/** 标签 → 内联样式（rich-text 只认内联样式，不认 class/外部 CSS） */
const TAG_STYLES: Record<string, string> = {
  h1: "font-size:40rpx;font-weight:700;margin:32rpx 0 16rpx;color:#3C3C43;",
  h2: "font-size:36rpx;font-weight:700;margin:32rpx 0 16rpx;color:#3C3C43;border-bottom:1px solid #eee;padding-bottom:8rpx;",
  h3: "font-size:32rpx;font-weight:600;margin:24rpx 0 12rpx;color:#3C3C43;",
  h4: "font-size:30rpx;font-weight:600;margin:20rpx 0 10rpx;color:#3C3C43;",
  h5: "font-size:28rpx;font-weight:600;margin:16rpx 0 8rpx;color:#3C3C43;",
  h6: "font-size:26rpx;font-weight:600;margin:16rpx 0 8rpx;color:#67676C;",
  p: "margin:12rpx 0;line-height:1.7;color:#3C3C43;font-size:28rpx;",
  blockquote: "border-left:6rpx solid #3E63DD;margin:16rpx 0;padding:8rpx 20rpx;color:#67676C;background:#F7F8FA;",
  ul: "padding-left:40rpx;margin:12rpx 0;",
  ol: "padding-left:40rpx;margin:12rpx 0;",
  li: "margin:6rpx 0;line-height:1.7;font-size:28rpx;color:#3C3C43;",
  a: "color:#3E63DD;text-decoration:underline;",
  strong: "font-weight:700;",
  em: "font-style:italic;",
  hr: "border:none;border-top:1px solid #eee;margin:32rpx 0;",
  table: "border-collapse:collapse;width:100%;margin:16rpx 0;font-size:26rpx;",
  th: "border:1px solid #e5e5e5;background:#F7F8FA;padding:12rpx 16rpx;font-weight:600;",
  td: "border:1px solid #e5e5e5;padding:12rpx 16rpx;",
  img: "max-width:100%;border-radius:12rpx;",
  del: "text-decoration:line-through;color:#67676C;",
};

const PRE_STYLE =
  "background:#16181D;color:#e6e6e6;border-radius:16rpx;padding:24rpx;margin:16rpx 0;overflow-x:auto;font-size:24rpx;line-height:1.6;";
const CODE_IN_PRE_STYLE =
  "font-family:Consolas,Menlo,monospace;background:transparent;color:#e6e6e6;padding:0;font-size:24rpx;";
const CODE_INLINE_STYLE =
  "font-family:Consolas,Menlo,monospace;background:rgba(62,99,221,0.08);color:#3E63DD;border-radius:6rpx;padding:2rpx 8rpx;font-size:26rpx;";

/** H5 标记：rich-text 字符串 nodes 的内联样式不做 rpx 转换（浏览器不识别 rpx），
 * 需在 H5 端把 rpx 按 750 设计稿换算为 px；小程序原生支持 rpx，保持原样。
 * 条件编译只写赋值语句（不写 return），避免 eslint no-unreachable。 */
let isH5 = false;
// #ifdef H5
isH5 = true;
// #endif

/** H5 端把样式值中的 rpx 换算为 px，其余平台原样返回 */
function adaptUnits(html: string): string {
  if (!isH5) return html;
  return html.replace(/(\d+(?:\.\d+)?)rpx/g, (_match, value) => `${uni.upx2px(Number(value))}px`);
}

/** 给 HTML 标签注入内联样式 */
function injectStyles(html: string): string {
  let out = html;
  // 先处理 pre><code（深色代码块内的 code 不能用行内浅色样式）
  out = out.replace(/<pre><code([^>]*)>/g, `<pre style="${PRE_STYLE}"><code style="${CODE_IN_PRE_STYLE}"$1>`);
  out = out.replace(/<pre(?![^>]*style=)([^>]*)>/g, `<pre style="${PRE_STYLE}"$1>`);
  out = out.replace(/<code(?![^>]*style=)([^>]*)>/g, `<code style="${CODE_INLINE_STYLE}"$1>`);
  for (const [tag, style] of Object.entries(TAG_STYLES)) {
    out = out.replace(new RegExp(`<${tag}(?![^>]*style=)([^>]*)>`, "g"), `<${tag} style="${style}"$1>`);
  }
  return adaptUnits(out);
}

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { gfm: true, breaks: false }) as string;
  return injectStyles(html);
}

/** 把笔记内容按 ::: 容器围栏切分为可渲染分段；不支持容器嵌套（笔记中没有） */
export function parseNote(content: string): NoteSegment[] {
  const lines = content.split("\n");
  const segments: NoteSegment[] = [];
  let mdBuffer: string[] = [];
  let i = 0;
  const flushMd = () => {
    const text = mdBuffer.join("\n").trim();
    mdBuffer = [];
    if (text) segments.push({ type: "html", html: renderMarkdown(text) });
  };
  while (i < lines.length) {
    const open = lines[i].match(/^:::\s*(tip|warning|danger|details)\s*(.*)$/);
    if (open) {
      flushMd();
      const kind = open[1] as ContainerKind;
      const customTitle = open[2].trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 跳过闭合 :::
      segments.push({
        type: "container",
        kind,
        title: customTitle || CONTAINER_DEFAULT_TITLES[kind],
        html: renderMarkdown(body.join("\n").trim()),
      });
    } else {
      mdBuffer.push(lines[i]);
      i++;
    }
  }
  flushMd();
  return segments;
}
