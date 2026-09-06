import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { RouteRecordRaw } from 'vue-router';

// ── mock 面（vi.mock 工厂被提升，先于 import 执行）──
// 1. 阻断 @/plugins/i18n 的 import.meta.glob YAML 加载
vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => m,
  $t: (k: string) => k,
  i18n: { global: { t: (m: string) => m, locale: { value: 'zh-CN' } } },
  useI18n: vi.fn(),
  localesConfigs: { zh: {}, en: {} }
}));
// 2. 阻断 @/router/index.ts 的 import-time createRouter + glob 模块加载
vi.mock('@/router', () => {
  const rootRoute: { path: string; children: RouteRecordRaw[] } = {
    path: '/',
    children: [
      {
        path: '/system/user',
        name: 'SystemUser',
        meta: {
          title: 'User Management',
          parentId: undefined,
          backstage: true
        },
        children: [
          {
            path: '/system/user/list',
            name: 'SystemUserList',
            meta: { title: 'User List' }
          }
        ]
      } as any
    ]
  };
  return {
    router: {
      hasRoute: vi.fn(() => false),
      addRoute: vi.fn(),
      getRoutes: vi.fn(() => [rootRoute]),
      currentRoute: { value: { meta: {} as Record<string, unknown> } },
      options: { routes: [rootRoute] }
    }
  };
});
// 3. 阻断 @/api/routes → @/utils/http 链
vi.mock('@/api/routes', () => ({
  getAsyncRoutes: vi.fn(() => Promise.resolve({ code: 0, data: [] }))
}));
// 4. pinia store 钩子
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({
    wholeMenus: [],
    flatteningRoutes: [],
    handleWholeMenus: vi.fn(),
    cacheOperate: vi.fn(),
    clearAllCachePage: vi.fn()
  })
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({
    getMultiTagsCache: false,
    handleTags: vi.fn()
  })
}));
// 5. vue-router 历史工厂
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    createWebHashHistory: vi.fn((base: string) => ({ base, type: 'hash' })),
    createWebHistory: vi.fn((base: string) => ({ base, type: 'h5' }))
  };
});

import { permissionGuard } from './guards';
import { userKey, multipleTabsKey } from '@/utils/auth';

const makeRoute = (over = {}) =>
  ({
    path: '/x',
    fullPath: '/x',
    name: 'X',
    meta: {},
    matched: [],
    ...over
  }) as any;

const makeCtx = (over = {}) => ({ router: { push: vi.fn() }, ...over }) as any;

function loginAsAdmin() {
  localStorage.setItem(
    userKey,
    JSON.stringify({
      username: 'admin',
      roles: ['admin'],
      expires: Date.now() + 1000 * 60 * 60
    })
  );
  document.cookie = `${multipleTabsKey}=1`;
}

describe('permissionGuard 访问控制', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.cookie = `${multipleTabsKey}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('未登录访问非白名单 → 重定向 /login', () => {
    const r = permissionGuard(
      makeRoute({ path: '/welcome', fullPath: '/welcome' }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toEqual({ path: '/login' });
  });

  it('未登录访问白名单 /login → 放行 true', () => {
    const r = permissionGuard(
      makeRoute({ path: '/login', fullPath: '/login' }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toBe(true);
  });

  it('已登录访问白名单 → 返回 from.fullPath', () => {
    loginAsAdmin();
    const from = makeRoute({ fullPath: '/welcome' });
    const r = permissionGuard(
      makeRoute({ path: '/login', fullPath: '/login' }),
      from,
      makeCtx()
    );
    expect(r).toBe('/welcome');
  });

  it('已登录访问 roles 不符路由 → 重定向 /error/403', () => {
    loginAsAdmin();
    const r = permissionGuard(
      makeRoute({ meta: { roles: ['super'] } }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toEqual({ path: '/error/403' });
  });

  it('externalLink 路由 → openLink + 返回 false（阻断）', () => {
    loginAsAdmin();
    const to = makeRoute({ name: 'https://example.com' });
    const r = permissionGuard(to, makeRoute({ name: 'Home' }), makeCtx());
    expect(r).toBe(false);
  });

  it('已登录刷新且菜单未加载 → initRouter 路径（router.push 被调用）', () => {
    loginAsAdmin();
    const ctx = makeCtx();
    const r = permissionGuard(
      makeRoute({ path: '/system/user', fullPath: '/system/user' }),
      makeRoute({ name: undefined }),
      ctx
    );
    expect(r).toBeUndefined();
  });

  it('VITE_HIDE_HOME=true 访问 /welcome → 重定向 /error/404', () => {
    vi.stubEnv('VITE_HIDE_HOME', 'true');
    loginAsAdmin();
    const r = permissionGuard(
      makeRoute({ path: '/welcome', fullPath: '/welcome' }),
      makeRoute(),
      makeCtx()
    );
    expect(r).toEqual({ path: '/error/404' });
    vi.unstubAllEnvs();
  });

  it('已登录刷新 → initRouter 回调执行标签处理与 router.push', async () => {
    loginAsAdmin();
    const ctx = makeCtx();
    permissionGuard(
      makeRoute({
        path: '/system/user',
        fullPath: '/system/user',
        name: undefined
      }),
      makeRoute({ name: undefined }),
      ctx
    );
    // 等待 initRouter().then(...) 异步回调完成
    await new Promise(r => setTimeout(r, 50));
    expect(ctx.router.push).toHaveBeenCalledWith('/system/user');
  });
});
