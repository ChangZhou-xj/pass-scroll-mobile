/**
 * AuthModule——认证模块（注册/登录/改密）
 *
 * 关键配置是 JwtModule：JWT（JSON Web Token）是本项目的登录态方案——
 * 登录成功后后端用密钥签一个 token 给前端，之后前端每个请求都在
 * Authorization: Bearer <token> 头里带上它，后端验签通过就认你是你。
 *   global: true           JwtService 全应用可注入（守卫要用，不用各处 import）
 *   secret                 签名密钥，来自 .env 的 JWT_SECRET；"dev-secret" 仅是开发兜底
 *   expiresIn: "7d"        token 7 天过期，过期后守卫返回 401，前端强制重新登录
 * 本项目是"单 token"方案：没有 refresh token、没有服务端会话，token 本身即全部凭证。
 */
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || "dev-secret",
      signOptions: { expiresIn: "7d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
