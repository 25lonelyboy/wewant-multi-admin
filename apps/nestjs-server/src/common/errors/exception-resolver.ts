import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { BizCode } from './biz-code.js';
import { BizException } from './biz.exception.js';

export interface ResolvedError {
  status: number;
  code: number;
  message: string;
}

/**
 * 纯函数：任意异常 → { status, code, message }。供全局过滤器与测试共用。
 */
export function resolveException(exception: unknown): ResolvedError {
  if (exception instanceof BizException) {
    return {
      status: exception.httpStatus,
      code: exception.code,
      message: exception.message
    };
  }
  if (exception instanceof BadRequestException) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: BizCode.VALIDATION_FAILED,
      message: '参数校验失败'
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const raw =
      typeof response === 'string'
        ? response
        : (response as { message?: string | string[] }).message;
    const message = Array.isArray(raw)
      ? raw.join('; ')
      : raw || exception.message;
    return { status, code: status * 100, message };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: BizCode.INTERNAL_ERROR,
    message: '服务器内部错误'
  };
}
