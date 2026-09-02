import { describe, it, expect, vi } from 'vitest';

// mock i18n 以避免 YAML 加载问题
vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (msg: string) => msg
}));

// ── src/router/enums.ts ──
import { home, components, error, system, monitor } from './enums';

describe('router/enums', () => {
  it('home 为 0（平台规定只有 home 路由 rank 才能为 0）', () => {
    expect(home).toBe(0);
  });

  it('各枚举值为递增数字', () => {
    expect(typeof components).toBe('number');
    expect(typeof error).toBe('number');
    expect(typeof system).toBe('number');
    expect(typeof monitor).toBe('number');
    expect(components).toBeLessThan(error);
    expect(error).toBeLessThan(system);
    expect(system).toBeLessThan(monitor);
  });
});

// ── src/router/modules/home.ts ──
import homeRoute from './modules/home';

describe('router/modules/home', () => {
  it('path 为 / 且 redirect 到 /welcome', () => {
    expect(homeRoute.path).toBe('/');
    expect(homeRoute.redirect).toBe('/welcome');
    expect(homeRoute.name).toBe('Home');
  });

  it('meta 包含 icon、title、rank', () => {
    expect(homeRoute.meta?.icon).toBe('ep/home-filled');
    expect(homeRoute.meta?.title).toBeDefined();
    expect(homeRoute.meta?.rank).toBe(home);
  });

  it('children 包含 /welcome 子路由', () => {
    expect(homeRoute.children).toBeDefined();
    expect(homeRoute.children!.length).toBe(1);
    expect(homeRoute.children![0].path).toBe('/welcome');
    expect(homeRoute.children![0].name).toBe('Welcome');
  });

  it('component 是函数（懒加载）', () => {
    expect(typeof homeRoute.component).toBe('function');
    expect(typeof homeRoute.children![0].component).toBe('function');
  });
});

// ── src/router/modules/remaining.ts ──
import remainingRoutes from './modules/remaining';

describe('router/modules/remaining', () => {
  it('导出为数组且包含 login 路由', () => {
    expect(Array.isArray(remainingRoutes)).toBe(true);
    const login = remainingRoutes.find(r => r.name === 'Login');
    expect(login).toBeDefined();
    expect(login!.path).toBe('/login');
  });

  it('包含错误页面路由（403/500）', () => {
    const denied = remainingRoutes.find(r => r.name === 'AccessDenied');
    expect(denied).toBeDefined();
    expect(denied!.path).toBe('/access-denied');

    const error = remainingRoutes.find(r => r.name === 'ServerError');
    expect(error).toBeDefined();
    expect(error!.path).toBe('/server-error');
  });

  it('包含 redirect 路由（含子路由）', () => {
    const redirect = remainingRoutes.find(r => r.path === '/redirect');
    expect(redirect).toBeDefined();
    expect(redirect!.children).toBeDefined();
    expect(redirect!.children!.length).toBeGreaterThan(0);
  });

  it('所有路由 showLink 为 false', () => {
    remainingRoutes.forEach(route => {
      expect(route.meta?.showLink).toBe(false);
    });
  });

  it('所有路由 component 是函数（懒加载）', () => {
    const routesWithComponent = remainingRoutes.filter(r => r.component);
    expect(routesWithComponent.length).toBeGreaterThan(0);
    routesWithComponent.forEach(route => {
      expect(typeof route.component).toBe('function');
    });
  });

  it('包含 account-settings 和 empty 路由', () => {
    const account = remainingRoutes.find(r => r.name === 'AccountSettings');
    expect(account).toBeDefined();
    expect(account!.path).toBe('/account-settings');

    const empty = remainingRoutes.find(r => r.name === 'Empty');
    expect(empty).toBeDefined();
    expect(empty!.path).toBe('/empty');
  });
});
