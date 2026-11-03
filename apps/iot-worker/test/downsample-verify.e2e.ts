import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Queue, Worker } from 'bullmq';
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { DS_DATABASE, RAW_DATABASE, dsSubtableName } from '../src/schema.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import { TdengineWriter, type PendingRow } from '../src/tdengine/writer.js';
import { levelSpec } from '../src/downsample/level.js';
import { DownsampleRing } from '../src/downsample/ring.js';
import { lastClosedBoundary } from '../src/downsample/window.js';
import {
  checkTablesNonEmpty,
  verifyLevel,
  type CheckRangeOptions
} from '../src/downsample/verify.js';

/**
 * ⚠️ 不消费的 worker / queue 替身：本 e2e **只驱动 `recompute`** 造出一行降采样后再喂给
 * **F6 的对账脚本**（`verifyLevel`），不起真实消费 worker——否则它会去抢 Redis 里早已注册的
 * `ds-*` 调度 job，与直接调用并发使用同一个写入器（单连接、单 stmt 不可并发）。
 * 真实 worker 消费这条链路另由 `downsample-worker.e2e.ts` 覆盖。
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

const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
const logger = createLogger(config);

/** 挑一台**远离其它 e2e** 的采集点（其余用例用 [0..2]） */
const subtable = p1DeviceRegistry.allSubtables()[50];

/** 选一段远离既有数据（本库数据集中在 2026-10 上旬）的整点窗口 */
const T0 = Date.parse('2026-09-14T12:00:00.000Z');

/** 落在同一个 1m 窗口内的三行；三个测点都带，便于核对全部列 */
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

/** 让 T0 那一段成为**最后一个已闭合窗口**：右边界越过网格 90s */
function nowForOneMinute(): number {
  return T0 + levelSpec('1m').windowMs + 90_000;
}

/** 期望标签：建表端按注册表写死 ⇒ 对账的期望来源也用注册表 */
const deviceIds = new Map(
  p1DeviceRegistry.allSubtables().map(sub => [sub.name, sub.deviceId])
);
const deviceIdFor = (rawName: string): string | null =>
  deviceIds.get(rawName) ?? null;

async function cleanup(sql: TdSql): Promise<void> {
  await sql
    .exec(
      `DELETE FROM ${RAW_DATABASE}.${subtable.name} WHERE ts >= ${T0} AND ts < ${T0 + 60_000}`
    )
    .catch(() => undefined);
  await sql
    .exec(
      `DELETE FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, '1m')} WHERE ts = ${lastClosedBoundary(T0, levelSpec('1m'))}`
    )
    .catch(() => undefined);
}

void test('判据②对账：驱动 F6 脚本逐字段比对；注入一处缺失后脚本**必须报出**', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const rawWriter = new TdengineWriter(config.tdengineUrl);
  const ring = new DownsampleRing(config, logger, {
    queue: inertQueue,
    worker: inertWorker
  });
  const nowMs = nowForOneMinute();
  const options: CheckRangeOptions = {
    lookback: config.downsampleLookbackWindows,
    // 默认 N=K-1、S=1：范围内每个窗口都被环最近一轮覆盖 ⇒ 任何差异都是真缺陷
    windows: config.downsampleLookbackWindows - 1,
    skip: 1
  };
  const windowStart = lastClosedBoundary(T0, levelSpec('1m'));

  try {
    // 1) 造原始行 → 重算，让降采样侧有一行
    assert.equal(
      await rawWriter.write(RAW_ROWS.map(pendingFrom)),
      RAW_ROWS.length,
      '原始行应全部落库'
    );
    assert.equal(await ring.recompute('1m', nowMs), 1, '应恰好写 1 行');

    // 2) 干净对账：逐字段比，应零差异
    const clean = await verifyLevel(
      sql,
      subtable.modelCode,
      '1m',
      nowMs,
      options,
      deviceIdFor
    );
    assert.ok(clean.expectedCount >= 1, '范围内应有原始聚合');
    assert.equal(
      clean.mismatches.length,
      0,
      `干净态不该有差异：${JSON.stringify(clean.mismatches)}`
    );
    // 三条输出表存在且非空（判据②的另一半）
    assert.deepEqual(await checkTablesNonEmpty(sql, [subtable.modelCode]), []);

    // 3) ⭐ 注入一处**真差异**——删掉那一行；脚本必须报出（否则它只会"看起来通过"）
    await sql.exec(
      `DELETE FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, '1m')} WHERE ts = ${windowStart}`
    );
    const broken = await verifyLevel(
      sql,
      subtable.modelCode,
      '1m',
      nowMs,
      options,
      deviceIdFor
    );
    const mine = broken.mismatches.find(
      mismatch =>
        mismatch.subtable === subtable.name && mismatch.ts === windowStart
    );
    assert.ok(
      mine,
      `注入缺失后脚本必须报出该行，实际：${JSON.stringify(broken.mismatches)}`
    );
    assert.equal(mine.kind, 'missing-row');
    assert.equal(mine.field, '<row>');

    // 4) 还原：把该行重算回来 ⇒ 脚本又对得上（数据库回到干净态）
    assert.equal(await ring.recompute('1m', nowMs), 1, '重算应补回那一行');
    const restored = await verifyLevel(
      sql,
      subtable.modelCode,
      '1m',
      nowMs,
      options,
      deviceIdFor
    );
    assert.equal(
      restored.mismatches.length,
      0,
      `还原后应无差异：${JSON.stringify(restored.mismatches)}`
    );
  } finally {
    await cleanup(sql);
    await ring.close();
    await rawWriter.close();
    await sql.close();
    destroyTd();
  }
});
