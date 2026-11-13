/** 格式化时间为相对描述 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (date.toDateString() === now.toDateString()) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `昨天 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

/** 截断文本到指定长度 */
export function truncateText(text: string, maxLength = 100): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * 摘要记忆化：列表里每张卡片都对整篇正文跑 14 条正则，一次刷新 50 张就是 700 次全文扫描，
 * 而结果只显示两行。key 用正文本身（字符串按键值比较，重新拉取后内容相同也能命中）。
 */
export const PLAIN_TEXT_CACHE_MAX = 200;
const plainTextCache = new Map<string, string>();

export function plainTextCacheSize(): number {
  return plainTextCache.size;
}

export function resetPlainTextCache(): void {
  plainTextCache.clear();
}

/** markdown 转纯文本（列表摘要用）：剥离语法符号、去掉文首 H1（通常与标题重复） */
export function plainText(markdown: string): string {
  const cached = plainTextCache.get(markdown);
  if (cached !== undefined) return cached;

  const text = stripMarkdown(markdown);
  if (plainTextCache.size >= PLAIN_TEXT_CACHE_MAX) {
    const oldest = plainTextCache.keys().next().value;
    if (oldest !== undefined) plainTextCache.delete(oldest);
  }
  plainTextCache.set(markdown, text);
  return text;
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#\s+.*(\n|$)/, "")
    .replace(/```[\s\S]*?```/g, " [代码] ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s*:::.*$/gm, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "[图片]")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*-{3,}\s*$/gm, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
