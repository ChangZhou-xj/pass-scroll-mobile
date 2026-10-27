/**
 * GitHub 文档抓取内核——把 GitHub 仓库某个目录下的 markdown 同步成本项目的 Record。
 *
 * 设计要点（也是"后端写法"的几条通则）：
 * 1. **零 Nest 依赖**：本模块只用 @prisma/client 的类型 + 全局 fetch，因此既能被一次性脚本
 *    （scripts/crawl-github.ts）调用，将来包成 CrawlService 也无需改写业务逻辑。
 * 2. **依赖注入换可测性**：HTTP 客户端、sleep、日志全部通过 CrawlOptions 注入，单测可塞假实现，
 *    不需要 mock 全局对象，也不需要真的连 MySQL。
 * 3. **幂等靠 sourceUrl 而非标题**：Record 有 @@unique([userId, sourceUrl])，同一来源重复同步
 *    不会产生脏数据；标题被用户在前端改掉也不影响判定（标题判重的三个坑见 spec 文档）。
 * 4. **内容变更遵守本项目不变量**：先写"修改前"快照，再 version+1，两步包在一个事务里
 *    （见 CLAUDE.md 后端数据不变量第 3 条）。
 */
import type { PrismaClient } from "@prisma/client";

export const GITHUB_API = "https://api.github.com";
export const RAW_HOST = "https://raw.githubusercontent.com";
export const DEFAULT_REPO = "lm-rebooter/NuggetsBooklet";
export const DEFAULT_DOC_PATH = "TypeScript 入门教程";
export const DEFAULT_BRANCH = "master";
/** Record.title 是 VarChar(200)，超长会直接 500 */
export const TITLE_MAX = 200;

// ---------------------------------------------------------------- 类型

/** fetch 的最小接口面：抽出来是为了让单测能注入假实现，同时将来可换成 undici/axios */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponseLike>;

/** Contents API 返回的单条（只取用得上的字段） */
export interface GithubContentItem {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
  size?: number;
}

/** HTTP 层错误：带状态码，用于和「连不上」区分开（只有后者才降级到 Contents API） */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface CrawlOptions {
  repo?: string;
  /** 仓库内的文档目录，如 "TypeScript 入门教程" */
  docPath?: string;
  branch?: string;
  /** GitHub Personal Access Token，不填则走匿名限额（60 次/小时） */
  token?: string;
  timeoutMs?: number;
  /** 限流退避的最大尝试次数 */
  maxAttempts?: number;
  /**
   * 是否优先走 raw.githubusercontent.com（默认 true）。
   * raw 不占 API 配额，但某些网络环境（代理/中间设备）会掐断它，此时可关掉直接进入 API 通道。
   */
  preferRaw?: boolean;
  /** 在目录标签之外额外附加的标签 */
  extraTags?: string[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

export interface DocPayload {
  sourceUrl: string;
  title: string;
  content: string;
  tags: string[];
}

export type DocOutcome = "created" | "updated" | "skipped";

export interface SyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  failures: { path: string; reason: string }[];
}

// ---------------------------------------------------------------- 纯函数（无 IO，最好测）

/** 文件名中的序号分隔符：1. 10、1- 1_ 都算 */
const ORDER_PREFIX = /^\d+\s*[.、_\-]\s*/;

/**
 * 自然序比较：文件名 `10.x` 必须排在 `2.x` 之后。
 * 两边都没有序号时退化为本地字符串比较（zh-Hans-CN 让中文按拼音排）。
 */
export function naturalCompare(a: string, b: string): number {
  const head = (s: string) => s.match(/^\d+/)?.[0];
  const ha = head(a);
  const hb = head(b);
  if (ha && hb) {
    const diff = Number(ha) - Number(hb);
    return diff !== 0 ? diff : a.localeCompare(b, "zh-Hans-CN");
  }
  if (ha) return -1;
  if (hb) return 1;
  return a.localeCompare(b, "zh-Hans-CN");
}

/** 剥掉 `1.` `10、` 这类序号前缀，让标题可读 */
export function stripOrderPrefix(name: string): string {
  return name.replace(ORDER_PREFIX, "");
}

/**
 * 标题优先级：正文第一个 H1 > 文件名（去序号前缀）。
 * 远程文档常有 "1.为什么你需要 TypeScript 类型之前xxx" 这种文件名，直接当标题太丑。
 */
export function resolveTitle(markdown: string, fileName: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const fallback = stripOrderPrefix(fileName.replace(/\.md$/i, "")).trim();
  return (h1 || fallback || fileName).slice(0, TITLE_MAX);
}

/** 目录里的 .md 文件：过滤 + 自然序 */
export function pickMarkdownFiles(items: GithubContentItem[]): GithubContentItem[] {
  return items
    .filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".md"))
    .sort((a, b) => naturalCompare(a.name, b.name));
}

/** 标签取最后一级目录名（"TypeScript 入门教程" → ["TypeScript 入门教程"]），再拼额外标签并去重 */
export function deriveTags(docPath: string, extraTags: string[] = []): string[] {
  const segments = docPath.split("/").filter(Boolean);
  const folder = segments[segments.length - 1] ?? "";
  return Array.from(new Set([folder, ...extraTags].map((tag) => tag.trim()).filter(Boolean)));
}

/** Contents API 地址：逐段编码，中文目录与空格都不会 404 */
export function buildContentsUrl(repo: string, docPath: string, branch: string): string {
  const segments = docPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${GITHUB_API}/repos/${repo}/contents/${segments}?ref=${encodeURIComponent(branch)}`;
}

/**
 * raw 文件地址：不用 API 返回的 download_url（它带着未编码的中文/空格，Node fetch 不一定吃），
 * 自己按同一规则拼。额外的好处是 raw.githubusercontent.com 不占 API 限流额度。
 */
export function buildRawUrl(repo: string, branch: string, filePath: string): string {
  const segments = filePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${RAW_HOST}/${repo}/${branch}/${segments}`;
}

// ---------------------------------------------------------------- HTTP

function buildHeaders(accept: string, token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept, "User-Agent": "pass-scroll-crawler" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 带退避重试的请求。
 * 只有"确属限流"才重试（403/429 且 X-RateLimit-Remaining=0）：401 是 token 错、404 是路径错，
 * 重试一万次也是同样的结果，直接抛更符合 fail fast。
 */
async function requestWithRetry(url: string, accept: string, options: CrawlOptions): Promise<FetchResponseLike> {
  const {
    fetchImpl = globalThis.fetch,
    timeoutMs = 15_000,
    maxAttempts = 3,
    token,
    sleep = defaultSleep,
    log,
  } = options;
  let status = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 原生 fetch 没有默认超时：不卡死的关键就是这行 signal
    const res = await fetchImpl(url, { headers: buildHeaders(accept, token), signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return res;
    status = res.status;
    const throttled = (res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0";
    if (!throttled || attempt === maxAttempts) break;
    const waitMs = Number(res.headers.get("retry-after") ?? 0) * 1000 || attempt * 2_000;
    log?.(`触发 GitHub 限流，${waitMs}ms 后重试（${attempt}/${maxAttempts}）`);
    await sleep(waitMs);
  }
  // 用带状态码的错误类型区分「资源不可达」与「网络层失败」——后者才值得走 Contents API 降级
  throw new HttpError(status, `GitHub 请求失败（HTTP ${status}）：${url}`);
}

/** 列目录：一次请求拿到该目录下全部条目 */
export async function listDirectory(options: CrawlOptions = {}): Promise<GithubContentItem[]> {
  const { repo = DEFAULT_REPO, docPath = DEFAULT_DOC_PATH, branch = DEFAULT_BRANCH } = options;
  const url = buildContentsUrl(repo, docPath, branch);
  const res = await requestWithRetry(url, "application/vnd.github+json", options);
  // body 只能读一次：先落到局部变量再判断形态（目录不存在时 GitHub 回的是 { message: "Not Found" } 对象）
  const body = (await res.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`列目录失败，GitHub 未返回列表对象：${docPath}`);
  }
  return body as GithubContentItem[];
}

/**
 * 走 Contents API 取单个文件的正文（base64 解码）。
 * 这是 raw 通道不通时的降级路径：代价是消耗一次 API 配额（匿名 60 次/小时）。
 */
export async function fetchDocViaApi(item: GithubContentItem, options: CrawlOptions = {}): Promise<string> {
  const { repo = DEFAULT_REPO, branch = DEFAULT_BRANCH } = options;
  const url = buildContentsUrl(repo, item.path, branch);
  const res = await requestWithRetry(url, "application/vnd.github+json", options);
  const body = (await res.json()) as { content?: string; encoding?: string };
  if (!body.content) {
    // 大于 1MB 的文件 GitHub 会返回 encoding:"none" 且不正文，只能报错让调用方知道这篇没抓到
    throw new Error(`Contents API 未返回正文（超过 1MB 或空文件）：${item.path}`);
  }
  if (body.encoding && body.encoding !== "base64") {
    throw new Error(`Contents API 返回未知编码 ${body.encoding}：${item.path}`);
  }
  // base64 里带换行符要先剔掉；Buffer 负责把多字节的中文还原成 UTF-8（不能用 atob+escape）
  return Buffer.from(body.content.replace(/\s/g, ""), "base64").toString("utf-8");
}

/**
 * 拉单个文件的 markdown 正文：优先 raw（不占配额），网络层失败时降级 Contents API。
 * HTTP 层失败（404/401）不降级——那说明资源本身不可达，换个通道也是一样的答案。
 */
export async function fetchMarkdown(item: GithubContentItem, options: CrawlOptions = {}): Promise<string> {
  const { repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, preferRaw = true } = options;

  if (preferRaw) {
    const rawUrl = buildRawUrl(repo, branch, item.path);
    try {
      const res = await requestWithRetry(rawUrl, "text/plain", options);
      return await res.text();
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      options.log?.(`raw 通道不可用（${reason}），改用 Contents API：${item.name}`);
    }
  }
  return fetchDocViaApi(item, options);
}

// ---------------------------------------------------------------- 落库

/**
 * 单条文档的 upsert 语义（手写成"查—判—写"，因为要用 快照+version 的组合，upsert 表达不了）。
 * @returns created 首次入库 / updated 内容有变更 / skipped 内容完全一致
 */
export async function saveDoc(prisma: PrismaClient, userId: string, payload: DocPayload): Promise<DocOutcome> {
  const existing = await prisma.record.findFirst({
    where: { userId, sourceUrl: payload.sourceUrl },
    select: { id: true, title: true, content: true, version: true },
  });

  // 标签只能这样挂：Tag 上有 @@unique([userId, name])，connectOrCreate 才能按用户隔离复用同名标签
  const tagLinks = payload.tags.map((name) => ({
    tag: { connectOrCreate: { where: { userId_name: { userId, name } }, create: { userId, name } } },
  }));

  if (!existing) {
    await prisma.record.create({
      data: {
        userId,
        title: payload.title,
        content: payload.content,
        sourceUrl: payload.sourceUrl,
        tags: { create: tagLinks },
      },
    });
    return "created";
  }

  if (existing.title === payload.title && existing.content === payload.content) {
    return "skipped";
  }

  // 内容变了：快照 + version+1 必须同属一个事务，否则会留下"版本前进了但没快照"的半截状态
  await prisma.$transaction([
    prisma.recordSnapshot.create({
      data: {
        recordId: existing.id,
        version: existing.version,
        title: existing.title.slice(0, TITLE_MAX),
        content: existing.content,
      },
    }),
    prisma.record.update({
      where: { id: existing.id },
      data: {
        title: payload.title,
        content: payload.content,
        version: { increment: 1 },
        // 先解绑再按当前来源重建，保证标签与远端一致（可能残留无引用的 Tag 行，可接受）
        tags: { deleteMany: {}, create: tagLinks },
      },
    }),
  ]);
  return "updated";
}

/**
 * 主流程：列目录 → 逐篇拉正文 → 落库 → 汇总。
 * 单篇失败不中断整批（failures 里留痕），这是批任务的默认姿态——17 篇里坏 1 篇不该让另外 16 篇陪葬。
 */
export async function syncDocs(prisma: PrismaClient, userId: string, options: CrawlOptions = {}): Promise<SyncResult> {
  const { repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, docPath = DEFAULT_DOC_PATH, log } = options;
  const result: SyncResult = { total: 0, created: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

  const items = pickMarkdownFiles(await listDirectory(options));
  result.total = items.length;
  if (!items.length) log?.(`目录 ${docPath} 下没有 .md 文件`);

  const tags = deriveTags(docPath, options.extraTags);
  for (const item of items) {
    try {
      const content = await fetchMarkdown(item, options);
      const outcome = await saveDoc(prisma, userId, {
        sourceUrl: buildRawUrl(repo, branch, item.path),
        title: resolveTitle(content, item.name),
        content,
        tags,
      });
      result[outcome] += 1;
      log?.(`${outcome === "created" ? "新增" : outcome === "updated" ? "更新" : "跳过"}：${item.name}`);
    } catch (err) {
      result.failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      result.failures.push({ path: item.path, reason });
      log?.(`失败：${item.name} —— ${reason}`);
    }
  }
  return result;
}
