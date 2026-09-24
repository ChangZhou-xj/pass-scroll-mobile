/**
 * 根模块（AppModule）——NestJS 应用的"装配图"
 *
 * NestJS 用【模块 Module】组织代码：每个业务域一个模块（auth 管登录注册、records 管笔记、
 * prisma 管数据库连接）。@Module 装饰器主要声明三件事：
 *   imports      —— 本模块依赖哪些其他模块
 *   controllers  —— 本模块有哪些控制器（接收 HTTP 请求）
 *   providers    —— 本模块有哪些可被依赖注入的服务（见各业务模块）
 * main.ts 启动时从这里出发，把所有模块装配成一个完整应用。
 */
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RecordsModule } from "./records/records.module";

@Module({
  imports: [PrismaModule, AuthModule, RecordsModule],
  controllers: [AppController],
})
export class AppModule {}
