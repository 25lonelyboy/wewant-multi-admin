import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock @/utils/http（使用 vi.hoisted 确保 mock 工厂可引用变量） ──
const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@/utils/http', () => ({
  http: { request: requestMock }
}));

beforeEach(() => requestMock.mockReset());

// ── src/api/routes.ts ──
import { getAsyncRoutes } from './routes';

describe('api/routes', () => {
  it('getAsyncRoutes 调用 GET /api/v1/auth/get-async-routes', () => {
    getAsyncRoutes();
    expect(requestMock).toHaveBeenCalledWith(
      'get',
      '/api/v1/auth/get-async-routes'
    );
  });
});

// ── src/api/user.ts ──
import {
  getLogin,
  refreshTokenApi,
  logoutApi,
  getMine,
  getMineLogs
} from './user';

describe('api/user', () => {
  it('getLogin 调用 POST /api/v1/auth/login', () => {
    const data = { username: 'admin', password: '123' };
    getLogin(data as any);
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/auth/login', {
      data
    });
  });

  it('refreshTokenApi 调用 POST /api/v1/auth/refresh-token', () => {
    const data = { refreshToken: 'old-token' };
    refreshTokenApi(data);
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/auth/refresh-token',
      { data }
    );
  });

  it('logoutApi 调用 POST /api/v1/auth/logout', () => {
    logoutApi();
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/auth/logout');
  });

  it('getMine 调用 GET /api/v1/auth/profile', () => {
    getMine();
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/auth/profile');
  });

  it('getMineLogs 调用 GET /api/v1/mine-logs', () => {
    const data = { page: 1 };
    getMineLogs(data);
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/mine-logs', {
      data
    });
  });
});

// ── src/api/system.ts ──
import {
  getUserList,
  getUserDetail,
  createUser,
  updateUser,
  deleteUser,
  getUserRoleIds,
  setUserRoles,
  getAllRoles,
  getRoleList,
  getRoleDetail,
  createRole,
  updateRole,
  deleteRole,
  getRoleMenuIds,
  setRoleMenus,
  getMenuList,
  getMenuDetail,
  createMenu,
  updateMenu,
  deleteMenu,
  getDeptList,
  getOnlineLogsList,
  getLoginLogsList,
  getOperationLogsList,
  getSystemLogsList,
  getSystemLogsDetail
} from './system';

describe('api/system', () => {
  it('用户 CRUD 路径正确', () => {
    getUserList({ page: 1, pageSize: 10 });
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/users', {
      params: { page: 1, pageSize: 10 }
    });

    getUserDetail('u1');
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/users/u1');

    createUser({} as any);
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/system/users', {
      data: {}
    });

    updateUser('u1', {} as any);
    expect(requestMock).toHaveBeenCalledWith('put', '/api/v1/system/users/u1', {
      data: {}
    });

    deleteUser('u1');
    expect(requestMock).toHaveBeenCalledWith(
      'delete',
      '/api/v1/system/users/u1'
    );
  });

  it('用户角色路径正确', () => {
    getUserRoleIds('u1');
    expect(requestMock).toHaveBeenCalledWith(
      'get',
      '/api/v1/system/users/u1/roles'
    );

    setUserRoles('u1', { roleIds: ['r1'] });
    expect(requestMock).toHaveBeenCalledWith(
      'put',
      '/api/v1/system/users/u1/roles',
      { data: { roleIds: ['r1'] } }
    );
  });

  it('角色 CRUD 路径正确', () => {
    getAllRoles();
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/roles/all');

    getRoleList({ page: 1, pageSize: 10 });
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/roles', {
      params: { page: 1, pageSize: 10 }
    });

    getRoleDetail('r1');
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/roles/r1');

    createRole({} as any);
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/system/roles', {
      data: {}
    });

    updateRole('r1', {} as any);
    expect(requestMock).toHaveBeenCalledWith('put', '/api/v1/system/roles/r1', {
      data: {}
    });

    deleteRole('r1');
    expect(requestMock).toHaveBeenCalledWith(
      'delete',
      '/api/v1/system/roles/r1'
    );
  });

  it('角色菜单路径正确', () => {
    getRoleMenuIds('r1');
    expect(requestMock).toHaveBeenCalledWith(
      'get',
      '/api/v1/system/roles/r1/menus'
    );

    setRoleMenus('r1', { menuIds: ['m1'] });
    expect(requestMock).toHaveBeenCalledWith(
      'put',
      '/api/v1/system/roles/r1/menus',
      { data: { menuIds: ['m1'] } }
    );
  });

  it('菜单 CRUD 路径正确', () => {
    getMenuList();
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/menus');

    getMenuDetail('m1');
    expect(requestMock).toHaveBeenCalledWith('get', '/api/v1/system/menus/m1');

    createMenu({} as any);
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/system/menus', {
      data: {}
    });

    updateMenu('m1', {} as any);
    expect(requestMock).toHaveBeenCalledWith('put', '/api/v1/system/menus/m1', {
      data: {}
    });

    deleteMenu('m1');
    expect(requestMock).toHaveBeenCalledWith(
      'delete',
      '/api/v1/system/menus/m1'
    );
  });

  it('监控域日志路径正确', () => {
    getDeptList();
    expect(requestMock).toHaveBeenCalledWith('post', '/api/v1/system/dept', {
      data: undefined
    });

    getOnlineLogsList();
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/system/online-logs',
      { data: undefined }
    );

    getLoginLogsList();
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/system/login-logs',
      { data: undefined }
    );

    getOperationLogsList();
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/system/operation-logs',
      { data: undefined }
    );

    getSystemLogsList();
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/system/system-logs',
      { data: undefined }
    );

    getSystemLogsDetail();
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      '/api/v1/system/system-logs-detail',
      { data: undefined }
    );
  });
});

// ── src/api/mock.ts ──
import { formUpload } from './mock';

describe('api/mock', () => {
  it('formUpload 调用 POST 外部 URL 且设置 multipart/form-data', () => {
    const fd = new FormData();
    formUpload(fd);
    expect(requestMock).toHaveBeenCalledWith(
      'post',
      'https://pureadmin.free.beeceptor.com/images',
      { data: fd },
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });
});
