/**
 * @CurrentUser() 参数装饰器——"当前登录用户"的取用捷径
 *
 * JwtAuthGuard 验完 token 后会把用户信息挂到 request.user 上。
 * 控制器方法参数上写 @CurrentUser() user: AuthUser，这个装饰器就替你把
 * request.user 取出来直接当参数用，不用每个方法都手写 getRequest()。
 *
 * 用法（records.controller.ts 里到处都是）：
 *   list(@CurrentUser() user: AuthUser) { ... user.userId ... }
 */
import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface AuthUser {
  userId: string;
  username: string;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
