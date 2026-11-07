import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX
} from '@multi-admin/contracts';
import { rawStableName, subtableName } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import { RAW_DATABASE } from '../src/schema.js';
import {
  P1_MODEL_CODE,
  clearSnapshot,
  p1DeviceId,
  writeSnapshot
} from './snapshot-fixture.js';

/**
 * 判据③——**强杀重投不丢**：拉起**真正的 worker 进程**（不是进程内 `new`），在它把一批
 * 报文攒在内存、**尚未落库也尚未 ack** 的当口 `SIGKILL` 掉，再起一个 worker，断言红队
 * 报文**一条不丢、一条不重**。
 *
 * ⭐ 为什么杀在 flush 之前才有意义：消费端的设计是"**入库成功才 ack**"。若攒在内存的报文
 * 已被 ack，这个 kill 就会把它们永久丢掉——那正是本判据要证伪的。故先断言杀之前库里是 0 行
 * （证明报文只在内存里、尚未落库），杀完库里仍是 0 行（内存那份随进程消失），靠 **BullMQ
 * 把未 ack 的 job 重新投递**才补回来。
 */

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

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });

/** `sim-001`——P1 快照里，查档必成 */
const SUBTABLE = subtableName(P1_MODEL_CODE, p1DeviceId(1));
const RAW_TABLE = `${RAW_DATABASE}.${rawStableName(P1_MODEL_CODE)}`;

/** 一批红队报文：落在远离既有数据的整点窗口内，ts 各不相同 */
const N = 40;
const BASE = Date.parse('2026-09-13T03:00:00.000Z');

function payload(ts: number): string {
  return JSON.stringify({
    localDeviceId: 'sim-001',
    ts,
    metrics: [
      { key: 'temperature', value: 62.4, unit: '°C' },
      { key: 'current', value: 4.31, unit: 'A' }
    ]
  });
}

async function countRows(sql: TdSql): Promise<number> {
  const rows = await sql.query(
    `SELECT COUNT(*) FROM ${RAW_TABLE} WHERE ts >= ${BASE} AND ts < ${BASE + N}`
  );
  return Number(rows[0]?.[0] ?? 0);
}

async function readTsSet(sql: TdSql): Promise<number[]> {
  const rows = await sql.query(
    `SELECT ts FROM ${RAW_TABLE} WHERE ts >= ${BASE} AND ts < ${BASE + N} ORDER BY ts`
  );
  return rows.map(row => Number(row[0]));
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

/** 拉起一个真实的 worker 进程（`src/index.ts`），返回句柄与它的 stderr 收集器 */
function spawnWorker(flushIntervalMs: number): {
  child: ChildProcess;
  stderr: () => string;
} {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      QUEUE_REDIS_URL: config.queueRedisUrl,
      REDIS_URL: config.redisUrl,
      TDENGINE_URL: config.tdengineUrl,
      // 攒批靠条数：把条数与间隔都设到本用例够不着的高位 ⇒ 杀之前**不会** flush
      INGEST_BATCH_SIZE: '1000',
      INGEST_FLUSH_INTERVAL_MS: String(flushIntervalMs),
      INGEST_CONCURRENCY: String(N),
      // 本用例造的是「远离当下的整点窗口」；放宽下界，避免固定基准日随 90 天窗口过期
      INGEST_TS_MAX_PAST_MS: '315360000000',
      DOWNSAMPLE_ENABLED: 'false'
    },
    // stderr 收着备用：worker 起不来时把原因打出来，stdout 丢弃以保持测试输出干净
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

void test('判据③ 强杀重投不丢：真实 worker 进程被杀在 flush 之前，重投后一条不丢一条不重', async () => {
  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const queue = new Queue(TELEMETRY_INGEST_QUEUE, {
    prefix: TELEMETRY_QUEUE_PREFIX,
    connection: { url: config.queueRedisUrl }
  });
  let worker: ReturnType<typeof spawnWorker> | null = null;
  let redis: Awaited<ReturnType<typeof writeSnapshot>> | null = null;

  await queue.obliterate({ force: true }).catch(() => undefined);

  try {
    redis = await writeSnapshot(config.redisUrl);
    // 1) 起 worker#1：攒批靠条数（1000）、flush 间隔 60s ⇒ 杀之前绝不会 flush
    worker = spawnWorker(60_000);

    // 2) 投 40 条红队报文
    for (let i = 0; i < N; i += 1) {
      await queue.add('ingest', payload(BASE + i), {
        attempts: 5,
        backoff: { type: 'fixed', delay: 100 }
      });
    }

    // 3) 等它们**全部**被 worker 揽进内存（active=在手的最多条数），此时尚未落库、尚未 ack
    await waitFor(
      async () => (await queue.getActiveCount()) >= N,
      30_000,
      `worker#1 揽下全部 ${N} 条`
    );
    assert.equal(
      await countRows(sql),
      0,
      '杀之前库里应为 0 行——报文只在内存里，尚未落库（这正是"未 ack"的证据）'
    );

    // 4) ⭐ 真·强杀：SIGKILL，不给进程优雅停机（否则它会先落库再退出，测不到这条路径）
    const first = worker;
    first.child.kill('SIGKILL');
    await killed(first.child);
    worker = null;

    // 5) 杀完库里仍是 0 行：内存里那批随进程消失，**没有**落库、也**没有**被 ack
    assert.equal(
      await countRows(sql),
      0,
      '强杀后库里仍应为 0 行——那批随内存消失；不丢只能靠重投'
    );

    // 6) 起 worker#2（正常 flush 间隔）：未 ack 的 job 会被重新投递并落库
    worker = spawnWorker(200);
    await waitFor(
      async () => (await countRows(sql)) >= N,
      150_000,
      '重投后 40 条全部落库'
    );

    // 7) 不丢：40 条全在；不重：恰好 40 行、ts 集合与投递的完全一致
    const tsList = await readTsSet(sql);
    assert.equal(
      tsList.length,
      N,
      '行数应恰好等于投递条数（多出即重复、缺即丢失）'
    );
    assert.deepEqual(
      tsList,
      Array.from({ length: N }, (_, i) => BASE + i),
      'ts 集合应与投递的逐条一致'
    );
    assert.equal(
      await queue.getFailedCount(),
      0,
      '不该有任何 job 落进 failed 集合'
    );
  } finally {
    const live = worker;
    if (live) {
      live.child.kill('SIGKILL');
      await killed(live.child);
    }
    await queue.obliterate({ force: true }).catch(() => undefined);
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts >= ${BASE} AND ts < ${BASE + N}`
      )
      .catch(() => undefined);
    await queue.close();
    await sql.close();
    if (redis !== null) await clearSnapshot(redis);
    destroyTd();
  }
});
