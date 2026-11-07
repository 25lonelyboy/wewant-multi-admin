import type { RegistrySnapshot } from '@multi-admin/device-registry';
import { Redis } from 'ioredis';
import { parseSnapshot, SNAPSHOT_KEY } from './client.js';

/**
 * 脚本用的一次性快照读取：不启动轮询、不进消费环。
 *
 * 返回 `null` 表示业务 Redis 里还没有快照——调用方必须**明确失败**，不能退回编译期常量
 * （那会让脚本报出一份与运行期无关的结论）。
 */
export async function readSnapshotOnce(
  redisUrl: string
): Promise<RegistrySnapshot | null> {
  // 脚本面向一次性读取：地址错就快速失败，不无限重连（否则排障时会挂住）
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  try {
    await redis.connect();
    const payload = await redis.get(SNAPSHOT_KEY);
    if (payload === null) return null;
    return parseSnapshot(payload);
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}
