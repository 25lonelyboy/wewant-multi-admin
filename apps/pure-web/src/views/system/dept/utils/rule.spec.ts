// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { formRules as _formRules } from './rule';
const formRules = _formRules as any;

describe('dept formRules', () => {
  it('name 为 required', () => {
    const rules = formRules.name;
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ required: true, trigger: 'blur' });
  });

  it('phone 校验：空值通过、正确格式通过、错误格式报错', () => {
    const phoneRule = formRules.phone[0] as any;
    const cb = vi.fn();

    phoneRule.validator(undefined, '', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    phoneRule.validator(undefined, '13800138000', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    phoneRule.validator(undefined, 'abc', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });

  it('email 校验：空值通过、正确格式通过、错误格式报错', () => {
    const emailRule = formRules.email[0] as any;
    const cb = vi.fn();

    emailRule.validator(undefined, '', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    emailRule.validator(undefined, 'test@example.com', cb);
    expect(cb).toHaveBeenCalledWith();

    cb.mockClear();
    emailRule.validator(undefined, 'bad', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
});
