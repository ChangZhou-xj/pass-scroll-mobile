/**
 * AuthService——认证业务逻辑
 *
 * 三个动作的共同套路：查库 → 校验（失败抛异常，由过滤器统一翻译）→ 写库/签 token。
 *
 * 【bcrypt】密码哈希算法：存库的是 bcrypt.hash 的结果（不可逆），校验时不是解密
 * 而是把用户输入再算一次哈希比对比对（bcrypt.compare）——所以数据库泄露也看不到明文。
 * 第二个参数 10 是"成本因子"，越大越慢越抗暴力破解，10 是通用值。
 *
 * 【登录失败为什么统一说"用户名或密码错误"】不区分"用户不存在"和"密码错"，
 * 防止攻击者枚举哪些用户名已注册。
 */
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
    // 注册成功直接视为登录：连同 token 一起返回，前端免再登一次
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

  /** 签发 JWT 并组装登录/注册的统一返回结构（sub = 用户 id，守卫验签后还原成 request.user） */
  private buildAuthResult(userId: string, username: string) {
    return {
      token: this.jwt.sign({ sub: userId, username }),
      user: { id: userId, username },
    };
  }
}
