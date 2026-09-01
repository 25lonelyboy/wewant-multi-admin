// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

// 阻断传递依赖链（directives → auth → @/router/utils → @/router → i18n YAML）
vi.mock('@/router', () => ({
  router: { currentRoute: { value: { meta: {} } } }
}));
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({})
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({})
}));
vi.mock('@/api/routes', () => ({
  getAsyncRoutes: vi.fn(() => Promise.resolve({ code: 0, data: [] }))
}));
vi.mock('@/api/user', () => ({
  getLogin: vi.fn(),
  refreshTokenApi: vi.fn(),
  logoutApi: vi.fn()
}));
vi.mock('@/utils/message', () => ({
  message: vi.fn(),
  closeAllMessage: vi.fn()
}));

import { auth, copy, longpress, optimize, perms, Ripple } from './index';

describe('directives barrel export', () => {
  it('导出全部六个指令', () => {
    expect(auth).toBeDefined();
    expect((auth as any).mounted).toBeTypeOf('function');

    expect(copy).toBeDefined();
    expect((copy as any).mounted).toBeTypeOf('function');

    expect(longpress).toBeDefined();
    expect((longpress as any).mounted).toBeTypeOf('function');

    expect(optimize).toBeDefined();
    expect((optimize as any).mounted).toBeTypeOf('function');

    expect(perms).toBeDefined();
    expect((perms as any).mounted).toBeTypeOf('function');

    expect(Ripple).toBeDefined();
    expect((Ripple as any).mounted).toBeTypeOf('function');
    expect((Ripple as any).unmounted).toBeTypeOf('function');
    expect((Ripple as any).updated).toBeTypeOf('function');
  });
});
