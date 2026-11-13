/**
 * markdown 渲染管线——把笔记原文解析为结构化节点树，由 MdBlocks/MdInline 原生组件递归渲染
 *
 * 设计要点：
 *   1. parseNote 按 ::: 围栏把原文切成"普通段"与"容器段"（tip/warning/danger/details），
 *      每段经 marked.lexer 解析为 token，再归一化为 BlockNode/InlineNode 节点树（纯函数，可单测）
 *   2. 渲染全部走原生组件：所有文字都是 <text selectable>，小程序/H5 均可原生长按/拖选复制，
 *      不再依赖 rich-text（仅裸 HTML 兜底）；样式走组件 class，跨端一致
 * 消费方：详情页/复习页/版本预览页/编辑器预览（segments → v-for 渲染）。
 */
import { marked } from "marked";

export type ContainerKind = "tip" | "warning" | "danger" | "details";

/** 行内节点：MdInline 递归渲染为嵌套 selectable text */
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong" | "em" | "del" | "code"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "br" };

/** 块级节点：MdBlocks 递归渲染 */
export type BlockNode =
  | { type: "heading"; depth: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: BlockNode[][] }
  | { type: "blockquote"; blocks: BlockNode[] }
  | { type: "code"; lang: string; text: string }
  | { type: "table"; aligns: ("left" | "center" | "right" | null)[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "image"; href: string; title: string }
  | { type: "hr" }
  | { type: "html"; html: string };

export type NoteSegment =
  | { type: "blocks"; blocks: BlockNode[] }
  | { type: "container"; kind: ContainerKind; title: string; blocks: BlockNode[] };

const CONTAINER_DEFAULT_TITLES: Record<ContainerKind, string> = {
  tip: "提示",
  warning: "警告",
  danger: "危险",
  details: "答案",
};

/** marked token 的最小结构描述（只声明用到的字段，避免依赖版本细节） */
interface MdToken {
  type: string;
  raw?: string;
  depth?: number;
  ordered?: boolean;
  lang?: string;
  text?: string;
  href?: string;
  title?: string;
  align?: ("left" | "center" | "right" | null)[];
  tokens?: MdToken[];
  items?: MdToken[];
  header?: MdToken[];
  rows?: MdToken[][];
}

function inlineToNode(t: MdToken): InlineNode | null {
  switch (t.type) {
    case "text":
    case "escape":
      return { type: "text", text: t.text ?? "" };
    case "strong":
    case "em":
    case "del":
      return { type: t.type, children: inlineToNodes(t.tokens) };
    case "codespan":
      return { type: "code", children: [{ type: "text", text: t.text ?? "" }] };
    case "link":
      return { type: "link", href: t.href ?? "", children: inlineToNodes(t.tokens) };
    // 行内图片（嵌在加粗/链接等内部）退化为替代文本；段落级图片由 blockOf 抽为独立 image 块
    case "image":
      return { type: "text", text: t.text ?? "" };
    case "br":
      return { type: "br" };
    case "html":
      return { type: "text", text: t.raw ?? "" };
    default:
      return null;
  }
}

function inlineToNodes(tokens?: MdToken[]): InlineNode[] {
  return (tokens ?? []).flatMap((t) => {
    if (t.type === "text" && t.tokens) return inlineToNodes(t.tokens);
    const node = inlineToNode(t);
    return node ? [node] : [];
  });
}

/** 压平后的行内片段：同一样式的连续文本合成一段 */
export interface InlineRun {
  text: string;
  cls: string;
}

const INLINE_CLASS: Record<string, string> = {
  strong: "md-strong",
  em: "md-em",
  del: "md-del",
  code: "md-codespan",
  link: "md-link",
};

function pushRun(runs: InlineRun[], text: string, cls: string, merge = true): void {
  if (!text) return;
  const last = runs[runs.length - 1];
  // 换行前后都不合并，否则 "A" + "\n" + "B" 会粘成一段，渲染时的换行位置可能与原逐节点渲染不同
  if (merge && last && last.cls === cls && last.text !== "\n") last.text += text;
  else runs.push({ text, cls });
}

/**
 * 把行内树压平成「一层 text + 若干兄弟 text」。
 * 原因：uni-app 的 <text> 里嵌套组件会在 H5 告警（Do not nest other components…）且各端渲染不一致，
 * 而递归渲染 MdInline 必然产生「text 里套组件」。压平后只剩 text 套 text，样式用 class 表达。
 */
export function flattenInline(nodes: InlineNode[], inherited: string[] = [], runs: InlineRun[] = []): InlineRun[] {
  for (const node of nodes) {
    if (node.type === "text") {
      pushRun(runs, node.text, inherited.join(" "));
      continue;
    }
    if (node.type === "br") {
      // 换行单独成段，不并入相邻文本，保持与原先逐节点渲染一致的换行位置
      pushRun(runs, "\n", inherited.join(" "), false);
      continue;
    }
    const cls = INLINE_CLASS[node.type];
    flattenInline(node.children, cls ? [...inherited, cls] : inherited, runs);
  }
  return runs;
}

function blockOf(t: MdToken): BlockNode[] {
  switch (t.type) {
    case "heading":
      return [{ type: "heading", depth: t.depth ?? 1, children: inlineToNodes(t.tokens) }];
    case "paragraph":
    case "text": {
      // 紧凑列表项的行内内容也是 text 型块；段落中的图片抽为独立 image 块（text 内无法嵌 image）
      const children: InlineNode[] = [];
      const blocks: BlockNode[] = [];
      for (const inline of t.tokens ?? []) {
        if (inline.type === "image") {
          blocks.push({ type: "image", href: inline.href ?? "", title: inline.title ?? "" });
          continue;
        }
        children.push(...inlineToNodes([inline]));
      }
      if (children.length) blocks.unshift({ type: "paragraph", children });
      return blocks;
    }
    case "list":
      return [
        {
          type: "list",
          ordered: Boolean(t.ordered),
          items: (t.items ?? []).map((item) => blocksOf(item.tokens)),
        },
      ];
    case "blockquote":
      return [{ type: "blockquote", blocks: blocksOf(t.tokens) }];
    case "code":
      return [{ type: "code", lang: t.lang ?? "", text: (t.text ?? "").replace(/\n$/, "") }];
    case "table":
      return [
        {
          type: "table",
          aligns: t.align ?? [],
          header: (t.header ?? []).map((cell) => inlineToNodes(cell.tokens)),
          rows: (t.rows ?? []).map((row) => row.map((cell) => inlineToNodes(cell.tokens))),
        },
      ];
    case "hr":
      return [{ type: "hr" }];
    case "html":
      return [{ type: "html", html: t.raw ?? "" }];
    case "space":
      return [];
    default:
      return [];
  }
}

function blocksOf(tokens?: MdToken[]): BlockNode[] {
  return (tokens ?? []).flatMap(blockOf);
}

/** 把一段 markdown 解析为块级节点树（纯函数） */
export function mdToBlocks(md: string): BlockNode[] {
  return blocksOf(marked.lexer(md, { gfm: true, breaks: false }) as unknown as MdToken[]);
}

/**
 * 解析结果记忆化：详情页/编辑页/复习页/版本页都在 computed 里调 parseNote，
 * 任何一次父级重渲染（置顶、改掌握度、返回页面）都会整篇重解析。
 * key 用原文：字符串按键值比较，重新拉取后内容相同仍能命中；只保留最近几篇，避免常驻大对象。
 */
export const NOTE_CACHE_MAX = 8;
const noteCache = new Map<string, NoteSegment[]>();

export function noteCacheSize(): number {
  return noteCache.size;
}

export function resetNoteCache(): void {
  noteCache.clear();
}

/** 把笔记内容按 ::: 容器围栏切分为可渲染分段；不支持容器嵌套（笔记中没有） */
export function parseNote(content: string): NoteSegment[] {
  const cached = noteCache.get(content);
  if (cached) return cached;

  const segments = parseNoteUncached(content);
  if (noteCache.size >= NOTE_CACHE_MAX) {
    const oldest = noteCache.keys().next().value;
    if (oldest !== undefined) noteCache.delete(oldest);
  }
  noteCache.set(content, segments);
  return segments;
}

function parseNoteUncached(content: string): NoteSegment[] {
  const lines = content.split("\n");
  const segments: NoteSegment[] = [];
  let buffer: string[] = [];
  let i = 0;
  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];
    if (text) segments.push({ type: "blocks", blocks: mdToBlocks(text) });
  };
  while (i < lines.length) {
    const open = lines[i].match(/^:::\s*(tip|warning|danger|details)\s*(.*)$/);
    if (open) {
      flush();
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
        blocks: mdToBlocks(body.join("\n").trim()),
      });
    } else {
      buffer.push(lines[i]);
      i++;
    }
  }
  flush();
  return segments;
}
