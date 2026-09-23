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
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: 500, message: "服务器内部错误", data: null });
  }
}
