/** 记忆宫殿模块（依赖全局 PrismaModule，无需再 imports） */
import { Module } from "@nestjs/common";
import { PalacesController } from "./palaces.controller";
import { PalacesService } from "./palaces.service";

@Module({
  controllers: [PalacesController],
  providers: [PalacesService],
})
export class PalacesModule {}
