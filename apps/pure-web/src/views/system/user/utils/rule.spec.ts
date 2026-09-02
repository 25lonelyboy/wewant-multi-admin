// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { formRules as _formRules } from './rule';
const formRules = _formRules as any;

describe('user formRules', () => {
  it('nickname / username / password 均为 required', () => {
    for (const key of ['nickname', 'username', 'password'] as const) {
      const rules = formRules[key];
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({ required: true, trigger: 'blur' });
    }
  });

  it('phone 校验：空值通过、正确格式通过、错误格式报错', () => {
    const phoneRule = formRules.phone[0] as any;
    const cb = vi.fn();

    // 空值 → 通过
    phoneRule.validator(undefined, '', cb);
    expect(cb).toHaveBeenCalledWith();

    // 正确手机号
    cb.mockClear();
    phoneRule.validator(undefined, '13800138000', cb);
    expect(cb).toHaveBeenCalledWith();

    // 错误格式
    cb.mockClear();
    phoneRule.validator(undefined, '12345', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it('email 校验：空值通过、正确格式通过、错误格式报错', () => {
    const emailRule = formRules.email[0] as any;
    const cb = vi.fn();

    emailRule.validator(undefined, '', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    emailRule.validator(undefined, 'a@b.com', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    emailRule.validator(undefined, 'not-email', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
});
