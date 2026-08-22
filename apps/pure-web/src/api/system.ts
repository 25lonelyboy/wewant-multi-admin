import { http } from '@/utils/http';
import type {
  ApiResponse,
  AssignRoleMenusRequest,
  CreateMenuRequest,
  CreateRoleRequest,
  CreateUserRequest,
  EntityId,
  MenuVO,
  PageResult,
  RoleOption,
  RoleQuery,
  RoleVO,
  SetUserRolesRequest,
  UpdateMenuRequest,
  UpdateRoleRequest,
  UpdateUserRequest,
  UserQuery,
  UserVO
} from '@multi-admin/contracts';

/**
 * 过渡性旧分页形状（list/total/pageSize/currentPage）。
 * 仅监控域 mock-only 端点使用；决策 #2：后端实现监控域后迁 PageResult。
 */
type LegacyTable = {
  list: Array<any>;
  total?: number;
  pageSize?: number;
  currentPage?: number;
};

// ===== user 域 =====

/** 用户列表（GET query 分页） */
export const getUserList = (params: UserQuery) => {
  return http.request<ApiResponse<PageResult<UserVO>>>(
    'get',
    '/api/v1/system/users',
    { params }
  );
};

/** 用户详情 */
export const getUserDetail = (id: EntityId) => {
  return http.request<ApiResponse<UserVO>>('get', `/api/v1/system/users/${id}`);
};

/** 新增用户 */
export const createUser = (data: CreateUserRequest) => {
  return http.request<ApiResponse<UserVO>>('post', '/api/v1/system/users', {
    data
  });
};

/** 编辑用户（护栏：不含 username） */
export const updateUser = (id: EntityId, data: UpdateUserRequest) => {
  return http.request<ApiResponse<UserVO>>(
    'put',
    `/api/v1/system/users/${id}`,
    { data }
  );
};

/** 删除用户（软删） */
export const deleteUser = (id: EntityId) => {
  return http.request<ApiResponse<null>>(
    'delete',
    `/api/v1/system/users/${id}`
  );
};

/** 查用户角色 id 列表 */
export const getUserRoleIds = (id: EntityId) => {
  return http.request<ApiResponse<EntityId[]>>(
    'get',
    `/api/v1/system/users/${id}/roles`
  );
};

/** 分配用户角色 */
export const setUserRoles = (id: EntityId, data: SetUserRolesRequest) => {
  return http.request<ApiResponse<EntityId[]>>(
    'put',
    `/api/v1/system/users/${id}/roles`,
    { data }
  );
};

// ===== role 域 =====

/** 全部角色（不分页；用户页下拉选项） */
export const getAllRoles = () => {
  return http.request<ApiResponse<RoleOption[]>>(
    'get',
    '/api/v1/system/roles/all'
  );
};

/** 角色列表（GET query 分页） */
export const getRoleList = (params: RoleQuery) => {
  return http.request<ApiResponse<PageResult<RoleVO>>>(
    'get',
    '/api/v1/system/roles',
    { params }
  );
};

/** 角色详情 */
export const getRoleDetail = (id: EntityId) => {
  return http.request<ApiResponse<RoleVO>>('get', `/api/v1/system/roles/${id}`);
};

/** 新增角色 */
export const createRole = (data: CreateRoleRequest) => {
  return http.request<ApiResponse<RoleVO>>('post', '/api/v1/system/roles', {
    data
  });
};

/** 编辑角色（护栏：不含 code） */
export const updateRole = (id: EntityId, data: UpdateRoleRequest) => {
  return http.request<ApiResponse<RoleVO>>(
    'put',
    `/api/v1/system/roles/${id}`,
    { data }
  );
};

/** 删除角色（软删） */
export const deleteRole = (id: EntityId) => {
  return http.request<ApiResponse<null>>(
    'delete',
    `/api/v1/system/roles/${id}`
  );
};

/** 查角色菜单 id 列表 */
export const getRoleMenuIds = (id: EntityId) => {
  return http.request<ApiResponse<EntityId[]>>(
    'get',
    `/api/v1/system/roles/${id}/menus`
  );
};

/** 分配角色菜单权限 */
export const setRoleMenus = (id: EntityId, data: AssignRoleMenusRequest) => {
  return http.request<ApiResponse<EntityId[]>>(
    'put',
    `/api/v1/system/roles/${id}/menus`,
    { data }
  );
};

// ===== menu 域 =====

/** 菜单全量树（不分页） */
export const getMenuList = () => {
  return http.request<ApiResponse<MenuVO[]>>('get', '/api/v1/system/menus');
};

/** 菜单详情（单行不带 children） */
export const getMenuDetail = (id: EntityId) => {
  return http.request<ApiResponse<Omit<MenuVO, 'children'>>>(
    'get',
    `/api/v1/system/menus/${id}`
  );
};

/** 新增菜单（服务端返回裸 Menu 行，不带 children） */
export const createMenu = (data: CreateMenuRequest) => {
  return http.request<ApiResponse<Omit<MenuVO, 'children'>>>(
    'post',
    '/api/v1/system/menus',
    { data }
  );
};

/** 编辑菜单（同上，不带 children） */
export const updateMenu = (id: EntityId, data: UpdateMenuRequest) => {
  return http.request<ApiResponse<Omit<MenuVO, 'children'>>>(
    'put',
    `/api/v1/system/menus/${id}`,
    { data }
  );
};

/** 删除菜单（软删） */
export const deleteMenu = (id: EntityId) => {
  return http.request<ApiResponse<null>>(
    'delete',
    `/api/v1/system/menus/${id}`
  );
};

// ===== dept 域（mock-only：后端未实现，前端 try/catch 降级） =====

/** 部门列表（直连态 404 → 前端树降级为空） */
export const getDeptList = (data?: object) => {
  return http.request<ApiResponse<Array<any>>>('post', '/api/v1/system/dept', {
    data
  });
};

// ===== 监控域（mock-only：旧形状，决策 #2） =====

/** 系统监控-在线用户 */
export const getOnlineLogsList = (data?: object) => {
  return http.request<ApiResponse<LegacyTable>>(
    'post',
    '/api/v1/system/online-logs',
    { data }
  );
};

/** 系统监控-登录日志 */
export const getLoginLogsList = (data?: object) => {
  return http.request<ApiResponse<LegacyTable>>(
    'post',
    '/api/v1/system/login-logs',
    { data }
  );
};

/** 系统监控-操作日志 */
export const getOperationLogsList = (data?: object) => {
  return http.request<ApiResponse<LegacyTable>>(
    'post',
    '/api/v1/system/operation-logs',
    { data }
  );
};

/** 系统监控-系统日志 */
export const getSystemLogsList = (data?: object) => {
  return http.request<ApiResponse<LegacyTable>>(
    'post',
    '/api/v1/system/system-logs',
    { data }
  );
};

/** 系统监控-系统日志详情 */
export const getSystemLogsDetail = (data?: object) => {
  return http.request<ApiResponse<Array<any>>>(
    'post',
    '/api/v1/system/system-logs-detail',
    { data }
  );
};
