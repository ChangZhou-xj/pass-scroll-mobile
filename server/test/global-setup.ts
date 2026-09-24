import { execSync } from "child_process";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL || "mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test";
  // 测试库每次重建可丢弃，加唯一约束等需要 --accept-data-loss 才能非交互执行
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
