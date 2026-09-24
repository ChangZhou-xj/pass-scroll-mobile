import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "./auth.module";
import { AuthService } from "./auth.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { resetDatabase } from "../../test/reset-db";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AuthModule, PrismaModule] }).compile();
    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwt = module.get(JwtService);
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("注册成功返回可用 token 与用户信息", async () => {
    const result = await service.register({ username: "alice", password: "abc12345" });
    expect(result.user).toEqual({ id: expect.any(String), username: "alice" });
    const payload = jwt.verify(result.token);
    expect(payload.sub).toBe(result.user.id);
    // 密码不落明文
    const user = await prisma.user.findUnique({ where: { username: "alice" } });
    expect(user?.password).not.toBe("abc12345");
  });

  it("重复注册抛 BusinessException 10001", async () => {
    await service.register({ username: "alice", password: "abc12345" });
    await expect(service.register({ username: "alice", password: "abc12345" })).rejects.toMatchObject({
      name: "BusinessException",
      businessCode: 10001,
    });
  });

  it("密码错误抛 UnauthorizedException", async () => {
    await service.register({ username: "alice", password: "abc12345" });
    await expect(service.login({ username: "alice", password: "wrong" })).rejects.toMatchObject({ status: 401 });
  });

  it("登录成功返回 token", async () => {
    await service.register({ username: "alice", password: "abc12345" });
    const result = await service.login({ username: "alice", password: "abc12345" });
    expect(jwt.verify(result.token).sub).toBe(result.user.id);
  });

  describe("密码策略与修改密码", () => {
    it("注册弱密码抛 10004（纯数字/纯字母/过短）", async () => {
      await expect(service.register({ username: "u1", password: "12345678" })).rejects.toMatchObject({
        businessCode: 10004,
      });
      await expect(service.register({ username: "u1", password: "abcdefgh" })).rejects.toMatchObject({
        businessCode: 10004,
      });
      await expect(service.register({ username: "u1", password: "a1b2c3" })).rejects.toMatchObject({
        businessCode: 10004,
      });
    });

    it("修改密码：旧密码错误 10003；新密码弱 10004；成功后新密码可登录旧密码不可", async () => {
      await service.register({ username: "u2", password: "old12345" });
      const user = await prisma.user.findUniqueOrThrow({ where: { username: "u2" } });
      await expect(
        service.changePassword(user.id, { oldPassword: "wrong", newPassword: "new12345" }),
      ).rejects.toMatchObject({ businessCode: 10003 });
      await expect(
        service.changePassword(user.id, { oldPassword: "old12345", newPassword: "weak" }),
      ).rejects.toMatchObject({ businessCode: 10004 });
      await service.changePassword(user.id, { oldPassword: "old12345", newPassword: "new12345" });
      await expect(service.login({ username: "u2", password: "old12345" })).rejects.toMatchObject({ status: 401 });
      const res = await service.login({ username: "u2", password: "new12345" });
      expect(res.token).toBeTruthy();
    });
  });
});
