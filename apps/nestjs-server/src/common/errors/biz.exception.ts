/**
 * 业务异常：携带数字错误码，由全局过滤器映射为统一信封。
 */
export class BizException extends Error {
  readonly code: number;
  readonly httpStatus: number;
  /** 结构化的错误细节，随信封的 `data` 字段返回（不新增数字码，见 S4 计划 §2.5） */
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'BizException';
    this.code = code;
    this.httpStatus = Math.floor(code / 100);
    this.data = data;
  }
}
