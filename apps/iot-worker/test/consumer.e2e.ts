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
import { TdengineWriter, type PendingRow } from '../src/tdengine/writer.js';
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { DS_DATABASE, RAW_DATABASE, dsSubtableName } from '../src/schema.js';
import { LEVEL_SPECS } from '../src/downsample/level.js';
import { lastClosedBoundary } from '../src/downsample/window.js';
import type { TdSql } from '../src/tdengine/client.js';

const SUBTABLE = ((): string => {
  const resolved = p1DeviceRegistry.resolve('sim-001');
  assert.ok(resolved.ok, 'sim-001 应在 P1 档案里');
  return resolved.subtable;
})();

/**
 * 删掉这段数据在三级降采样里可能产生的窗口行。
 *
 * 本进程不跑降采样环，但**另一个开着环的 worker**（含 CI 的 worker 容器）会把同一段算成
 * 1m/1h/1d 三行——只删 1m 会留下 1h/1d 的残留。
 */
async function deleteDsWindows(
  sql: TdSql,
  fromMs: number,
  toMs: number
): Promise<void> {
  for (const spec of LEVEL_SPECS) {
    const starts = new Set([
      lastClosedBoundary(fromMs, spec),
      lastClosedBoundary(toMs, spec)
    ]);
    for (const start of starts) {
      await sql
        .exec(
          `DELETE FROM ${DS_DATABASE}.${dsSubtableName(SUBTABLE, spec.level)} WHERE ts = ${start}`
        )
        .catch(() => undefined);
    }
  }
}

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

  const ts = Date.now();
  try {
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
    await deleteDsWindows(sql, ts, ts + 2);
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts >= ${ts} AND ts < ${ts + 3}`
      )
      .catch(() => undefined);
    await sql.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    destroyTd();
  }
});

/**
 * 替身：每次写入自带连接、写完即关；首次只落 n-1 行、报 n-1 ⇒ 制造一次"真实的部分成功"。
 *
 * 每次自带连接是刻意的——连接的生命周期归 `close()`，替身不共享连接，就不会在测试进程里
 * 留下挂住的孤儿连接。
 */
function partialFirstWriter(url: string): {
  writer: TdengineWriter;
  calls: () => number;
} {
  let calls = 0;
  const writer = {
    async write(rows: readonly PendingRow[]): Promise<number> {
      calls += 1;
      const real = new TdengineWriter(url);
      try {
        if (calls === 1 && rows.length > 1) {
          const dropped = rows.slice(0, rows.length - 1);
          await real.write(dropped);
          return dropped.length;
        }
        return await real.write(rows);
      } finally {
        await real.close();
      }
    },
    invalidate: (): void => undefined,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as TdengineWriter;
  return { writer, calls: () => calls };
}

void test('部分成功 ⇒ 整批重投：消息重试且不丢数据', async () => {
  const partialConfig = loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    // 条数触发即 flush，且间隔设得远大于用例时长 ⇒ 首个 flush 必是整批 3 行
    INGEST_BATCH_SIZE: '3',
    INGEST_FLUSH_INTERVAL_MS: '60000',
    INGEST_CONCURRENCY: '10'
  });

  const queue = new Queue(TELEMETRY_INGEST_QUEUE, {
    prefix: TELEMETRY_QUEUE_PREFIX,
    connection: { url: partialConfig.queueRedisUrl }
  });
  await queue.obliterate({ force: true }).catch(() => undefined);

  const sql = await connectTd(partialConfig.tdengineUrl, RAW_DATABASE);
  const { writer, calls } = partialFirstWriter(partialConfig.tdengineUrl);
  const consumer = new TelemetryConsumer(partialConfig, logger, { writer });
  consumer.start();

  const base = Date.now();
  try {
    for (const ts of [base, base + 1, base + 2]) {
      await queue.add('ingest', payload('sim-001', ts), {
        attempts: 3,
        backoff: { type: 'fixed', delay: 100 }
      });
    }

    // 若无重投：首次 flush 丢了 1 行并被 ack ⇒ COUNT 停在 2，这里超时
    await waitFor(async () => {
      const rows = await sql.query(
        `SELECT COUNT(*) FROM ${RAW_DATABASE}.telemetry WHERE ts >= ${base}`
      );
      return Number(rows[0]?.[0] ?? 0) >= 3;
    });

    assert.ok(calls() >= 2, `期望至少重投一次，实际 write 调用 ${calls()} 次`);

    const rows = await sql.query(
      `SELECT ts FROM ${RAW_DATABASE}.telemetry WHERE ts >= ${base} ORDER BY ts`
    );
    assert.equal(rows.length, 3);
    // 失败那轮不计数：written 只随成功那轮涨 3
    assert.equal(consumer.stats.written, 3);
  } finally {
    await consumer.close();
    await deleteDsWindows(sql, base, base + 2);
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts >= ${base} AND ts < ${base + 3}`
      )
      .catch(() => undefined);
    await sql.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    destroyTd();
  }
});
