import type { Redis } from 'ioredis';
import { RedisThrottlerStorage, INCR_LUA } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage', () => {
  const redis = { eval: jest.fn() };
  const storage = new RedisThrottlerStorage(redis as unknown as Redis);

  beforeEach(() => redis.eval.mockReset());

  it('increment：Lua 原子 eval、键形 throttle:{throttlerName}:{key}、透传 ttl', async () => {
    redis.eval.mockResolvedValue(3);
    const record = await storage.increment(
      '127.0.0.1',
      60_000,
      5,
      60_000,
      'login'
    );
    expect(redis.eval).toHaveBeenCalledWith(
      INCR_LUA,
      1,
      'throttle:login:127.0.0.1',
      60_000
    );
    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 60_000
    });
  });

  it('hits > limit → isBlocked=true', async () => {
    redis.eval.mockResolvedValue(6);
    const record = await storage.increment(
      '127.0.0.1',
      60_000,
      5,
      60_000,
      'login'
    );
    expect(record).toMatchObject({ totalHits: 6, isBlocked: true });
  });

  it('脚本文本：INCR + 首写 PEXPIRE 单脚本', () => {
    expect(INCR_LUA).toContain('INCR');
    expect(INCR_LUA).toContain('PEXPIRE');
    expect(INCR_LUA).toMatch(/if hits == 1 then/);
  });
});
