/**
 * PalacesController——记忆宫殿接口（/palaces/*）
 *
 * 全部接口要求登录（类上 @UseGuards），userId 一律从 token 取（防越权），同 records.controller。
 *
 *   GET    /palaces                     我的宫殿列表（含每张宫殿里的卡片数）
 *   POST   /palaces                     新建宫殿
 *   PATCH  /palaces/:id                  改名/换图标/改说明
 *   DELETE /palaces/:id                  删除宫殿（笔记保留，只解除归属）
 *   POST   /palaces/:id/records          设定宫内卡片及桩位顺序（数组顺序即位置顺序）
 *   DELETE /palaces/:id/records/:rid     把某张卡移出宫殿
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { CreatePalaceDto, SetPalaceRecordsDto, UpdatePalaceDto } from "./dto/palace.dto";
import { PalacesService } from "./palaces.service";

@UseGuards(JwtAuthGuard)
@Controller("palaces")
export class PalacesController {
  constructor(private readonly palaces: PalacesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.palaces.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePalaceDto) {
    return this.palaces.create(user.userId, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdatePalaceDto) {
    return this.palaces.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.palaces.remove(user.userId, id);
  }

  @Post(":id/records")
  setRecords(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: SetPalaceRecordsDto) {
    return this.palaces.setRecords(user.userId, id, dto);
  }

  @Delete(":id/records/:rid")
  removeRecord(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("rid") rid: string) {
    return this.palaces.removeRecord(user.userId, id, rid);
  }
}
