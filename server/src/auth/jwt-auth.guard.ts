import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException("未登录或登录已过期");
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; username: string }>(token);
      request.user = { userId: payload.sub, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException("未登录或登录已过期");
    }
  }
}
