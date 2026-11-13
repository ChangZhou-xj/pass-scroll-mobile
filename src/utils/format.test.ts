import { describe, expect, it } from "vitest";
import { PLAIN_TEXT_CACHE_MAX, plainText, plainTextCacheSize, resetPlainTextCache } from "./format";

describe("plainText - 列表摘要", () => {
  it("剥离 markdown 语法并压成一行", () => {
    expect(plainText("# 标题\n\n**粗** 与 `code`\n- 项")).toBe("粗 与 code 项");
  });

  it("文首 H1 与标题重复时整行丢弃", () => {
    expect(plainText("# 我只出现一次\n正文")).toBe("正文");
  });

  it("代码块压成占位符", () => {
    expect(plainText("前\n```js\nconst a = 1;\n```\n后")).toBe("前 [代码] 后");
  });

  it("同一份正文第二次直接命中缓存", () => {
    resetPlainTextCache();
    const md = "## 标题\n正文内容";
    const first = plainText(md);
    const second = plainText(md);
    expect(second).toBe(first);
    expect(plainTextCacheSize()).toBe(1);
  });

  it("不同正文分别缓存", () => {
    resetPlainTextCache();
    plainText("# 甲\n内容一");
    plainText("# 乙\n内容二");
    expect(plainTextCacheSize()).toBe(2);
  });

  it("超过上限后淘汰最旧条目，不会无限增长", () => {
    resetPlainTextCache();
    for (let i = 0; i < PLAIN_TEXT_CACHE_MAX + 5; i++) plainText(`# 第 ${i} 篇\n正文 ${i}`);
    expect(plainTextCacheSize()).toBe(PLAIN_TEXT_CACHE_MAX);
  });
});
