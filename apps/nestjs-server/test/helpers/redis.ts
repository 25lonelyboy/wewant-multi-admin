// test/helpers/redis.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseDotenv } from 'dotenv';
import type { Redis } from 'ioredis';

/** 套件间清理：测试实例 FLUSHDB（逻辑 DB 固定 0，设计 §5.2） */
export async function flushTestRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}

/**
 * 测试缺省 Redis 连接串（进程环境变量缺失时兜底）。
 * 本地 compose 的业务缓存已开认证，测试与运行中的应用共用同一实例 ⇒ 缺省值取自应用 `.env` 的
 * `REDIS_URL`（含凭据），与运行中的应用同源；真机 / CI 由进程环境变量覆盖。
 * `.env` 按调用进程 cwd 解析（pnpm / turbo 均以应用根为 cwd）。
 */
export function defaultRedisUrl(): string {
  try {
    return (
      parseDotenv(readFileSync(join(process.cwd(), '.env'))).REDIS_URL ??
      // 最后手段缺省（非可用配置）：业务缓存已开认证，无凭据的串一连即响亮报 NOAUTH；仅应用 .env 缺失时到达
      'redis://localhost:6379'
    );
  } catch {
    return 'redis://localhost:6379';
  }
}
