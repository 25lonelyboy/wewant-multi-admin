import type { RegistrySnapshot } from '@multi-admin/device-registry';
import { Redis } from 'ioredis';
import {
  BUILT_KEY,
  parseSnapshot,
  REGISTRY_REV_KEY,
  SNAPSHOT_KEY
} from './client.js';

/** 一次连接读到的业务 Redis 档案状态：快照载荷 + 已建版本 + 期望版本 */
export interface RegistryState {
  snapshot: RegistrySnapshot;
  built: number | null;
  rev: number | null;
}

function versionOf(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 一次性读取 `snapshot` / `built` / `rev`（清理脚本的新鲜度闸要用后两者）。
 *
 * 返回 `null` 表示业务 Redis 里还没有快照——调用方必须**明确失败**，不能退回编译期常量
 * （那会让脚本报出一份与运行期无关的结论）。
 */
export async function readRegistryState(
  redisUrl: string
): Promise<RegistryState | null> {
  // 脚本面向一次性读取：地址错就快速失败，不无限重连（否则排障时会挂住）
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  try {
    await redis.connect();
    const [payload, built, rev] = await redis.mget(
      SNAPSHOT_KEY,
      BUILT_KEY,
      REGISTRY_REV_KEY
    );
    if (payload === null) return null;
    return {
      snapshot: parseSnapshot(payload),
      built: versionOf(built ?? null),
      rev: versionOf(rev ?? null)
    };
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

/** 审计用：只关心快照载荷 */
export async function readSnapshotOnce(
  redisUrl: string
): Promise<RegistrySnapshot | null> {
  const state = await readRegistryState(redisUrl);
  return state?.snapshot ?? null;
}
