import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnrecoverableError, type Job, type Queue, type Worker } from 'bullmq';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { dsSubtableName } from '../src/schema.js';
import { DS_CODEC, type DsAggregateRow } from '../src/downsample/rows.js';
import {
  DownsampleRing,
  type AggregateReader
} from '../src/downsample/ring.js';
import type { TdRow } from '../src/tdengine/client.js';
import type { TdengineWriter } from '../src/tdengine/writer.js';

/** 一行读查询结果（列序见 buildAggregateSql） */
function aggRow(tbname = 'm5obq5cr2hcze10j_001'): TdRow {
  return [
    tbname,
    1_791_818_580_000n,
    373.1,
    6n,
    61.1,
    62.4,
    10.92,
    6n,
    1.8,
    1.84,
    25.86,
    6n,
    4.3,
    4.32,
    '°C',
    'mm/s',
    'A'
  ];
}

function codedError(name: string, code: number, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

function fakeWorker(): {
  worker: Worker;
  emitFailed: (job: Job, error: unknown) => void;
} {
  const handlers: Record<string, (...args: never[]) => void> = {};
  const worker = {
    on: (event: string, handler: (...args: never[]) => void): Worker => {
      handlers[event] = handler;
      return worker;
    },
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
  return {
    worker,
    emitFailed: (job, error) =>
      handlers['failed']?.(job as never, error as never)
  };
}

interface Upsert {
  id: string;
  repeat: unknown;
  template: { name?: string; data?: unknown; opts?: unknown };
}

function fakeQueue(): { queue: Queue; upserts: Upsert[] } {
  const upserts: Upsert[] = [];
  const queue = {
    waitUntilReady: (): Promise<void> => Promise.resolve(),
    upsertJobScheduler: (
      id: string,
      repeat: unknown,
      template: Upsert['template']
    ): Promise<undefined> => {
      upserts.push({ id, repeat, template });
      return Promise.resolve(undefined);
    },
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Queue;
  return { queue, upserts };
}

function fakeReader(rows: readonly TdRow[]): {
  reader: AggregateReader;
  queries: string[];
} {
  const queries: string[] = [];
  return {
    reader: {
      query: (sql: string): Promise<TdRow[]> => {
        queries.push(sql);
        return Promise.resolve([...rows]);
      }
    },
    queries
  };
}

function fakeWriter(
  affected: (rows: readonly DsAggregateRow[]) => number,
  thrown?: Error
): {
  writer: TdengineWriter<DsAggregateRow>;
  written: DsAggregateRow[][];
  invalidations: () => number;
} {
  const written: DsAggregateRow[][] = [];
  let invalidations = 0;
  const writer = {
    write: (rows: readonly DsAggregateRow[]): Promise<number> => {
      if (thrown !== undefined) {
        return Promise.reject(thrown);
      }
      written.push([...rows]);
      return Promise.resolve(affected(rows));
    },
    invalidate: (): void => {
      invalidations += 1;
    },
    close: (): Promise<void> => Promise.resolve()
  } as unknown as TdengineWriter<DsAggregateRow>;
  return { writer, written, invalidations: () => invalidations };
}

function makeRing(deps: {
  reader: AggregateReader;
  writer: TdengineWriter<DsAggregateRow>;
  queue: Queue;
  worker: Worker;
}): DownsampleRing {
  const config = loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    DOWNSAMPLE_LOOKBACK_WINDOWS: '3'
  });
  return new DownsampleRing(config, createLogger(config), deps);
}

const NOW = 1_791_850_011_067;

void test('recompute：把窗口聚合写进**带级别后缀**的降采样子表', async () => {
  const { reader, queries } = fakeReader([aggRow()]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    const count = await ring.recompute('1m', NOW);
    assert.equal(count, 1);
    assert.equal(queries.length, 1, '应跑一次聚合查询');
    assert.match(queries[0] ?? '', /INTERVAL\(1m\)/);
    assert.equal(written.length, 1);
    const row = written[0]?.[0];
    assert.ok(row);
    assert.equal(row.level, '1m');
    assert.equal(
      DS_CODEC.subtable(row),
      dsSubtableName('m5obq5cr2hcze10j_001', '1m')
    );
  } finally {
    await ring.close();
  }
});

void test('recompute：空窗口落 0 行、不写（不是失败）', async () => {
  const { reader } = fakeReader([]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    assert.equal(await ring.recompute('1h', NOW), 0);
    assert.equal(written.length, 0);
  } finally {
    await ring.close();
  }
});

void test('⭐ C10：写入行数少于提交数 ⇒ 响亮失败', async () => {
  const { reader } = fakeReader([aggRow(), aggRow('x')]);
  const { writer } = fakeWriter(rows => rows.length - 1);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW), /少于提交行数/);
  } finally {
    await ring.close();
  }
});

void test('连接级（可重试）写入失败 ⇒ 作废连接并抛回', async () => {
  const { reader } = fakeReader([aggRow()]);
  const { writer, invalidations } = fakeWriter(
    rows => rows.length,
    codedError('TDWebSocketClientError', 104, 'connection creation failed')
  );
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW));
    assert.equal(invalidations(), 1, '连接级故障应作废连接');
  } finally {
    await ring.close();
  }
});

void test('数据/结构类失败不重连（invalidate 只在连接级调用）', async () => {
  const { reader } = fakeReader([aggRow()]);
  const { writer, invalidations } = fakeWriter(
    rows => rows.length,
    codedError('WebSocketInterfaceError', 9731, 'Table does not exist')
  );
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW));
    assert.equal(invalidations(), 0);
  } finally {
    await ring.close();
  }
});

void test('start：注册三条调度，身份与节拍正确', async () => {
  const { reader } = fakeReader([]);
  const { writer } = fakeWriter(rows => rows.length);
  const { queue, upserts } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    await ring.start();
    assert.equal(upserts.length, 3);

    const byId = new Map(upserts.map(u => [u.id, u]));
    assert.deepEqual(byId.get('ds-1m')?.repeat, { every: 60_000 });
    assert.deepEqual(byId.get('ds-1h')?.repeat, { every: 3_600_000 });
    assert.deepEqual(byId.get('ds-1d')?.repeat, {
      pattern: '0 8 * * *',
      tz: 'Asia/Shanghai'
    });
    for (const upsert of upserts) {
      assert.equal(upsert.template.name, 'recompute');
      assert.ok(
        typeof upsert.template.data === 'object' &&
          upsert.template.data !== null &&
          'level' in upsert.template.data
      );
      const opts = upsert.template.opts as {
        removeOnComplete?: unknown;
        removeOnFail?: unknown;
      };
      assert.equal(opts.removeOnComplete, true);
      assert.deepEqual(opts.removeOnFail, { count: 5000 });
    }
    assert.deepEqual(
      upserts.map(u => (u.template.data as { level: string }).level).sort(),
      ['1d', '1h', '1m']
    );
  } finally {
    await ring.close();
  }
});

void test('onJob：载荷 level 非法 ⇒ UnrecoverableError（不重试）', async () => {
  const { reader } = fakeReader([aggRow()]);
  const { writer } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    const onJob = (
      ring as unknown as { onJob(job: Job): Promise<void> }
    ).onJob.bind(ring);
    await assert.rejects(
      onJob({ data: { level: '2m' } } as unknown as Job),
      error => error instanceof UnrecoverableError
    );
  } finally {
    await ring.close();
  }
});

void test('onJob：载荷合法 ⇒ 触发对应级别的重算', async () => {
  const { reader, queries } = fakeReader([aggRow()]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ reader, writer, queue, worker });
  try {
    const onJob = (
      ring as unknown as { onJob(job: Job): Promise<void> }
    ).onJob.bind(ring);
    await onJob({ data: { level: '1d' } } as unknown as Job);
    assert.match(queries[0] ?? '', /INTERVAL\(1d, 8h\)/);
    assert.equal(written[0]?.[0]?.level, '1d');
  } finally {
    await ring.close();
  }
});
