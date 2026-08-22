import { http } from '@/utils/http';
import type { ApiResponse, AsyncRouteNode } from '@multi-admin/contracts';

/** 获取动态路由 */
export const getAsyncRoutes = () => {
  return http.request<ApiResponse<AsyncRouteNode[]>>(
    'get',
    '/api/v1/auth/get-async-routes'
  );
};
