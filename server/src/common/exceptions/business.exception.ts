/**
 * BusinessException——业务异常的统一载体
 *
 * 用法：业务代码遇到"可预期的失败"（用户名已存在、状态非法流转、版本冲突等）
 * 就 throw new BusinessException(业务码, 提示语)。
 * HttpExceptionFilter 会把它翻译成 HTTP 200 + { code: 业务码, message: 提示语 }。
 *
 * 为什么业务失败也用 HTTP 200？这是本项目的约定：HTTP 状态码只表达"传输/协议层"
 * 结果（401 未登录、404 路由不存在），业务成败一律看 body.code——前端只需一套解析逻辑。
 *
 * 业务码清单（新增时往后排，别复用）：
 *   10001 数据已存在/用户名已存在
 *   10002 掌握度状态非法流转
 *   10003 旧密码错误
 *   10004 密码强度不足
 *   10409 笔记版本冲突（乐观锁）
 */
export class BusinessException extends Error {
  constructor(
    public readonly businessCode: number,
    message: string,
  ) {
    super(message);
    this.name = "BusinessException";
  }
}
