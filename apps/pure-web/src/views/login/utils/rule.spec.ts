// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (m: string) => m,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => ({ verifyCode: '1234' })
}));

vi.mock('@pureadmin/utils', async () => {
  const actual = await vi.importActual<Record<string, any>>('@pureadmin/utils');
  return { ...actual, isPhone: (v: string) => /^1[3-9]\d{9}$/.test(v) };
});

import {
  REGEXP_SIX,
  REGEXP_PWD,
  loginRules,
  phoneRules,
  updateRules
} from './rule';

function getValidator(rules: any): Function {
  return (rules as any[])[0].validator;
}

describe('login/utils/rule', () => {
  it('REGEXP_SIX 匹配6位数字', () => {
    expect(REGEXP_SIX.test('123456')).toBe(true);
    expect(REGEXP_SIX.test('12345')).toBe(false);
    expect(REGEXP_SIX.test('abcdef')).toBe(false);
  });

  it('REGEXP_PWD 匹配8-18位两种组合密码', () => {
    expect(REGEXP_PWD.test('Ab123456')).toBe(true);
    expect(REGEXP_PWD.test('abcdefgh')).toBe(false);
    expect(REGEXP_PWD.test('12345678')).toBe(false);
  });

  it('loginRules 包含 password 和 verifyCode 规则', () => {
    expect(loginRules.password).toBeDefined();
    expect(loginRules.verifyCode).toBeDefined();
    expect(Array.isArray(loginRules.password)).toBe(true);
  });

  // password validator
  it('loginRules.password validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(loginRules.password)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('loginRules.password validator 不符合正则回调错误', () => {
    const cb = vi.fn();
    getValidator(loginRules.password)({} as any, 'abcdefgh', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('loginRules.password validator 正确密码回调无参', () => {
    const cb = vi.fn();
    getValidator(loginRules.password)({} as any, 'Ab123456', cb);
    expect(cb).toHaveBeenCalledWith();
  });

  // verifyCode validator
  it('loginRules.verifyCode validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(loginRules.verifyCode)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('loginRules.verifyCode validator 不匹配回调错误', () => {
    const cb = vi.fn();
    getValidator(loginRules.verifyCode)({} as any, '9999', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('loginRules.verifyCode validator 匹配 store 中的验证码', () => {
    const cb = vi.fn();
    getValidator(loginRules.verifyCode)({} as any, '1234', cb);
    expect(cb).toHaveBeenCalledWith();
  });

  // phoneRules
  it('phoneRules.phone validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(phoneRules.phone)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('phoneRules.phone validator 非法手机号回调错误', () => {
    const cb = vi.fn();
    getValidator(phoneRules.phone)({} as any, '12345', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('phoneRules.phone validator 合法手机号回调无参', () => {
    const cb = vi.fn();
    getValidator(phoneRules.phone)({} as any, '13800138000', cb);
    expect(cb).toHaveBeenCalledWith();
  });
  it('phoneRules.verifyCode validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(phoneRules.verifyCode)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('phoneRules.verifyCode validator 非6位回调错误', () => {
    const cb = vi.fn();
    getValidator(phoneRules.verifyCode)({} as any, '123', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('phoneRules.verifyCode validator 6位数字回调无参', () => {
    const cb = vi.fn();
    getValidator(phoneRules.verifyCode)({} as any, '123456', cb);
    expect(cb).toHaveBeenCalledWith();
  });

  // updateRules
  it('updateRules.phone validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.phone)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.phone validator 非法手机号回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.phone)({} as any, '12345', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.phone validator 合法手机号回调无参', () => {
    const cb = vi.fn();
    getValidator(updateRules.phone)({} as any, '13800138000', cb);
    expect(cb).toHaveBeenCalledWith();
  });
  it('updateRules.verifyCode validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.verifyCode)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.verifyCode validator 非6位回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.verifyCode)({} as any, 'ab', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.verifyCode validator 6位数字回调无参', () => {
    const cb = vi.fn();
    getValidator(updateRules.verifyCode)({} as any, '123456', cb);
    expect(cb).toHaveBeenCalledWith();
  });
  it('updateRules.password validator 空值回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.password)({} as any, '', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.password validator 不符合正则回调错误', () => {
    const cb = vi.fn();
    getValidator(updateRules.password)({} as any, 'short', cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error));
  });
  it('updateRules.password validator 正确密码回调无参', () => {
    const cb = vi.fn();
    getValidator(updateRules.password)({} as any, 'Ab123456', cb);
    expect(cb).toHaveBeenCalledWith();
  });
});
