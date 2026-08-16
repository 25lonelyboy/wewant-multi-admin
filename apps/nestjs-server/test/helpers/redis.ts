// test/helpers/redis.ts
import type { Redis } from 'ioredis';

/** 套件间清理：测试实例 FLUSHDB（逻辑 DB 固定 0，设计 §5.2） */
export async function flushTestRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
