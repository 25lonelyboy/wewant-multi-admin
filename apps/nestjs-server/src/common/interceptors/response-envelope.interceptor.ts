import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BizCode } from '@multi-admin/contracts';
import type { ApiResponse } from '@multi-admin/contracts';

/**
 * 统一响应信封：{ code: 0, message: 'ok', data }（总 spec §5）。
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>
  ): Observable<ApiResponse<T>> {
    return next
      .handle()
      .pipe(map(data => ({ code: BizCode.SUCCESS, message: 'ok', data })));
  }
}
