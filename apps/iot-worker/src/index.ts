import { loadConfig } from './config.js';
import { TelemetryConsumer } from './consumer.js';
import { createLogger } from './logger.js';

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

logger.info(
  {
    queueRedisUrl: config.queueRedisUrl,
    tdengineUrl: config.tdengineUrl,
    batchSize: config.ingestBatchSize,
    flushIntervalMs: config.ingestFlushIntervalMs,
    concurrency: config.ingestConcurrency
  },
  'iot-worker 已启动'
);

const shutdown = (signal: string): void => {
  logger.info({ signal }, '收到停止信号，先落库再退出');
  consumer
    .close()
    .then(() => {
      logger.info(consumer.stats, 'iot-worker 已停止');
      process.exit(0);
    })
    .catch(error => {
      logger.error({ err: String(error) }, '停机失败');
      process.exit(1);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
