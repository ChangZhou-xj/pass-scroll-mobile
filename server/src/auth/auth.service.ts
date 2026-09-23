import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { BusinessException } from "../common/exceptions/business.exception";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto, RegisterDto } from "./dto/auth.dto";

export const USERNAME_EXISTS = 10001;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
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

  private buildAuthResult(userId: string, username: string) {
    return {
      token: this.jwt.sign({ sub: userId, username }),
      user: { id: userId, username },
    };
  }
}
