import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TdRow } from '../src/tdengine/client.js';
import type { ExpectedSubtable } from '../src/subtables/audit.js';
import {
  SNAPSHOT_MAX_AGE_MS,
  checkSnapshotFreshness,
  cleanupOrphans
} from '../src/subtables/cleanup.js';

const EXPECTED: ExpectedSubtable[] = [
  { name: 'p1_abc', deviceId: 'ABC', modelCode: 'p1' }
];

/** 两库各一张孤儿、一张期望表 */
const ROWS: TdRow[] = [
  ['wewant_iot', 'p1', 'p1_abc'],
  ['wewant_iot', 'p1', 'p1_old'],
  ['wewant_iot', 'p1', 'p1_gone'],
  ['wewant_iot_ds', 'p1_1m', 'p1_abc_1m'],
  ['wewant_iot_ds', 'p1_1m', 'p1_old_1m'],
  ['wewant_iot_ds', 'p1_1m', 'p1_gone_1m']
];

function fakeDeps(onExec?: (sql: string) => void) {
  const executed: string[] = [];
  return {
    executed,
    deps: {
      query: { query: () => Promise.resolve(ROWS) },
      exec: (sql: string): Promise<void> => {
        executed.push(sql);
        onExec?.(sql);
        return Promise.resolve();
      }
    }
  };
}

void test('dry-run 不执行任何删除，待删名单来自审计的孤儿桶', async () => {
  const { executed, deps } = fakeDeps();
  const result = await cleanupOrphans(deps, EXPECTED, { apply: false });

  assert.deepEqual(executed, []);
  assert.deepEqual(result.dropped, []);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.report.orphanRaw, ['p1_gone', 'p1_old']);
  assert.deepEqual(result.report.orphanDs, ['p1_gone_1m', 'p1_old_1m']);
});

void test('原始优先：先删完全部孤儿原始子表，再删降采样子表', async () => {
  const { executed, deps } = fakeDeps();
  const result = await cleanupOrphans(deps, EXPECTED, {
    apply: true,
    retryDelayMs: 0
  });

  assert.deepEqual(executed, [
    'DROP TABLE IF EXISTS wewant_iot.p1_gone',
    'DROP TABLE IF EXISTS wewant_iot.p1_old',
    'DROP TABLE IF EXISTS wewant_iot_ds.p1_gone_1m',
    'DROP TABLE IF EXISTS wewant_iot_ds.p1_old_1m'
  ]);
  assert.deepEqual(result.dropped, [
    'p1_gone',
    'p1_old',
    'p1_gone_1m',
    'p1_old_1m'
  ]);
  assert.deepEqual(result.failed, []);
});

void test('库名限定：每条 DROP 都带库前缀，不按前缀匹配扩删', async () => {
  const { executed, deps } = fakeDeps();
  await cleanupOrphans(deps, EXPECTED, { apply: true, retryDelayMs: 0 });

  for (const sql of executed) {
    assert.match(sql, /^DROP TABLE IF EXISTS wewant_iot(_ds)?\./);
  }
  // 只删名单里的 4 张，期望表一张都不碰
  assert.equal(executed.length, 4);
  assert.ok(!executed.some(sql => sql.includes('p1_abc')));
});

void test('单表失败按次数重试，仍失败记录并继续删其余', async () => {
  const { executed, deps } = fakeDeps(sql => {
    if (sql.includes('p1_gone') && sql.includes('wewant_iot.')) {
      throw new Error('drop failed');
    }
  });
  const result = await cleanupOrphans(deps, EXPECTED, {
    apply: true,
    retries: 3,
    retryDelayMs: 0
  });

  // 失败那张重试 3 次，其余各 1 次
  assert.equal(
    executed.filter(sql => sql === 'DROP TABLE IF EXISTS wewant_iot.p1_gone')
      .length,
    3
  );
  assert.deepEqual(result.failed, ['p1_gone']);
  assert.deepEqual(result.dropped, ['p1_old', 'p1_gone_1m', 'p1_old_1m']);
});

void test('期望集为空时拒绝判定（闸 2）', async () => {
  const { executed, deps } = fakeDeps();
  await assert.rejects(
    () => cleanupOrphans(deps, [], { apply: true }),
    /期望集为空/
  );
  assert.deepEqual(executed, []);
});

void test('闸 3：built 缺失、rev 缺失、rev ≠ built、builtAt 非法、陈旧均拒绝', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  const freshAt = new Date(now - 60_000).toISOString();

  assert.deepEqual(checkSnapshotFreshness(null, 3, freshAt, now), {
    ok: false,
    reason: 'built-missing'
  });
  assert.deepEqual(checkSnapshotFreshness(3, null, freshAt, now), {
    ok: false,
    reason: 'rev-missing'
  });
  assert.deepEqual(checkSnapshotFreshness(3, 4, freshAt, now), {
    ok: false,
    reason: 'rev-mismatch'
  });
  assert.deepEqual(checkSnapshotFreshness(3, 3, 'not-a-date', now), {
    ok: false,
    reason: 'built-at-invalid'
  });
  assert.deepEqual(
    checkSnapshotFreshness(
      3,
      3,
      new Date(now - SNAPSHOT_MAX_AGE_MS - 1).toISOString(),
      now
    ),
    { ok: false, reason: 'stale' }
  );
});

void test('闸 3：新鲜且版本一致才放行（恰好等于上限放行）', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  assert.deepEqual(
    checkSnapshotFreshness(
      3,
      3,
      new Date(now - SNAPSHOT_MAX_AGE_MS).toISOString(),
      now
    ),
    { ok: true }
  );
});
