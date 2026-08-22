import { defineFakeRoute } from 'vite-plugin-fake-server/client';
import { BizCode } from '@multi-admin/contracts';
import type { ApiResponse, RefreshResponse } from '@multi-admin/contracts';

// 模拟刷新token接口（契约同形：RefreshResponse，对外不含 sid）
export default defineFakeRoute([
  {
    url: '/api/v1/auth/refresh-token',
    method: 'post',
    response: ({ body }) => {
      if (body.refreshToken) {
        return {
          code: BizCode.SUCCESS,
          message: '操作成功',
          data: {
            accessToken: 'eyJhbGciOiJIUzUxMiJ9.newAdmin',
            refreshToken: 'eyJhbGciOiJIUzUxMiJ9.newAdminRefresh',
            // 毫秒时间戳（每次刷新递增，与直连态一致）
            expires: Date.now() + 2 * 60 * 60 * 1000
          } satisfies RefreshResponse
        } satisfies ApiResponse<RefreshResponse>;
      } else {
        return {
          code: BizCode.REFRESH_TOKEN_INVALID,
          message: 'refreshToken 无效',
          data: null
        } satisfies ApiResponse<null>;
      }
    }
  }
]);
