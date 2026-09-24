/**
 * TransformInterceptor——成功响应的"统一包装机"
 *
 * 【拦截器 Interceptor】在控制器方法"之后"拿到返回值，可以加工后再发给客户端。
 * 本项目与前端约定所有成功响应都是 { code: 0, message: "ok", data }（前端 request.ts
 * 见到 code === 0 才 resolve）。有了它，控制器/服务里只管 return 业务数据本体，
 * 包装动作全部在这里自动完成——业务代码零样板。
 * （rxjs 的 pipe(map(...)) 就是"对返回值做一次变换"，可理解为 Promise 的 .then。）
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ code: 0, message: "ok", data: (data ?? null) as T })));
  }
}
