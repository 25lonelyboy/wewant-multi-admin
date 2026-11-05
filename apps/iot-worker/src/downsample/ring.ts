import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { TELEMETRY_QUEUE_PREFIX } from '@multi-admin/contracts';
import {
  DS_LEVELS,
  p1DeviceRegistry,
  type DsLevel
} from '@multi-admin/device-registry';
import { RAW_DATABASE } from '../schema.js';
import type { WorkerConfig } from '../config.js';
import {
  classifyWriteError,
  isConnectionLevel,
  UnrecoverableWriteError
} from '../failure.js';
import type { Logger } from '../logger.js';
import { connectTd, type TdRow, type TdSql } from '../tdengine/client.js';
import { TdengineWriter } from '../tdengine/writer.js';
import {
  LEVEL_SPECS,
  assertLevelCoverage,
  levelSpec,
  type DsLevelSpec,
  type LevelSchedule
} from './level.js';
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
 * 读连接**连续**失败达此数即丢 reader 重连（成功清零）。
 *
 * ⚠️ 与写入池的 `SLOT_FAILURE_LIMIT` 同一纪律：单次读错不丢（瞬时），连中两次才丢——兜住
 * "连接坏了但报的不是连接级码"（半开 socket）的**永久卡死**；否则失败的连接会被重试反复复用。
 */
const READER_FAILURE_LIMIT = 2;

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

/** 建一条读连接——生产是 `connectTd`；单测注入替身以制造"连接已废" */
export type TdConnect = (url: string, database?: string) => Promise<TdSql>;

/** 可注入依赖——单测注入替身以隔离 BullMQ 与 TDengine；生产一律走默认值 */
export interface RingDeps {
  connect?: TdConnect;
  writer?: TdengineWriter<DsAggregateRow>;
  queue?: Queue;
  worker?: Worker;
  /** 要重算的模型编码；缺省从 P1 档案去重。单测注入假列表覆盖多模型分支 */
  modelCodes?: readonly string[];
}

/** 档案里出现过的模型编码（去重）——建表与计算共用同一份来源 */
export function registryModelCodes(): string[] {
  return [
    ...new Set(p1DeviceRegistry.allSubtables().map(sub => sub.modelCode))
  ];
}

/**
 * 降采样环：进程内的一条独立链路，与消费环**并列**。
 *
 * ⭐ **三级平级**：每条调度各自从原始超表算（§4），互不依赖、可各自重试。
 * ⭐ 每次只算**最近 K 个已闭合窗口**、不记游标——晚到数据落在最近 K 个窗口内即被自愈（§3.2）。
 */
export class DownsampleRing {
  private readonly connect: TdConnect;
  private readonly writer: TdengineWriter<DsAggregateRow>;
  private readonly queue: Queue;
  private readonly worker: Worker;
  /**
   * 要重算的模型编码——**构造时快照一次**。
   *
   * ⚠️ 新模型加入档案后本进程不会自己发现，须重启 worker 才参与计算（今日的档案是编译期常量，
   * 无差别）。档案改成运行期可变（S2）之后，是「重读」还是「重启」由 D3 定；不要在这里默默改成
   * 每 tick 重读——那会把一次档案读取失败变成静默停摆。
   */
  private readonly modelCodes: readonly string[];

  private sql: TdSql | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private closing = false;
  /** 读连接连续失败计数——成功即清零；达上限就丢 reader（见 `READER_FAILURE_LIMIT`） */
  private readerFailures = 0;

  constructor(
    private readonly config: WorkerConfig,
    private readonly logger: Logger,
    deps: RingDeps = {}
  ) {
    // 级别口径漂移（DS_LEVELS ↔ LEVEL_SPECS）是静态错误，构造即响亮失败，不留到运行期才发现
    assertLevelCoverage();

    this.connect = deps.connect ?? connectTd;
    this.modelCodes = deps.modelCodes ?? registryModelCodes();
    this.writer =
      deps.writer ??
      new TdengineWriter<DsAggregateRow>(
        config.tdengineUrl,
        DS_CODEC,
        config.tdengineConnections
      );

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
   * 按需重算一级的最近 K 个已闭合窗口。`nowMs` 默认取墙上时钟——**生产路径**；
   * 单测与验收可注入它复算历史段。
   *
   * ⚠️ 每个模型编码各算一次（每条原始超表是独立输入）；**建表与计算必须同形**，
   * 否则会「建了 N 张超表、只算 1 张」。
   * ⚠️ 任一环节失败**原样抛出**（C10）：交给 BullMQ 记入 failed/重试，绝不在此吞掉后报成功。
   */
  async recompute(level: DsLevel, nowMs: number = Date.now()): Promise<number> {
    const spec = levelSpec(level);
    const { startMs, endMs } = closedWindowRange(
      nowMs,
      spec,
      this.config.downsampleLookbackWindows
    );

    let total = 0;
    for (const modelCode of this.modelCodes) {
      total += await this.recomputeModel(
        modelCode,
        level,
        spec,
        startMs,
        endMs
      );
    }
    return total;
  }

  private async recomputeModel(
    modelCode: string,
    level: DsLevel,
    spec: DsLevelSpec,
    startMs: number,
    endMs: number
  ): Promise<number> {
    const rows = await this.readAggregates(
      buildAggregateSql(modelCode, spec, startMs, endMs)
    );
    const aggregates = parseAggregateRows(rows, level);

    if (aggregates.length === 0) {
      // 空窗口不是失败：这一段确实没有原始数据，落 0 行是正确结果
      this.logger.debug(
        { modelCode, level, startMs, endMs },
        '降采样窗口无数据'
      );
      return 0;
    }

    let affected: number;
    try {
      affected = await this.writer.write(aggregates);
    } catch (error) {
      const failure = classifyWriteError(error);
      // ⭐ 作废收窄到**连接级**（行 5）：`kind==='retryable'` 是粗代理，含超时（105，可能已成功）、
      // 连接数上限（110）与判不出形态的默认桶——这些连接是好的，作废只会白白重连。
      if (failure.connectionLevel) this.writer.invalidate();
      this.logger.error(
        {
          modelCode,
          level,
          startMs,
          endMs,
          code: failure.code,
          err: error instanceof Error ? error.message : String(error)
        },
        '降采样写入失败，交给队列重试'
      );
      // B 类（格式 / 权限 / 表结构）重试无意义 ⇒ 抛 UnrecoverableError 直接进 failed 集合，
      // 不再空耗 attempts 次全窗扫描（与消费环同一纪律；仍然响亮失败，C10）
      throw failure.kind === 'unrecoverable'
        ? new UnrecoverableWriteError(failure, error)
        : error;
    }

    // ⭐ C10：写入行数少于提交数 ⇒ 必有行没落库。getLastAffected 不给行级定位 ⇒ 唯一可执行的
    // 处置是**响亮失败**（进 failed 集合），绝不吞掉后报成功。
    if (affected < aggregates.length) {
      throw new Error(
        `降采样写入行数少于提交行数：affected=${affected}, expected=${aggregates.length}`
      );
    }

    this.logger.info(
      { modelCode, level, startMs, endMs, rows: affected },
      '降采样完成'
    );
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

  /**
   * 跑一条聚合查询。
   *
   * ⚠️ 连接**不自我修复** ⇒ **连接级**读错（实测：108 / 104）即作废缓存的连接，下一次重连；
   * 不作废的话，失败的连接会被重试反复复用，三级重算**永久卡死**直到进程重启。
   * ⚠️ **非连接级**（确定性 SQL / 解析错）单次不丢（否则每次都白重连一次）；但**连续**达
   * `READER_FAILURE_LIMIT` 次也丢——兜住"半开连接报的不是 104/108"那类拿不到连接级码的死连接。
   */
  private async readAggregates(sqlText: string): Promise<TdRow[]> {
    try {
      const sql = await this.sqlClient();
      const rows = await sql.query(sqlText);
      this.readerFailures = 0; // 成功即清零
      return rows;
    } catch (error) {
      this.readerFailures += 1;
      if (
        isConnectionLevel(error) ||
        this.readerFailures >= READER_FAILURE_LIMIT
      ) {
        this.dropReader();
      }
      throw error;
    }
  }

  private async sqlClient(): Promise<TdSql> {
    if (this.sql === null) {
      this.sql = await this.connect(this.config.tdengineUrl, RAW_DATABASE);
    }
    return this.sql;
  }

  /** 作废读连接：置空引用，并尽力关闭旧句柄（不 await——半开连接的 close 可能挂起、拖住恢复） */
  private dropReader(): void {
    const stale = this.sql;
    this.sql = null;
    this.readerFailures = 0;
    if (stale !== null) void stale.close().catch(() => undefined);
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
