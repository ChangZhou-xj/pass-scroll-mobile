/**
 * LoggerMiddleware——请求访问日志（谁来了、结果如何、花了多久）
 *
 * 【中间件 Middleware】在请求到达"守卫 → 控制器"链条之前执行，适合放与具体
 * 业务无关的通用处理。借鉴 xj-server 的 LoggerMiddleware：请求进来时记下开始
 * 时间，响应发送完毕（res 的 "finish" 事件）时输出一行日志。
 *
 * 输出示例： [HTTP] GET /records?keyword=vue 200 12ms
 *
 * 【排查价值】线上出现"接口慢""谁一直在报 401"时直接翻这行日志，比事后猜快得多；
 * 健康检查 GET /health 也会被记录——探活程序周期性触发属正常现象。
 * 用 NestJS Logger（而非 console.log）是为了带上 [HTTP] 上下文标签，与框架自身的
 * 启动日志风格一致，将来若要按级别静音/降级也只改一处。
 */
import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    // "finish" = 响应体已完全发给客户端，此时状态码与耗时都已确定；
    // 监听它而不是在 next() 之前打日志，是因为那时还不知道请求会成功还是抛异常
    res.on("finish", () => {
      this.logger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  }
}
