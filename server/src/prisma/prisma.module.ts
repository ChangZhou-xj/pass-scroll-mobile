/**
 * PrismaModule——把数据库连接包装成"全局可用的模块"
 *
 * 【@Global()】普通模块的 providers 只对本模块可见，其他模块要用得先 import 它。
 * 标了 @Global 后，PrismaService 在全应用任何地方都能直接注入，不用每个模块
 * 都写一遍 imports: [PrismaModule]——数据库连接这种"水电煤"资源适合全局化。
 *
 * providers: [PrismaService]  告诉 NestJS"这个类由你创建和管理"
 * exports: [PrismaService]    告诉 NestJS"允许别的模块注入它"
 */
import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
