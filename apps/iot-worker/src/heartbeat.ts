import { hostname } from 'node:os';
import { TELEMETRY_QUEUE_PREFIX } from '@multi-admin/contracts';
import type { RedisLike } from './redis-store.js';

/** 键的存活时间；进程卡死时靠它自己过期 */
export const HEARTBEAT_TTL_SECONDS = 30;
/** 刷新间隔，必须明显小于 TTL */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * 带容器主机名：多实例部署时，一个健康实例的心跳不会顶掉另一个卡死实例的。
 */
export function heartbeatKey(host: string): string {
  return `${TELEMETRY_QUEUE_PREFIX}:worker:hb:${host}`;
}

export interface HeartbeatTimer {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface HeartbeatOptions {
  host?: string;
  intervalMs?: number;
  ttlSeconds?: number;
  timer?: HeartbeatTimer;
}

export interface Heartbeat {
  stop(): Promise<void>;
}

interface HeartbeatLogger {
  warn(obj: object, msg: string): void;
}

const REAL_TIMER: HeartbeatTimer = {
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
  clearInterval: id =>
    globalThis.clearInterval(id as ReturnType<typeof setInterval>)
};

/**
 * 只反映"事件环还在转 + 队列 Redis 可达"，不反映消费进度。
 * 定时器与存储都可注入，单测不需要真 Redis、也不需要真等待。
 */
export function startHeartbeat(
  store: RedisLike,
  logger: HeartbeatLogger,
  options: HeartbeatOptions = {}
): Heartbeat {
  const host = options.host ?? hostname();
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const ttlSeconds = options.ttlSeconds ?? HEARTBEAT_TTL_SECONDS;
  const timer = options.timer ?? REAL_TIMER;
  const key = heartbeatKey(host);
  let warned = false;

  const beat = async (): Promise<void> => {
    try {
      await store.set(
        key,
        JSON.stringify({ pid: process.pid, ts: Date.now() }),
        ttlSeconds
      );
      warned = false;
    } catch (error) {
      if (!warned) {
        warned = true;
        logger.warn({ err: String(error) }, '心跳写入失败（本次进程只记一次）');
      }
    }
  };

  void beat();
  const timerId = timer.setInterval(() => void beat(), intervalMs);

  return {
    async stop(): Promise<void> {
      timer.clearInterval(timerId);
      try {
        await store.del(key);
      } catch {
        // 退出路径不因心跳失败而阻塞
      }
      store.disconnect();
    }
  };
}
