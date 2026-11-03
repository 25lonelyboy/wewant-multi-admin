import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Queue, Worker } from 'bullmq';
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import {
  DS_DATABASE,
  RAW_DATABASE,
  dsSubtableName,
  rawStableName
} from '../src/schema.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import { TdengineWriter, type PendingRow } from '../src/tdengine/writer.js';
import { levelSpec } from '../src/downsample/level.js';
import { DownsampleRing } from '../src/downsample/ring.js';
import {
  closedWindowRange,
  lastClosedBoundary
} from '../src/downsample/window.js';

/**
 * ⚠️ 不消费的 worker / queue 替身：本 e2e **只驱动 `recompute`**，不能起真实的消费 worker——
 * 否则它会去抢 Redis 里早已注册的 `ds-1m` 调度 job，与直接调用**并发**使用同一个写入器
 * （单连接、单 stmt 不可并发），会把用例拖死。worker 循环本身另有单测覆盖。
 */
const inertQueue = {
  waitUntilReady: (): Promise<void> => Promise.resolve(),
  upsertJobScheduler: (): Promise<undefined> => Promise.resolve(undefined),
  close: (): Promise<void> => Promise.resolve()
} as unknown as Queue;
const inertWorker = ((): Worker => {
  const worker = {
    on: (): Worker => worker,
    close: (): Promise<void> => Promise.resolve()
  } as unknown as Worker;
  return worker;
})();

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
const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
const logger = createLogger(config);

/** 挑一台已登记的采集点——原始子表与降采样子表都已在库里 */
const subtable = p1DeviceRegistry.allSubtables()[0];

/**
 * 选一段**远离既有数据**的窗口（本库数据集中在 2026-10 上旬）：这样重算窗口里只有本用例
 * 造的行，逐字段比对才是无歧义的。时刻取整点对齐，三级窗口都能干净地包住它。
 */
const T0 = Date.parse('2026-09-15T10:00:00.000Z');

/** 落在同一个 1m 窗口内的三行；三个测点都带，便于核对 16 列 */
const RAW_ROWS = [
  { ts: T0 + 5_000, temperature: 60.1, vibration: 1.8, current: 4.3 },
  { ts: T0 + 20_000, temperature: 62.2, vibration: 1.82, current: 4.31 },
  { ts: T0 + 40_000, temperature: 64.3, vibration: 1.84, current: 4.32 }
];

function pendingFrom(sample: (typeof RAW_ROWS)[number]): PendingRow {
  return {
    subtable: subtable.name,
    ts: sample.ts,
    metrics: {
      temperature: { value: sample.temperature, unit: '°C' },
      vibration: { value: sample.vibration, unit: 'mm/s' },
      current: { value: sample.current, unit: 'A' }
    }
  };
}

/** 各级要用的 nowMs——让 T0 那一段成为**最后一个已闭合窗口** */
function nowFor(level: '1m' | '1h' | '1d'): number {
  const spec = levelSpec(level);
  // T0 所在的窗口整体闭合后再取 now：右边界＝T0 窗口的右边界 + 90s（足够越过网格）
  return T0 + spec.windowMs + 90_000;
}

/**
 * 手跑的 §3.3 查询——**独立于被测代码**（不调 `buildAggregateSql`），只为拿真值逐字段核对。
 */
function handSql(
  modelCode: string,
  level: '1m' | '1h' | '1d',
  startMs: number,
  endMs: number
): string {
  const spec = levelSpec(level);
  const interval =
    spec.offsetExpr === null
      ? `${spec.windowExpr}`
      : `${spec.windowExpr}, ${spec.offsetExpr}`;
  const aggregates = ['temperature', 'vibration', 'current'].flatMap(metric => [
    `SUM(${metric}) AS sum_${metric}`,
    `COUNT(${metric}) AS count_${metric}`,
    `MIN(${metric}) AS min_${metric}`,
    `MAX(${metric}) AS max_${metric}`
  ]);
  const units = ['temperature', 'vibration', 'current'].map(
    metric => `LAST(${metric}_unit) AS ${metric}_unit`
  );
  return [
    `SELECT tbname, _wstart AS ts, ${[...aggregates, ...units].join(', ')}`,
    `FROM ${RAW_DATABASE}.${rawStableName(modelCode)}`,
    `WHERE ts >= ${startMs} AND ts < ${endMs}`,
    `PARTITION BY tbname`,
    `INTERVAL(${interval})`
  ].join(' ');
}

function asNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function near(actual: unknown, expected: unknown, label: string): void {
  assert.ok(
    Math.abs(asNumber(actual) - asNumber(expected)) < 1e-6,
    `${label}：期望 ${String(expected)}，实际 ${String(actual)}`
  );
}

async function cleanup(sql: TdSql): Promise<void> {
  // 原始行：只删本用例在 [T0, T0+1h) 造的那几行（原始库其余数据一律不动）
  await sql
    .exec(
      `DELETE FROM ${RAW_DATABASE}.${subtable.name} WHERE ts >= ${T0} AND ts < ${T0 + 3_600_000}`
    )
    .catch(() => undefined);
  // 降采样行：删三级各自 T0 所在窗口的那一行
  for (const level of ['1m', '1h', '1d'] as const) {
    const windowStart = lastClosedBoundary(T0, levelSpec(level));
    await sql
      .exec(
        `DELETE FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, level)} WHERE ts = ${windowStart}`
      )
      .catch(() => undefined);
  }
}

void test('降采样环：三级各自从原始表重算，落库值与手跑 §3.3 查询逐字段相等', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const rawWriter = new TdengineWriter(config.tdengineUrl);
  const ring = new DownsampleRing(config, logger, {
    queue: inertQueue,
    worker: inertWorker
  });

  try {
    // 1) 造原始数据——只在 T0 那一个 1m 窗口内
    const affected = await rawWriter.write(RAW_ROWS.map(pendingFrom));
    assert.equal(affected, RAW_ROWS.length, '原始行应全部落库');

    // 2) 逐级重算，与手跑查询对账
    for (const level of ['1m', '1h', '1d'] as const) {
      const spec = levelSpec(level);
      const nowMs = nowFor(level);
      const { startMs, endMs } = closedWindowRange(
        nowMs,
        spec,
        config.downsampleLookbackWindows
      );
      const windowStart = lastClosedBoundary(T0, spec);

      const written = await ring.recompute(level, nowMs);
      assert.equal(written, 1, `${level}：应恰好写 1 行（一个子表一个窗口）`);

      // 手跑真值
      const handRows = await sql.query(
        handSql(subtable.modelCode, level, startMs, endMs)
      );
      const hand = handRows.find(row => String(row[0]) === subtable.name);
      assert.ok(hand, `${level}：手查询结果应含子表 ${subtable.name}`);

      // 读降采样行
      const dsRows = await sql.query(
        `SELECT ts, sum_temperature, count_temperature, min_temperature, max_temperature,` +
          ` sum_vibration, count_vibration, sum_current, count_current,` +
          ` temperature_unit, vibration_unit, current_unit, deviceId` +
          ` FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, level)} WHERE ts = ${windowStart}`
      );
      assert.equal(dsRows.length, 1, `${level}：降采样表应有 1 行`);
      const ds = dsRows[0];

      // 窗口 ts 两侧一致
      assert.equal(
        asNumber(ds[0]),
        windowStart,
        `${level}：窗口起始 ts 不一致`
      );
      assert.equal(
        asNumber(hand[1]),
        windowStart,
        `${level}：手查询窗口起始 ts 不一致`
      );

      // 逐字段：sum / count / min / max（temperature、vibration、current）
      near(ds[1], hand[2], `${level}.sum_temperature`);
      assert.equal(
        BigInt(asNumber(ds[2])),
        BigInt(asNumber(hand[3])),
        `${level}.count_temperature`
      );
      near(ds[3], hand[4], `${level}.min_temperature`);
      near(ds[4], hand[5], `${level}.max_temperature`);

      near(ds[5], hand[6], `${level}.sum_vibration`);
      assert.equal(
        BigInt(asNumber(ds[6])),
        BigInt(asNumber(hand[7])),
        `${level}.count_vibration`
      );
      near(ds[7], hand[10], `${level}.sum_current`);
      assert.equal(
        BigInt(asNumber(ds[8])),
        BigInt(asNumber(hand[11])),
        `${level}.count_current`
      );

      // 单位列＝窗口内最后一次上报
      assert.equal(
        String(ds[9]),
        String(hand[14]),
        `${level}.temperature_unit`
      );
      assert.equal(String(ds[10]), String(hand[15]), `${level}.vibration_unit`);
      assert.equal(String(ds[11]), String(hand[16]), `${level}.current_unit`);

      // ⭐ 标签保留原样大小写（子表预建时由注册表写死，写入端不碰标签）
      assert.equal(
        String(ds[12]),
        subtable.deviceId,
        `${level}：deviceId 标签应保留原样`
      );
    }
  } finally {
    await cleanup(sql);
    await ring.close();
    await rawWriter.close();
    await sql.close();
    destroyTd();
  }
});

/**
 * ⭐ 窗口内**缺测点** ⇒ 降采样列落 NULL 的**真库往返**。
 *
 * 窗口里只上报 temperature ⇒ vibration / current 的 sum/min/max/unit 应为 NULL、count 为 0。
 * 这条路径（连接器把 `null` 绑进 DOUBLE/FLOAT/VARCHAR 列）此前只由单测的**解析**覆盖，
 * 未曾在真表上写过并读回——`writer.ts` 里 `?? null` 的兜底正需要这一条来证。
 */
void test('降采样环：窗口内缺测点 ⇒ 对应列落 NULL（真库往返）', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const rawWriter = new TdengineWriter(config.tdengineUrl);
  const ring = new DownsampleRing(config, logger, {
    queue: inertQueue,
    worker: inertWorker
  });

  const nullableSub = p1DeviceRegistry.allSubtables()[1];
  const TN = Date.parse('2026-09-16T10:00:00.000Z');
  const spec = levelSpec('1m');

  try {
    const affected = await rawWriter.write([
      {
        subtable: nullableSub.name,
        ts: TN + 5_000,
        metrics: { temperature: { value: 55.5, unit: '°C' } }
      }
    ]);
    assert.equal(affected, 1, '原始行应落库');

    assert.equal(await ring.recompute('1m', TN + spec.windowMs + 90_000), 1);

    const windowStart = lastClosedBoundary(TN, spec);
    const rows = await sql.query(
      `SELECT sum_temperature, count_temperature,` +
        ` sum_vibration, count_vibration, min_vibration, max_vibration, vibration_unit,` +
        ` sum_current, count_current, current_unit` +
        ` FROM ${DS_DATABASE}.${dsSubtableName(nullableSub.name, '1m')} WHERE ts = ${windowStart}`
    );
    assert.equal(rows.length, 1, '降采样表应有 1 行');
    const row = rows[0];

    // 有值的测点照写
    assert.equal(asNumber(row[0]), 55.5);
    assert.equal(BigInt(asNumber(row[1])), 1n);

    // 缺值的测点：sum/min/max/unit 落 NULL（连接器把 SQL NULL 渲染成字符串 'NULL'，两种都认）
    for (const index of [2, 4, 5, 6, 7, 9]) {
      const value = row[index];
      assert.ok(
        value === null || value === 'NULL',
        `列 ${index} 应为 NULL，实际 ${String(value)}`
      );
    }
    assert.equal(BigInt(asNumber(row[3])), 0n, 'count_vibration 应为 0');
    assert.equal(BigInt(asNumber(row[8])), 0n, 'count_current 应为 0');
  } finally {
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${nullableSub.name} WHERE ts >= ${TN} AND ts < ${TN + 60_000}`
      )
      .catch(() => undefined);
    await sql
      .exec(
        `DELETE FROM ${DS_DATABASE}.${dsSubtableName(nullableSub.name, '1m')} WHERE ts = ${lastClosedBoundary(TN, spec)}`
      )
      .catch(() => undefined);
    await ring.close();
    await rawWriter.close();
    await sql.close();
    destroyTd();
  }
});
