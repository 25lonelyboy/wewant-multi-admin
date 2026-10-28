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
  type DsLevel
} from '../src/schema.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import { TdengineWriter } from '../src/tdengine/writer.js';
import { levelSpec } from '../src/downsample/level.js';
import { DownsampleRing } from '../src/downsample/ring.js';
import { lastClosedBoundary } from '../src/downsample/window.js';

/**
 * ⚠️ 不消费的 worker / queue 替身：本 e2e **只驱动 `recompute`**，不能起真实消费 worker——
 * 否则它会去抢 Redis 里早已注册的 `ds-1m` 调度 job，与直接调用**并发**使用同一个写入器
 * （单连接、单 stmt 不可并发），会把用例拖死。
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

const num = (value: unknown): number =>
  typeof value === 'bigint' ? Number(value) : Number(value);

/**
 * ⭐ 驱动 **默认 `now`**（真实墙上时钟）——`recompute(level)` 不传 `nowMs`。
 *
 * 每级挑一台已登记采集点，在它**最后一个已闭合窗口**内造一行原始数据，再以默认 now 触发重算，
 * 断言该子表在**那个窗口**收到了降采样行。这样 `recompute` 的 `nowMs = Date.now()` 分支被真实覆盖，
 * 且不依赖模拟器在跑（造的行就是窗口里唯一/主要的数据）。
 *
 * ⚠️ `1d` 的最后窗口 `[昨天00:00Z, 今天00:00Z)` 含既往真实数据，故 1d 重算会一并写入那些子表的
 * 正确聚合行——那是生产里 1d 调度本就该产出的，保留；本用例只清掉自己造的原始行与目标子表的行。
 */
void test('降采样环：默认 now 驱动三级，降采样表在对应窗口收到行', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const rawWriter = new TdengineWriter(config.tdengineUrl);
  const ring = new DownsampleRing(config, logger, {
    queue: inertQueue,
    worker: inertWorker
  });

  const subs = p1DeviceRegistry.allSubtables();
  const targets: {
    level: DsLevel;
    subtable: (typeof subs)[number];
    rawTs: number;
    windowStart: number;
    value: number;
  }[] = [];

  try {
    const now = Date.now();
    const planning: {
      level: DsLevel;
      index: number;
      offsetInWindow: number;
      value: number;
    }[] = [
      // 1m/1h 的 offset 取小；1d 取窗口内的 10h 处（远离窗口边界）
      { level: '1m', index: 0, offsetInWindow: 5_000, value: 41.5 },
      { level: '1h', index: 1, offsetInWindow: 5_000, value: 42.5 },
      { level: '1d', index: 2, offsetInWindow: 10 * 3_600_000, value: 43.5 }
    ];

    for (const plan of planning) {
      const spec = levelSpec(plan.level);
      const windowStart = lastClosedBoundary(now, spec) - spec.windowMs;
      const rawTs = windowStart + plan.offsetInWindow;
      const subtable = subs[plan.index];
      const affected = await rawWriter.write([
        {
          subtable: subtable.name,
          ts: rawTs,
          metrics: { temperature: { value: plan.value, unit: '°C' } }
        }
      ]);
      assert.equal(affected, 1, '原始行应落库');
      targets.push({
        level: plan.level,
        subtable,
        rawTs,
        windowStart,
        value: plan.value
      });
    }

    // ⭐ 默认 now：不传 nowMs
    for (const target of targets) {
      const written = await ring.recompute(target.level);
      assert.ok(
        written >= 1,
        `${target.level}：默认 now 重算应至少写 1 行，实际 ${written}`
      );
    }

    for (const target of targets) {
      const rows = await sql.query(
        `SELECT count_temperature, sum_temperature, min_temperature, max_temperature, deviceId` +
          ` FROM ${DS_DATABASE}.${dsSubtableName(target.subtable.name, target.level)} WHERE ts = ${target.windowStart}`
      );
      assert.equal(
        rows.length,
        1,
        `${target.level}：${target.subtable.name}@${target.windowStart} 应恰有 1 行`
      );
      const row = rows[0];
      assert.ok(BigInt(num(row[0])) >= 1n, `${target.level}：count 应 ≥ 1`);
      // 造的值必须落在 min..max 里（证明这一行确实来自我们的原始行）
      assert.ok(
        num(row[2]) <= target.value && target.value <= num(row[3]),
        `${target.level}：${target.value} 应落在 [${String(row[2])}, ${String(row[3])}]`
      );
      assert.equal(
        String(row[4]),
        target.subtable.deviceId,
        `${target.level}：deviceId 标签保留原样`
      );
    }
  } finally {
    await cleanup(sql, targets);
    await ring.close();
    await rawWriter.close();
    await sql.close();
    destroyTd();
  }
});

async function cleanup(
  sql: TdSql,
  targets: readonly {
    level: DsLevel;
    subtable: { name: string };
    rawTs: number;
    windowStart: number;
  }[]
): Promise<void> {
  for (const target of targets) {
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${target.subtable.name} WHERE ts = ${target.rawTs}`
      )
      .catch(() => undefined);
    await sql
      .exec(
        `DELETE FROM ${DS_DATABASE}.${dsSubtableName(target.subtable.name, target.level)} WHERE ts = ${target.windowStart}`
      )
      .catch(() => undefined);
  }
}
