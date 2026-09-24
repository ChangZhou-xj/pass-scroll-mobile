/**
 * JwtAuthGuard——登录态的"门卫"
 *
 * 【守卫 Guard】在请求进入控制器之前执行，canActivate 返回 true 才放行。
 * 用 @UseGuards(JwtAuthGuard) 标在控制器类或单个方法上（records.controller.ts 标在类上，
 * 即该控制器所有接口都要求登录）。
 *
 * 工作流程：
 *   1. 从 Authorization 请求头取出 "Bearer <token>" 中的 token
 *   2. 用 JWT_SECRET 验签 + 检查是否过期（verifyAsync 失败/过期都会抛异常）
 *   3. 验通过：把 token 里的用户信息挂到 request.user，控制器用 @CurrentUser() 取
 *      （payload.sub 是签发时写入的用户 id，见 auth.service 的 buildAuthResult）
 *   任一步失败：抛 401，前端 request.ts 收到 401 会强制跳登录页
 */
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
