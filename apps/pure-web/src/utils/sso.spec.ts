// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth', () => ({
  removeToken: vi.fn(),
  setToken: vi.fn()
}));

import {
  getSsoParams,
  isSsoLogin,
  buildSsoRedirectUrl,
  handleSsoLogin
} from './sso';
import { removeToken, setToken } from './auth';
import type { DataInfo } from './auth';

const params: DataInfo<number> = {
  username: 'sso',
  roles: 'admin',
  accessToken: 't-1'
} as unknown as DataInfo<number>;

const fakeLocation = (hash: string) =>
  ({
    href: `http://localhost:8848/#/permission/page/index?username=sso&roles=admin&accessToken=t-1${hash}`,
    origin: 'http://localhost:8848',
    pathname: '/',
    hash,
    replace: vi.fn()
  }) as unknown as Location;

beforeEach(() => vi.clearAllMocks());

describe('getSsoParams', () => {
  it('must 三键齐备且键数恰为 3 时返回参数', () => {
    const url = 'http://xx.com/#/?username=sso&roles=admin&accessToken=t';
    expect(getSsoParams(url)).toEqual(
      expect.objectContaining({ username: 'sso' })
    );
  });

  it('参数量不对或缺失 must 键时返回 null', () => {
    expect(getSsoParams('http://xx.com/#/?username=sso')).toBeNull();
    expect(
      getSsoParams(
        'http://xx.com/#/?username=sso&roles=admin&other=1&accessToken=t'
      )
    ).toBeNull();
  });

  it('键数恰为 3 但 must 键缺失时返回 null', () => {
    expect(
      getSsoParams('http://xx.com/#/?username=sso&roles=admin&other=x')
    ).toBeNull();
  });
});

describe('isSsoLogin', () => {
  it('null 判 false', () => {
    expect(isSsoLogin(null)).toBe(false);
  });
});

describe('buildSsoRedirectUrl', () => {
  it('剥除 roles/accessToken，username 以 query 保留', () => {
    const loc = fakeLocation('#/permission/page/index');
    expect(buildSsoRedirectUrl(params, loc)).toBe(
      'http://localhost:8848/#/permission/page/index?username=sso'
    );
  });

  it('hash 已含 query 时剥离后拼接', () => {
    const loc = fakeLocation('#/permission/page/index?old=1');
    expect(buildSsoRedirectUrl(params, loc)).toBe(
      'http://localhost:8848/#/permission/page/index?username=sso'
    );
  });
});

describe('handleSsoLogin', () => {
  it('append 三键时：清旧 + 存新 + replace 跳转', () => {
    const loc = fakeLocation('#/permission/page/index');
    handleSsoLogin(loc);
    expect(removeToken).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledTimes(1);
    expect(loc.replace).toHaveBeenCalledWith(
      'http://localhost:8848/#/permission/page/index?username=sso'
    );
  });

  it('非单点参数时早退为零副作用', () => {
    const loc = {
      ...fakeLocation('#/login'),
      href: 'http://localhost:8848/#/login'
    } as unknown as Location;
    handleSsoLogin(loc);
    expect(removeToken).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it('无参调用走全局 location（jsdom）且不抛错', () => {
    expect(() => handleSsoLogin()).not.toThrow();
  });
});
