import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

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
