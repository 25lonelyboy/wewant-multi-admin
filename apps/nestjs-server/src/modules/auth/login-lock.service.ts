import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import {
  MAX_ATTEMPTS,
  LOCK_TTL_SECONDS,
  FAIL_WINDOW_SECONDS
} from './login-lock.constants.js';

export const LOGIN_FAIL_KEY_PREFIX = 'auth:login-fail:';
export const LOGIN_LOCK_KEY_PREFIX = 'auth:login-lock:';

/**
 * Lua 原子执行：INCR 计数 + 首失败设窗口 TTL → 达阈写锁定键并删计数键。
 * 原子性防并发竞态：并发失败请求不会因读改写交错漏掉锁定。
 */
const RECORD_FAILURE_LUA = `
local count = redis.call('incr', KEYS[1])
if count == 1 then
  redis.call('expire', KEYS[1], ARGV[1])
end
if count >= tonumber(ARGV[2]) then
  redis.call('set', KEYS[2], '1', 'EX', ARGV[3])
  redis.call('del', KEYS[1])
  return 1
end
return 0`;

@Injectable()
export class LoginLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isLocked(username: string): Promise<boolean> {
    return (await this.redis.exists(LOGIN_LOCK_KEY_PREFIX + username)) === 1;
  }

  /** 剩余锁定秒数；未锁定返回 0 */
  async lockRemainingSeconds(username: string): Promise<number> {
    const ttl = await this.redis.ttl(LOGIN_LOCK_KEY_PREFIX + username);
    return ttl > 0 ? ttl : 0;
  }

  /** 记录一次登录失败；返回本次是否达阈触发锁定 */
  async recordFailure(username: string): Promise<boolean> {
    const locked = await this.redis.eval(
      RECORD_FAILURE_LUA,
      2,
      LOGIN_FAIL_KEY_PREFIX + username,
      LOGIN_LOCK_KEY_PREFIX + username,
      String(FAIL_WINDOW_SECONDS),
      String(MAX_ATTEMPTS),
      String(LOCK_TTL_SECONDS)
    );
    return Number(locked) === 1;
  }

  /** 清除计数与锁定（幂等）：成功登录后调用 */
  async clear(username: string): Promise<void> {
    await this.redis.del(
      LOGIN_FAIL_KEY_PREFIX + username,
      LOGIN_LOCK_KEY_PREFIX + username
    );
  }
}
