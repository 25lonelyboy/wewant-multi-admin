import { loadConfig } from './config.js';
import { TelemetryConsumer } from './consumer.js';
import { DownsampleLeader } from './downsample/ring.js';
import { startHeartbeat } from './heartbeat.js';
import { createLogger } from './logger.js';
import { createRedis } from './redis-store.js';
import { RegistrySnapshotClient } from './snapshot/client.js';
import { destroyTd } from './tdengine/client.js';

/**
 * 消费者进程入口。
 *
 * ⚠️ 它与 HTTP 服务**并列**，不是它的模块：可独立启停、可多实例、可独立扩缩
 * （缓冲层 §2.2）。本进程不受 C1 约束——它是专职进程，TDengine 不可达**就该**起不来。
 */
const config = loadConfig();
const logger = createLogger(config);

// ⭐ 冷启动门禁：快照拉不到就不构造消费环与降采样环。用空快照跑会把全部数据当
// `unknown-device` 丢掉，且计数看起来像设备故障；业务 Redis 挂了、队列还在时，积压比静默丢数据好。
const snapshot = new RegistrySnapshotClient(config, logger);
await snapshot.start();

const consumer = new TelemetryConsumer(config, logger, snapshot);
consumer.start();

// 心跳：事件环在转 + 队列 Redis 可达时定时刷新键；卡死则键过期，容器探针据此判 unhealthy
const heartbeat = startHeartbeat(createRedis(config.queueRedisUrl), logger);

// 降采样环与消费环**并列**、各自独立队列：任一条跑挂不得带走另一条（§3.5）
// ⭐ 只有 leader 才持有环：任何时刻一个写者、一份快照，模型集合 / 版本 / 重叠窗口三类不一致一起消失
const leader = config.downsampleEnabled
  ? new DownsampleLeader(config, logger, snapshot)
  : null;
// ⚠️ 不 await：选主不得因为 queue Redis 抖动挡住进程启动（C1）；start() 自身不抛
void leader?.start();

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

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, '收到停止信号，先落库再退出');
  try {
    await Promise.all([
      consumer.close(),
      leader?.close() ?? Promise.resolve(),
      heartbeat.stop(),
      snapshot.close()
    ]);
    logger.info(consumer.stats, 'iot-worker 已停止');
    destroyTd();
    process.exit(0);
  } catch (error) {
    logger.error({ err: String(error) }, '停机失败');
    destroyTd();
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
