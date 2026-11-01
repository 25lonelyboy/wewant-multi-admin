import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { heartbeatKey } from './heartbeat.js';
import { createRedis, type RedisLike } from './redis-store.js';

export interface HealthcheckDeps {
  store: RedisLike;
  host: string;
  log: (message: string) => void;
}

/**
 * 心跳键存在即健康。
 *
 * 测什么：事件环停摆（定时器不再刷新）、队列 Redis 不可达（键过期）。
 * 不测：消费卡住但事件环正常——那是指标，不是 liveness。
 *
 * ⚠️ 这是容器 liveness 探针，不是重启器：compose 只把状态标成 `unhealthy`
 * 并在 `docker ps` 里可见，**不会**因 unhealthy 自动重启容器。
 */
export async function runHealthcheck(deps: HealthcheckDeps): Promise<number> {
  const value = await deps.store.get(heartbeatKey(deps.host));
  if (value === null) {
    deps.log('心跳键不存在或已过期');
    return 1;
  }
  return 0;
}

/**
 * 探针进程每次都是新连接，而 ioredis 在 socket 可写前会即时拒绝命令
 * （`enableOfflineQueue:false`），首次尝试常因建连竞态抛错。短暂重试，
 * 总耗时约 2 s，落在 compose healthcheck 的 5 s timeout 内。
 */
const CONNECT_RETRY_ATTEMPTS = 10;
const CONNECT_RETRY_DELAY_MS = 200;

async function checkWithRetry(deps: HealthcheckDeps): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CONNECT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await runHealthcheck(deps);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const url = process.env.QUEUE_REDIS_URL;
  if (url === undefined || url === '') {
    console.error('缺少 QUEUE_REDIS_URL');
    process.exitCode = 1;
    return;
  }

  const store = createRedis(url);
  try {
    process.exitCode = await checkWithRetry({
      store,
      host: hostname(),
      log: message => console.error(message)
    });
  } finally {
    store.disconnect();
  }
}

// 只在被 `node dist/healthcheck.js` 当作脚本执行时跑；被单测 import 时不产生副作用
if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch(error => {
    console.error('健康检查失败：', error);
    process.exit(1);
  });
}
