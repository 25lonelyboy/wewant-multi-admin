import { BizCode } from '@multi-admin/contracts';

describe('BizCode', () => {
  it('成功码为 0 且关键错误码符合契约', () => {
    expect(BizCode.SUCCESS).toBe(0);
    expect(BizCode.VALIDATION_FAILED).toBe(40001);
    expect(BizCode.UNAUTHORIZED).toBe(40101);
    expect(BizCode.ACCESS_TOKEN_EXPIRED).toBe(40102);
    expect(BizCode.REFRESH_TOKEN_INVALID).toBe(40103);
    expect(BizCode.FORBIDDEN).toBe(40301);
    expect(BizCode.NOT_FOUND).toBe(40404);
    expect(BizCode.CONFLICT).toBe(40900);
    expect(BizCode.RATE_LIMITED).toBe(42901);
    expect(BizCode.INTERNAL_ERROR).toBe(50000);
  });
});
