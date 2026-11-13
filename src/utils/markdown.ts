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

/** 把笔记内容按 ::: 容器围栏切分为可渲染分段；不支持容器嵌套（笔记中没有） */
export function parseNote(content: string): NoteSegment[] {
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
