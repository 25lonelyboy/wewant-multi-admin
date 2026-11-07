import { Worker, type Job } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import type { WorkerConfig } from './config.js';
import { parseEnvelope } from './detection.js';
import {
  classifyWriteError,
  UnrecoverableWriteError,
  type WriteFailure
} from './failure.js';
import { filterByDeclaration } from './filter.js';
import type { Logger } from './logger.js';
import { resolvePoint } from './resolve.js';
import type { SnapshotSource } from './snapshot/client.js';
import {
  RAW_CODEC,
  TdengineWriter,
  type PendingRow
} from './tdengine/writer.js';

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
  /** 测试注入固定时钟（时间戳边界判定用）；生产缺省 `Date.now` */
  now?: () => number;
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
  private readonly writer: TdengineWriter;
  private readonly now: () => number;

  private buffer: PendingRow[] = [];
  private waiters: Waiter[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushChain: Promise<void> = Promise.resolve();
  private closing = false;

  private received = 0;
  private written = 0;
  private rejected = 0;
  private unknownDevice = 0;
  private outOfRangeTs = 0;
  /** 时钟越界（`ts` 超出允许的上下界）——与 `outOfRangeTs`（`ts` 不落在 usage 区间）是两回事 */
  private clockOutOfRange = 0;
  private clockOutWindowCount = 0;
  private readonly clockOutDevices = new Set<string>();
  private clockOutLoggedAt = 0;
  private metricNotInModel = 0;
  private metricInvalidValue = 0;
  private unitMismatch = 0;
  private emptyAfterFilter = 0;
  private duplicateInBatch = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
    private readonly snapshot: SnapshotSource,
    deps: ConsumerDeps = {}
  ) {
    this.now = deps.now ?? Date.now;
    this.writer =
      deps.writer ??
      new TdengineWriter(
        config.tdengineUrl,
        RAW_CODEC,
        config.tdengineConnections
      );

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
      unknownDevice: this.unknownDevice,
      outOfRangeTs: this.outOfRangeTs,
      clockOutOfRange: this.clockOutOfRange,
      metricNotInModel: this.metricNotInModel,
      metricInvalidValue: this.metricInvalidValue,
      unitMismatch: this.unitMismatch,
      emptyAfterFilter: this.emptyAfterFilter,
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

  /**
   * 解析 → 按 ts 判设备与版本 → 按声明过滤 → 攒批用的行；不该入库的返回 `null`（正常 ack）。
   *
   * ⚠️ 顺序与旧版相反（旧版先检测后查档）：先拿到 `localDeviceId` 与 `ts`，才能从快照取该时刻
   * 的声明。倒过来之后，未知设备与未知属性都能带上 `localDeviceId` 打日志。
   */
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

    const envelope = parseEnvelope(data);
    if ('reason' in envelope) {
      this.rejected += 1;
      this.logger.warn({ reason: envelope.reason }, '报文不符，丢弃');
      return null;
    }

    // 时钟边界在校验设备之前：越界与设备是否存在无关，先挡能避免把错钟设备计成
    // `unknown-device`。边界取闭区间——恰好等于上/下界放行（D4「超界拒收」）。
    const now = this.now();
    const earliest = now - this.config.tsMaxPastMs;
    const latest = now + this.config.tsMaxFutureMs;
    if (envelope.ts < earliest || envelope.ts > latest) {
      this.rejected += 1;
      this.clockOutOfRange += 1;
      this.logClockOutOfRange(envelope, now, earliest, latest);
      return null;
    }

    const resolved = resolvePoint(
      this.snapshot.currentIndex(),
      envelope.localDeviceId,
      envelope.ts
    );
    if (!resolved.ok) {
      this.rejected += 1;
      if (resolved.reason === 'unknown-device') this.unknownDevice += 1;
      else this.outOfRangeTs += 1;
      this.logger.warn(
        {
          localDeviceId: envelope.localDeviceId,
          ts: envelope.ts,
          reason: resolved.reason
        },
        '查档失败，丢弃'
      );
      return null;
    }

    const filtered = filterByDeclaration(envelope.metrics, resolved.properties);
    // ⚠️ 单位错意味着这台设备的量纲解释整体不可信 ⇒ 整条丢弃，不只丢那个测点（D2 §10）
    if (filtered.unitMismatch) {
      this.unitMismatch += 1;
      this.rejected += 1;
      this.logger.warn(
        {
          localDeviceId: envelope.localDeviceId,
          modelCode: resolved.modelCode,
          ts: envelope.ts
        },
        '载荷单位与模型声明不符，整条丢弃'
      );
      return null;
    }

    if (filtered.notInModel.length > 0) {
      this.metricNotInModel += filtered.notInModel.length;
      // ⚠️ 告警必须带上报的那个 key：现场动作与版本边界不可能秒级重合，这条计数是过渡带的进度条
      this.logger.warn(
        {
          localDeviceId: envelope.localDeviceId,
          modelCode: resolved.modelCode,
          keys: filtered.notInModel
        },
        '测点不在该时刻的声明里，只丢这些测点'
      );
    }
    if (filtered.invalid.length > 0) {
      this.metricInvalidValue += filtered.invalid.length;
      this.logger.warn(
        {
          localDeviceId: envelope.localDeviceId,
          modelCode: resolved.modelCode,
          keys: filtered.invalid
        },
        '测点值非法，只丢这些测点'
      );
    }

    // ⚠️ 全被过滤掉要丢整条：否则会写出只有 ts 的空行
    if (filtered.accepted.length === 0) {
      this.emptyAfterFilter += 1;
      this.rejected += 1;
      this.logger.warn(
        {
          localDeviceId: envelope.localDeviceId,
          modelCode: resolved.modelCode,
          ts: envelope.ts
        },
        '过滤后无可用测点，整条丢弃'
      );
      return null;
    }

    return {
      subtable: resolved.subtable,
      ts: envelope.ts,
      metrics: filtered.accepted
    };
  }

  /**
   * 时钟越界的日志：错钟设备会让**每一条**报文都越界，逐条 warn 会刷屏——与超限同一纪律，
   * 按秒打一条累计（条数与设备数），逐条细节降为 debug。
   *
   * ⚠️ `reason` 用 `clock-out-of-range`，不要写成 `ts-out-of-range`：既有的 `outOfRangeTs`
   * 是「ts 不落在 usage 区间」，两者差一个词序、语义完全不同，混了排障必读错。
   */
  private logClockOutOfRange(
    envelope: { localDeviceId: string; ts: number },
    now: number,
    earliest: number,
    latest: number
  ): void {
    this.clockOutWindowCount += 1;
    this.clockOutDevices.add(envelope.localDeviceId);
    const bounds = {
      reason: 'clock-out-of-range',
      now,
      earliest,
      latest,
      tsMaxPastMs: this.config.tsMaxPastMs,
      tsMaxFutureMs: this.config.tsMaxFutureMs
    };

    if (now - this.clockOutLoggedAt >= 1000) {
      this.logger.warn(
        {
          ...bounds,
          count: this.clockOutWindowCount,
          devices: this.clockOutDevices.size
        },
        '时间戳越界，已丢弃（按秒聚合）'
      );
      this.clockOutWindowCount = 0;
      this.clockOutDevices.clear();
      this.clockOutLoggedAt = now;
      return;
    }

    this.logger.debug(
      { ...bounds, localDeviceId: envelope.localDeviceId, ts: envelope.ts },
      '时间戳越界，丢弃'
    );
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
      const failure = classifyWriteError(error);
      // ⭐ 只有连接级错误才作废连接（行 5）：超时"可能已成功"、数据 / 结构错、判不出形态的默认桶
      // 都**不证明连接坏了**——作废它们只会白白重连。作废粒度是失败的那一条（writer 记下的那一格）。
      if (failure.connectionLevel) this.writer.invalidate();
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

/**
 * 批内同 `(子表, ts)` 只保留最后一条——同 ts 覆盖是 TDengine 语义，留着只会白写。
 *
 * ⭐ **必须在 `write()` 之前做**：不去重会把"重投覆盖"误报成"部分成功"（`affected < 提交数`）。
 * 因是纯函数、无副作用，导出供单测直接钉住这条不变量（`flushOnce` 仍经它）。
 */
export function dedupeInBatch(rows: readonly PendingRow[]): PendingRow[] {
  const byKey = new Map<string, PendingRow>();
  for (const row of rows) {
    byKey.set(`${row.subtable}\u0000${row.ts}`, row);
  }
  return [...byKey.values()];
}
