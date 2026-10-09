/**
 * TransformInterceptor——成功响应的"统一包装机"
 *
 * 【拦截器 Interceptor】在控制器方法"之后"拿到返回值，可以加工后再发给客户端。
 * 本项目与前端约定所有成功响应都是 { code: 0, message: "ok", data }（前端 request.ts
 * 见到 code === 0 才 resolve）。有了它，控制器/服务里只管 return 业务数据本体，
 * 包装动作全部在这里自动完成——业务代码零样板。
 * （rxjs 的 pipe(map(...)) 就是"对返回值做一次变换"，可理解为 Promise 的 .then。）
 *
 * 两道边界处理（借鉴 xj-server 的 ResponseInterceptor，按本项目契约裁剪）：
 *   1. 已包装过的响应原样放行：controller 若因特殊原因手工 return 了
 *      { code, message, data } 形态（如含业务码的错误信息），绝不能再套一层变成
 *      { code: 0, data: { code: 10002, ... } }——前端会把它当成功结果解析。
 *      代价是"业务数据天然长成这个形态会被误判放行"，但当前契约下不可能发生：
 *      成功响应的 data 来自 record.serializer（顶层只有 id/title/content 等字段），
 *      列表则是数组，都不含数字 code + 字符串 message + data 的组合
 *   2. null/undefined 统一落为 data: null，前端 resolve 出来的值形态稳定
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
    return next.handle().pipe(
      map((data) => {
        // 已包装响应的载荷类型无法从外形推断，按不透明载荷直接断言——
        // 前端只读 code/message，data 透传即可
        if (this.isApiResponse(data)) return data as ApiResponse<T>;
        return { code: 0, message: "ok", data: (data ?? null) as T };
      }),
    );
  }

  /** 判断是否已是 { code: number, message: string, data } 形态的成品响应 */
  private isApiResponse(data: unknown): data is ApiResponse<unknown> {
    return (
      typeof data === "object" &&
      data !== null &&
      typeof (data as { code?: unknown }).code === "number" &&
      typeof (data as { message?: unknown }).message === "string" &&
      "data" in data
    );
  }
}
