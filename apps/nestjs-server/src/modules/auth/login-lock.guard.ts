import {
  Injectable,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../../common/errors/biz.exception.js';
import { LoginLockService } from './login-lock.service.js';

/**
 * 登录锁定前置检查：位于 LocalAuthGuard 之前，锁定账号直接拒绝，
 * 不进入 argon2 计算。读不到 username 则跳过检查（ValidationPipe
 * 已在上游拒绝非法请求体，此为防御性兜底）。
 */
@Injectable()
export class LoginLockGuard implements CanActivate {
  constructor(private readonly lock: LoginLockService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const body = context
      .switchToHttp()
      .getRequest<{ body?: { username?: string } }>().body;
    const username = body?.username;
    if (!username) return true;
    if (!(await this.lock.isLocked(username))) return true;
    const remaining = await this.lock.lockRemainingSeconds(username);
    const minutes = Math.max(1, Math.ceil(remaining / 60));
    throw new BizException(
      BizCode.LOGIN_ACCOUNT_LOCKED,
      `账号已锁定，请在 ${minutes} 分钟后重试`
    );
  }
}
