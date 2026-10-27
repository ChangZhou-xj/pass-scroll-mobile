/**
 * RecordsController——笔记相关全部接口（/records/*）
 *
 * 类上 @UseGuards(JwtAuthGuard)：这个控制器的【所有】接口都要求登录，
 * 未带/过期 token 一律 401（前端收到后强制跳登录页）。
 *
 * 每个方法的第一参数都是 @CurrentUser() user——"这条数据是谁的"全部从 token 里取，
 * 绝不信任前端传的用户 id（防越权）。userId 一路传到 service 做数据归属校验（findOwned）。
 *
 * REST 风格速览：
 *   GET    /records            列表（keyword/tag/分页，参数在 query）
 *   GET    /records/due        今日复习队列（按标签分块，同主题连续复习）；可传 tag 只学一个主题
 *   GET    /records/due/tags   今日待复习按标签统计（标签栏角标 / 主题切换器）
 *   GET    /records/stats      统计（"我的"页）——必须注册在 @Get(":id") 之前，
 *                              否则 "stats" 会被 :id 当成一个记录 id 匹配走（同段数路由按声明顺序匹配）
 *   GET    /records/:id        单条详情
 *   POST   /records            新建
 *   PATCH  /records/:id        修改（部分更新，可带乐观锁 expectedVersion）
 *   DELETE /records/:id        删除
 *   POST   /records/:id/pin    置顶切换
 *   POST   /records/:id/mastery 掌握度标记（状态机校验）
 *   GET    /records/:id/snapshots[/:sid]  历史版本列表/详情
 *   POST   /records/:id/snapshots/:sid/restore  恢复旧版本
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import {
  CreateRecordDto,
  DueQueryDto,
  QueryRecordDto,
  ReviewRecordDto,
  UpdateMasteryDto,
  UpdateRecordDto,
} from "./dto/record.dto";
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

  // 复习队列：必须注册在 @Get(":id") 之前（同 stats 的路由顺序陷阱）
  @Get("due")
  due(@CurrentUser() user: AuthUser, @Query() query: DueQueryDto) {
    return this.records.due(user.userId, query);
  }

  // 今日待复习按标签统计（标签栏角标 / 复习页主题切换器）；同理要注册在 @Get(":id") 之前
  @Get("due/tags")
  dueTags(@CurrentUser() user: AuthUser) {
    return this.records.dueTags(user.userId);
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

  // 提交一次复习自评（AGAIN/HARD/GOOD/EASY）→ 推进间隔重复调度
  @Post(":id/review")
  review(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ReviewRecordDto) {
    return this.records.review(user.userId, id, dto);
  }
}
