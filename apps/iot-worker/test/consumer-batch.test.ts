import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Job, type Worker } from 'bullmq';
import type {
  PropertyDecl,
  RegistrySnapshot
} from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { TelemetryConsumer, dedupeInBatch } from '../src/consumer.js';
import { createLogger } from '../src/logger.js';
import { buildIndex, type SnapshotSource } from '../src/snapshot/client.js';
import type { PendingRow, TdengineWriter } from '../src/tdengine/writer.js';

/**
 * 攒批与批内去重的单测——都不走队列 / TDengine（注入替身）。
 *
 * ⚠️ 这些用例**不调 `consumer.start()`**：不挂定时器，于是 flush **只可能**由"攒批条数触发"
 * 这条路走到（正是要钉的那条），排除了 `INGEST_FLUSH_INTERVAL_MS` 的定时兜底把用例蒙混过去。
 */

/** `sim-001` 在快照里，声明了一个 float 测点 */
function fakeSnapshot(): SnapshotSource {
  const temperature: PropertyDecl = {
    key: 'temperature',
    kind: 'float',
    unit: '°C',
    range: { min: -50, max: 200 },
    aggregates: ['sum']
  };
  const snapshot: RegistrySnapshot = {
    version: 1,
    builtAt: '1970-01-01T00:00:00.000Z',
    models: [
      {
        modelCode: 'p1',
        rawColumns: [{ name: 'temperature', bindKind: 'float' }],
        dsColumns: [],
        versions: [
          {
            version: 1,
            effectiveFrom: '1970-01-01T00:00:00.000Z',
            effectiveTo: null,
            properties: [temperature]
          }
        ]
      }
    ],
    devices: [
      {
        localDeviceId: 'sim-001',
        deviceId: 'ABCDEFGHIJKLMNOP',
        modelCode: 'p1',
        fromAt: '1970-01-01T00:00:00.000Z',
        toAt: null
      }
    ]
  };
  const index = buildIndex(snapshot);
  return { currentIndex: () => index };
}

/** 一条合法报文——`sim-001` 在快照里，查档必成 */
function payload(ts: number): string {
  return JSON.stringify({
    localDeviceId: 'sim-001',
    ts,
    metrics: [{ key: 'temperature', value: 62.4, unit: '°C' }]
  });
}

/** 记录每次 `write` 的入参，返回提交行数 */
function recordingWriter(): {
  writer: TdengineWriter;
  calls: () => number;
  last: () => readonly PendingRow[];
} {
  let calls = 0;
  let last: readonly PendingRow[] = [];
  const writer = {
    write: (rows: readonly PendingRow[]): Promise<number> => {
      calls += 1;
      last = rows;
      return Promise.resolve(rows.length);
    },
    invalidate: (): void => undefined,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as TdengineWriter;
  return { writer, calls: () => calls, last: () => last };
}

/** BullMQ worker 替身：单测不走队列，只用到 `on()` / `close()` */
function fakeWorker(): Worker {
  const worker = {
    on: (): Worker => worker,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
  return worker;
}

function makeConsumer(
  writer: TdengineWriter,
  batchSize: number
): TelemetryConsumer {
  const config = loadConfig({
    ...process.env,
    REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
    LOG_LEVEL: 'silent',
    INGEST_BATCH_SIZE: String(batchSize)
  });
  return new TelemetryConsumer(config, createLogger(config), fakeSnapshot(), {
    writer,
    worker: fakeWorker(),
    // 本文件的 ts 是任意毫秒小值：固定时钟让它们落在时间戳上下界内
    now: () => 10_000
  });
}

/** 取私有处理器入口——生产路径由 BullMQ worker 逐 job 调用 */
function processor(consumer: TelemetryConsumer): (job: Job) => Promise<void> {
  return (consumer as unknown as { onJob(job: Job): Promise<void> }).onJob.bind(
    consumer
  );
}

const job = (data: unknown): Job => ({ data }) as unknown as Job;

/** 让已排入微任务队列的回调跑完，再看是否有写入发生 */
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/**
 * 给一个可能永不落定的 Promise 加上界。
 *
 * ⭐ 本文件刻意不挂 flush 定时器，于是"达到条数阈值"是唯一的落定路径——一旦那条触发失效，
 * await 会**永久挂起**（node:test 默认无单测超时）直到 CI 作业超时，而不是失败。用有界的
 * race 让回归**响亮且立刻**地失败。落定即清定时器，不留悬挂句柄。
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`超时（${ms}ms）：${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function row(subtable: string, ts: number, value: number): PendingRow {
  return {
    subtable,
    ts,
    metrics: [{ key: 'temperature', bindKind: 'float', value }]
  };
}

void test('dedupeInBatch：同 (子表, ts) 只留最后一条，异子表 / 异 ts 各留一条', () => {
  const first = row('s', 1, 1);
  const sameKey = row('s', 1, 2); // 同 (子表, ts) ⇒ 覆盖 first
  const otherTs = row('s', 2, 3);
  const otherTable = row('t', 1, 4);

  const out = dedupeInBatch([first, sameKey, otherTs, otherTable]);

  assert.equal(out.length, 3, '只有键相同的那一对被并成一条');
  // 保留的是**最后**一条：TDengine 同 ts 覆盖语义下，先写的那条本就会被后写的顶掉
  assert.equal(
    out.find(r => r.subtable === 's' && r.ts === 1)?.metrics[0]?.value,
    2
  );
  assert.equal(
    out.find(r => r.subtable === 't' && r.ts === 1)?.metrics[0]?.value,
    4
  );
});

void test('⭐ 攒批条数触发：达到 INGEST_BATCH_SIZE 才 flush，且只 flush 一次', async () => {
  const { writer, calls, last } = recordingWriter();
  const consumer = makeConsumer(writer, 3);
  try {
    const run = processor(consumer);
    const first = run(job(payload(1_000)));
    const second = run(job(payload(2_000)));

    // 未达阈值：写入器一次都没被调用，前两个 Promise 也仍 pending（未 ack）
    await tick();
    assert.equal(calls(), 0, '未达阈值不该 flush');

    const third = run(job(payload(3_000)));
    // 有界等待：条数触发若失效，三个 Promise 永不落定 ⇒ 立刻失败而非挂到作业超时
    await withTimeout(
      Promise.all([first, second, third]),
      2_000,
      '达到阈值应触发整批 flush'
    );

    assert.equal(calls(), 1, '达到阈值只 flush 一次（整批一起）');
    assert.equal(last().length, 3, '本批应装入三条');
  } finally {
    await consumer.close();
  }
});

void test('⭐ 批内同 (子表, ts)：只提交一份、计入 duplicateInBatch，且不算部分成功', async () => {
  const { writer, last } = recordingWriter();
  // 条数触发即 flush，且不挂定时器 ⇒ 首个 flush 就是这两条
  const consumer = makeConsumer(writer, 2);
  try {
    const run = processor(consumer);
    const ts = 5_000;
    // 同一个 ts 的两条报文：去重后应合成一行
    await withTimeout(
      Promise.all([run(job(payload(ts))), run(job(payload(ts)))]),
      2_000,
      '达到阈值应触发整批 flush'
    );

    assert.equal(consumer.stats.duplicateInBatch, 1, '应计一条批内重复');
    assert.equal(
      last().length,
      1,
      '去重后只提交一份（否则会被误报成部分成功）'
    );
    assert.equal(consumer.stats.written, 1, '按去重后的行数累加');
  } finally {
    await consumer.close();
  }
});

void test('异 ts 的批内行不去重，duplicateInBatch 保持 0', async () => {
  const { writer } = recordingWriter();
  const consumer = makeConsumer(writer, 2);
  try {
    const run = processor(consumer);
    await withTimeout(
      Promise.all([run(job(payload(7_000))), run(job(payload(7_001)))]),
      2_000,
      '达到阈值应触发整批 flush'
    );
    assert.equal(consumer.stats.duplicateInBatch, 0);
    assert.equal(consumer.stats.written, 2);
  } finally {
    await consumer.close();
  }
});
