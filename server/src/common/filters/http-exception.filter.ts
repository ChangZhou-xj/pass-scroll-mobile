/**
 * HttpExceptionFilter——异常的"统一翻译官"
 *
 * 【过滤器 ExceptionFilter】捕获请求处理链上任何环节抛出的异常，转成约定的
 * { code, message, data: null } 响应体。@Catch() 不带参数 = 捕获所有异常类型。
 *
 * 四类异常的翻译规则（与前端 request.ts 的解析一一对应）：
 *   1. BusinessException（业务异常，如"用户名已存在"）
 *      → HTTP 200 + 自定义业务码。前后端约定：业务上的"可预期失败"不用 HTTP 错误码，
 *        前端按 body.code 弹对应提示即可
 *   2. HttpException（NestJS 内建异常，如 401 未登录、404 不存在、400 参数校验失败）
 *      → 用异常自带的 HTTP 状态码；校验失败的 message 可能是数组，拼成一句
 *   3. Prisma P2002（数据库唯一约束冲突，如并发注册同名用户）
 *      → HTTP 200 + 业务码 10001
 *   4. 其余未知异常（代码 bug、数据库断连等）
 *      → 500，后台 console.error 留痕，不给客户端泄露内部细节
 */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Response } from "express";
import { BusinessException } from "../exceptions/business.exception";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof BusinessException) {
      res.status(HttpStatus.OK).json({ code: exception.businessCode, message: exception.message, data: null });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === "string"
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join(";")
            : (body as { message?: string }).message || exception.message;
      res.status(status).json({ code: status, message, data: null });
      return;
    }
    if (typeof exception === "object" && exception !== null && (exception as { code?: string }).code === "P2002") {
      res.status(HttpStatus.OK).json({ code: 10001, message: "数据已存在（唯一约束冲突）", data: null });
      return;
    }
    console.error("unhandled exception", exception);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 500, message: "服务器内部错误", data: null });
  }
}
