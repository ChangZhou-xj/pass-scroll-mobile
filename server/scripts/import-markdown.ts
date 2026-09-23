import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

interface Args {
  dir: string;
  user: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (key: string) => {
    const index = argv.indexOf(`--${key}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const dir = get("dir");
  const user = get("user");
  if (!dir || !user) {
    console.error("用法: npm run import:md -- --dir <docs目录> --user <用户名>");
    process.exit(1);
  }
  return { dir: path.resolve(dir), user };
}

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield full;
    }
  }
}

function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return (match ? match[1].trim() : path.basename(filename, ".md")).slice(0, 200);
}

async function main() {
  const { dir, user } = parseArgs();
  const prisma = new PrismaClient();
  const target = await prisma.user.findUnique({ where: { username: user } });
  if (!target) {
    console.error(`用户 ${user} 不存在，请先通过注册接口创建`);
    process.exit(1);
  }

  let imported = 0;
  let skipped = 0;
  for (const file of walk(dir)) {
    const content = fs.readFileSync(file, "utf-8");
    const title = extractTitle(content, file);
    const rel = path.relative(dir, path.dirname(file));
    const tags = rel ? rel.split(path.sep).filter(Boolean) : [];

    const exists = await prisma.record.findFirst({ where: { userId: target.id, title }, select: { id: true } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.record.create({
      data: {
        title,
        content,
        userId: target.id,
        tags: {
          create: tags.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { userId_name: { userId: target.id, name } },
                create: { userId: target.id, name },
              },
            },
          })),
        },
      },
    });
    imported++;
  }
  console.log(`完成：导入 ${imported} 条，跳过 ${skipped} 条（按标题判重）`);
  await prisma.$disconnect();
}

main();
