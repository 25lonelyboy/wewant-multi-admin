import { hostname } from 'node:os';
import { checkWithRetry } from './healthcheck-core.js';
import { createRedis } from './redis-store.js';

/**
 * 容器健康探针的入口。
 *
 * ⚠️ 不设"是否被当作脚本执行"的守卫：守卫一旦失配（入口改名、经过符号链接、
 * 被 `--import` 加载），进程会静默退出 0，探针就永远报健康——那是 liveness
 * 探针最坏的失败形态。判断逻辑留在 `healthcheck-core.ts`，由单测直接调用；
 * 本文件只负责拿配置、建连、退出码。
 */
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

void main().catch(error => {
  console.error('健康检查失败：', error);
  process.exit(1);
});
