import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { TELEMETRY_QUEUE_PREFIX } from '@multi-admin/contracts';
import { dsSubtableName, subtableName } from '@multi-admin/device-registry';
import { Redis } from 'ioredis';
import { loadConfig } from '../src/config.js';
import { DS_DATABASE, RAW_DATABASE } from '../src/schema.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { TdengineWriter } from '../src/tdengine/writer.js';
import { levelSpec } from '../src/downsample/level.js';
import { DOWNSAMPLE_QUEUE } from '../src/downsample/ring.js';
import { lastClosedBoundary } from '../src/downsample/window.js';
import {
  P1_MODEL_CODE,
  clearSnapshot,
  p1DeviceId,
  writeSnapshot
} from './snapshot-fixture.js';

/**
 * 降采样队列的**真实 job 路径**——补上别处缺失的一段。
 *
 * ⚠️ 其余降采样 e2e 都注入 inert worker / queue（只驱动 `recompute`），于是
 * 「调度注册 → 产出 job → **真实 worker 消费** → `onJob`」这条传导线一直没有自动化用例
 * 覆盖。本用例拉起**真正的 worker 进程**（带 `DOWNSAMPLE_ENABLED=true`），让调度器产出的
 * `recompute` job 由真实 `Worker` 消费、真实走到 `onJob`，再把结果落库读回来。
 */

process.on('uncaughtException', error => {
  console.error('UNCAUGHT:', error);
  process.exit(1);
});
process.on('unhandledRejection', reason => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });

/** 挑一台**远离其它 e2e** 的设备（其余用例用 [0..2]）；52 号与 1-based 序号对齐 */
const subtable = {
  name: subtableName(P1_MODEL_CODE, p1DeviceId(52)),
  deviceId: p1DeviceId(52),
  modelCode: P1_MODEL_CODE
};
const spec = levelSpec('1m');

/** `1m` 的最后**已闭合**窗口起点——调度器每轮重算的就是这一段（K=1） */
function lastClosedStart(now: number): number {
  return lastClosedBoundary(now, spec) - spec.windowMs;
}

const num = (value: unknown): number =>
  typeof value === 'bigint' ? Number(value) : Number(value);

function spawnWorker(): { child: ChildProcess; stderr: () => string } {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      QUEUE_REDIS_URL: config.queueRedisUrl,
      REDIS_URL: config.redisUrl,
      TDENGINE_URL: config.tdengineUrl,
      // 只重算最近 1 个已闭合窗口，缩小写入面
      DOWNSAMPLE_ENABLED: 'true',
      DOWNSAMPLE_LOOKBACK_WINDOWS: '1',
      INGEST_FLUSH_INTERVAL_MS: '200'
    },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let captured = '';
  child.stderr?.on('data', chunk => {
    captured += String(chunk);
  });
  return { child, stderr: () => captured };
}

function killed(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
  });
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  what: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`等待超时（${what}）：条件在 ${timeoutMs}ms 内未成立`);
}

void test('降采样队列：调度注册 + 真实 worker 消费 recompute，结果落库', async () => {
  const now = Date.now();
  const windowStart = lastClosedStart(now);
  const rawTs = windowStart + 5_000;
  const value = 47.25;

  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const rawWriter = new TdengineWriter(config.tdengineUrl);
  const queue = new Queue(DOWNSAMPLE_QUEUE, {
    prefix: TELEMETRY_QUEUE_PREFIX,
    connection: { url: config.queueRedisUrl }
  });
  let worker: ReturnType<typeof spawnWorker> | null = null;
  const redis = await writeSnapshot(config.redisUrl);

  const dsRow = async (): Promise<unknown[] | undefined> => {
    const rows = await sql.query(
      `SELECT count_temperature, sum_temperature, min_temperature, max_temperature, deviceId` +
        ` FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, '1m')} WHERE ts = ${windowStart}`
    );
    return rows[0];
  };

  try {
    // 0) 清掉本窗口可能留下的旧行，保证断言只指向本轮
    await sql
      .exec(
        `DELETE FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, '1m')} WHERE ts = ${windowStart}`
      )
      .catch(() => undefined);

    // 1) 在最后已闭合的 1m 窗口里造一行原始数据
    assert.equal(
      await rawWriter.write([
        {
          subtable: subtable.name,
          ts: rawTs,
          metrics: [{ key: 'temperature', bindKind: 'float', value }]
        }
      ]),
      1,
      '原始行应落库'
    );

    // 2) 拉起真实 worker：它注册三条调度并开始消费降采样队列
    worker = spawnWorker();

    // 3) 调度确实注册了（真实 worker 的 `registerSchedulers` 生效）
    await waitFor(
      async () => {
        const schedulers = await queue.getJobSchedulers();
        const ids = schedulers.map(s => s.key ?? s.name ?? '');
        return ids.some(id => id.includes('ds-1m'));
      },
      30_000,
      'ds-1m 调度注册'
    );

    // 4) ⭐ 真实 worker 消费调度产出的 job、走 onJob → recompute，把本窗口聚合落库
    await waitFor(
      async () => (await dsRow()) !== undefined,
      120_000,
      '降采样行落库（真实 worker 消费）'
    );

    const row = await dsRow();
    assert.ok(row, '应读到降采样行');
    assert.ok(BigInt(num(row[0])) >= 1n, 'count 应 ≥ 1');
    // 造的值必须落在 min..max 里——证明这一行确实来自我们的原始行
    assert.ok(
      num(row[2]) <= value && value <= num(row[3]),
      `${value} 应落在 [${String(row[2])}, ${String(row[3])}]`
    );
    assert.equal(String(row[4]), subtable.deviceId, 'deviceId 标签保留原样');
  } finally {
    const live = worker;
    if (live) {
      live.child.kill('SIGKILL');
      await killed(live.child);
    }
    await sql
      .exec(`DELETE FROM ${RAW_DATABASE}.${subtable.name} WHERE ts = ${rawTs}`)
      .catch(() => undefined);
    await sql
      .exec(
        `DELETE FROM ${DS_DATABASE}.${dsSubtableName(subtable.name, '1m')} WHERE ts = ${windowStart}`
      )
      .catch(() => undefined);
    // 真实 worker 被强杀时 leader 锁仍在有效期内，显式清掉，避免污染后续用例
    const lockRedis = new Redis(config.queueRedisUrl, {
      maxRetriesPerRequest: 1
    });
    await lockRedis.del('iot:downsample:leader').catch(() => 0);
    await lockRedis.quit().catch(() => lockRedis.disconnect());
    await queue.close();
    await clearSnapshot(redis);
    await rawWriter.close();
    await sql.close();
    destroyTd();
  }
});
