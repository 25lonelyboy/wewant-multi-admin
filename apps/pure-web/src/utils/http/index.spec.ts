// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll
} from 'vitest';

// ===== 外部边界 mock =====
const axiosFake = vi.hoisted(() => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    },
    request: vi.fn()
  };
  return { instance, create: vi.fn(() => instance) };
});
vi.mock('axios', () => ({
  default: { create: axiosFake.create, isCancel: (e: any) => !!e?.isCancel },
  isCancel: (e: any) => !!e?.isCancel
}));

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { closeAll: vi.fn() })
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

const userStoreFake = {
  handRefreshToken: vi.fn(),
  logOut: vi.fn()
};
vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => userStoreFake
}));
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));

// 真实依赖：auth（B1.4 已测）、message 模块（element-plus 已被 mock）
import Cookies from 'js-cookie';
import { storageLocal } from '@pureadmin/utils';
import { TokenKey } from '@/utils/auth';
import { ElMessage } from 'element-plus';

const ElMessageMock = ElMessage as unknown as ReturnType<typeof vi.fn>;

// ===== 拦截器 handler 捕捉 =====
// http 模块顶层 Axios.create 即返回 axiosFake.instance，use 各被调用 1 次，
// 首次调用参数即 request/response 拦截器处理器
function requireHttpModule() {
  // 模块级单例：vi.hoisted 已先建 fake，import 后拦截器完成注册
  return import('@/utils/http');
}
let requestFulfilled: (config: any) => any;
let responseFulfilled: (response: any) => any;
let responseRejected: (error: any) => any;

beforeAll(async () => {
  await requireHttpModule();
  // 拦截器注册发生在模块顶层首次执行；use.mock.calls 一经捕获后不可被 clearAllMocks 清空
  requestFulfilled =
    axiosFake.instance.interceptors.request.use.mock.calls[0][0];
  // response.use 仅调用一次：args[0]=fulfilled，args[1]=rejected
  responseFulfilled =
    axiosFake.instance.interceptors.response.use.mock.calls[0][0];
  responseRejected =
    axiosFake.instance.interceptors.response.use.mock.calls[0][1];
});

beforeEach(() => {
  // 注意：不可 vi.clearAllMocks()——会清空拦截器注册记录（use.mock.calls）
  axiosFake.instance.request.mockReset();
  userStoreFake.handRefreshToken.mockReset();
  userStoreFake.logOut.mockReset();
  ElMessageMock.mockClear();
  Cookies.remove(TokenKey);
  storageLocal().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function seedToken(
  overrides: Partial<{
    accessToken: string;
    refreshToken: string;
    expires: number;
  }> = {}
) {
  const data = {
    accessToken: 'a-token',
    refreshToken: 'r-token',
    expires: Date.now() + 3600_000,
    ...overrides
  };
  Cookies.set(TokenKey, JSON.stringify(data));
  return data;
}

describe('request 拦截 fulfilled', () => {
  it('beforeRequestCallback 传参时短路返回 config', async () => {
    const config = { beforeRequestCallback: vi.fn(), url: '/api/v1/x' };
    const result = await requestFulfilled(config);
    expect(config.beforeRequestCallback).toHaveBeenCalledWith(config);
    expect(result).toBe(config);
  });

  it('白名单 /refresh-token 直接放行，不注入 Authorization', async () => {
    seedToken();
    const config = { headers: {}, url: '/api/v1/auth/refresh-token' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
    expect(
      (config.headers as Record<string, string>)['Authorization']
    ).toBeUndefined();
  });

  it('白名单 /login 直接放行', async () => {
    seedToken();
    const config = { headers: {}, url: '/api/v1/auth/login' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
  });

  it('无 token 直接放行', async () => {
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
  });

  it('token 未过期：注入 Bearer Authorization', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    const { accessToken } = seedToken({
      expires: new Date('2026-08-30T01:00:00Z').getTime()
    });
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const result = await requestFulfilled(config);
    expect(result).toBe(config);
    expect((config.headers as Record<string, string>)['Authorization']).toBe(
      `Bearer ${accessToken}`
    );
  });

  it('token 过期：单飞刷新后以新 token 重放入队请求', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    seedToken({ expires: new Date('2026-08-29T23:00:00Z').getTime() });
    userStoreFake.handRefreshToken.mockResolvedValue({
      data: { accessToken: 'fresh-token' }
    });
    const config = { headers: {}, url: '/api/v1/system/user/list' };
    const pending = requestFulfilled(config);
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'r-token'
    });
    await vi.runAllTicks();
    const result = await pending;
    expect(result).toBe(config);
    expect((config.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer fresh-token'
    );
  });
});

describe('response 拦截 rejected', () => {
  it('取消请求直通 reject', async () => {
    const err = { isCancel: true, response: undefined };
    await expect(responseRejected(err)).rejects.toBe(err);
    expect(userStoreFake.handRefreshToken).not.toHaveBeenCalled();
  });

  it('40102（ACCESS_TOKEN_EXPIRED）：交给 refreshAndRetry 单飞重试', async () => {
    seedToken();
    userStoreFake.handRefreshToken.mockResolvedValue({
      data: { accessToken: 'fresh-token' }
    });
    const retryConfig = { headers: {}, url: '/api/v1/system/user/list' };
    axiosFake.instance.request.mockResolvedValue({ retried: true });
    const err = {
      isCancel: false,
      response: { data: { code: 40102 } },
      config: retryConfig
    };
    const result = await responseRejected(err);
    expect(result).toEqual({ retried: true });
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledTimes(1);
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledWith({
      refreshToken: 'r-token'
    });
    expect(
      (retryConfig.headers as Record<string, string>)['Authorization']
    ).toBe('Bearer fresh-token');
  });

  it('并发 3 个 40102：handRefreshToken 只发一次，队列全员重放', async () => {
    vi.useFakeTimers();
    let resolveRefresh: (v: any) => void;
    userStoreFake.handRefreshToken.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRefresh = resolve;
        })
    );
    axiosFake.instance.request.mockResolvedValue({ ok: true });
    const makeErr = (n: number) => ({
      isCancel: false,
      response: { data: { code: 40102 } },
      config: { headers: {}, url: `/api/v1/list/${n}` }
    });
    const p1 = responseRejected(makeErr(1));
    const p2 = responseRejected(makeErr(2));
    const p3 = responseRejected(makeErr(3));
    await vi.runAllTicks();
    expect(userStoreFake.handRefreshToken).toHaveBeenCalledTimes(1);
    resolveRefresh!({ data: { accessToken: 'fresh-token' } });
    const results = await Promise.all([p1, p2, p3]);
    expect(results.every(r => r.ok)).toBe(true);
    expect(axiosFake.instance.request).toHaveBeenCalledTimes(3);
  });

  it('刷新失败：队列清空 + logOut + warning toast', async () => {
    vi.useFakeTimers();
    userStoreFake.handRefreshToken.mockRejectedValue(new Error('denied'));
    const err = {
      isCancel: false,
      response: { data: { code: 40102 } },
      config: { headers: {}, url: '/api/v1/x' }
    };
    // 刷新失败时 retryOriginalRequest 的回调永不被调用，返回的 promise 永久挂起——
    // 不 await 该 promise，只驱动微任务后断言失败副作用（logOut + 告警 toast）
    void responseRejected(err);
    // 需要多次 runAllTicks 来推进所有嵌套的 Promise 链
    await vi.runAllTicks();
    await vi.runAllTicks();
    await vi.runAllTicks();
    expect(userStoreFake.logOut).toHaveBeenCalled();
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning' })
    );
  });

  it('其他错误信封：toast 后端 message 后 reject', async () => {
    const errWithBody = {
      isCancel: false,
      response: { data: { code: 50000, message: 'boom' } }
    };
    await expect(responseRejected(errWithBody)).rejects.toBe(errWithBody);
    expect(ElMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom', type: 'error' })
    );
  });

  it('响应无信封数据（response 缺省）：不 toast 直接 reject', async () => {
    const err = { isCancel: false, response: undefined };
    await expect(responseRejected(err)).rejects.toBe(err);
    expect(ElMessageMock).not.toHaveBeenCalled();
  });
});

describe('response 拦截 fulfilled', () => {
  it('无回调时返回 response.data', async () => {
    const response = { config: {}, data: { code: 0, message: 'ok' } };
    const result = responseFulfilled(response);
    expect(result).toEqual({ code: 0, message: 'ok' });
  });

  it('beforeResponseCallback 传参时调用回调并返回 response.data', async () => {
    const callback = vi.fn();
    const response = {
      config: { beforeResponseCallback: callback },
      data: { code: 0 }
    };
    const result = responseFulfilled(response);
    expect(callback).toHaveBeenCalledWith(response);
    expect(result).toEqual({ code: 0 });
  });
});
