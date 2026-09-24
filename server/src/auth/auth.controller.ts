/**
 * AuthController——认证接口（/auth/*）
 *
 * 注意这个控制器【没有】类级 @UseGuards：注册/登录本来就是给未登录用户用的；
 * 只有"修改密码"在方法上单独挂 JwtAuthGuard——必须先证明你登录了，才允许改自己的密码。
 * 路由前缀 @Controller("auth")，最终路径 = 前缀 + 方法装饰器路径（本项目无 /api 前缀）。
 *
 * 控制器保持"薄"：只接参数、调服务、返回结果，业务判断全部在 AuthService。
 */
import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthUser, CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthService } from "./auth.service";
import { ChangePasswordDto, LoginDto, RegisterDto } from "./dto/auth.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("password")
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.userId, dto);
  }
}
