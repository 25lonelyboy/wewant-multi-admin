import { loadConfig } from './config.js';
import { TelemetryConsumer } from './consumer.js';
import { DownsampleRing } from './downsample/ring.js';
import { createLogger } from './logger.js';
import { destroyTd } from './tdengine/client.js';

/**
 * 消费者进程入口。
 *
 * ⚠️ 它与 HTTP 服务**并列**，不是它的模块：可独立启停、可多实例、可独立扩缩
 * （缓冲层 §2.2）。本进程不受 C1 约束——它是专职进程，TDengine 不可达**就该**起不来。
 */
const config = loadConfig();
const logger = createLogger(config);

const consumer = new TelemetryConsumer(config, logger);
consumer.start();

// 降采样环与消费环**并列**、各自独立队列：任一条跑挂不得带走另一条（§3.5）
const ring = config.downsampleEnabled
  ? new DownsampleRing(config, logger)
  : null;
// ⚠️ 不 await：调度注册不得因为 queue Redis 抖动挡住进程启动（C1）；start() 自身不抛
void ring?.start();

logger.info(
  {
    queueRedisUrl: config.queueRedisUrl,
    tdengineUrl: config.tdengineUrl,
    tdengineConnections: config.tdengineConnections,
    batchSize: config.ingestBatchSize,
    flushIntervalMs: config.ingestFlushIntervalMs,
    concurrency: config.ingestConcurrency,
    downsampleEnabled: config.downsampleEnabled,
    downsampleLookbackWindows: config.downsampleLookbackWindows
  },
  'iot-worker 已启动'
);

const shutdown = (signal: string): void => {
  logger.info({ signal }, '收到停止信号，先落库再退出');
  Promise.all([consumer.close(), ring?.close() ?? Promise.resolve()])
    .then(() => {
      logger.info(consumer.stats, 'iot-worker 已停止');
      // 释放连接器持有的全局资源（连接池 / 定时器等）——不调它进程可能停不干净
      destroyTd();
      process.exit(0);
    })
    .catch(error => {
      logger.error({ err: String(error) }, '停机失败');
      destroyTd();
      process.exit(1);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
