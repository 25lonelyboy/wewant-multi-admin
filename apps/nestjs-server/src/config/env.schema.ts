import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:8848'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.string().min(1),
  MQTT_URL: z.url().default('mqtt://127.0.0.1:1883'),
  /** 订阅端 clientId：**固定**才能配合 `clean=false` 用上持久会话；每次重启换 id 会让会话白搭 */
  MQTT_CLIENT_ID: z.string().min(1).default('wewant-iot-subscriber'),
  /**
   * 会话是否**干净起始**（MQTT 5 的 Clean Start）。缺省 `false`——保留跨重连的持久会话，
   * QoS 1 的未确认投递才可能在重连后补上（生产口径）。
   *
   * ⚠️ 置 `true` 时 Broker 会**丢弃同 clientId 的既有会话及其排队报文**，随后每次连接都从零开始
   * ⇒ e2e 复跑用它甩掉上一轮遗留的 QoS1 积压，避免旧报文混进本轮的计数断言。
   */
  MQTT_CLEAN_SESSION: z.enum(['true', 'false']).default('false'),
  /** 持久会话的过期秒数；0 表示连接断开即结束会话 */
  MQTT_SESSION_EXPIRY_SECONDS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(86400),
  /** 队列 Redis——与业务缓存 `REDIS_URL` 是**两个实例**（ADR-010 D4） */
  QUEUE_REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6380'),
  /** TDengine taosAdapter 的 WebSocket 入口；与 worker 同名同默认，容器内必须显式传 */
  TDENGINE_URL: z.string().min(1).default('ws://root:taosdata@127.0.0.1:6041'),
  /** 队列不可达时落本地的目录；不挂卷则容器一重建，缓冲就白做 */
  IOT_SPILL_DIR: z.string().min(1).default('./.spill'),
  /** 本地缓冲上限（字节）；超过即**停订阅 + 告警**，不静默丢数据 */
  IOT_SPILL_MAX_BYTES: z.coerce.number().int().positive().default(268_435_456),
  /**
   * 单条上行报文的字节上限（默认 256 KiB）。超限报文在**入队之前**拒收并计入独立去向
   * `oversized`——它是"报文本身不合格"，不是"丢弃"（缓冲满 / 落盘失败）。
   * ⚠️ EMQX 的 `max_packet_size` 保持默认 1 MB 作硬顶：留出 256 KiB–1 MB 这一段，
   * 误配置的设备才能被应用侧计数到。
   */
  IOT_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(262_144),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BODY_LIMIT: z.string().default('1mb'),
  UPLOAD_BODY_LIMIT: z.string().default('10mb'),
  PRISMA_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
  PRISMA_QUERY_LOG: z.enum(['true', 'false']).default('false')
});

export const envSchema = baseEnvSchema.superRefine((value, ctx) => {
  if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_REFRESH_SECRET'],
      message: 'JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 必须不同'
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * 供 @nestjs/config 的 validate 选项使用：校验失败直接抛出，启动即崩、快速暴露部署问题。
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败:\n${details}`);
  }
  return parsed.data;
}
