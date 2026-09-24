/**
 * 后端入口文件（整个 NestJS 应用的"开机按钮"）
 *
 * 请求在本项目的完整旅程（后文注释都围绕这条链路讲）：
 *   前端 uni.request
 *     → main.ts 注册的【全局管道 ValidationPipe】（校验请求参数格式）
 *     → 【守卫 JwtAuthGuard】（校验登录态，auth/jwt-auth.guard.ts）
 *     → 【控制器 Controller】（定义 URL 路由，接收请求）
 *     → 【服务 Service】（写业务逻辑、操作数据库）
 *     → 返回结果经【全局拦截器 TransformInterceptor】包装成 { code: 0, message, data }
 *   任一环节抛出的异常，统一由【全局过滤器 HttpExceptionFilter】转成 { code, message, data: null }
 */
// 必须在第一行加载 .env（DATABASE_URL、JWT_SECRET 都靠它注入 process.env），顺序不能动
import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor";

async function bootstrap() {
  // 生产环境 fail-fast：禁止在缺省 JWT_SECRET 时静默回退到 auth.module 中的弱兜底密钥
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET 未配置（生产环境必须设置）");
  }
  const app = await NestFactory.create(AppModule);
  // 允许跨域：前端 dev server（5173 等端口）与后端（3100）不同源，浏览器要求服务端显式放行
  app.enableCors();
  // 全局管道：自动校验所有请求 body/query。whitelist=只保留 DTO 里声明过的字段（防多余字段注入），
  // transform=把字符串参数自动转成 DTO 声明的类型（如 "1" → 数字 1）
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 全局拦截器：把成功返回值统一包装成 { code: 0, message: "ok", data }
  app.useGlobalInterceptors(new TransformInterceptor());
  // 全局过滤器：把抛出的异常统一包装成 { code, message, data: null }
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = process.env.PORT || 3100;
  await app.listen(port);
  console.log(`server running at http://localhost:${port}`);
}
bootstrap();
