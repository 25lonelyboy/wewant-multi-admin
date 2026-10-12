import { Worker, type Job } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import type { WorkerConfig } from './config.js';
import { detect } from './detection.js';
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
 * 遥测消费者。
 *
 * ⭐ **入库成功才 ack**：`processor` 返回的 Promise 由本批的写入结果统一兑现——
 * 写入失败即整批 reject ⇒ BullMQ 整批重投（`getLastAffected` 不给行级定位，
 * "丢弃失败那行、ack 其余"技术上做不到）。⚠️ 写入层**不另造重试**，失败直接抛回队列。
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
    private readonly logger: Logger
  ) {
    this.cache = new ResolveCache(p1DeviceRegistry, CACHE_TTL_MS);
    this.writer = new TdengineWriter(config.tdengineUrl);

    this.worker = new Worker(
      TELEMETRY_INGEST_QUEUE,
      (job: Job) => this.onJob(job),
      {
        prefix: TELEMETRY_QUEUE_PREFIX,
        connection: {
          url: config.queueRedisUrl,
          // ⚠️ 消费者必须无限等待：BullMQ 的阻塞读命令不能因超时中断
          maxRetriesPerRequest: null
        },
        // 并发即"同时在手的最多条数"——攒批靠它，不靠逐条处理
        concurrency: config.ingestConcurrency
      }
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        { jobId: job?.id, attempts: job?.attemptsMade, err: String(error) },
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
      this.written += deduped.length;
      // 核对：不去重会把"覆盖"误报成"部分失败"，所以先按 (子表, ts) 去重再比
      if (affected < deduped.length) {
        this.logger.warn(
          { affected, expected: deduped.length },
          '写入行数少于提交行数，可能有覆盖或被拒的行'
        );
      }
      for (const waiter of waiters) waiter.resolve();
    } catch (error) {
      // ⚠️ 一次非法绑定会把连接拖废 ⇒ 作废重连；"这批失败"与"连接已废"是两件事
      this.writer.invalidate();
      this.logger.error({ err: String(error) }, '整批写入失败，整批重投');
      for (const waiter of waiters) waiter.reject(error);
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
