import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err instanceof BizException) throw err;
    // 不直接 import jsonwebtoken（幻影依赖）：按错误名识别过期
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw new BizException(
        BizCode.ACCESS_TOKEN_EXPIRED,
        'accessToken 已过期'
      );
    }
    if (err || !user) {
      throw new BizException(BizCode.UNAUTHORIZED, '未认证或凭证无效');
    }
    return user;
  }
}
