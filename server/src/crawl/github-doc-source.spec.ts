// github-doc-source 单元测试——全部用注入的假 fetch / 假 Prisma，不连网也不连数据库。
// 这也是本模块把 IO 抽成 CrawlOptions 的原因：业务逻辑可以在毫秒级被反复验证。
import type { PrismaClient } from "@prisma/client";
import {
  buildContentsUrl,
  buildRawUrl,
  deriveTags,
  fetchDocViaApi,
  fetchMarkdown,
  HttpError,
  listDirectory,
  naturalCompare,
  pickMarkdownFiles,
  resolveTitle,
  saveDoc,
  stripOrderPrefix,
  syncDocs,
  TITLE_MAX,
} from "./github-doc-source";
import type { CrawlOptions, FetchLike, FetchResponseLike, GithubContentItem } from "./github-doc-source";

// ---------------------------------------------------------------- 测试脚手架

/** 按 url 匹配返回响应的假 fetch；未登记的地址返回 404 */
/** 路由值：正常响应对象，或 { networkError } 表示这一跳直接抛（模拟被 RST/断网） */
type RouteValue = Partial<FetchResponseLike> | FetchResponseLike | { networkError: string };

function fakeFetch(routes: Record<string, RouteValue>): FetchLike {
  return jest.fn(async (url: string) => {
    const matched = routes[url] as RouteValue | undefined;
    if (matched && "networkError" in matched) throw new TypeError(matched.networkError);
    const base: FetchResponseLike = {
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "",
    };
    return { ...base, ...(matched as object) } as FetchResponseLike;
  });
}

function okJson(body: unknown): Partial<FetchResponseLike> {
  return { ok: true, status: 200, json: async () => body };
}

function okText(body: string): Partial<FetchResponseLike> {
  return { ok: true, status: 200, text: async () => body };
}

/** 带调用记录的假 Prisma：只实现 saveDoc 用到的四个方法 */
function fakePrisma() {
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const snapshotCreate = jest.fn();
  const transaction = jest.fn(async () => []);
  const prisma = {
    record: { findFirst, create, update },
    recordSnapshot: { create: snapshotCreate },
    $transaction: transaction,
  };
  return { prisma: prisma as unknown as PrismaClient, findFirst, create, update, snapshotCreate, transaction };
}

const fileItem = (name: string, path = `dir/${name}`, type = "file"): GithubContentItem => ({
  name,
  path,
  type,
  download_url: null,
});

// 统一用这组 repo/docPath，保证测试里拼出来的 URL 和被测代码内部拼的一致（漏传就会落到默认仓库，假 fetch 命中不了）
const baseOptions: CrawlOptions = {
  repo: "o/r",
  docPath: "docs",
  timeoutMs: 50,
  maxAttempts: 2,
  sleep: async () => undefined,
};

// ---------------------------------------------------------------- 纯函数

describe("naturalCompare", () => {
  it("10 排在 2 之后（字典序会把 10 排在 2 前面）", () => {
    const names = ["1.a.md", "10.b.md", "2.c.md"].sort(naturalCompare);
    expect(names).toEqual(["1.a.md", "2.c.md", "10.b.md"]);
  });

  it("序号相同时按剩余字符串本地序比较", () => {
    expect(naturalCompare("1.b.md", "1.a.md")).toBeGreaterThan(0);
  });

  it("无序号的项排在最后，彼此按拼音序", () => {
    const names = ["无序号.md", "1.a.md", "啊.md"].sort(naturalCompare);
    expect(names[0]).toBe("1.a.md");
    expect(names).toContain("无序号.md");
  });
});

describe("stripOrderPrefix", () => {
  it.each([
    ["1.为什么你需要 TypeScript.md", "为什么你需要 TypeScript.md"],
    ["10、内置工具类型.md", "内置工具类型.md"],
    ["2-函数类型.md", "函数类型.md"],
    ["没有序号.md", "没有序号.md"],
  ])("%s → %s", (input, expected) => {
    expect(stripOrderPrefix(input)).toBe(expected);
  });
});

describe("resolveTitle", () => {
  it("优先取正文第一个 H1（多行文档只取标题那一行）", () => {
    // 用模板字面量写多行，避免 "\n" 转义在不同编辑器里被二次转义
    const markdown = `# 类型世界

正文第一段
# 第二个一级标题`;
    expect(resolveTitle(markdown, "1.xxx.md")).toBe("类型世界");
  });

  it("没有 H1 时退回剥掉序号的文件名", () => {
    expect(resolveTitle("没有标题的正文", "3.原始类型与对象类型.md")).toBe("原始类型与对象类型");
  });

  it(`超长标题截断到 ${TITLE_MAX} 字符（Record.title 是 VarChar(200)）`, () => {
    const long = `# ${"啊".repeat(300)}`;
    expect(resolveTitle(long, "x.md")).toHaveLength(TITLE_MAX);
  });

  it("剥完序号为空时兜底用原文件名（防止空标题入库）", () => {
    expect(resolveTitle("", "1..md")).toBe("1..md");
  });

  it("普通文件名：剥序号后剩下的部分作为标题", () => {
    expect(resolveTitle("", "1.md")).toBe("1");
  });
});

describe("deriveTags", () => {
  it("取最后一级目录名做标签", () => {
    expect(deriveTags("TypeScript 入门教程")).toEqual(["TypeScript 入门教程"]);
  });

  it("多级目录只取末级", () => {
    expect(deriveTags("a/b/c")).toEqual(["c"]);
  });

  it("附加标签去重去空", () => {
    expect(deriveTags("docs", ["TypeScript", "docs", "  ", "面试"])).toEqual(["docs", "TypeScript", "面试"]);
  });
});

describe("pickMarkdownFiles", () => {
  it("只留 file 类型的 .md，并按自然序", () => {
    const items = [
      fileItem("10.b.md"),
      fileItem("目录", "dir/目录", "dir"),
      fileItem("2.a.md"),
      fileItem("readme.txt"),
    ];
    expect(pickMarkdownFiles(items).map((i) => i.name)).toEqual(["2.a.md", "10.b.md"]);
  });

  it("空目录返回空数组", () => {
    expect(pickMarkdownFiles([])).toEqual([]);
  });
});

describe("URL 构造", () => {
  it("目录路由逐段编码，中文与空格不会破坏 URL", () => {
    expect(buildContentsUrl("o/r", "TypeScript 入门教程", "master")).toBe(
      "https://api.github.com/repos/o/r/contents/TypeScript%20%E5%85%A5%E9%97%A8%E6%95%99%E7%A8%8B?ref=master",
    );
  });

  it("raw 地址同样逐段编码", () => {
    expect(buildRawUrl("o/r", "master", "TypeScript 入门教程/1.为什么.md")).toBe(
      "https://raw.githubusercontent.com/o/r/master/TypeScript%20%E5%85%A5%E9%97%A8%E6%95%99%E7%A8%8B/1.%E4%B8%BA%E4%BB%80%E4%B9%88.md",
    );
  });
});

// ---------------------------------------------------------------- HTTP 与重试

describe("listDirectory", () => {
  const url = buildContentsUrl("o/r", "docs", "master");

  it("正常返回条目数组", async () => {
    const items = [fileItem("1.a.md")];
    const result = await listDirectory({ ...baseOptions, fetchImpl: fakeFetch({ [url]: okJson(items) }) });
    expect(result).toEqual(items);
  });

  it("目录不存在（GitHub 返回对象而非数组）→ 抛错而非静默返回空", async () => {
    await expect(
      listDirectory({ ...baseOptions, fetchImpl: fakeFetch({ [url]: okJson({ message: "Not Found" }) }) }),
    ).rejects.toThrow("未返回列表对象");
  });

  it("限流时退避重试，成功后返回数据", async () => {
    const throttled = jest.fn(async () => ({
      ok: false,
      status: 403,
      headers: { get: (name: string) => (name === "x-ratelimit-remaining" ? "0" : null) },
      json: async () => ({}),
      text: async () => "",
    })) as unknown as FetchLike;
    const succeeded = jest.fn(async () => ({ ...okJson([fileItem("1.a.md")]) })) as unknown as FetchLike;
    let calls = 0;
    const fetchImpl = jest.fn(async (u: string) => {
      calls += 1;
      return calls === 1 ? throttled(u) : succeeded(u);
    }) as unknown as FetchLike;

    const result = await listDirectory({ ...baseOptions, fetchImpl });
    expect(result).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("非限流错误不重试（401/404 重试无意义）", async () => {
    const fetchImpl = fakeFetch({ [url]: { ok: false, status: 404 } });
    await expect(listDirectory({ ...baseOptions, fetchImpl })).rejects.toThrow("HTTP 404");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("token 存在时带上 Authorization", async () => {
    const fetchImpl = fakeFetch({ [url]: okJson([]) });
    await listDirectory({ ...baseOptions, fetchImpl, token: "ghp_xxx" });
    expect(fetchImpl).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer ghp_xxx" }) }),
    );
  });

  it("重试耗尽才失败：尝试次数 == maxAttempts，且退避间隔递增", async () => {
    const throttled = jest.fn(async () => ({
      ok: false,
      status: 403,
      headers: { get: (name: string) => (name === "x-ratelimit-remaining" ? "0" : null) },
      json: async () => ({}),
      text: async () => "",
    })) as unknown as FetchLike;
    const waits: number[] = [];

    await expect(
      listDirectory({
        ...baseOptions,
        maxAttempts: 3,
        fetchImpl: throttled,
        sleep: async (ms) => {
          waits.push(ms);
        },
      }),
    ).rejects.toThrow("HTTP 403");

    expect(throttled).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([2000, 4000]); // 第 3 次用完即抛，不再退避
  });

  it("未注入 fetchImpl 时回落到全局 fetch", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = fakeFetch({ [url]: okJson([fileItem("1.a.md")]) }) as unknown as typeof fetch;
    try {
      await expect(listDirectory({ ...baseOptions })).resolves.toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("fetchMarkdown", () => {
  it("按 item.path 拼 raw 地址并返回正文", async () => {
    const item = fileItem("1.a.md", "docs/1.a.md");
    const rawUrl = buildRawUrl("o/r", "master", item.path);
    const result = await fetchMarkdown(item, {
      ...baseOptions,
      repo: "o/r",
      fetchImpl: fakeFetch({ [rawUrl]: okText("# 标题\\n正文") }),
    });
    expect(result).toBe("# 标题\\n正文");
  });

  it("raw 网络失败 → 降级 Contents API 并成功取到正文", async () => {
    const item = fileItem("1.a.md", "docs/1.a.md");
    const markdown = "# 类型世界\n正文";
    const apiResult = {
      content: Buffer.from(markdown, "utf-8").toString("base64"),
      encoding: "base64",
    };
    const fetchImpl = fakeFetch({
      // raw 这一跳模拟 ECONNRESET：只有网络层失败才应该降级
      [buildRawUrl("o/r", "master", item.path)]: { networkError: "fetch failed" },
      [buildContentsUrl("o/r", item.path, "master")]: okJson(apiResult),
    });

    const result = await fetchMarkdown(item, { ...baseOptions, fetchImpl });

    expect(result).toBe(markdown);
  });

  it("HTTP 404 不降级（换通道也是同样的答案，白浪费一次配额）", async () => {
    const item = fileItem("1.a.md", "docs/1.a.md");
    const apiUrl = buildContentsUrl("o/r", item.path, "master");
    const fetchImpl = fakeFetch({ [apiUrl]: okJson({ content: "bogus" }) });

    await expect(fetchMarkdown(item, { ...baseOptions, fetchImpl })).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 只有 raw 那一次，没碰 Contents API
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("raw.githubusercontent.com"), expect.anything());
  });

  it("preferRaw=false 时直接走 Contents API", async () => {
    const item = fileItem("1.a.md", "docs/1.a.md");
    const apiUrl = buildContentsUrl("o/r", item.path, "master");
    const fetchImpl = fakeFetch({
      [apiUrl]: okJson({ content: Buffer.from("正文", "utf-8").toString("base64"), encoding: "base64" }),
    });

    await expect(fetchMarkdown(item, { ...baseOptions, fetchImpl, preferRaw: false })).resolves.toBe("正文");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchDocViaApi", () => {
  const item = fileItem("1.a.md", "docs/1.a.md");
  const apiUrl = buildContentsUrl("o/r", item.path, "master");

  it("base64 解码后中文保持 UTF-8（不能丢 reinterpret 成 latin1）", async () => {
    const fetchImpl = fakeFetch({
      [apiUrl]: okJson({ content: Buffer.from("# 泛型：类型的参数", "utf-8").toString("base64"), encoding: "base64" }),
    });
    await expect(fetchDocViaApi(item, { ...baseOptions, fetchImpl })).resolves.toBe("# 泛型：类型的参数");
  });

  it("正文为空（超 1MB 文件）→ 明确报错而不是写空笔记", async () => {
    const fetchImpl = fakeFetch({ [apiUrl]: okJson({ encoding: "none" }) });
    await expect(fetchDocViaApi(item, { ...baseOptions, fetchImpl })).rejects.toThrow("未返回正文");
  });

  it("未知编码 → 报错，避免静默写脏数据", async () => {
    const fetchImpl = fakeFetch({ [apiUrl]: okJson({ content: "xxx", encoding: "gzip" }) });
    await expect(fetchDocViaApi(item, { ...baseOptions, fetchImpl })).rejects.toThrow("未知编码");
  });
});

// ---------------------------------------------------------------- 落库幂等

describe("saveDoc", () => {
  const payload = { sourceUrl: "https://raw/1.md", title: "标题", content: "正文", tags: ["TypeScript"] };
  const userId = "user-1";

  it("首次入库 → created，标签走 connectOrCreate", async () => {
    const { prisma, findFirst, create } = fakePrisma();
    findFirst.mockResolvedValue(null);

    const outcome = await saveDoc(prisma, userId, payload);

    expect(outcome).toBe("created");
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId, sourceUrl: payload.sourceUrl },
      select: { id: true, title: true, content: true, version: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        title: "标题",
        content: "正文",
        sourceUrl: payload.sourceUrl,
        tags: {
          create: [
            {
              tag: {
                connectOrCreate: {
                  where: { userId_name: { userId, name: "TypeScript" } },
                  create: { userId, name: "TypeScript" },
                },
              },
            },
          ],
        },
      }),
    });
  });

  it("标题与正文都没变 → skipped，且不产生任何写操作", async () => {
    const { prisma, findFirst, create, update, transaction } = fakePrisma();
    findFirst.mockResolvedValue({ id: "r1", title: "标题", content: "正文", version: 1 });

    const outcome = await saveDoc(prisma, userId, payload);

    expect(outcome).toBe("skipped");
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("正文变了 → updated：快照 + version+1 同事务", async () => {
    const { prisma, findFirst, update, snapshotCreate, transaction } = fakePrisma();
    findFirst.mockResolvedValue({ id: "r1", title: "标题", content: "旧正文", version: 7 });

    const outcome = await saveDoc(prisma, userId, payload);

    expect(outcome).toBe("updated");
    expect(transaction).toHaveBeenCalledTimes(1);
    // 快照留的是"修改前"的内容与当时的版本号
    expect(snapshotCreate).toHaveBeenCalledWith({
      data: { recordId: "r1", version: 7, title: "标题", content: "旧正文" },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: expect.objectContaining({ title: "标题", content: "正文", version: { increment: 1 } }),
    });
  });

  it("只有标题变了也触发 updated（标题参与幂等判定）", async () => {
    const { prisma, findFirst, update } = fakePrisma();
    findFirst.mockResolvedValue({ id: "r1", title: "旧标题", content: "正文", version: 1 });

    expect(await saveDoc(prisma, userId, payload)).toBe("updated");
    expect(update).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- 整批编排

describe("syncDocs", () => {
  const userId = "user-1";
  const listUrl = buildContentsUrl("o/r", "docs", "master");
  const items = [fileItem("1.a.md", "docs/1.a.md"), fileItem("2.b.md", "docs/2.b.md")];

  it("两篇都首次入库 → created:2", async () => {
    const { prisma, findFirst } = fakePrisma();
    findFirst.mockResolvedValue(null);
    const fetchImpl = fakeFetch({
      [listUrl]: okJson(items),
      [buildRawUrl("o/r", "master", "docs/1.a.md")]: okText("# 第一篇"),
      [buildRawUrl("o/r", "master", "docs/2.b.md")]: okText("# 第二篇"),
    });

    const result = await syncDocs(prisma, userId, { ...baseOptions, repo: "o/r", docPath: "docs", fetchImpl });

    expect(result).toMatchObject({ total: 2, created: 2, updated: 0, skipped: 0, failed: 0 });
  });

  it("单篇失败不中断整批，错误进 failures（17 篇里坏 1 篇不该让 16 篇陪葬）", async () => {
    const { prisma, findFirst } = fakePrisma();
    findFirst.mockResolvedValue(null);
    const fetchImpl = fakeFetch({
      [listUrl]: okJson(items),
      // 第二篇故意不登记 → 假 fetch 返回 404
      [buildRawUrl("o/r", "master", "docs/1.a.md")]: okText("# 第一篇"),
    });

    const result = await syncDocs(prisma, userId, { ...baseOptions, repo: "o/r", docPath: "docs", fetchImpl });

    expect(result.total).toBe(2);
    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures[0]).toEqual({ path: "docs/2.b.md", reason: expect.stringContaining("HTTP 404") });
  });

  it("目录下没有 md 文件 → 全部计数为 0 且不报错", async () => {
    const { prisma } = fakePrisma();
    const result = await syncDocs(prisma, userId, {
      ...baseOptions,
      repo: "o/r",
      docPath: "docs",
      fetchImpl: fakeFetch({ [listUrl]: okJson([fileItem("readme.txt")]) }),
    });
    expect(result).toMatchObject({ total: 0, created: 0, failed: 0 });
  });
});
