import { z } from 'zod';
import { MAX_BIND_ROWS } from './schema.js';

/**
 * 布尔型环境变量。
 *
 * ⚠️ 不能用 `z.coerce.boolean()`：它对任意非空字符串都返回 `true`（`Boolean('false') === true`），
 * 于是 `DOWNSAMPLE_ENABLED=false` 会被静默当成开启。只认 `true/false/1/0`（大小写不敏感）。
 */
const booleanEnv = (defaultValue: boolean) =>
  z
    .string()
    .default(String(defaultValue))
    .transform((value, ctx) => {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      ctx.addIssue({ code: 'custom', message: `不是布尔值：${value}` });
      return z.NEVER;
    });

/**
 * worker 的运行期配置。
 *
 * ⚠️ 队列 Redis 与业务缓存是**两个实例**（ADR-010 D4）：BullMQ 要求 `noeviction`，
 * 而该配置是实例级，业务缓存恰好希望有淘汰。
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['silent', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  /** 队列 Redis——与业务缓存的 `REDIS_URL` 不是一个实例 */
  QUEUE_REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6380'),
  /** TDengine taosAdapter 的 WebSocket 入口（REST 与 WebSocket 同端口） */
  TDENGINE_URL: z.string().min(1).default('ws://root:taosdata@127.0.0.1:6041'),
  /** 期望的服务器时区——窗口对齐靠它，不匹配则启动即失败 */
  TDENGINE_TIMEZONE: z.string().min(1).default('Asia/Shanghai'),
  /**
   * TDengine 连接池大小（2~4，默认 2）。同一池里一条连接挂掉只作废那一条，不全链路停摆
   * （决策 2 §9 的故障隔离）；连接数不是越大越好——服务端有真实的会话上限。
   */
  TDENGINE_CONNECTIONS: z.coerce.number().int().min(2).max(4).default(2),
  /**
   * 攒批：条数上限。
   * ⚠️ 上限 32767：单次 `bind` 的行数硬上限（2¹⁵−1，探针实测），超出会在写入时抛
   * `bind number out of range` ⇒ 必须在启动时挡下（行 2），不等到写的时候才炸。
   */
  INGEST_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_BIND_ROWS, {
      message: `不能超过单次 bind 上限 ${MAX_BIND_ROWS}（超出会抛 bind number out of range）`
    })
    .default(500),
  /** 攒批：等待上限（毫秒），与条数先到先 flush */
  INGEST_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  /**
   * Worker 并发。⭐ **它同时是"一批最多攒多少条"**：BullMQ 逐 job 调处理器、
   * 处理器返回的 Promise 由整批的写入结果兑现，所以在手的条数就是并发数 ⇒
   * 攒批靠这个值，不靠逐条处理。
   */
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(500),
  /** 降采样开关：关掉只跑消费环（排障用） */
  DOWNSAMPLE_ENABLED: booleanEnv(true),
  /** 每次重算的窗口数 K——晚到数据只要落在最近 K 个窗口内即被自愈 */
  DOWNSAMPLE_LOOKBACK_WINDOWS: z.coerce.number().int().positive().default(3)
});

export interface WorkerConfig {
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** 队列 Redis——与业务缓存的 `REDIS_URL` 不是一个实例 */
  queueRedisUrl: string;
  /** TDengine taosAdapter 的 WebSocket 入口（REST 与 WebSocket 同端口） */
  tdengineUrl: string;
  /** 期望的服务器时区——窗口对齐靠它，不匹配则启动即失败 */
  tdengineTimezone: string;
  /** TDengine 连接池大小（2~4）——一条挂掉不全链路停摆（决策 2 §9） */
  tdengineConnections: number;
  ingestBatchSize: number;
  ingestFlushIntervalMs: number;
  ingestConcurrency: number;
  downsampleEnabled: boolean;
  downsampleLookbackWindows: number;
}

/** 读取并校验环境变量；不合法直接抛，不让进程带着半截配置跑起来 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `环境变量不合法：${parsed.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    logLevel: parsed.data.LOG_LEVEL,
    queueRedisUrl: parsed.data.QUEUE_REDIS_URL,
    tdengineUrl: parsed.data.TDENGINE_URL,
    tdengineTimezone: parsed.data.TDENGINE_TIMEZONE,
    tdengineConnections: parsed.data.TDENGINE_CONNECTIONS,
    ingestBatchSize: parsed.data.INGEST_BATCH_SIZE,
    ingestFlushIntervalMs: parsed.data.INGEST_FLUSH_INTERVAL_MS,
    ingestConcurrency: parsed.data.INGEST_CONCURRENCY,
    downsampleEnabled: parsed.data.DOWNSAMPLE_ENABLED,
    downsampleLookbackWindows: parsed.data.DOWNSAMPLE_LOOKBACK_WINDOWS
  };
}
