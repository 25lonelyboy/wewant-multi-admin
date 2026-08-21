import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { BizCode } from '@multi-admin/contracts';
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
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: BizCode.CONFLICT,
          message: '资源唯一约束冲突'
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: BizCode.NOT_FOUND,
          message: '资源不存在或已删除'
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: BizCode.VALIDATION_FAILED,
          message: '关联资源不存在或无效'
        };
      default:
        break;
    }
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: BizCode.INTERNAL_ERROR,
    message: '服务器内部错误'
  };
}
