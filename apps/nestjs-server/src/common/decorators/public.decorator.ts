import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记路由免 JWT 认证（login/refresh-token/health） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
