import { BizCode } from '@multi-admin/contracts';
import { BizException } from './biz.exception.js';

describe('BizException', () => {
  it('由错误码推导 HTTP 状态（code 整除 100）', () => {
    expect(new BizException(BizCode.FORBIDDEN, '无权限').httpStatus).toBe(403);
    expect(new BizException(BizCode.RATE_LIMITED, '触发限流').httpStatus).toBe(
      429
    );
    expect(
      new BizException(BizCode.INTERNAL_ERROR, '内部错误').httpStatus
    ).toBe(500);
  });

  it('保留 code 与 message', () => {
    const ex = new BizException(BizCode.UNAUTHORIZED, '未认证');
    expect(ex.code).toBe(40101);
    expect(ex.message).toBe('未认证');
    expect(ex).toBeInstanceOf(Error);
  });
});
