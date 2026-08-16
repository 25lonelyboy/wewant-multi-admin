import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveException } from '../errors/exception-resolver.js';

/**
 * 全局兜底过滤器：任意异常 → 统一信封 { code, message, data: null }。
 * 5xx 记 error 日志并带 requestId，4xx 记 warn。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, code, message } = resolveException(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} -> ${status}`,
        exception as Error,
        req.requestId
      );
    } else {
      this.logger.warn(
        `${req.method} ${req.url} -> ${status} ${message}`,
        req.requestId
      );
    }
    res.status(status).json({ code, message, data: null });
  }
}
