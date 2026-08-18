import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  override handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err instanceof BizException) throw err;
    if (err || !user) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户名或密码错误');
    }
    return user;
  }
}
