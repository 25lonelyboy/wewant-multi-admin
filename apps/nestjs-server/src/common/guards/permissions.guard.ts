import {
  Injectable,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../errors/biz.exception.js';
import type { AuthUser } from '../../modules/auth/auth-user.js';

/** 权限执行：AND 语义；admin 通配 `*:*:*` 直通 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new BizException(BizCode.UNAUTHORIZED, '未认证或凭证无效');
    }
    if (user.permissions.includes('*:*:*')) return true;
    if (required.every(p => user.permissions.includes(p))) return true;
    throw new BizException(BizCode.FORBIDDEN, '无权限访问');
  }
}
