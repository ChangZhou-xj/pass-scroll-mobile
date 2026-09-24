/**
 * PrismaService——数据库连接的"总开关"
 *
 * 【Prisma】是本项目用的 ORM：用 TypeScript 对象操作代替手写 SQL（如 prisma.record.findMany()
 * 就是 SELECT * FROM Record）。PrismaClient 是它与 MySQL 通信的客户端。
 *
 * 【@Injectable() 与依赖注入】NestJS 的核心机制：凡标了 @Injectable 的类，都可以被
 * "注入"到其他类的构造函数里（如 RecordsService 的 constructor(private prisma: PrismaService)），
 * 由框架统一创建和管理实例（单例），业务代码不用自己 new。
 *
 * 这里继承 PrismaClient 并挂两个生命周期钩子：应用启动时连库、关闭时断开。
 * 业务代码用到的 this.prisma 就是这个类——它拥有 record/tag/user/recordSnapshot 等
 * 全部表的操作方法（由 prisma/schema.prisma 生成）。
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
