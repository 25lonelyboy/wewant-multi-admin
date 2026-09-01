import { describe, it, expect } from 'vitest';

// ── 验证 defineFakeRoute 可在 vitest node 环境导入 ──
describe('mock/defineFakeRoute 导入', () => {
  it('vite-plugin-fake-server/client 可正常导入 defineFakeRoute', async () => {
    const mod = await import('vite-plugin-fake-server/client');
    expect(typeof mod.defineFakeRoute).toBe('function');
  });
});

// ── mock/asyncRoutes.ts ──
import asyncRoutesDefault from './asyncRoutes';
const asyncRoutes = asyncRoutesDefault as any[];

describe('mock/asyncRoutes', () => {
  it('导出为数组且包含 get-async-routes 路由', () => {
    expect(Array.isArray(asyncRoutes)).toBe(true);
    const route = asyncRoutes[0];
    expect(route.url).toBe('/api/v1/auth/get-async-routes');
    expect(route.method).toBe('get');
    expect(typeof route.response).toBe('function');
  });

  it('response 返回 ApiResponse<AsyncRouteNode[]> 形状', () => {
    const res = asyncRoutes[0].response();
    expect(res.code).toBe(0);
    expect(res.message).toBe('操作成功');
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(2);
    // 第一个是 system 路由
    expect(res.data[0].path).toBe('/system');
    expect(res.data[0].children.length).toBeGreaterThanOrEqual(4);
    // 第二个是 monitor 路由
    expect(res.data[1].path).toBe('/monitor');
  });
});

// ── mock/login.ts ──
import loginDefault from './login';
const login = loginDefault as any[];

describe('mock/login', () => {
  it('导出为数组且包含 login 路由', () => {
    expect(Array.isArray(login)).toBe(true);
    const route = login[0];
    expect(route.url).toBe('/api/v1/auth/login');
    expect(route.method).toBe('post');
  });

  it('admin 用户登录返回正确信封', () => {
    const res = login[0].response({
      body: { username: 'admin' }
    });
    expect(res.code).toBe(0);
    expect(res.data.username).toBe('admin');
    expect(res.data.roles).toEqual(['admin']);
    expect(res.data.permissions).toEqual(['*:*:*']);
    expect(typeof res.data.accessToken).toBe('string');
    expect(typeof res.data.refreshToken).toBe('string');
    expect(typeof res.data.expires).toBe('number');
  });

  it('非 admin 用户返回 common 角色', () => {
    const res = login[0].response({
      body: { username: 'other' }
    });
    expect(res.data.username).toBe('common');
    expect(res.data.roles).toEqual(['common']);
  });
});

// ── mock/mine.ts ──
import mineDefault from './mine';
const mine = mineDefault as any[];

describe('mock/mine', () => {
  it('包含 profile 和 mine-logs 两个路由', () => {
    expect(mine.length).toBe(2);
    expect(mine[0].url).toBe('/api/v1/auth/profile');
    expect(mine[1].url).toBe('/api/v1/mine-logs');
  });

  it('profile 返回符合 UserProfile 形状', () => {
    const res = mine[0].response();
    expect(res.code).toBe(0);
    expect(res.data.username).toBe('admin');
    expect(typeof res.data.email).toBe('string');
    expect(typeof res.data.phone).toBe('string');
  });

  it('mine-logs 返回分页列表', () => {
    const res = mine[1].response();
    expect(res.code).toBe(0);
    expect(Array.isArray(res.data.list)).toBe(true);
    expect(res.data.total).toBe(2);
    expect(res.data.pageSize).toBe(10);
    expect(res.data.currentPage).toBe(1);
  });
});

// ── mock/refreshToken.ts ──
import refreshTokenDefault from './refreshToken';
const refreshToken = refreshTokenDefault as any[];

describe('mock/refreshToken', () => {
  it('有效 refreshToken 返回新 token', () => {
    const res = refreshToken[0].response({
      body: { refreshToken: 'valid-token' }
    });
    expect(res.code).toBe(0);
    expect(typeof res.data.accessToken).toBe('string');
    expect(typeof res.data.refreshToken).toBe('string');
    expect(typeof res.data.expires).toBe('number');
  });

  it('无效 refreshToken 返回错误码', () => {
    const res = refreshToken[0].response({
      body: {}
    });
    expect(res.code).not.toBe(0);
    expect(res.data).toBeNull();
  });
});

// ── mock/system.ts ──
import systemDefault from './system';
const system = systemDefault as any[];

describe('mock/system', () => {
  it('导出为非空数组', () => {
    expect(Array.isArray(system)).toBe(true);
    expect(system.length).toBeGreaterThan(10);
  });

  it('用户列表 GET /api/v1/system/users 返回分页数据', () => {
    const userRoute = system.find(
      (r: any) => r.url === '/api/v1/system/users' && r.method === 'get'
    );
    expect(userRoute).toBeDefined();
    const res = userRoute.response({ query: {}, params: {} });
    expect(res.code).toBe(0);
    expect(res.data.items.length).toBeGreaterThan(0);
    expect(res.data.total).toBeGreaterThan(0);
    expect(res.data.page).toBe(1);
  });

  it('用户列表支持 username 和 status 过滤', () => {
    const userRoute = system.find(
      (r: any) => r.url === '/api/v1/system/users' && r.method === 'get'
    );
    const res = userRoute.response({
      query: { username: 'admin', status: 'ACTIVE' },
      params: {}
    });
    expect(res.data.items.every((u: any) => u.username.includes('admin'))).toBe(
      true
    );
    expect(res.data.items.every((u: any) => u.status === 'ACTIVE')).toBe(true);
  });

  it('角色列表 GET /api/v1/system/roles 返回分页数据', () => {
    const roleRoute = system.find(
      (r: any) => r.url === '/api/v1/system/roles' && r.method === 'get'
    );
    expect(roleRoute).toBeDefined();
    const res = roleRoute.response({ query: {}, params: {} });
    expect(res.code).toBe(0);
    expect(res.data.items.length).toBeGreaterThan(0);
  });

  it('角色列表支持 name/code/status 过滤', () => {
    const roleRoute = system.find(
      (r: any) => r.url === '/api/v1/system/roles' && r.method === 'get'
    );
    const res = roleRoute.response({
      query: { name: '超级', code: 'admin', status: 'ACTIVE' },
      params: {}
    });
    expect(res.data.items.length).toBe(1);
    expect(res.data.items[0].code).toBe('admin');
  });

  it('菜单树 GET /api/v1/system/menus 返回树形数据', () => {
    const menuRoute = system.find(
      (r: any) => r.url === '/api/v1/system/menus' && r.method === 'get'
    );
    expect(menuRoute).toBeDefined();
    const res = menuRoute.response();
    expect(res.code).toBe(0);
    expect(Array.isArray(res.data)).toBe(true);
    // 根节点应有 children 数组
    expect(res.data[0].children).toBeDefined();
  });

  it('用户详情 GET /api/v1/system/users/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/users/:id' && r.method === 'get'
    );
    expect(route).toBeDefined();
    // 存在的用户
    const res = route.response({
      params: { id: 'user-mock-admin' },
      query: {}
    });
    expect(res.code).toBe(0);
    expect(res.data.username).toBe('admin');
    // 不存在的用户
    const res404 = route.response({ params: { id: 'nonexistent' }, query: {} });
    expect(res404.code).not.toBe(0);
  });

  it('用户新增 POST /api/v1/system/users', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/users' && r.method === 'post'
    );
    expect(route).toBeDefined();
    const res = route.response({ body: { username: 'new' } });
    expect(res.data.id).toBe('user-mock-created');
  });

  it('用户删除 DELETE /api/v1/system/users/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/users/:id' && r.method === 'delete'
    );
    expect(route).toBeDefined();
    const res = route.response({ params: { id: 'u1' } });
    expect(res.code).toBe(0);
  });

  it('角色详情 GET /api/v1/system/roles/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles/:id' && r.method === 'get'
    );
    const res = route.response({ params: { id: 'role-mock-admin' } });
    expect(res.code).toBe(0);
    expect(res.data.name).toBe('超级管理员');
  });

  it('角色菜单列表 GET /api/v1/system/roles/:id/menus', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/roles/:id/menus' && r.method === 'get'
    );
    const res = route.response({ params: { id: 'role-mock-admin' } });
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
  });

  it('部门列表 POST /api/v1/system/dept', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/dept' && r.method === 'post'
    );
    const res = route.response();
    expect(res.code).toBe(0);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('在线用户 POST /api/v1/system/online-logs', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/online-logs' && r.method === 'post'
    );
    const res = route.response({ body: { username: '' } });
    expect(res.data.list.length).toBeGreaterThan(0);
  });

  it('登录日志 POST /api/v1/system/login-logs', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/login-logs' && r.method === 'post'
    );
    const res = route.response({ body: { username: '', status: '' } });
    expect(res.data.list.length).toBeGreaterThan(0);
  });

  it('操作日志 POST /api/v1/system/operation-logs', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/operation-logs' && r.method === 'post'
    );
    const res = route.response({ body: { module: '', status: '' } });
    expect(res.data.list.length).toBeGreaterThan(0);
  });

  it('系统日志 POST /api/v1/system/system-logs', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/system-logs' && r.method === 'post'
    );
    const res = route.response({ body: { module: '' } });
    expect(res.data.list.length).toBeGreaterThan(0);
  });

  it('系统日志详情 POST /api/v1/system/system-logs-detail', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/system-logs-detail' && r.method === 'post'
    );
    const res1 = route.response({ body: { id: 1 } });
    expect(res1.id).toBe(1);
    const res2 = route.response({ body: { id: 2 } });
    expect(res2.id).toBe(2);
    const res3 = route.response({ body: { id: 99 } });
    expect(res3.code).not.toBe(0);
  });

  it('用户编辑 PUT /api/v1/system/users/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/users/:id' && r.method === 'put'
    );
    expect(route).toBeDefined();
    const res = route.response({
      params: { id: 'u1' },
      body: { username: 'updated' }
    });
    expect(res.data.id).toBe('u1');
  });

  it('用户角色分配 PUT /api/v1/system/users/:id/roles', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/users/:id/roles' && r.method === 'put'
    );
    const res = route.response({ body: { roleIds: ['r1', 'r2'] } });
    expect(res.data).toEqual(['r1', 'r2']);
  });

  it('用户角色查询 GET /api/v1/system/users/:id/roles', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/users/:id/roles' && r.method === 'get'
    );
    const resAdmin = route.response({ params: { id: 'user-mock-admin' } });
    expect(resAdmin.data).toEqual(['role-mock-admin']);
    const resCommon = route.response({ params: { id: 'other' } });
    expect(resCommon.data).toEqual(['role-mock-common']);
  });

  it('角色新增 POST /api/v1/system/roles', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles' && r.method === 'post'
    );
    const res = route.response({ body: { name: 'new' } });
    expect(res.data.id).toBe('role-mock-created');
  });

  it('角色编辑 PUT /api/v1/system/roles/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles/:id' && r.method === 'put'
    );
    const res = route.response({
      params: { id: 'r1' },
      body: { name: 'updated' }
    });
    expect(res.data.id).toBe('r1');
  });

  it('角色删除 DELETE /api/v1/system/roles/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles/:id' && r.method === 'delete'
    );
    const res = route.response({ params: { id: 'r1' } });
    expect(res.code).toBe(0);
  });

  it('角色菜单不存在时返回 404', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles/:id' && r.method === 'get'
    );
    const res = route.response({ params: { id: 'nonexistent' } });
    expect(res.code).not.toBe(0);
  });

  it('角色菜单分配 PUT /api/v1/system/roles/:id/menus', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/roles/:id/menus' && r.method === 'put'
    );
    const res = route.response({ body: { menuIds: ['m1'] } });
    expect(res.data).toEqual(['m1']);
    const resEmpty = route.response({ body: {} });
    expect(resEmpty.data).toEqual([]);
  });

  it('菜单详情 GET /api/v1/system/menus/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/menus/:id' && r.method === 'get'
    );
    const res = route.response({ params: { id: 'menu-system' } });
    expect(res.code).toBe(0);
    expect(res.data.title).toBe('menus.pureSystem');
    const res404 = route.response({ params: { id: 'nonexistent' } });
    expect(res404.code).not.toBe(0);
  });

  it('菜单新增 POST /api/v1/system/menus', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/menus' && r.method === 'post'
    );
    const res = route.response({ body: { title: 'new' } });
    expect(res.data.id).toBe('menu-mock-created');
  });

  it('菜单编辑 PUT /api/v1/system/menus/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/menus/:id' && r.method === 'put'
    );
    const res = route.response({
      params: { id: 'm1' },
      body: { title: 'updated' }
    });
    expect(res.data.id).toBe('m1');
  });

  it('菜单删除 DELETE /api/v1/system/menus/:id', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/menus/:id' && r.method === 'delete'
    );
    const res = route.response({ params: { id: 'm1' } });
    expect(res.code).toBe(0);
  });

  it('在线用户支持 username 过滤', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/online-logs' && r.method === 'post'
    );
    const res = route.response({ body: { username: 'admin' } });
    expect(res.data.list.every((u: any) => u.username.includes('admin'))).toBe(
      true
    );
  });

  it('登录日志支持 username 和 status 过滤', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/login-logs' && r.method === 'post'
    );
    const res = route.response({ body: { username: 'admin', status: '1' } });
    expect(res.data.list.every((u: any) => u.username.includes('admin'))).toBe(
      true
    );
  });

  it('操作日志支持 module 和 status 过滤', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/operation-logs' && r.method === 'post'
    );
    const res = route.response({ body: { module: '系统管理', status: '1' } });
    expect(res.data.list.every((u: any) => u.module.includes('系统管理'))).toBe(
      true
    );
  });

  it('系统日志支持 module 过滤', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/system-logs' && r.method === 'post'
    );
    const res = route.response({ body: { module: '菜单管理' } });
    expect(res.data.list.every((u: any) => u.module.includes('菜单管理'))).toBe(
      true
    );
  });

  it('全部角色 GET /api/v1/system/roles/all', () => {
    const route = system.find(
      (r: any) => r.url === '/api/v1/system/roles/all' && r.method === 'get'
    );
    const res = route.response();
    expect(res.code).toBe(0);
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBe(2);
  });

  it('角色菜单列表普通角色返回过滤后的数据', () => {
    const route = system.find(
      (r: any) =>
        r.url === '/api/v1/system/roles/:id/menus' && r.method === 'get'
    );
    const res = route.response({ params: { id: 'role-mock-common' } });
    expect(Array.isArray(res.data)).toBe(true);
    expect(res.data.length).toBeLessThan(20);
  });
});
