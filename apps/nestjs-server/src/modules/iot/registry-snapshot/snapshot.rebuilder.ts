import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { buildRegistrySnapshot } from './snapshot.builder.js';
import {
  REGISTRY_BUILT_KEY,
  REGISTRY_REBUILD_LOCK_KEY,
  REGISTRY_REV_KEY,
  REGISTRY_SNAPSHOT_KEY
} from './snapshot.keys.js';

/** 重建节拍：每 500ms 最多一次，持续脏就持续重建（节流，不是 trailing debounce） */
const REBUILD_INTERVAL_MS = 500;
/** 锁有效期；重建约 100ms，2 秒足够覆盖一次构建 */
const LOCK_TTL_MS = 2_000;
/**
 * 无条件重建周期——**正确性的一部分，不是优化**。
 *
 * `PG commit → INCR` 之间进程崩溃时版本号不会前进，只有无条件重建能把那次变更补进快照。
 */
const FORCE_REBUILD_MS = 60_000;

/** 条件写：版本不倒退。比较与两次 SET 必须在同一段 Lua 里，不能拆成两条命令。 */
const CONDITIONAL_WRITE = `
local built = tonumber(redis.call('GET', KEYS[1]) or '-1')
if tonumber(ARGV[1]) <= built then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[1], ARGV[1])
return 1
`;

/** 只删自己持有的锁，防误删他人的 */
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/**
 * 档案快照重建器：server 侧一个 provider，每 500ms 一轮。
 *
 * 触发条件三选一：快照或 `built` 不存在、`rev > built`、距上次成功重建 ≥ 60 秒。
 * 满足条件才抢锁重建——写路径只做 `INCR`，不做任何重建。
 */
@Injectable()
export class RegistrySnapshotRebuilder
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private closing = false;
  /** 上次成功重建（或确认已由他人写完）的时刻；0 表示进程启动后还没跑过 */
  private lastBuiltAt = 0;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly logger: Logger
  ) {}

  onApplicationBootstrap(): void {
    // 先跑一轮：服务启动时库里可能已有档案，而 Redis 是空的
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, REBUILD_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    this.closing = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 一轮判定与重建。对外公开只为单测能逐轮驱动，生产只由定时器调用。
   */
  async tick(): Promise<void> {
    if (this.running || this.closing) return;
    this.running = true;
    try {
      await this.rebuildIfNeeded();
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        '档案快照重建失败，下一轮重试'
      );
    } finally {
      this.running = false;
    }
  }

  private async rebuildIfNeeded(): Promise<void> {
    const [builtRaw, exists, revRaw] = await Promise.all([
      this.redis.get(REGISTRY_BUILT_KEY),
      this.redis.exists(REGISTRY_SNAPSHOT_KEY),
      this.redis.get(REGISTRY_REV_KEY)
    ]);
    const built = builtRaw === null ? -1 : Number(builtRaw);
    const rev = revRaw === null ? 0 : Number(revRaw);
    const forced =
      this.lastBuiltAt === 0 ||
      Date.now() - this.lastBuiltAt >= FORCE_REBUILD_MS;

    if (exists === 1 && !forced && rev <= built) return;

    const token = `${hostname()}-${process.pid}-${randomUUID()}`;
    const locked = await this.redis.set(
      REGISTRY_REBUILD_LOCK_KEY,
      token,
      'PX',
      LOCK_TTL_MS,
      'NX'
    );
    if (locked === null) return;

    try {
      // ⚠️ 先读 rev 再读库：反过来会把读库期间的新变更标成已建
      const version = await this.readRev();
      const snapshot = await buildRegistrySnapshot(
        this.prisma,
        version,
        new Date()
      );
      await this.redis.eval(
        CONDITIONAL_WRITE,
        2,
        REGISTRY_BUILT_KEY,
        REGISTRY_SNAPSHOT_KEY,
        String(version),
        JSON.stringify(snapshot)
      );
      this.lastBuiltAt = Date.now();
    } finally {
      await this.redis
        .eval(RELEASE_LOCK, 1, REGISTRY_REBUILD_LOCK_KEY, token)
        .catch(() => undefined);
    }
  }

  private async readRev(): Promise<number> {
    const value = await this.redis.get(REGISTRY_REV_KEY);
    if (value === null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
