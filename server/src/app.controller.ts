/**
 * 应用级控制器——只有健康检查接口。
 *
 * 【控制器 Controller】是 NestJS 里定义"URL → 处理函数"映射的类：
 * 类上的 @Controller() 是路由前缀（这里为空），方法上的 @Get/@Post 等是具体路径。
 * GET /health 用于部署后探活：负载均衡或你自己想确认"后端起来没"时访问它即可。
 */
import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
