import type { Redis } from 'ioredis';
import {
  LoginLockService,
  LOGIN_FAIL_KEY_PREFIX,
  LOGIN_LOCK_KEY_PREFIX
} from './login-lock.service.js';

describe('LoginLockService', () => {
  let redis: {
    exists: jest.Mock;
    ttl: jest.Mock;
    eval: jest.Mock;
    del: jest.Mock;
  };
  let service: LoginLockService;

  beforeEach(() => {
    redis = {
      exists: jest.fn(),
      ttl: jest.fn(),
      eval: jest.fn(),
      del: jest.fn().mockResolvedValue(1)
    };
    service = new LoginLockService(redis as unknown as Redis);
  });

  it('isLocked：EXISTS 锁定键', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(service.isLocked('admin')).resolves.toBe(true);
    expect(redis.exists).toHaveBeenCalledWith(LOGIN_LOCK_KEY_PREFIX + 'admin');
    redis.exists.mockResolvedValue(0);
    await expect(service.isLocked('admin')).resolves.toBe(false);
  });

  it('lockRemainingSeconds：TTL>0 返回剩余秒；键不存在（-2/-1）返回 0', async () => {
    redis.ttl.mockResolvedValue(121);
    await expect(service.lockRemainingSeconds('admin')).resolves.toBe(121);
    redis.ttl.mockResolvedValue(-2);
    await expect(service.lockRemainingSeconds('admin')).resolves.toBe(0);
  });

  it('recordFailure：Lua 入参为两键 + 窗口/阈值/锁定时长；达阈返回 true', async () => {
    redis.eval.mockResolvedValue(1);
    await expect(service.recordFailure('admin')).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('incr'),
      2,
      LOGIN_FAIL_KEY_PREFIX + 'admin',
      LOGIN_LOCK_KEY_PREFIX + 'admin',
      '600',
      '5',
      '900'
    );
    redis.eval.mockResolvedValue(0);
    await expect(service.recordFailure('admin')).resolves.toBe(false);
  });

  it('clear：DEL 计数与锁定两键（幂等）', async () => {
    await service.clear('admin');
    expect(redis.del).toHaveBeenCalledWith(
      LOGIN_FAIL_KEY_PREFIX + 'admin',
      LOGIN_LOCK_KEY_PREFIX + 'admin'
    );
  });
});
