import { describe, expect, it } from "vitest";
import { NOTE_CACHE_MAX, flattenInline, mdToBlocks, noteCacheSize, parseNote, resetNoteCache } from "./markdown";

describe("mdToBlocks - 块级结构", () => {
  it("标题解析为 heading 节点", () => {
    const blocks = mdToBlocks("# 标题");
    expect(blocks).toEqual([{ type: "heading", depth: 1, children: [{ type: "text", text: "标题" }] }]);
  });

  it("段落含加粗与行内代码", () => {
    const blocks = mdToBlocks("**加粗** 和 `code` 文本");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "strong", children: [{ type: "text", text: "加粗" }] },
          { type: "text", text: " 和 " },
          { type: "code", children: [{ type: "text", text: "code" }] },
          { type: "text", text: " 文本" },
        ],
      },
    ]);
  });

  it("链接解析为 link 节点", () => {
    const blocks = mdToBlocks("[百度](https://baidu.com)");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "link", href: "https://baidu.com", children: [{ type: "text", text: "百度" }] }],
      },
    ]);
  });

  it("无序列表", () => {
    const blocks = mdToBlocks("- 项目一\n- 项目二");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "paragraph", children: [{ type: "text", text: "项目一" }] }],
          [{ type: "paragraph", children: [{ type: "text", text: "项目二" }] }],
        ],
      },
    ]);
  });

  it("有序列表", () => {
    const blocks = mdToBlocks("1. 第一\n2. 第二");
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("引用块", () => {
    const blocks = mdToBlocks("> 引用内容");
    expect(blocks).toEqual([
      { type: "blockquote", blocks: [{ type: "paragraph", children: [{ type: "text", text: "引用内容" }] }] },
    ]);
  });

  it("代码围栏保留原文与语言", () => {
    const blocks = mdToBlocks("```js\nconst a = 1;\n```");
    expect(blocks).toEqual([{ type: "code", lang: "js", text: "const a = 1;" }]);
  });

  it("表格解析表头与行", () => {
    const blocks = mdToBlocks("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(blocks).toEqual([
      {
        type: "table",
        aligns: [null, null],
        header: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]],
        rows: [[[{ type: "text", text: "1" }], [{ type: "text", text: "2" }]]],
      },
    ]);
  });

  it("分隔线", () => {
    expect(mdToBlocks("---")).toEqual([{ type: "hr" }]);
  });

  it("图片独立成块", () => {
    const blocks = mdToBlocks("![配图](https://example.com/a.png)");
    expect(blocks).toEqual([{ type: "image", href: "https://example.com/a.png", title: "" }]);
  });

  it("多段落切分为多个块", () => {
    const blocks = mdToBlocks("第一段\n\n第二段");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });
});

describe("parseNote - 容器切分", () => {
  it("普通文本产出 blocks 分段，容器产出 container 分段", () => {
    const segments = parseNote("前文\n\n:::tip\n提示内容\n:::");
    expect(segments).toEqual([
      { type: "blocks", blocks: [{ type: "paragraph", children: [{ type: "text", text: "前文" }] }] },
      {
        type: "container",
        kind: "tip",
        title: "提示",
        blocks: [{ type: "paragraph", children: [{ type: "text", text: "提示内容" }] }],
      },
    ]);
  });

  it("容器支持自定义标题", () => {
    const segments = parseNote(":::details 自定义答案\n内容\n:::");
    expect(segments[0]).toMatchObject({ type: "container", kind: "details", title: "自定义答案" });
  });

  it("空内容返回空数组", () => {
    expect(parseNote("")).toEqual([]);
  });
});

describe("flattenInline - 行内压平", () => {
  const text = (value: string) => ({ type: "text" as const, text: value });

  it("普通文本与加粗拆成两段，类名分别携带", () => {
    const runs = flattenInline([text("前"), { type: "strong", children: [text("粗")] }, text("后")]);
    expect(runs).toEqual([
      { text: "前", cls: "" },
      { text: "粗", cls: "md-strong" },
      { text: "后", cls: "" },
    ]);
  });

  it("相邻同一样式合并为一段", () => {
    const runs = flattenInline([
      { type: "strong", children: [text("A")] },
      { type: "strong", children: [text("B")] },
    ]);
    expect(runs).toEqual([{ text: "AB", cls: "md-strong" }]);
  });

  it("嵌套样式叠加类名，不产生嵌套节点", () => {
    const runs = flattenInline([{ type: "strong", children: [{ type: "em", children: [text("又粗又斜")] }] }]);
    expect(runs).toEqual([{ text: "又粗又斜", cls: "md-strong md-em" }]);
  });

  it("换行退化成一个换行符", () => {
    expect(flattenInline([text("A"), { type: "br" }, text("B")])).toEqual([
      { text: "A", cls: "" },
      { text: "\n", cls: "" },
      { text: "B", cls: "" },
    ]);
  });

  it("行内代码与链接带各自类名", () => {
    const runs = flattenInline([
      { type: "code", children: [text("x")] },
      { type: "link", href: "#", children: [text("链接")] },
    ]);
    expect(runs).toEqual([
      { text: "x", cls: "md-codespan" },
      { text: "链接", cls: "md-link" },
    ]);
  });
});

describe("parseNote - 记忆化", () => {
  it("同一内容返回同一份解析结果，不重复解析", () => {
    resetNoteCache();
    const md = "## 标题\n\n正文 **加粗**";
    expect(parseNote(md)).toBe(parseNote(md));
    expect(noteCacheSize()).toBe(1);
  });

  it("不同内容各自入缓存", () => {
    resetNoteCache();
    parseNote("第一篇\n\n内容");
    parseNote("第二篇\n\n内容");
    expect(noteCacheSize()).toBe(2);
  });

  it("空内容命中缓存时仍返回空数组", () => {
    resetNoteCache();
    expect(parseNote("")).toEqual([]);
    expect(parseNote("")).toEqual([]);
    expect(noteCacheSize()).toBe(1);
  });

  it("超过上限后淘汰最旧条目", () => {
    resetNoteCache();
    for (let i = 0; i < NOTE_CACHE_MAX + 4; i++) parseNote(`第 ${i} 篇\n\n内容 ${i}`);
    expect(noteCacheSize()).toBe(NOTE_CACHE_MAX);
  });
});
