import { Queue } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import { TelemetrySpill } from './telemetry-spill.js';

/** 队列里只有一种活；job 名是占位 */
const JOB_NAME = 'ingest';

/** 补投轮询间隔 */
const DRAIN_INTERVAL_MS = 5_000;

/**
 * 入库 job 的选项。
 *
 * ⚠️ BullMQ 的默认值一个都不能信：**默认不重试、默认不退避、抖动默认 0**，三样都要显式配。
 * `removeOnComplete` —— 完成的 job 没有留着的理由；`removeOnFail` 留得多一些，
 * 因为 **failed 集合就是"待人工看"的那条队列**。
 */
const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 200, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: { count: 5000 }
} as const;

/** 只用到三个方法，收窄依赖便于测试替身 */
export interface ProducerLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface TelemetryProducerOptions {
  queueRedisUrl: string;
  spillDir: string;
  spillMaxBytes: number;
  logger: ProducerLogger;
  /** 本地缓冲超限——订阅端据此**停订阅** */
  onSpillOverflow: (message: string) => void;
  /** 写本地失败（磁盘满、权限错）——那时真的会丢，必须响亮 */
  onSpillFailure: (message: string) => void;
}

/**
 * 遥测入库队列的生产者。
 *
 * ⚠️ **不做重试**：入队失败就落本地——数据全程在本地缓冲里，比在内存里重试安全。
 */
export class TelemetryProducer {
  private readonly queue: Queue;
  private readonly spill: TelemetrySpill;
  private readonly logger: ProducerLogger;
  private drainTimer: NodeJS.Timeout | null = null;
  private draining = false;
  private overflowed = false;

  constructor(private readonly options: TelemetryProducerOptions) {
    this.logger = options.logger;
    this.spill = new TelemetrySpill(options.spillDir, options.spillMaxBytes);

    // ⚠️ 构造 Queue **不 await、不 ping**：队列 Redis 不可达**不得**阻断 API 与订阅端启动。
    // 不可达时 add() 快速失败（enableOfflineQueue: false），由落本地兜底。
    this.queue = new Queue(TELEMETRY_INGEST_QUEUE, {
      prefix: TELEMETRY_QUEUE_PREFIX,
      connection: {
        url: options.queueRedisUrl,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        lazyConnect: true
      }
    });
    this.queue.on('error', (error: unknown) => {
      this.logger.warn(`队列连接异常，将自动重连：${String(error)}`);
    });
  }

  /** 待补投的本地缓冲体积 */
  get spillBytes(): number {
    return this.spill.sizeBytes;
  }

  /** 准备好本地缓冲并开始周期性补投；自身吞掉异常，不阻断启动 */
  async start(): Promise<void> {
    try {
      await this.spill.init();
      if (this.spill.sizeBytes > 0) {
        this.logger.info(`本地缓冲有 ${this.spill.sizeBytes} 字节待补投`);
      }
    } catch (error) {
      this.options.onSpillFailure(`本地缓冲目录不可用：${String(error)}`);
    }
    this.drainTimer = setInterval(() => {
      void this.drainSpill();
    }, DRAIN_INTERVAL_MS);
    await this.drainSpill();
  }

  /** 入队；失败则落本地。**不抛**——接入热路径不该被下游异常打断 */
  async send(raw: string): Promise<void> {
    if (this.overflowed) return;
    try {
      await this.queue.add(JOB_NAME, raw, JOB_OPTIONS);
    } catch (error) {
      this.logger.warn(`入队失败，改落本地：${String(error)}`);
      await this.spillOnly(raw);
    }
  }

  async close(): Promise<void> {
    if (this.drainTimer !== null) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    try {
      await this.queue.close();
    } catch {
      // 关闭期错误不影响退出
    }
  }

  private async spillOnly(raw: string): Promise<void> {
    if (this.overflowed) return;
    try {
      const withinLimit = await this.spill.append(raw);
      if (!withinLimit) {
        this.overflowed = true;
        this.options.onSpillOverflow(
          `本地缓冲已达上限（${this.spill.sizeBytes} ≥ ${this.options.spillMaxBytes} 字节）`
        );
      }
    } catch (error) {
      this.options.onSpillFailure(
        `写本地缓冲失败，这段数据会丢：${String(error)}`
      );
    }
  }

  private async drainSpill(): Promise<void> {
    if (this.draining || this.spill.sizeBytes === 0) return;
    this.draining = true;
    try {
      const sent = await this.spill.drain(async raw => {
        await this.queue.add(JOB_NAME, raw, JOB_OPTIONS);
      });
      if (sent > 0) this.logger.info(`本地缓冲补投 ${sent} 条`);
    } catch (error) {
      this.logger.warn(`补投失败：${String(error)}`);
    } finally {
      this.draining = false;
    }
  }
}
