import { hostname } from 'node:os';
import { normalizeLocalId } from '@multi-admin/contracts';
import type {
  RegistrySnapshot,
  SnapshotDevice,
  SnapshotModel
} from '@multi-admin/device-registry';
import { Redis } from 'ioredis';
import type { WorkerConfig } from '../config.js';
import type { Logger } from '../logger.js';

/** server 侧写入的键——与 `apps/nestjs-server` 的 `snapshot.keys.ts` 同值 */
const BUILT_KEY = 'iot:registry:built';
export const SNAPSHOT_KEY = 'iot:registry:snapshot';
const WORKER_VERSION_KEY_PREFIX = 'iot:registry:worker-version:';

/** worker 实例当前应用的版本——供 A4 验收轮询，TTL 30 秒 */
const WORKER_VERSION_TTL_SECONDS = 30;

/** 冷启动重试：退避到 5 秒为止，之后持续重试 */
const START_RETRY_MIN_MS = 250;
const START_RETRY_MAX_MS = 5_000;

/**
 * 换入快照时同时建好的索引。
 *
 * ⚠️ 索引必须在换入时建，不能在查询时线性扫：一万台设备 × 每秒上百条报文时，逐条扫
 * `devices` 是 O(N) 的。`byLocalId` 的值按 `fromAt` 升序、`toAt` 为 `null` 的最后，
 * 一台设备有多条 usage（换型）时按 ts 选对。
 */
export interface SnapshotIndex {
  snapshot: RegistrySnapshot;
  byLocalId: Map<string, SnapshotDevice[]>;
  byModelCode: Map<string, SnapshotModel>;
}

/** 消费环只依赖这一面——单测可注入手写索引，不必连 Redis */
export interface SnapshotSource {
  currentIndex(): SnapshotIndex;
}

export type SnapshotClientDeps = {
  /** 测试注入；生产由 client 用 `config.redisUrl` 自建 */
  redis?: Redis;
  now?: () => number;
};

/**
 * 业务 Redis 上的档案快照客户端。
 *
 * - 每 `REGISTRY_POLL_MS` 读 `built`，大于本地版本才拉全量
 * - **拉取 / 解析失败保留旧快照继续跑**：可用性优先，滞后由下一次成功刷新纠正
 * - 冷启动拉不到时 `start()` 不返回——消费环与降采样环都起不来。业务 Redis 挂了、队列还在时，
 *   积压比静默丢数据好（D1 §2.6）
 */
export class RegistrySnapshotClient {
  private readonly redis: Redis;
  private readonly now: () => number;
  private readonly instanceId = `${hostname()}-${process.pid}`;
  private index: SnapshotIndex | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastSuccessAt = 0;
  private closing = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
    deps: SnapshotClientDeps = {}
  ) {
    this.now = deps.now ?? Date.now;
    this.redis =
      deps.redis ??
      // ⚠️ 独立连接，不与队列 Redis 复用：两者是不同实例，队列连接还挂着 BullMQ 的阻塞读
      new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
  }

  /** 首拉，失败退避重试直到成功 */
  async start(): Promise<void> {
    let delay = START_RETRY_MIN_MS;
    for (;;) {
      try {
        await this.refresh(true);
        this.lastSuccessAt = this.now();
        break;
      } catch (error) {
        this.logger.warn(
          {
            err: error instanceof Error ? error.message : String(error),
            retryInMs: delay
          },
          '档案快照首拉失败，退避重试；消费环与降采样环暂不启动'
        );
        await sleep(delay);
        delay = Math.min(delay * 2, START_RETRY_MAX_MS);
      }
    }

    this.timer = setInterval(() => {
      void this.poll();
    }, this.config.registryPollMs);
    this.timer.unref();
    this.logger.info(
      {
        snapshotVersion: this.index?.snapshot.version,
        models: this.index?.byModelCode.size,
        devices: this.index?.byLocalId.size
      },
      '档案快照已就绪'
    );
  }

  /** 未就绪时抛错——启动门禁已挡住，走到这里是编码错误 */
  current(): RegistrySnapshot {
    if (this.index === null) {
      throw new Error('档案快照未就绪：启动门禁应在 start() 之后才构造消费环');
    }
    return this.index.snapshot;
  }

  /** 索引只读视图；`resolvePoint` 只读它 */
  currentIndex(): SnapshotIndex {
    if (this.index === null) {
      throw new Error('档案快照未就绪：启动门禁应在 start() 之后才构造消费环');
    }
    return this.index;
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.redis.quit().catch(() => this.redis.disconnect());
  }

  /** 一轮轮询。对外公开只为单测能逐轮驱动，生产只由定时器调用。 */
  async poll(): Promise<void> {
    if (this.closing) return;
    try {
      await this.refresh(false);
      this.lastSuccessAt = this.now();
    } catch (error) {
      this.reportStale(error);
    }
  }

  private async refresh(initial: boolean): Promise<void> {
    const builtRaw = await this.redis.get(BUILT_KEY);
    const built = builtRaw === null ? null : Number(builtRaw);
    if (built === null || !Number.isFinite(built)) {
      if (initial) throw new Error('业务 Redis 里还没有快照（built 缺失）');
      // 非首拉：保留旧快照。built 被淘汰不等于快照变旧，下一次有条件重建会补回
      await this.publishWorkerVersion();
      return;
    }

    if (this.index === null || built > this.index.snapshot.version) {
      const payload = await this.redis.get(SNAPSHOT_KEY);
      if (payload === null) {
        if (initial) throw new Error('业务 Redis 里还没有快照（payload 缺失）');
        await this.publishWorkerVersion();
        return;
      }
      const snapshot = parseSnapshot(payload);
      this.index = buildIndex(snapshot);
    }

    await this.publishWorkerVersion();
  }

  private async publishWorkerVersion(): Promise<void> {
    if (this.index === null) return;
    await this.redis.set(
      `${WORKER_VERSION_KEY_PREFIX}${this.instanceId}`,
      String(this.index.snapshot.version),
      'EX',
      WORKER_VERSION_TTL_SECONDS
    );
  }

  private reportStale(error: unknown): void {
    const staleMs = this.now() - this.lastSuccessAt;
    const fields = {
      err: error instanceof Error ? error.message : String(error),
      staleSeconds: Math.round(staleMs / 1000)
    };
    if (staleMs >= this.config.registryStaleAlertMs) {
      this.logger.error(fields, '档案快照已陈旧，继续用旧快照运行');
    } else {
      this.logger.warn(fields, '档案快照刷新失败，保留旧快照');
    }
  }
}

export function parseSnapshot(payload: string): RegistrySnapshot {
  const parsed: unknown = JSON.parse(payload);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('快照不是对象');
  }
  const snapshot = parsed as Partial<RegistrySnapshot>;
  if (
    typeof snapshot.version !== 'number' ||
    !Array.isArray(snapshot.models) ||
    !Array.isArray(snapshot.devices)
  ) {
    throw new Error('快照缺字段（version / models / devices）');
  }
  return snapshot as RegistrySnapshot;
}

export function buildIndex(snapshot: RegistrySnapshot): SnapshotIndex {
  const byLocalId = new Map<string, SnapshotDevice[]>();
  for (const device of snapshot.devices) {
    const key = normalizeLocalId(device.localDeviceId);
    const list = byLocalId.get(key);
    if (list === undefined) byLocalId.set(key, [device]);
    else list.push(device);
  }
  for (const list of byLocalId.values()) {
    list.sort((a, b) => {
      // fromAt 升序；toAt 为 null 的排最后（同一 fromAt 时 open usage 优先被扫到也没关系，
      // 区间判定各自独立）
      const byFrom = Date.parse(a.fromAt) - Date.parse(b.fromAt);
      if (byFrom !== 0) return byFrom;
      if (a.toAt === null) return 1;
      if (b.toAt === null) return -1;
      return Date.parse(a.toAt) - Date.parse(b.toAt);
    });
  }

  return {
    snapshot,
    byLocalId,
    byModelCode: new Map(snapshot.models.map(model => [model.modelCode, model]))
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
