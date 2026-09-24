import { IsString, Length } from "class-validator";

export class RegisterDto {
  @IsString()
  @Length(3, 20, { message: "用户名长度需为 3-20 位" })
  username: string;

  @IsString()
  password: string;
}

export class LoginDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  newPassword: string;
}
