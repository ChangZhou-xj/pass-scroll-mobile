/**
 * 笔记接口的 DTO——"每个接口的 body/query 长什么样"的声明式校验（机制见 auth/dto 注释）
 *
 * 常用装饰器速查：
 *   @IsOptional()           字段可以不传（更新类接口的字段都可选，传啥改啥）
 *   @IsString/@IsInt        类型校验（@IsInt 要求整数）
 *   @Type(() => Number)     先把字符串转成数字再校验——query 参数都是字符串，必须配它
 *   @Length(1, 200)         字符串长度区间
 *   @ArrayUnique            数组元素去重（重复直接判 400）
 *   @IsEnum(Mastery)        取值必须在枚举内（"NONE"/"LEARNING"/"MASTERED" 之外一律 400）
 *   @Min/@Max               数值区间（pageSize 封顶 100，防一次拉全表）
 *   message: "..."          校验失败时返回给前端的提示语
 */
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Mastery } from "@prisma/client";

export class CreateRecordDto {
  @IsString()
  @Length(1, 200, { message: "标题长度需为 1-200 字" })
  title: string;

  @IsString()
  content: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10, { message: "标签最多 10 个" })
  @IsString({ each: true })
  tags: string[];
}

export class UpdateRecordDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  /** 乐观锁凭证：前端编辑时读到的 version，保存时带回；不一致说明已被别处修改（见 service.update） */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class QueryRecordDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class UpdateMasteryDto {
  @IsEnum(Mastery, { message: "掌握度取值非法" })
  to: Mastery;
}

/**
 * 用户自定制的记忆曲线（POST /records/:id/review 的 curve 字段）
 * ——后端不持久化它（偏好属于客户端），每次复习时随评分一起带上；缺失就用 DEFAULT_CURVE。
 * 所有字段都可选且会被 normalizeCurve 兜底清洗，所以这里只做"类型要对"的粗校验。
 */
export class CurveDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12, { message: "记忆阶段最多 12 个" })
  @IsInt({ each: true })
  @Min(1, { each: true })
  steps?: number[];

  @IsOptional()
  @IsNumber()
  @Min(1.3)
  @Max(3.2)
  ease?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  easyBonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1)
  hardFactor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  masteredStage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  newPerDay?: number;
}

/** POST /records/:id/review——提交一次主动回忆的自评 */
export class ReviewRecordDto {
  @IsIn(["AGAIN", "HARD", "GOOD", "EASY"], { message: "评分取值非法" })
  grade: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CurveDto)
  curve?: CurveDto;
}

/** GET /records/due——复习队列查询 */
export class DueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  /** 只取某个记忆宫殿内的卡片（宫殿巡游模式） */
  @IsOptional()
  @IsString()
  palaceId?: string;

  /** 每日新卡上限：曲线配置存在客户端，取队列时带上，否则服务端只能按默认值限额 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  newPerDay?: number;

  /**
   * 只看某一个标签（主题）的卡片——学习曲线按标签分块，用户想"今天就啃这一个主题"时用它。
   * 为空 = 全主题混排（但仍按主题分块，见 records.service.due() 的 orderByTagBlock）。
   */
  @IsOptional()
  @IsString()
  tag?: string;
}
