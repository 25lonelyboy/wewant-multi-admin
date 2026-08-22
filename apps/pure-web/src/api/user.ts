import { http } from '@/utils/http';
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  UserProfile
} from '@multi-admin/contracts';

/** 个人安全日志表（mock-only 端点 /api/v1/mine-logs，后端未实现，见 backlog） */
type MineLogsTable = {
  list: Array<any>;
  total?: number;
  pageSize?: number;
  currentPage?: number;
};

/** 登录 */
export const getLogin = (data: LoginRequest) => {
  return http.request<ApiResponse<LoginResponse>>(
    'post',
    '/api/v1/auth/login',
    { data }
  );
};

/** 刷新令牌（轮换：旧 refresh 立即失效） */
export const refreshTokenApi = (data: { refreshToken: string }) => {
  return http.request<ApiResponse<RefreshResponse>>(
    'post',
    '/api/v1/auth/refresh-token',
    { data }
  );
};

/** 登出（server 失效 refresh 并拉黑 access） */
export const logoutApi = () => {
  return http.request<ApiResponse<null>>('post', '/api/v1/auth/logout');
};

/** 账户设置-个人信息 */
export const getMine = () => {
  return http.request<ApiResponse<UserProfile>>('get', '/api/v1/auth/profile');
};

/** 账户设置-个人安全日志（mock-only） */
export const getMineLogs = (data?: object) => {
  return http.request<ApiResponse<MineLogsTable>>('get', '/api/v1/mine-logs', {
    data
  });
};
