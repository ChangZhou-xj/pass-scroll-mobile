/**
 * 根模块（AppModule）——NestJS 应用的"装配图"
 *
 * NestJS 用【模块 Module】组织代码：每个业务域一个模块（auth 管登录注册、records 管笔记、
 * prisma 管数据库连接）。@Module 装饰器主要声明三件事：
 *   imports      —— 本模块依赖哪些其他模块
 *   controllers  —— 本模块有哪些控制器（接收 HTTP 请求）
 *   providers    —— 本模块有哪些可被依赖注入的服务（见各业务模块）
 * main.ts 启动时从这里出发，把所有模块装配成一个完整应用。
 *
 * 本模块还实现了 NestModule 接口的 configure()：这是模块级注册中间件的
 * 固定写法（区别于 main.ts 里的 useGlobalXxx 全局注册），把 LoggerMiddleware
 * 挂到所有路由上，让任何请求进来都会先留下一行访问日志。
 */
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { LoggerMiddleware } from "./common/middleware/logger.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { RecordsModule } from "./records/records.module";

@Module({
  imports: [PrismaModule, AuthModule, RecordsModule],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // "*" 表示匹配所有路由（Nest 10 的语法；若将来升级 Nest 11，其依赖的
    // path-to-regexp 8 要求通配符改写成 "{*splat}"，届时此处需同步改）
    consumer.apply(LoggerMiddleware).forRoutes("*");
  }
}
