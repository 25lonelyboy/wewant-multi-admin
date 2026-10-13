import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnrecoverableError, type Job, type Queue, type Worker } from 'bullmq';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { dsSubtableName } from '../src/schema.js';
import { DS_CODEC, type DsAggregateRow } from '../src/downsample/rows.js';
import { DownsampleRing, type TdConnect } from '../src/downsample/ring.js';
import type { TdRow, TdSql } from '../src/tdengine/client.js';
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

/** 一个只实现读的 TdSql 替身 */
function fakeSql(query: (sql: string) => Promise<TdRow[]>): TdSql {
  return {
    query,
    exec: (): Promise<void> => Promise.resolve(),
    version: (): Promise<string> => Promise.resolve('fake'),
    close: (): Promise<void> => Promise.resolve()
  };
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

/** 读连接工厂替身：每次 connect 给一条新连接，记录跑过的 SQL */
function fakeConnect(rows: readonly TdRow[]): {
  connect: TdConnect;
  queries: string[];
} {
  const queries: string[] = [];
  return {
    connect: (): Promise<TdSql> =>
      Promise.resolve(
        fakeSql(sql => {
          queries.push(sql);
          return Promise.resolve([...rows]);
        })
      ),
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
  connect: TdConnect;
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
  const { connect, queries } = fakeConnect([aggRow()]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
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
  const { connect } = fakeConnect([]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    assert.equal(await ring.recompute('1h', NOW), 0);
    assert.equal(written.length, 0);
  } finally {
    await ring.close();
  }
});

void test('⭐ C10：写入行数少于提交数 ⇒ 响亮失败', async () => {
  const { connect } = fakeConnect([aggRow(), aggRow('x')]);
  const { writer } = fakeWriter(rows => rows.length - 1);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW), /少于提交行数/);
  } finally {
    await ring.close();
  }
});

void test('连接级（104）写入失败 ⇒ 作废连接并抛回', async () => {
  const { connect } = fakeConnect([aggRow()]);
  const { writer, invalidations } = fakeWriter(
    rows => rows.length,
    codedError('TDWebSocketClientError', 104, 'connection creation failed')
  );
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW));
    assert.equal(invalidations(), 1, '连接级故障应作废连接');
  } finally {
    await ring.close();
  }
});

void test('⭐ 超时（105）写入失败 ⇒ 抛回但**不作废**连接（连接是好的，行 5）', async () => {
  const { connect } = fakeConnect([aggRow()]);
  const { writer, invalidations } = fakeWriter(
    rows => rows.length,
    codedError('TDWebSocketClientError', 105, 'websocket query timeout')
  );
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW));
    assert.equal(invalidations(), 0, '超时是 A 类但不是连接级，不该作废连接');
  } finally {
    await ring.close();
  }
});

void test('⭐ B 类（结构类）失败 ⇒ UnrecoverableError 且不重连（快速进 failed 集合）', async () => {
  const { connect } = fakeConnect([aggRow()]);
  const { writer, invalidations } = fakeWriter(
    rows => rows.length,
    codedError('WebSocketInterfaceError', 9731, 'Table does not exist')
  );
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW), error => {
      assert.ok(
        error instanceof UnrecoverableError,
        'B 类须抛 UnrecoverableError，才能跳过重试直接进 failed 集合'
      );
      return true;
    });
    assert.equal(invalidations(), 0, 'B 类连接是好的，不该重连');
  } finally {
    await ring.close();
  }
});

void test('⭐ 读失败后作废读连接：下一次读重连成功，不永久卡死', async () => {
  let connects = 0;
  const connect: TdConnect = () => {
    connects += 1;
    const stale = connects === 1;
    return Promise.resolve(
      fakeSql(() =>
        stale
          ? Promise.reject(
              codedError('TaosResultError', 108, 'Invalid websocket connection')
            )
          : Promise.resolve([aggRow()])
      )
    );
  };
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW), /Invalid websocket/);
    assert.equal(connects, 1, '首次读应建立一条连接');
    // 连接已作废 ⇒ 第二次读必须重连，而不是复用死连接
    assert.equal(await ring.recompute('1m', NOW), 1);
    assert.equal(connects, 2, '读失败后应重连');
    assert.equal(written.length, 1);
  } finally {
    await ring.close();
  }
});

void test('⭐ 读侧：确定性 SQL 错（非连接级）不丢 reader——不再每次尝试都重连', async () => {
  let connects = 0;
  const connect: TdConnect = () => {
    connects += 1;
    return Promise.resolve(
      fakeSql(() =>
        Promise.reject(
          codedError('TaosResultError', 9730, 'Invalid column name: bad')
        )
      )
    );
  };
  const { writer } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
  try {
    await assert.rejects(ring.recompute('1m', NOW), /Invalid column name/);
    assert.equal(connects, 1);
    // 非连接级读错 ⇒ reader 保留 ⇒ 第二次读仍是同一条连接（不重连）
    await assert.rejects(ring.recompute('1m', NOW), /Invalid column name/);
    assert.equal(connects, 1, '非连接级读错不该丢掉 reader');
  } finally {
    await ring.close();
  }
});

void test('start：注册三条调度，身份与节拍正确', async () => {
  const { connect } = fakeConnect([]);
  const { writer } = fakeWriter(rows => rows.length);
  const { queue, upserts } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
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
  const { connect } = fakeConnect([aggRow()]);
  const { writer } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
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
  const { connect, queries } = fakeConnect([aggRow()]);
  const { writer, written } = fakeWriter(rows => rows.length);
  const { queue } = fakeQueue();
  const { worker } = fakeWorker();
  const ring = makeRing({ connect, writer, queue, worker });
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
