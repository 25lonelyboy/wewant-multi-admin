import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Queue } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import { loadConfig } from '../src/config.js';
import { TelemetryConsumer } from '../src/consumer.js';
import { createLogger } from '../src/logger.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { RAW_DATABASE } from '../src/schema.js';

// 连接器会把 winston 的 uncaughtException 处理器摘掉（见 client.ts），这里补上自己的：
// 否则未捕获异常会让进程静默退出，什么也看不到。
process.on('uncaughtException', error => {
  console.error('UNCAUGHT:', error);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// 队列与 TDengine 都没有假实现可用：这段接线正是本应用唯一带真实外部依赖的部分，
// 用真实的 redis-queue 与 taosAdapter 验证。本地需先 pnpm ops:env-up。
const config = loadConfig({
  ...process.env,
  LOG_LEVEL: 'silent',
  INGEST_FLUSH_INTERVAL_MS: '200',
  INGEST_CONCURRENCY: '50'
});
const logger = createLogger(config);

function payload(localDeviceId: string, ts: number): string {
  return JSON.stringify({
    localDeviceId,
    ts,
    metrics: [
      { key: 'temperature', value: 62.4, unit: '°C' },
      { key: 'current', value: 4.31, unit: 'A' }
    ]
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 20_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`等待超时：条件在 ${timeoutMs}ms 内未成立`);
}

void test('队列 → 消费者 → TDengine：合法报文落库，坏报文与未知测点被计数', async () => {
  const queue = new Queue(TELEMETRY_INGEST_QUEUE, {
    prefix: TELEMETRY_QUEUE_PREFIX,
    connection: { url: config.queueRedisUrl }
  });
  await queue.obliterate({ force: true }).catch(() => undefined);

  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const consumer = new TelemetryConsumer(config, logger);
  consumer.start();

  try {
    const ts = Date.now();
    await queue.add('ingest', payload('sim-001', ts));
    await queue.add('ingest', payload('sim-001', ts + 1));
    // 坏 JSON：原样入队 → 消费者判 malformed，不入库
    await queue.add('ingest', 'not-json');
    // 未知测点：只丢那个测点，同条里合法的照写
    await queue.add(
      'ingest',
      JSON.stringify({
        localDeviceId: 'sim-001',
        ts: ts + 2,
        metrics: [
          { key: 'temperature', value: 61.1, unit: '°C' },
          { key: 'pressure', value: 101.3, unit: 'kPa' }
        ]
      })
    );

    await waitFor(async () => {
      const rows = await sql.query(
        `SELECT COUNT(*) FROM ${RAW_DATABASE}.telemetry WHERE ts >= ${ts}`
      );
      return Number(rows[0]?.[0] ?? 0) >= 3;
    });

    const rows = await sql.query(
      `SELECT ts, temperature, current FROM ${RAW_DATABASE}.telemetry WHERE ts >= ${ts} ORDER BY ts`
    );
    assert.equal(rows.length, 3);
    // 第三条只带了 temperature，current 整列不写 ⇒ 落成 NONE
    // （连接器把 NULL 渲染成字符串 'NULL' 而不是 null，两种都认）
    const missing = rows[2]?.[2];
    assert.ok(
      missing === null || missing === 'NULL',
      `期望 current 无值，实际 ${String(missing)}`
    );

    const stats = consumer.stats;
    assert.equal(stats.received, 4);
    assert.equal(stats.written, 3);
    assert.equal(stats.rejected, 1);
    assert.equal(stats.unknownMetrics, 1);
  } finally {
    await consumer.close();
    await sql.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    destroyTd();
  }
});
