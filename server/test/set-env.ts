process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || "mysql://root:pass_scroll_dev@localhost:3307/pass_scroll_test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
