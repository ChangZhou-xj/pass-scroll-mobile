import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/auth.dto";
import { assertPasswordStrength } from "./password-policy";

export const USERNAME_EXISTS = 10001;
export const WRONG_OLD_PASSWORD = 10003;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    assertPasswordStrength(dto.password);
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new BusinessException(USERNAME_EXISTS, "用户名已存在");
    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({ data: { username: dto.username, password: hash } });
    return this.buildAuthResult(user.id, user.username);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException("用户名或密码错误");
    }
    return this.buildAuthResult(user.id, user.username);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(dto.oldPassword, user.password))) {
      throw new BusinessException(WRONG_OLD_PASSWORD, "旧密码错误");
    }
    assertPasswordStrength(dto.newPassword);
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return null;
  }

  private buildAuthResult(userId: string, username: string) {
    return {
      token: this.jwt.sign({ sub: userId, username }),
      user: { id: userId, username },
    };
  }
}
