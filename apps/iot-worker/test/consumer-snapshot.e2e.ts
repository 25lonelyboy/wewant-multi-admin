import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job, Worker } from 'bullmq';
import type {
  PropertyDecl,
  RegistrySnapshot
} from '@multi-admin/device-registry';
import { subtableName } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { TelemetryConsumer } from '../src/consumer.js';
import { createLogger } from '../src/logger.js';
import { buildIndex, type SnapshotSource } from '../src/snapshot/client.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { TdengineWriter } from '../src/tdengine/writer.js';
import { RAW_DATABASE } from '../src/schema.js';

/**
 * 判据 A / C 的**运行期**证据：不重启消费者，只换快照，新模型的 BOOL 与枚举测点
 * 就能写入并回读为声明类型。
 *
 * ⚠️ 物理列是「所有版本的并集」：v2 才声明的 door / mode 列在库里先建好（列只增不减），
 * 但 v1 的快照不会写它们——这条正是「按 ts 选声明、按列名绑定」的接线证据。
 */
const MODEL = 'e2e_snap_bool';
const LOCAL_ID = 'sim-e2e-bool';
const DEVICE_ID = 'E2EBOOLDVICE0001';
const SUBTABLE = subtableName(MODEL, DEVICE_ID);
const T_SWAP = Date.parse('2026-03-01T00:00:00.000Z');

const temperature: PropertyDecl = {
  key: 'temperature',
  kind: 'float',
  unit: '°C',
  range: { min: -50, max: 200 },
  aggregates: []
};
const door: PropertyDecl = {
  key: 'door',
  kind: 'bool',
  aggregates: []
};
const mode: PropertyDecl = {
  key: 'mode',
  kind: 'enum',
  enumValues: [1, 2],
  aggregates: []
};

const config = loadConfig({
  ...process.env,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  LOG_LEVEL: 'silent',
  INGEST_FLUSH_INTERVAL_MS: '50'
});
const logger = createLogger(config);

/** 两份快照共用同一台设备；v2 把 v1 的右边界收在 T_SWAP，并新增两个属性 */
function snapshotOf(version: 1 | 2): RegistrySnapshot {
  const versions =
    version === 1
      ? [
          {
            version: 1,
            effectiveFrom: '2020-01-01T00:00:00.000Z',
            effectiveTo: null,
            properties: [temperature]
          }
        ]
      : [
          {
            version: 1,
            effectiveFrom: '2020-01-01T00:00:00.000Z',
            effectiveTo: new Date(T_SWAP).toISOString(),
            properties: [temperature]
          },
          {
            version: 2,
            effectiveFrom: new Date(T_SWAP).toISOString(),
            effectiveTo: null,
            properties: [temperature, door, mode]
          }
        ];

  return {
    version,
    builtAt: '2020-01-01T00:00:00.000Z',
    models: [
      {
        modelCode: MODEL,
        rawColumns: [
          { name: 'temperature', bindKind: 'float' },
          { name: 'door', bindKind: 'bool' },
          { name: 'mode', bindKind: 'int' }
        ],
        dsColumns: [],
        versions
      }
    ],
    devices: [
      {
        localDeviceId: LOCAL_ID,
        deviceId: DEVICE_ID,
        modelCode: MODEL,
        fromAt: '2020-01-01T00:00:00.000Z',
        toAt: null
      }
    ]
  };
}

function fakeWorker(): Worker {
  const worker = {
    on: (): Worker => worker,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
  return worker;
}

function payload(ts: number, metrics: unknown[]): string {
  return JSON.stringify({ localDeviceId: LOCAL_ID, ts, metrics });
}

function processor(consumer: TelemetryConsumer): (job: Job) => Promise<void> {
  return (consumer as unknown as { onJob(job: Job): Promise<void> }).onJob.bind(
    consumer
  );
}

const job = (data: unknown): Job => ({ data }) as unknown as Job;

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`等待超时（${timeoutMs}ms）`);
}

void test('快照换入即生效：新模型的 BOOL / 枚举测点按声明类型写入并可回读', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  let currentIndex = buildIndex(snapshotOf(1));
  const source: SnapshotSource = { currentIndex: () => currentIndex };
  const writer = new TdengineWriter(config.tdengineUrl);
  const consumer = new TelemetryConsumer(config, logger, source, {
    writer,
    worker: fakeWorker()
  });
  // 单条消息也要落库：起定时兜底 flush（攒批阈值默认 500 条够不着）
  consumer.start();

  try {
    // 物理列取所有版本的并集——列只增不减，v2 的列先建好
    await sql.exec(
      `CREATE STABLE IF NOT EXISTS ${RAW_DATABASE}.${MODEL} ` +
        `(ts TIMESTAMP, temperature FLOAT, door BOOL, mode INT) ` +
        `TAGS (deviceId VARCHAR(16))`
    );
    await sql.exec(
      `CREATE TABLE IF NOT EXISTS ${RAW_DATABASE}.${SUBTABLE} ` +
        `USING ${RAW_DATABASE}.${MODEL} TAGS ('${DEVICE_ID}')`
    );

    const run = processor(consumer);
    const t1 = T_SWAP - 60_000;
    await run(
      job(payload(t1, [{ key: 'temperature', value: 61.5, unit: '°C' }]))
    );

    await waitFor(async () => {
      const rows = await sql.query(
        `SELECT temperature FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts = ${t1}`
      );
      return rows.length === 1;
    });

    // 换快照（模拟 server 重建后 worker 拉到新版本）：不重启消费者
    currentIndex = buildIndex(snapshotOf(2));

    const t2 = T_SWAP + 60_000;
    await run(
      job(
        payload(t2, [
          { key: 'door', value: true, unit: '' },
          { key: 'mode', value: 2, unit: '' }
        ])
      )
    );

    await waitFor(async () => {
      const rows = await sql.query(
        `SELECT door, mode FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts = ${t2}`
      );
      return rows.length === 1;
    });

    const [row] = await sql.query(
      `SELECT door, mode FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts = ${t2}`
    );
    // 连接器可能给布尔或 0/1，两种口径都认；关键是不能被当成 float 写坏
    assert.ok(
      row?.[0] === true || row?.[0] === 1 || row?.[0] === 'true',
      `door 应为真，实际 ${String(row?.[0])}`
    );
    assert.equal(Number(row?.[1]), 2, 'mode 应按 int 写入并可回读');

    // v1 区间的报文只按 v1 声明解释：同一 ts 的 v2 属性不会被补写
    assert.equal(consumer.stats.written, 2);
    assert.equal(consumer.stats.metricNotInModel, 0);
    assert.equal(consumer.stats.unitMismatch, 0);
  } finally {
    await consumer.close();
    await sql
      .exec(`DROP TABLE IF EXISTS ${RAW_DATABASE}.${SUBTABLE}`)
      .catch(() => undefined);
    await sql
      .exec(`DROP STABLE IF EXISTS ${RAW_DATABASE}.${MODEL}`)
      .catch(() => undefined);
    await sql.close();
    destroyTd();
  }
});
