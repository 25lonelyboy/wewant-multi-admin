import { z } from 'zod';

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
  /** 攒批：条数上限 */
  INGEST_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  /** 攒批：等待上限（毫秒），与条数先到先 flush */
  INGEST_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  /**
   * Worker 并发。⭐ **它同时是"一批最多攒多少条"**：BullMQ 逐 job 调处理器、
   * 处理器返回的 Promise 由整批的写入结果兑现，所以在手的条数就是并发数 ⇒
   * 攒批靠这个值，不靠逐条处理。
   */
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(500)
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
  ingestBatchSize: number;
  ingestFlushIntervalMs: number;
  ingestConcurrency: number;
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
    ingestBatchSize: parsed.data.INGEST_BATCH_SIZE,
    ingestFlushIntervalMs: parsed.data.INGEST_FLUSH_INTERVAL_MS,
    ingestConcurrency: parsed.data.INGEST_CONCURRENCY
  };
}
