/** 记忆宫殿接口的 DTO（校验机制见 records/dto/record.dto.ts 顶部注释） */
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, Length } from "class-validator";

export class CreatePalaceDto {
  @IsString()
  @Length(1, 60, { message: "宫殿名称长度需为 1-60 字" })
  name: string;

  @IsOptional()
  @IsString()
  @Length(1, 8)
  emoji?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  description?: string;
}

export class UpdatePalaceDto {
  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 8)
  emoji?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  description?: string;
}

export class SetPalaceRecordsDto {
  /** 桩位顺序：数组下标就是 palaceOrder（第 0 个位置、第 1 个位置……） */
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200, { message: "一个宫殿最多放 200 张卡片" })
  @IsString({ each: true })
  recordIds: string[];
}
