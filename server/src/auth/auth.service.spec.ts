import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AuthModule } from "./auth.module";
import { AuthService } from "./auth.service";
import { BusinessException } from "../common/exceptions/business.exception";
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
    const result = await service.register({ username: "alice", password: "123456" });
    expect(result.user).toEqual({ id: expect.any(String), username: "alice" });
    const payload = jwt.verify(result.token);
    expect(payload.sub).toBe(result.user.id);
    // 密码不落明文
    const user = await prisma.user.findUnique({ where: { username: "alice" } });
    expect(user?.password).not.toBe("123456");
  });

  it("重复注册抛 BusinessException 10001", async () => {
    await service.register({ username: "alice", password: "123456" });
    await expect(service.register({ username: "alice", password: "654321" })).rejects.toMatchObject({
      name: "BusinessException",
      businessCode: 10001,
    });
  });

  it("密码错误抛 UnauthorizedException", async () => {
    await service.register({ username: "alice", password: "123456" });
    await expect(service.login({ username: "alice", password: "wrong" })).rejects.toMatchObject({ status: 401 });
  });

  it("登录成功返回 token", async () => {
    await service.register({ username: "alice", password: "123456" });
    const result = await service.login({ username: "alice", password: "123456" });
    expect(jwt.verify(result.token).sub).toBe(result.user.id);
  });
});
