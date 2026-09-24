/**
 * RecordsModule——笔记业务模块（列表/详情/增删改/置顶/掌握度/历史版本/统计）
 * 没有 imports：需要的数据库连接来自全局的 PrismaModule，登录校验用的
 * JwtService 来自全局的 JwtModule（见 auth.module.ts 的 global: true）。
 */
import { Module } from "@nestjs/common";
import { RecordsController } from "./records.controller";
import { RecordsService } from "./records.service";

@Module({
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
