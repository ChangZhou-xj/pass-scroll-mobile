import { describe, expect, it } from "vitest";
import { mdToBlocks, parseNote } from "./markdown";

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
