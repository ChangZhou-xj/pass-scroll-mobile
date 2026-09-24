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
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
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
