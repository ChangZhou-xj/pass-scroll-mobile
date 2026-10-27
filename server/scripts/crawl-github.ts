/**
 * 一次性抓取脚本：把 GitHub 仓库某个目录下的 markdown 文档导入成自己的笔记。
 *
 * 用法：cd server && npm run crawl:github -- --user <用户名> [--repo owner/name] [--dir "子目录"] [--branch master] [--tags a,b]
 *   --user    必需，必须是已注册用户（脚本只查不建）
 *   --dir     文档所在目录，默认 "TypeScript 入门教程"
 *   --tags    在目录标签之外额外附加的标签
 * 幂等：以 (userId, sourceUrl) 判重，重复跑只更新变化的部分（内容与标题都相同则跳过）。
 * 额度：匿名 60 次/小时；在 .env 里配 GITHUB_TOKEN 可提到 5000 次/小时。
 *
 * 本文件只做「读参数 + 取用户 + 打结果」，真正的抓取与落库逻辑在 src/crawl/github-doc-source.ts
 * （分层的意义：业务逻辑可单测、可被将来的 Nest 服务复用，脚本坏了不影响内核）。
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { syncDocs } from "../src/crawl/github-doc-source";

interface Args {
  user: string;
  repo?: string;
  docPath?: string;
  branch?: string;
  extraTags?: string[];
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (key: string) => {
    const index = argv.indexOf(`--${key}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const user = get("user");
  if (!user) {
    console.error('用法: npm run crawl:github -- --user <用户名> [--repo owner/name] [--dir "子目录"] [--tags a,b]');
    process.exit(1);
  }
  const tags = get("tags");
  return {
    user,
    repo: get("repo"),
    docPath: get("dir"),
    branch: get("branch"),
    extraTags: tags
      ? tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined,
  };
}

async function main() {
  const args = parseArgs();
  const prisma = new PrismaClient();
  try {
    const target = await prisma.user.findUnique({ where: { username: args.user } });
    if (!target) {
      console.error(`用户 ${args.user} 不存在，请先通过注册接口创建`);
      process.exit(1);
    }

    console.log(`开始抓取：${args.repo ?? "默认仓库"} / ${args.docPath ?? "默认目录"} → 用户 ${args.user}`);
    const result = await syncDocs(prisma, target.id, {
      repo: args.repo,
      docPath: args.docPath,
      branch: args.branch,
      extraTags: args.extraTags,
      token: process.env.GITHUB_TOKEN,
      log: (message) => console.log(message),
    });

    console.log("---");
    console.log(
      `完成：共 ${result.total} 篇，新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}，失败 ${result.failed}`,
    );
    if (result.failures.length) {
      for (const failure of result.failures) console.error(`  ${failure.path}：${failure.reason}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
