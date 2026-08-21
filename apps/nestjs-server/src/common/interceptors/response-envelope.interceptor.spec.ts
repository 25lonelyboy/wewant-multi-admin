import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { BizCode } from '@multi-admin/contracts';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

describe('ResponseEnvelopeInterceptor', () => {
  it('把处理器返回值包装为统一信封', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const handler = { handle: () => of({ id: 1 }) } as CallHandler;
    const result = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, handler)
    );
    expect(result).toEqual({
      code: BizCode.SUCCESS,
      message: 'ok',
      data: { id: 1 }
    });
  });
});
