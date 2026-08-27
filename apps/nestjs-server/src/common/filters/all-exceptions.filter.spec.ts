import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'GET', url: '/test', requestId: 'req-1' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => req
    })
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('resolveException 返回 data 时透传到响应体', () => {
    const errors = [
      { field: 'username', message: '用户名不能为空' },
      { field: 'email', message: '邮箱格式不正确' }
    ];
    const ex = new BadRequestException({
      statusCode: 400,
      message: '参数校验失败',
      errors
    });
    const { host, status, json } = mockHost();

    filter.catch(ex, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { errors }
      })
    );
  });

  it('resolveException 无 data 时响应 data: null', () => {
    const { host, status, json } = mockHost();

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: null }));
  });
});
