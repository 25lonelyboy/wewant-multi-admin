import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { TELEMETRY_QUEUE_PREFIX } from '@multi-admin/contracts';
import { DS_LEVELS, RAW_DATABASE, type DsLevel } from '../schema.js';
import type { WorkerConfig } from '../config.js';
import { classifyWriteError } from '../failure.js';
import type { Logger } from '../logger.js';
import { connectTd, type TdRow, type TdSql } from '../tdengine/client.js';
import { TdengineWriter } from '../tdengine/writer.js';
import { LEVEL_SPECS, levelSpec, type LevelSchedule } from './level.js';
import { buildAggregateSql } from './query.js';
import { DS_CODEC, parseAggregateRows, type DsAggregateRow } from './rows.js';
import { closedWindowRange } from './window.js';

/**
 * 降采样队列名。
 *
 * ⚠️ **就地定义，不进 `packages/contracts`**：契约里的队列常量存在，是因为生产端与消费端
 * **分属两个应用**（如遥测 ingest 队列由 `nestjs-server` 投、本应用取）。降采样环的调度注册
 * 与消费**都在本进程内**，没有第二个应用引用它 ⇒ 就地常量即可，无须制造跨应用契约。
 * ⚠️ **不能带冒号**——BullMQ 用冒号作 Redis 键分隔符，队列名含冒号构造即抛。
 */
export const DOWNSAMPLE_QUEUE = 'iot-telemetry-downsample';

const JOB_NAME = 'recompute';

/** 调度注册失败后的重试间隔——Redis 抖动不能永久丢掉调度登记 */
const REGISTER_RETRY_MS = 30_000;

/**
 * 与 ingest 队列同一口径：完成即清、失败留一批待人工看。
 * ⚠️ 保留率只买可观测性与重试，**不买正确性**——即便同一段被两实例同时算，
 * `(子表, ts)` 覆盖也保证结果正确（§3.1 ⭐）。
 */
const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 200, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: { count: 5000 }
} as const;

/** 读端：把一条聚合 SQL 跑出行。生产用真实 TDengine；单测注入替身 */
export interface AggregateReader {
  query(sql: string): Promise<TdRow[]>;
}

/** 可注入依赖——单测注入替身以隔离 BullMQ 与 TDengine；生产一律走默认值 */
export interface RingDeps {
  reader?: AggregateReader;
  writer?: TdengineWriter<DsAggregateRow>;
  queue?: Queue;
  worker?: Worker;
}

/**
 * 降采样环：进程内的一条独立链路，与消费环**并列**。
 *
 * ⭐ **三级平级**：每条调度各自从原始超表算（§4），互不依赖、可各自重试。
 * ⭐ 每次只算**最近 K 个已闭合窗口**、不记游标——晚到数据落在最近 K 个窗口内即被自愈（§3.2）。
 */
export class DownsampleRing {
  private readonly injectedReader: AggregateReader | undefined;
  private readonly writer: TdengineWriter<DsAggregateRow>;
  private readonly queue: Queue;
  private readonly worker: Worker;

  private sql: TdSql | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
    deps: RingDeps = {}
  ) {
    this.injectedReader = deps.reader;
    this.writer =
      deps.writer ??
      new TdengineWriter<DsAggregateRow>(config.tdengineUrl, DS_CODEC);

    const connection = {
      url: config.queueRedisUrl,
      // ⚠️ 消费者必须无限等待：BullMQ 的阻塞读命令不能因超时中断
      maxRetriesPerRequest: null
    };
    this.queue =
      deps.queue ??
      new Queue(DOWNSAMPLE_QUEUE, {
        prefix: TELEMETRY_QUEUE_PREFIX,
        connection
      });
    this.worker =
      deps.worker ??
      new Worker(DOWNSAMPLE_QUEUE, (job: Job) => this.onJob(job), {
        prefix: TELEMETRY_QUEUE_PREFIX,
        connection,
        // 同一级同时只跑一个；调度本身已按 (调度id, 下一次触发时刻) 派生确定性 jobId
        concurrency: 1
      });

    this.worker.on('failed', (job, error) => {
      const failure = classifyWriteError(error);
      this.logger.error(
        {
          jobId: job?.id,
          level: (job?.data as { level?: unknown } | undefined)?.level,
          attempts: job?.attemptsMade,
          code: failure.code,
          err: error instanceof Error ? error.message : String(error)
        },
        '降采样 job 失败'
      );
    });
    this.worker.on('error', error => {
      this.logger.warn(
        { err: String(error) },
        '降采样队列连接异常，将自动重连'
      );
    });
  }

  /**
   * 注册三条调度并开始消费。
   *
   * ⚠️ 调用方**不 await**（`void ring.start()`）：scheduler 注册不得因为 queue Redis 抖动
   * 让整个 worker 起不来（C1）。本方法自身不抛——注册失败只告警并稍后重试。
   */
  async start(): Promise<void> {
    await this.registerSchedulers();
  }

  /**
   * 按需重算一级的最近 K 个已闭合窗口。**可注入 `nowMs`**——单测与验收据它复算历史段。
   *
   * ⚠️ 任一环节失败**原样抛出**（C10）：交给 BullMQ 记入 failed/重试，绝不在此吞掉后报成功。
   */
  async recompute(level: DsLevel, nowMs: number = Date.now()): Promise<number> {
    const spec = levelSpec(level);
    const { startMs, endMs } = closedWindowRange(
      nowMs,
      spec,
      this.config.downsampleLookbackWindows
    );
    const reader = await this.readerClient();
    const rows = await reader.query(buildAggregateSql(spec, startMs, endMs));
    const aggregates = parseAggregateRows(rows, level);

    if (aggregates.length === 0) {
      // 空窗口不是失败：这一段确实没有原始数据，落 0 行是正确结果
      this.logger.debug({ level, startMs, endMs }, '降采样窗口无数据');
      return 0;
    }

    let affected: number;
    try {
      affected = await this.writer.write(aggregates);
    } catch (error) {
      // 连接级（可重试）错误才作废连接重连；数据/结构类错误连接是好的，不该重连
      if (classifyWriteError(error).kind === 'retryable')
        this.writer.invalidate();
      this.logger.error(
        {
          level,
          startMs,
          endMs,
          err: error instanceof Error ? error.message : String(error)
        },
        '降采样写入失败，交给队列重试'
      );
      throw error;
    }

    // ⭐ C10：写入行数少于提交数 ⇒ 必有行没落库。getLastAffected 不给行级定位 ⇒ 唯一可执行的
    // 处置是**响亮失败**（进 failed 集合），绝不吞掉后报成功。
    if (affected < aggregates.length) {
      throw new Error(
        `降采样写入行数少于提交行数：affected=${affected}, expected=${aggregates.length}`
      );
    }

    this.logger.info({ level, startMs, endMs, rows: affected }, '降采样完成');
    return affected;
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await this.worker.close();
    await this.queue.close();
    await this.writer.close();
    const sql = this.sql;
    this.sql = null;
    if (sql !== null) await sql.close();
  }

  private async onJob(job: Job): Promise<void> {
    const level = (job.data as { level?: unknown } | undefined)?.level;
    if (!isDsLevel(level)) {
      // 载荷非法：重试无意义，直接进 failed 集合
      throw new UnrecoverableError(
        `降采样 job 的 level 非法：${String(level)}`
      );
    }
    await this.recompute(level);
  }

  private async registerSchedulers(): Promise<void> {
    try {
      await this.queue.waitUntilReady();
      for (const spec of LEVEL_SPECS) {
        await this.queue.upsertJobScheduler(
          spec.schedule.id,
          repeatOptions(spec.schedule),
          {
            name: JOB_NAME,
            data: { level: spec.level },
            opts: JOB_OPTIONS
          }
        );
      }
      this.logger.info(
        { schedulers: LEVEL_SPECS.map(spec => spec.schedule.id) },
        '降采样调度已注册'
      );
    } catch (error) {
      if (this.closing) return;
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        '降采样调度注册失败，稍后重试'
      );
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.registerSchedulers();
      }, REGISTER_RETRY_MS);
    }
  }

  private async readerClient(): Promise<AggregateReader> {
    if (this.injectedReader !== undefined) return this.injectedReader;
    if (this.sql === null) {
      this.sql = await connectTd(this.config.tdengineUrl, RAW_DATABASE);
    }
    return this.sql;
  }
}

function repeatOptions(
  schedule: LevelSchedule
): { every: number } | { pattern: string; tz?: string } {
  return schedule.every !== undefined
    ? { every: schedule.every }
    : {
        pattern: schedule.pattern ?? '',
        ...(schedule.tz === undefined ? {} : { tz: schedule.tz })
      };
}

function isDsLevel(value: unknown): value is DsLevel {
  return (
    typeof value === 'string' &&
    (DS_LEVELS as readonly string[]).includes(value)
  );
}
