import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateRecordDto, QueryRecordDto, UpdateRecordDto } from "./dto/record.dto";
import { RecordsService } from "./records.service";

@UseGuards(JwtAuthGuard)
@Controller("records")
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryRecordDto) {
    return this.records.list(user.userId, query);
  }

  @Get(":id")
  detail(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.records.detail(user.userId, id);
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
}
