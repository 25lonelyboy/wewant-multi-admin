import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job, Worker } from 'bullmq';
import { loadConfig } from '../src/config.js';
import { TelemetryConsumer } from '../src/consumer.js';
import { createLogger } from '../src/logger.js';
import type { PendingRow, TdengineWriter } from '../src/tdengine/writer.js';

/** 一条合法报文——`sim-001` 在 P1 档案里，查档必成 */
function payload(ts: number): string {
  return JSON.stringify({
    localDeviceId: 'sim-001',
    ts,
    metrics: [{ key: 'temperature', value: 62.4, unit: '°C' }]
  });
}

/** `write()` 的返回由用例给定；顺带记录调用次数与作废次数 */
function fakeWriter(onWrite: (rows: readonly PendingRow[]) => number): {
  writer: TdengineWriter;
  invalidations: () => number;
} {
  let invalidations = 0;
  const writer = {
    write: (rows: readonly PendingRow[]): Promise<number> =>
      Promise.resolve(onWrite(rows)),
    invalidate: (): void => {
      invalidations += 1;
    },
    close: (): Promise<void> => Promise.resolve()
  } as unknown as TdengineWriter;
  return { writer, invalidations: () => invalidations };
}

/** BullMQ worker 替身：本单测不走队列，只用到 `on()` / `close()`——用于隔离真实 redis */
function fakeWorker(): Worker {
  return {
    on: () => undefined,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
}

function makeConsumer(
  writer: TdengineWriter,
  batchSize: number
): TelemetryConsumer {
  const config = loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    INGEST_BATCH_SIZE: String(batchSize)
  });
  return new TelemetryConsumer(config, createLogger(config), {
    writer,
    worker: fakeWorker()
  });
}

/** 取私有处理器入口——生产路径由 BullMQ worker 逐 job 调用 */
function processor(consumer: TelemetryConsumer): (job: Job) => Promise<void> {
  return (consumer as unknown as { onJob(job: Job): Promise<void> }).onJob.bind(
    consumer
  );
}

const job = (data: unknown): Job => ({ data }) as unknown as Job;

void test('单行部分成功（affected < 提交数）⇒ reject，且不累加 written', async () => {
  const { writer, invalidations } = fakeWriter(() => 0);
  const consumer = makeConsumer(writer, 1);
  try {
    await assert.rejects(processor(consumer)(job(payload(Date.now()))));
    assert.equal(consumer.stats.written, 0);
    assert.equal(invalidations(), 1);
  } finally {
    await consumer.close();
  }
});

void test('多行部分成功 ⇒ 同批每个 waiter 都 reject，written 不涨', async () => {
  const { writer } = fakeWriter(rows => rows.length - 1);
  const consumer = makeConsumer(writer, 2);
  try {
    const run = processor(consumer);
    const first = run(job(payload(Date.now())));
    const second = run(job(payload(Date.now() + 1)));
    await assert.rejects(Promise.all([first, second]));
    assert.equal(consumer.stats.written, 0);
  } finally {
    await consumer.close();
  }
});

void test('全部成功 ⇒ resolve，written 按提交数累加', async () => {
  const { writer, invalidations } = fakeWriter(rows => rows.length);
  const consumer = makeConsumer(writer, 2);
  try {
    const run = processor(consumer);
    await Promise.all([
      run(job(payload(Date.now()))),
      run(job(payload(Date.now() + 1)))
    ]);
    assert.equal(consumer.stats.written, 2);
    assert.equal(invalidations(), 0);
  } finally {
    await consumer.close();
  }
});

void test('写入抛异常 ⇒ 整批 reject，且不累加 written', async () => {
  const { writer, invalidations } = fakeWriter(() => {
    throw new Error('TDengine 连接已废');
  });
  const consumer = makeConsumer(writer, 1);
  try {
    await assert.rejects(processor(consumer)(job(payload(Date.now()))));
    assert.equal(consumer.stats.written, 0);
    assert.equal(invalidations(), 1);
  } finally {
    await consumer.close();
  }
});
