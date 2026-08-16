/**
 * 业务异常：携带数字错误码，由全局过滤器映射为统一信封。
 */
export class BizException extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'BizException';
    this.code = code;
    this.httpStatus = Math.floor(code / 100);
  }
}
