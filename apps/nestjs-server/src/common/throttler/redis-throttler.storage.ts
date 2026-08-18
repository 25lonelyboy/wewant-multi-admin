import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

/** @nestjs/throttler 未从主入口导出此类型，此处本地镜像以避免深路径导入 */
export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Lua 单脚本原子 INCR + 首写 PEXPIRE：
 * 避免 INCR/EXPIRE 分离的竞态与无 TTL 僵尸键。
 */
export const INCR_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return hits`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    const hits = (await this.redis.eval(
      INCR_LUA,
      1,
      `throttle:${throttlerName}:${key}`,
      ttl
    )) as number;
    return {
      totalHits: hits,
      timeToExpire: ttl,
      isBlocked: hits > limit,
      timeToBlockExpire: blockDuration
    };
  }
}
