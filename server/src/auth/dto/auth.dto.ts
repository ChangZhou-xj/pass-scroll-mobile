/**
 * 认证相关的 DTO（Data Transfer Object，数据传输对象）
 *
 * 【DTO 是什么】用 class 声明"这个接口的 body 应该长什么样"，字段上的装饰器
 * （class-validator 提供）就是校验规则。main.ts 注册的全局 ValidationPipe 会在
 * 进入控制器之前自动校验：不合格直接返回 400，控制器里拿到的必然是合法数据。
 * 这是"声明式校验"——规则写在类型旁边，不用手写 if 判断。
 *
 * 注意密码强度不在此处校验：它是一条跨接口的业务规则，统一收在 password-policy.ts，
 * 由 service 调用（注册/改密同一把尺子）。
 */
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
