// @vitest-environment jsdom
import { it, expect, vi, beforeEach, beforeAll } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

const axiosFake = vi.hoisted(() => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    request: vi.fn()
  };
  // instance 必须暴露：fake request 是纯 vi.fn，拦截器链不会自动执行，
  // 需要捕获真实 responseRejected handler 后直接驱动（见 beforeAll）
  return { instance, create: vi.fn(() => instance) };
});
vi.mock('axios', () => ({
  default: { create: axiosFake.create, isCancel: (e: any) => !!e?.isCancel },
  isCancel: (e: any) => !!e?.isCancel
}));
vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));

// 真实 user store（本用例被测对象）；@/api/user 仅 mock HTTP 边界（B2 口径）
const apiMock = vi.hoisted(() => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/api/user', () => apiMock);

import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import { TokenKey } from '@/utils/auth';
import { useUserStoreHook } from './user';
// side-effect import：建立 http 单例，真实拦截器注册进 axiosFake.instance
import '@/utils/http';

// 无法经 http.get() 端到端触发 40102：fake axios 的 request 是纯 vi.fn，
// 不会执行注册的拦截器链——改为捕获真实 responseRejected 直接驱动
let responseRejected: (error: any) => any;

beforeAll(() => {
  responseRejected =
    axiosFake.instance.interceptors.response.use.mock.calls[0][1];
});

beforeEach(() => {
  vi.clearAllMocks();
  storageLocal().clear();
  Cookies.remove(TokenKey);
  useUserStoreHook().$reset();
});

it('40102 → 真实 user.handRefreshToken → setToken 双写 → 原请求以新 token 重放', async () => {
  Cookies.set(
    TokenKey,
    JSON.stringify({
      accessToken: 'old-token',
      refreshToken: 'r-token',
      expires: Date.now() + 3600_000
    })
  );
  apiMock.refreshTokenApi.mockResolvedValue({
    code: 0,
    data: {
      accessToken: 'fresh-token',
      refreshToken: 'r2',
      expires: Date.now() + 7200_000
    }
  });
  const retryConfig = { headers: {}, url: '/api/v1/auth/profile' };
  axiosFake.instance.request.mockResolvedValue({ profile: 'ok' });

  const result = await responseRejected({
    isCancel: false,
    response: { data: { code: 40102, message: 'expired' } },
    config: retryConfig
  });

  expect(result).toEqual({ profile: 'ok' });
  expect(apiMock.refreshTokenApi).toHaveBeenCalledWith({
    refreshToken: 'r-token'
  });
  expect(JSON.parse(Cookies.get(TokenKey) ?? '{}').accessToken).toBe(
    'fresh-token'
  );
  expect(axiosFake.instance.request).toHaveBeenCalledWith(retryConfig);
  expect(retryConfig.headers['Authorization']).toBe('Bearer fresh-token');
});
