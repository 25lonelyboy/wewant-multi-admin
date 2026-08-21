// auth 域契约一致性（分设计 §3.3 第 3 件）：
// 编译期钉住 server 产物形状与 contracts 一致，漂移即红。
import type {
  LoginResponse,
  RefreshResponse,
  UserProfile
} from '@multi-admin/contracts';
import type { TokenPair } from './token.service.js';

/** JSON 序列化后的类型映射：Date → string（与 HTTP 响应体一致） */
type Serialized<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<Serialized<U>>
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

describe('auth 域契约一致性', () => {
  it('refresh 对外形状 = TokenPair 剥离 sid', () => {
    const pair: Omit<TokenPair, 'sid'> = {
      accessToken: 'a',
      refreshToken: 'r',
      expires: Date.now()
    };
    const exposed: RefreshResponse = pair; // 编译期钉住
    expect(exposed).not.toHaveProperty('sid');
  });

  it('登录响应 = 画像 + 令牌载荷（序列化形态）', () => {
    const body = {
      avatar: null,
      username: 'admin',
      nickname: '超级管理员',
      roles: ['admin'],
      permissions: ['*:*:*'],
      accessToken: 'a',
      refreshToken: 'r',
      expires: Date.now()
    };
    const login: LoginResponse = body; // 编译期钉住
    expect(login.expires).toEqual(expect.any(Number));
  });

  it('UserProfile 四新字段可空', () => {
    const profile: UserProfile = {
      avatar: null,
      username: 'admin',
      nickname: '超级管理员',
      email: null,
      phone: null,
      description: null
    };
    expect(profile.description).toBeNull();
  });

  it('Serialized 映射自检（Date → string）', () => {
    type Check = Serialized<{ at: Date }>;
    const v: Check = { at: '2026-08-22T00:00:00.000Z' };
    expect(typeof v.at).toBe('string');
  });
});
