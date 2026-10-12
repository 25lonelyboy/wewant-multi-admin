import { Worker, type Job } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import type { WorkerConfig } from './config.js';
import { detect } from './detection.js';
import {
  classifyWriteError,
  UnrecoverableWriteError,
  type WriteFailure
} from './failure.js';
import type { Logger } from './logger.js';
import { ResolveCache } from './registry-cache.js';
import { TdengineWriter, type PendingRow } from './tdengine/writer.js';

/** 查档结果的缓存有效期：档案一变，最多等这么久生效 */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface Waiter {
  resolve: () => void;
  reject: (error: unknown) => void;
}

/**
 * 可注入依赖。
 *
 * ⚠️ 只为可测性：单测注入替身以隔离 BullMQ 与 TDengine；生产一律走默认值。
 */
export interface ConsumerDeps {
  writer?: TdengineWriter;
  worker?: Worker;
}

/**
 * 遥测消费者。
 *
 * ⭐ **入库成功才 ack**：`processor` 返回的 Promise 由本批的写入结果统一兑现——
 * 写入失败**或写入行数少于提交数（部分成功）**即整批 reject ⇒ BullMQ 整批重投
 * （`getLastAffected` 不给行级定位，"丢弃失败那行、ack 其余"技术上做不到）。
 * ⚠️ 写入层**不另造重试**：A 类（连接 / 超时）原样抛回队列、交给 BullMQ 退避重试；
 * B 类（格式 / 权限 / 表结构）抛 `UnrecoverableError` 直接进 failed 集合，不空耗重试
 * ——分类见 `failure.ts`。
 */
export class TelemetryConsumer {
  private readonly worker: Worker;
  private readonly cache: ResolveCache;
  private readonly writer: TdengineWriter;

  private buffer: PendingRow[] = [];
  private waiters: Waiter[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private closing = false;

  private received = 0;
  private written = 0;
  private rejected = 0;
  private unknownMetrics = 0;
  private duplicateInBatch = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
    deps: ConsumerDeps = {}
  ) {
    this.cache = new ResolveCache(p1DeviceRegistry, CACHE_TTL_MS);
    this.writer = deps.writer ?? new TdengineWriter(config.tdengineUrl);

    this.worker =
      deps.worker ??
      new Worker(TELEMETRY_INGEST_QUEUE, (job: Job) => this.onJob(job), {
        prefix: TELEMETRY_QUEUE_PREFIX,
        connection: {
          url: config.queueRedisUrl,
          // ⚠️ 消费者必须无限等待：BullMQ 的阻塞读命令不能因超时中断
          maxRetriesPerRequest: null
        },
        // 并发即"同时在手的最多条数"——攒批靠它，不靠逐条处理
        concurrency: config.ingestConcurrency
      });
    this.worker.on('failed', (job, error) => {
      // 读错误码——failed 集合是"待人工看"的那一处，告警不带码人到了也不知道从哪查
      const failure = classifyWriteError(error);
      this.logger.error(
        {
          jobId: job?.id,
          attempts: job?.attemptsMade,
          code: failure.code,
          elevated: failure.elevated,
          err: error instanceof Error ? error.message : String(error)
        },
        'job 失败'
      );
    });
    this.worker.on('error', error => {
      this.logger.warn({ err: String(error) }, '队列连接异常，将自动重连');
    });
  }

  get stats(): Record<string, number> {
    return {
      received: this.received,
      written: this.written,
      rejected: this.rejected,
      unknownMetrics: this.unknownMetrics,
      duplicateInBatch: this.duplicateInBatch
    };
  }

  /** 兜底 flush：条数没攒够也要按时落库 */
  start(): void {
    this.flushTimer = setInterval(() => {
      void this.scheduleFlush();
    }, this.config.ingestFlushIntervalMs);
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // 先把在手的批落库，再关 worker——否则那些 job 会因等待而变 stalled
    await this.scheduleFlush();
    await this.worker.close();
    await this.writer.close();
  }

  private onJob(job: Job): Promise<void> {
    const row = this.toRow(job.data);
    if (row === null) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      this.buffer.push(row);
      this.waiters.push({ resolve, reject });
      if (this.buffer.length >= this.config.ingestBatchSize) {
        void this.scheduleFlush();
      }
    });
  }

  /** 解析 → 检测 → 查档 → 攒批用的行；不该入库的返回 `null`（正常 ack） */
  private toRow(data: unknown): PendingRow | null {
    this.received += 1;

    if (typeof data !== 'string') {
      this.rejected += 1;
      this.logger.warn(
        { dataType: typeof data },
        'job 里的载荷不是字符串，丢弃'
      );
      return null;
    }

    const detected = detect(data);
    if (!detected.ok) {
      this.rejected += 1;
      this.logger.warn({ reason: detected.reason }, '报文不符，丢弃');
      return null;
    }

    const { sample } = detected;
    if (sample.unknownMetricKeys.length > 0) {
      this.unknownMetrics += sample.unknownMetricKeys.length;
      // ⚠️ 告警必须带上报的那个 key，否则人只知道"有未知测点"，不知道多了什么
      this.logger.warn(
        { localDeviceId: sample.localDeviceId, keys: sample.unknownMetricKeys },
        '未知测点，只丢这些测点'
      );
    }

    const resolved = this.cache.resolve(
      sample.localDeviceId,
      sample.localPointId
    );
    if (!resolved.ok) {
      this.rejected += 1;
      this.logger.warn(
        {
          localDeviceId: sample.localDeviceId,
          localPointId: sample.localPointId,
          reason: resolved.reason
        },
        '查档失败，丢弃'
      );
      return null;
    }

    const subtable = `${resolved.deviceId}_${resolved.pointKey}`.toLowerCase();
    return {
      subtable,
      ts: sample.ts,
      metrics: Object.fromEntries(
        sample.metrics.map(metric => [
          metric.key,
          { value: metric.value, unit: metric.unit }
        ])
      )
    };
  }

  private scheduleFlush(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this.flushOnce());
    return this.flushChain;
  }

  private async flushOnce(): Promise<void> {
    if (this.buffer.length === 0) return;

    const rows = this.buffer;
    const waiters = this.waiters;
    this.buffer = [];
    this.waiters = [];

    const deduped = dedupeInBatch(rows);
    this.duplicateInBatch += rows.length - deduped.length;

    try {
      const affected = await this.writer.write(deduped);
      // ⭐ C10：写入行数少于提交数 ⇒ 必有行没落库。`getLastAffected` 不给行级定位，
      // "丢弃失败那行、ack 其余"技术上做不到 ⇒ 唯一可执行处置是**整批重投**。
      // 重投安全：`(子表, ts)` 幂等覆盖下，重投仍计入 affected（本机实测），不会再触发本分支。
      // 批内去重也正因如此才必须先做——不去重会把"覆盖"误报成"部分失败"。
      if (affected < deduped.length) {
        throw new Error(
          `写入行数少于提交行数：affected=${affected}，expected=${deduped.length}`
        );
      }
      this.written += deduped.length;
      for (const waiter of waiters) waiter.resolve();
    } catch (error) {
      // ⚠️ 一次非法绑定会把连接拖废 ⇒ 作废重连；"这批失败"与"连接已废"是两件事
      this.writer.invalidate();
      const failure = classifyWriteError(error);
      this.logWriteFailure(failure, error);
      for (const waiter of waiters) {
        // B 类抛 `UnrecoverableError` ⇒ 跳过重试直接进 failed 集合；A 类原样抛回交给 BullMQ
        // 退避重试。整批同码：一个 B 类错误把本批所有 job 一起送进 failed 集合。
        waiter.reject(
          failure.kind === 'unrecoverable'
            ? new UnrecoverableWriteError(failure, error)
            : error
        );
      }
    }
  }

  /**
   * 单批失败只告警一次——一批里有 N 条 job，逐条重复告警会淹没真正的信号。
   *
   * ⚠️ `Table does not exist` 走 **fatal**（提级）——正常路径下它不该出现（预建 + 不带
   * `USING`），一旦出现只可能是**建表遗漏**或**命名逻辑 bug**，都是"平台侧自己错了"。
   */
  private logWriteFailure(failure: WriteFailure, error: unknown): void {
    const fields = {
      code: failure.code,
      err: error instanceof Error ? error.message : String(error)
    };
    if (failure.elevated) {
      this.logger.fatal(
        fields,
        '⭐ 提级告警：写入子表不存在——预建遗漏或命名逻辑 bug；本批已进 failed 集合'
      );
    } else if (failure.kind === 'unrecoverable') {
      this.logger.error(
        fields,
        '写入失败（重试无意义），本批已进 failed 集合待人工处理'
      );
    } else {
      this.logger.error(fields, '整批写入失败，整批重投');
    }
  }
}

/** 批内同 `(子表, ts)` 只保留最后一条——同 ts 覆盖是 TDengine 语义，留着只会白写 */
function dedupeInBatch(rows: readonly PendingRow[]): PendingRow[] {
  const byKey = new Map<string, PendingRow>();
  for (const row of rows) {
    byKey.set(`${row.subtable}\u0000${row.ts}`, row);
  }
  return [...byKey.values()];
}
