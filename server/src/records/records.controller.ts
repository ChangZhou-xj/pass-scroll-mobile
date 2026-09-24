import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateRecordDto, QueryRecordDto, UpdateMasteryDto, UpdateRecordDto } from "./dto/record.dto";
import { RecordsService } from "./records.service";

@UseGuards(JwtAuthGuard)
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRecordDto) {
    return this.records.list(user.userId, query);
  }

  @Get("stats")
  stats(@CurrentUser() user: AuthUser) {
    return this.records.stats(user.userId);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.detail(user.userId, id);
  }

  @Get(":id/snapshots")
  snapshots(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.snapshots(user.userId, id);
  }

  @Get(":id/snapshots/:sid")
  snapshot(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.records.snapshot(user.userId, id, sid);
  }

  @Post(":id/snapshots/:sid/restore")
  restoreSnapshot(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("sid") sid: string) {
    return this.records.restoreSnapshot(user.userId, id, sid);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRecordDto) {
    return this.records.create(user.userId, dto);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateRecordDto) {
    return this.records.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.remove(user.userId, id);
  }

  @Post(":id/pin")
  togglePin(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.togglePin(user.userId, id);
  }

  @Post(":id/mastery")
  setMastery(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpdateMasteryDto) {
    return this.records.setMastery(user.userId, id, dto.to);
  }
}
