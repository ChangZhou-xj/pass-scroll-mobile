import { execSync } from "child_process";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL || "mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test";
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
