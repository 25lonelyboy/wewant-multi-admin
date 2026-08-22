// 登录（契约同形：信封 + LoginResponse；expires 为毫秒时间戳，与直连态 token.service 一致）
import { defineFakeRoute } from 'vite-plugin-fake-server/client';
import type { ApiResponse, LoginResponse } from '@multi-admin/contracts';

// access 有效期 2 小时（与 server JWT_ACCESS_TTL 默认值同口径）
const expires = Date.now() + 2 * 60 * 60 * 1000;

export default defineFakeRoute([
  {
    url: '/api/v1/auth/login',
    method: 'post',
    response: ({ body }) => {
      if (body.username === 'admin') {
        return {
          code: 0,
          message: '操作成功',
          data: {
            avatar: null,
            username: 'admin',
            nickname: '小铭',
            roles: ['admin'],
            permissions: ['*:*:*'],
            accessToken: 'eyJhbGciOiJIUzUxMiJ9.admin',
            refreshToken: 'eyJhbGciOiJIUzUxMiJ9.adminRefresh',
            expires
          } satisfies LoginResponse
        } satisfies ApiResponse<LoginResponse>;
      } else {
        return {
          code: 0,
          message: '操作成功',
          data: {
            avatar: null,
            username: 'common',
            nickname: '小林',
            roles: ['common'],
            permissions: ['permission:btn:add', 'permission:btn:edit'],
            accessToken: 'eyJhbGciOiJIUzUxMiJ9.common',
            refreshToken: 'eyJhbGciOiJIUzUxMiJ9.commonRefresh',
            expires
          } satisfies LoginResponse
        } satisfies ApiResponse<LoginResponse>;
      }
    }
  }
]);
