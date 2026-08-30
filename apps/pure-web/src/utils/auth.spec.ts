// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';

const userStore = {
  isRemembered: false,
  loginDay: 7,
  SET_AVATAR: vi.fn(),
  SET_USERNAME: vi.fn(),
  SET_NICKNAME: vi.fn(),
  SET_ROLES: vi.fn(),
  SET_PERMS: vi.fn(),
  permissions: undefined as Array<string> | undefined
};
vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => userStore
}));

import {
  getToken,
  setToken,
  removeToken,
  formatToken,
  hasPerms,
  userKey,
  TokenKey,
  multipleTabsKey,
  type DataInfo
} from './auth';
import { useUserStoreHook } from '@/store/modules/user';

beforeEach(() => {
  vi.clearAllMocks();
  Cookies.remove(TokenKey);
  Cookies.remove(multipleTabsKey);
  storageLocal().clear();
});

const baseData: DataInfo<number> = {
  accessToken: 'a-token',
  refreshToken: 'r-token',
  expires: Date.now() + 3600_000
};

describe('formatToken', () => {
  it('拼接 Bearer 前缀', () => {
    expect(formatToken('abc')).toBe('Bearer abc');
  });
});

describe('getToken', () => {
  it('cookie 优先', () => {
    Cookies.set(
      TokenKey,
      JSON.stringify({
        accessToken: 'from-cookie',
        expires: 1,
        refreshToken: 'r'
      })
    );
    expect(getToken()?.accessToken).toBe('from-cookie');
  });

  it('cookie 缺失时回退 localStorage', () => {
    storageLocal().setItem(userKey, { accessToken: 'from-storage' });
    expect(getToken()?.accessToken).toBe('from-storage');
  });

  it('两边均无返回 null', () => {
    expect(getToken()).toBeNull();
  });
});

describe('setToken', () => {
  it('expires > 0 时按毫秒间隔换算天数写入 cookie', () => {
    const data = { ...baseData, expires: Date.now() + 86400_000 };
    setToken(data);
    const parsed = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(parsed).toMatchObject({
      accessToken: 'a-token',
      refreshToken: 'r-token'
    });
    expect(parsed.expires).toBe(data.expires);
  });

  it('expires 非正时写会话 cookie', () => {
    setToken({ ...baseData, expires: 0 });
    const parsed = JSON.parse(Cookies.get(TokenKey) ?? '{}');
    expect(parsed).toMatchObject({ accessToken: 'a-token' });
  });

  it('username && roles 齐备：SET_* 与 storage 双写、multiple-tabs 会话 cookie', () => {
    const data = {
      ...baseData,
      username: 'sso-user',
      roles: ['admin'],
      avatar: 'avatars/x.png',
      nickname: '苏',
      permissions: ['system:add']
    };
    setToken(data);
    expect(userStore.SET_AVATAR).toHaveBeenCalledWith('avatars/x.png');
    expect(userStore.SET_USERNAME).toHaveBeenCalledWith('sso-user');
    expect(userStore.SET_ROLES).toHaveBeenCalledWith(['admin']);
    expect(userStore.SET_PERMS).toHaveBeenCalledWith(['system:add']);
    const stored = storageLocal().getItem<DataInfo<number>>(userKey);
    expect(stored?.username).toBe('sso-user');
    expect(Cookies.get(multipleTabsKey)).toBe('true');
  });

  it('username 或 roles 缺失：其余字段从 storage 回读补写', () => {
    storageLocal().setItem(userKey, {
      avatar: 'backup.png',
      username: 'backup-user',
      nickname: '备',
      roles: ['user'],
      permissions: ['x']
    });
    setToken({ ...baseData });
    expect(userStore.SET_AVATAR).toHaveBeenCalledWith('backup.png');
    expect(userStore.SET_USERNAME).toHaveBeenCalledWith('backup-user');
    expect(userStore.SET_ROLES).toHaveBeenCalledWith(['user']);

    const stored = storageLocal().getItem<DataInfo<number>>(userKey);
    expect(stored?.refreshToken).toBe('r-token');
    expect(stored?.avatar).toBe('backup.png');
  });

  it('isRemembered=true 时 multiple-tabs 带 loginDay 过期', () => {
    vi.mocked(useUserStoreHook()).isRemembered = true;
    setToken({ ...baseData });
    const spy = vi.mocked(useUserStoreHook());
    expect(spy.isRemembered).toBe(true);
    expect(Cookies.get(multipleTabsKey)).toBe('true');
  });
});

describe('removeToken', () => {
  it('清理 cookie 两键与 storage', () => {
    Cookies.set(TokenKey, 'x');
    Cookies.set(multipleTabsKey, 'true');
    storageLocal().setItem(userKey, { accessToken: 'x' });
    removeToken();
    expect(Cookies.get(TokenKey)).toBeUndefined();
    expect(Cookies.get(multipleTabsKey)).toBeUndefined();
    expect(storageLocal().getItem(userKey)).toBeNull();
  });
});

describe('hasPerms', () => {
  it('空值/无权限拒绝', () => {
    expect(hasPerms('')).toBe(false);
    storageLocal().clear();
    vi.mocked(useUserStoreHook()).permissions =
      undefined as unknown as Array<string>;
    expect(hasPerms('system:add')).toBe(false);
    vi.mocked(useUserStoreHook()).permissions = [];
    expect(hasPerms('system:add')).toBe(false);
  });

  it('超级权限通配放行', () => {
    vi.mocked(useUserStoreHook()).permissions = ['*:*:*'];
    expect(hasPerms('anything')).toBe(true);
  });

  it('单值与数组形式（isIncludeAllChildren 语义）', () => {
    vi.mocked(useUserStoreHook()).permissions = ['a', 'sub-b'];
    expect(hasPerms('a')).toBe(true);
    expect(hasPerms('c')).toBe(false);
    expect(hasPerms(['a', 'c'])).toBe(false);
  });
});
