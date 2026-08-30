// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

const apiMock = vi.hoisted(() => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/api/user', () => apiMock);

import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import {
  TokenKey,
  multipleTabsKey,
  userKey,
  type DataInfo
} from '@/utils/auth';
import { useUserStoreHook } from './user';

// 真实链：auth.setToken 双写 cookie+storage、logout 真实 multiTags+router（jsdom 已打通）
const hook = useUserStoreHook;

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  Cookies.remove(TokenKey);
  Cookies.remove(multipleTabsKey);
  hook().$reset();
  // 路由跳转静默：真实 router 可用，push 前守卫走白名单放行
});

describe('SET 动作', () => {
  it('九个 SET action 各自写入对应 state 键', () => {
    const store = hook();
    store.SET_AVATAR('a.png');
    expect(store.avatar).toBe('a.png');
    store.SET_USERNAME('admin');
    expect(store.username).toBe('admin');
    store.SET_NICKNAME('nick');
    expect(store.nickname).toBe('nick');
    store.SET_ROLES(['admin']);
    expect(store.roles).toEqual(['admin']);
    store.SET_PERMS(['system:user:list']);
    expect(store.permissions).toEqual(['system:user:list']);
    store.SET_VERIFYCODE('1234');
    expect(store.verifyCode).toBe('1234');
    store.SET_CURRENTPAGE(1);
    expect(store.currentPage).toBe(1);
    store.SET_ISREMEMBERED(true);
    expect(store.isRemembered).toBe(true);
    store.SET_LOGINDAY(3);
    expect(store.loginDay).toBe(3);
  });
});

describe('loginByUsername', () => {
  it('code 0：setToken 双写 cookie + storage，resolve 原信封', async () => {
    const payload = {
      code: 0,
      data: {
        accessToken: 'a-token',
        refreshToken: 'r-token',
        expires: Date.now() + 3600_000,
        username: 'admin',
        roles: ['admin']
      }
    };
    apiMock.getLogin.mockResolvedValue(payload);
    const result = await hook().loginByUsername({
      username: 'admin',
      password: 'x'
    });
    expect(result).toBe(payload);
    const cookie = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(cookie.accessToken).toBe('a-token');
    expect(
      (storageLocal().getItem(userKey) as DataInfo<number> | null)?.username
    ).toBe('admin');
  });

  it('code 非 0：reject(message)', async () => {
    apiMock.getLogin.mockResolvedValue({ code: 40001, message: 'bad' });
    await expect(
      hook().loginByUsername({ username: 'x', password: 'y' })
    ).rejects.toBe('bad');
  });

  it('HTTP 异常：reject(error)', async () => {
    const err = new Error('net');
    apiMock.getLogin.mockRejectedValue(err);
    await expect(
      hook().loginByUsername({ username: 'x', password: 'y' })
    ).rejects.toBe(err);
  });
});

describe('handRefreshToken', () => {
  it('code 0：setToken 写入新 token 并 resolve', async () => {
    const payload = {
      code: 0,
      data: {
        accessToken: 'fresh',
        refreshToken: 'r2',
        expires: Date.now() + 3600_000
      }
    };
    apiMock.refreshTokenApi.mockResolvedValue(payload);
    const result = await hook().handRefreshToken({ refreshToken: 'r-token' });
    expect(result).toBe(payload);
    expect(JSON.parse(Cookies.get(TokenKey) ?? '{}').accessToken).toBe('fresh');
  });

  it('code 非 0：reject(message)', async () => {
    apiMock.refreshTokenApi.mockResolvedValue({ code: 40103, message: 'nope' });
    await expect(
      hook().handRefreshToken({ refreshToken: 'r-token' })
    ).rejects.toBe('nope');
  });

  it('HTTP 异常：reject(error)', async () => {
    const err = new Error('net');
    apiMock.refreshTokenApi.mockRejectedValue(err);
    await expect(
      hook().handRefreshToken({ refreshToken: 'r-token' })
    ).rejects.toBe(err);
  });
});

describe('logOut', () => {
  it('fire-and-forget 服务端失败不阻塞本地清理', async () => {
    apiMock.logoutApi.mockRejectedValue(new Error('server down'));
    hook().username = 'u';
    hook().roles = ['admin'];
    hook().permissions = ['x'];
    Cookies.set(TokenKey, 'x');
    Cookies.set(multipleTabsKey, 'true');
    storageLocal().setItem(userKey, { accessToken: 'x' });

    hook().logOut();

    expect(hook().username).toBe('');
    expect(hook().roles).toEqual([]);
    expect(hook().permissions).toEqual([]);
    expect(Cookies.get(TokenKey)).toBeUndefined();
    expect(storageLocal().getItem(userKey)).toBeNull();
  });
});
