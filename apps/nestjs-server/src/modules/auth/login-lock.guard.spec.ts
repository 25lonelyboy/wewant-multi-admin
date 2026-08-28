import type { ExecutionContext } from '@nestjs/common';
import { LoginLockGuard } from './login-lock.guard.js';
import type { LoginLockService } from './login-lock.service.js';

const contextOf = (body: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ body }) })
  }) as unknown as ExecutionContext;

describe('LoginLockGuard', () => {
  let lock: { isLocked: jest.Mock; lockRemainingSeconds: jest.Mock };
  let guard: LoginLockGuard;

  beforeEach(() => {
    lock = {
      isLocked: jest.fn().mockResolvedValue(false),
      lockRemainingSeconds: jest.fn().mockResolvedValue(0)
    };
    guard = new LoginLockGuard(lock as unknown as LoginLockService);
  });

  it('未锁定 → 放行', async () => {
    await expect(
      guard.canActivate(contextOf({ username: 'admin' }))
    ).resolves.toBe(true);
    expect(lock.isLocked).toHaveBeenCalledWith('admin');
  });

  it('锁定中 → 42301，剩余分钟向上取整', async () => {
    lock.isLocked.mockResolvedValue(true);
    lock.lockRemainingSeconds.mockResolvedValue(121);
    await expect(
      guard.canActivate(contextOf({ username: 'admin' }))
    ).rejects.toMatchObject({
      code: 42301,
      message: '账号已锁定，请在 3 分钟后重试'
    });
  });

  it('缺 username → 跳过检查放行（防御性兜底）', async () => {
    await expect(guard.canActivate(contextOf({}))).resolves.toBe(true);
    expect(lock.isLocked).not.toHaveBeenCalled();
  });
});
