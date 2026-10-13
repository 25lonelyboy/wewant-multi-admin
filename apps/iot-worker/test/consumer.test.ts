import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnrecoverableError, type Job, type Worker } from 'bullmq';
import { loadConfig } from '../src/config.js';
import { TelemetryConsumer } from '../src/consumer.js';
import { createLogger, type Logger } from '../src/logger.js';
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
interface FakeWorker {
  worker: Worker;
  /** 手动触发注册在 `'failed'` 上的处理器 */
  emitFailed: (job: Job, error: unknown) => void;
}

function fakeWorker(): FakeWorker {
  let failed: ((job: Job, error: unknown) => void) | null = null;
  const worker = {
    on: (event: string, handler: (...args: unknown[]) => void): Worker => {
      if (event === 'failed') {
        failed = handler as (job: Job, error: unknown) => void;
      }
      return worker;
    },
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
  return {
    worker,
    emitFailed: (job, error) => {
      failed?.(job, error);
    }
  };
}

/** 记录日志调用（级别 + 字段 + 文案）的替身 */
interface SpyLogger {
  logger: Logger;
  calls: { level: string; fields: unknown; msg: string }[];
}

function spyLogger(): SpyLogger {
  const calls: SpyLogger['calls'] = [];
  const make =
    (level: string) =>
    (fields: unknown, msg?: string): void => {
      calls.push({
        level,
        fields,
        msg:
          typeof msg === 'string'
            ? msg
            : typeof fields === 'string'
              ? fields
              : ''
      });
    };
  const logger = {
    fatal: make('fatal'),
    error: make('error'),
    warn: make('warn'),
    info: make('info'),
    debug: make('debug'),
    trace: make('trace')
  } as unknown as Logger;
  return { logger, calls };
}

function makeConsumer(
  writer: TdengineWriter,
  batchSize: number,
  deps: { worker?: Worker; logger?: Logger } = {}
): TelemetryConsumer {
  const config = loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    INGEST_BATCH_SIZE: String(batchSize)
  });
  return new TelemetryConsumer(config, deps.logger ?? createLogger(config), {
    writer,
    worker: deps.worker ?? fakeWorker().worker
  });
}

/** 取私有处理器入口——生产路径由 BullMQ worker 逐 job 调用 */
function processor(consumer: TelemetryConsumer): (job: Job) => Promise<void> {
  return (consumer as unknown as { onJob(job: Job): Promise<void> }).onJob.bind(
    consumer
  );
}

const job = (data: unknown): Job => ({ data }) as unknown as Job;

void test('单行部分成功（affected < 提交数）⇒ reject，不累加 written，且不作废连接', async () => {
  const { writer, invalidations } = fakeWriter(() => 0);
  const consumer = makeConsumer(writer, 1);
  try {
    await assert.rejects(processor(consumer)(job(payload(Date.now()))));
    assert.equal(consumer.stats.written, 0);
    // 能拿到结果说明连接是好的——部分成功不该作废连接（行 5）
    assert.equal(invalidations(), 0);
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

void test('连接级写入失败（108）⇒ 整批 reject、作废连接，且不累加 written', async () => {
  const { writer, invalidations } = fakeWriter(() => {
    throw codedError('TaosResultError', 108, 'Invalid websocket connection');
  });
  const consumer = makeConsumer(writer, 1);
  try {
    await assert.rejects(processor(consumer)(job(payload(Date.now()))));
    assert.equal(consumer.stats.written, 0);
    assert.equal(invalidations(), 1, '连接级错误应作废连接');
  } finally {
    await consumer.close();
  }
});

void test('⭐ 超时（105）⇒ 整批 reject，但**不作废**连接（连接是好的，行 5）', async () => {
  const { writer, invalidations } = fakeWriter(() => {
    throw codedError('TDWebSocketClientError', 105, 'websocket query timeout');
  });
  const consumer = makeConsumer(writer, 1);
  try {
    await assert.rejects(processor(consumer)(job(payload(Date.now()))));
    assert.equal(consumer.stats.written, 0);
    assert.equal(invalidations(), 0, '超时"可能已成功"，但连接没坏，不该作废');
  } finally {
    await consumer.close();
  }
});

void test('⭐ 全列皆未知 ⇒ 告警带上报的 key，并计入 unknownMetrics（行 4）', async () => {
  const { logger, calls } = spyLogger();
  const { writer } = fakeWriter(rows => rows.length);
  const consumer = makeConsumer(writer, 1, { logger });
  try {
    const data = JSON.stringify({
      localDeviceId: 'sim-001',
      ts: Date.now(),
      metrics: [{ key: 'pressure', value: 1, unit: 'kPa' }]
    });
    await processor(consumer)(job(data));
    assert.equal(consumer.stats.rejected, 1);
    assert.equal(consumer.stats.unknownMetrics, 1);
    const line = calls.find(
      call =>
        call.level === 'warn' &&
        Array.isArray((call.fields as { keys?: unknown }).keys)
    );
    assert.deepEqual(
      (line?.fields as { keys?: string[] } | undefined)?.keys,
      ['pressure'],
      '告警必须带上报的 key'
    );
  } finally {
    await consumer.close();
  }
});

/** 造一个连接器风格的错误（带数字 `code`，与实测抛出的对象同形） */
function codedError(name: string, code: number, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

void test('A 类写入失败 ⇒ reject 原始错误（BullMQ 照常重试），不触发提级告警', async () => {
  const { logger, calls } = spyLogger();
  const original = codedError(
    'TDWebSocketClientError',
    104,
    'connection creation failed'
  );
  const { writer } = fakeWriter(() => {
    throw original;
  });
  const consumer = makeConsumer(writer, 1, { logger });
  try {
    await assert.rejects(
      processor(consumer)(job(payload(Date.now()))),
      error => {
        assert.ok(
          !(error instanceof UnrecoverableError),
          'A 类不应包装成 UnrecoverableError，否则 BullMQ 不会重试'
        );
        assert.equal(
          error,
          original,
          'A 类应原样抛出，保留给 BullMQ 与失败原因'
        );
        return true;
      }
    );
    assert.equal(consumer.stats.written, 0);
    assert.ok(!calls.some(call => call.level === 'fatal'), 'A 类不是提级告警');
  } finally {
    await consumer.close();
  }
});

void test('B 类写入失败 ⇒ reject UnrecoverableError（不重试，直接进 failed 集合）', async () => {
  const { logger, calls } = spyLogger();
  const { writer } = fakeWriter(() => {
    throw codedError(
      'WebSocketInterfaceError',
      566,
      'bind number out of range or not match'
    );
  });
  const consumer = makeConsumer(writer, 1, { logger });
  try {
    await assert.rejects(
      processor(consumer)(job(payload(Date.now()))),
      error => {
        assert.ok(
          error instanceof UnrecoverableError,
          'B 类必须是 UnrecoverableError，才能跳过重试直接进 failed 集合'
        );
        return true;
      }
    );
    assert.equal(consumer.stats.written, 0);
    const errorLine = calls.find(call => call.level === 'error');
    assert.equal((errorLine?.fields as { code?: number })?.code, 566);
    assert.ok(!calls.some(call => call.level === 'fatal'), 'B 类不提级');
  } finally {
    await consumer.close();
  }
});

void test('⭐ Table does not exist ⇒ 走提级告警（fatal，带 code=9731）', async () => {
  const { logger, calls } = spyLogger();
  const { writer } = fakeWriter(() => {
    throw codedError('WebSocketInterfaceError', 9731, 'Table does not exist');
  });
  const consumer = makeConsumer(writer, 1, { logger });
  try {
    await assert.rejects(
      processor(consumer)(job(payload(Date.now()))),
      error => {
        assert.ok(error instanceof UnrecoverableError);
        return true;
      }
    );
    const fatal = calls.filter(call => call.level === 'fatal');
    assert.equal(fatal.length, 1, '提级告警应恰好一条');
    assert.match(fatal[0]?.msg ?? '', /提级/);
    assert.equal((fatal[0]?.fields as { code?: number })?.code, 9731);
    // 提级一律不带普通 error 告警
    assert.ok(!calls.some(call => call.level === 'error'));
  } finally {
    await consumer.close();
  }
});

void test('worker.on("failed") ⇒ 记录 jobId、尝试次数与错误码', async () => {
  const { logger, calls } = spyLogger();
  const handle = fakeWorker();
  const { writer } = fakeWriter(rows => rows.length);
  const consumer = makeConsumer(writer, 1, {
    worker: handle.worker,
    logger
  });
  try {
    handle.emitFailed(
      { id: 'j-7', attemptsMade: 2 } as unknown as Job,
      codedError('WebSocketInterfaceError', 9731, 'Table does not exist')
    );
    const line = calls.find(call => call.msg === 'job 失败');
    assert.ok(line, '应记录一条 job 失败');
    assert.deepEqual(line?.fields, {
      jobId: 'j-7',
      attempts: 2,
      code: 9731,
      elevated: true,
      err: 'Table does not exist'
    });
  } finally {
    await consumer.close();
  }
});
