import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { DS_DATABASE, RAW_DATABASE } from '../src/schema.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import {
  auditSubtables,
  type ExpectedSubtable
} from '../src/subtables/audit.js';
import { cleanupOrphans } from '../src/subtables/cleanup.js';

/**
 * 真 TDengine 上的清理路径：造两张孤儿表 → dry-run 名单 → --apply 删除 → 重跑归零。
 *
 * ⚠️ 期望集取自**库里现有的全部原始子表**（再加一张自己建的锚表，保证非空）——
 * 只把本次造的孤儿排除在外。这样 --apply 不会碰开发库里的真实子表；前置审计若报出
 * 其它孤儿，用例**直接失败**而不是把它们一起删掉。
 */
const ANCHOR_MODEL = 'e2e_clean_anchor';
const ANCHOR_TABLE = 'e2e_clean_anchor_a';
const ORPHAN_MODEL = 'e2e_clean_orphan';
const ORPHAN_RAW = ['e2e_clean_orphan_a', 'e2e_clean_orphan_b'];
const ORPHAN_DS = ['e2e_clean_orphan_a_1m', 'e2e_clean_orphan_b_1m'];

const config = loadConfig({
  ...process.env,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  LOG_LEVEL: 'silent'
});

interface TdSqlLike {
  query(sql: string): Promise<unknown[][]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** 16 位标签值（`deviceId VARCHAR(16)` 的上限） */
function tagOf(index: number): string {
  return `E2ECLEAN${String(index).padStart(8, '0')}`;
}

async function createRaw(
  model: string,
  tables: readonly string[]
): Promise<void> {
  const sql = await connectTd(config.tdengineUrl);
  try {
    await sql.exec(
      `CREATE STABLE IF NOT EXISTS ${RAW_DATABASE}.${model} ` +
        `(ts TIMESTAMP, temperature FLOAT) TAGS (deviceId VARCHAR(16))`
    );
    for (const [index, table] of tables.entries()) {
      await sql.exec(
        `CREATE TABLE IF NOT EXISTS ${RAW_DATABASE}.${table} ` +
          `USING ${RAW_DATABASE}.${model} TAGS ('${tagOf(index)}')`
      );
    }
  } finally {
    await sql.close();
  }
}

async function createDs(
  model: string,
  tables: readonly string[]
): Promise<void> {
  const sql = await connectTd(config.tdengineUrl);
  try {
    await sql.exec(
      `CREATE STABLE IF NOT EXISTS ${DS_DATABASE}.${model}_1m ` +
        `(ts TIMESTAMP, sum_temperature DOUBLE) TAGS (deviceId VARCHAR(16))`
    );
    for (const [index, table] of tables.entries()) {
      await sql.exec(
        `CREATE TABLE IF NOT EXISTS ${DS_DATABASE}.${table} ` +
          `USING ${DS_DATABASE}.${model}_1m TAGS ('${tagOf(index)}')`
      );
    }
  } finally {
    await sql.close();
  }
}

async function tableNames(
  sql: TdSqlLike
): Promise<{ raw: string[]; ds: string[] }> {
  const rows = await sql.query(
    `SELECT db_name, stable_name, table_name FROM information_schema.ins_tables ` +
      `WHERE db_name IN ('${RAW_DATABASE}', '${DS_DATABASE}')`
  );
  const raw: string[] = [];
  const ds: string[] = [];
  for (const row of rows) {
    const db = String(row[0]).toLowerCase();
    const stable = String(row[1]).toLowerCase();
    const table = String(row[2]).toLowerCase();
    if (table === '' || table === stable) continue;
    if (db === RAW_DATABASE.toLowerCase()) raw.push(table);
    else if (db === DS_DATABASE.toLowerCase()) ds.push(table);
  }
  return { raw: raw.sort(), ds: ds.sort() };
}

void test('孤儿清理：dry-run 名单与 --apply 实删逐名一致，重跑归零', async () => {
  const sql = await connectTd(config.tdengineUrl);
  try {
    // 锚表：保证期望集非空（CI 的全新库可能还没有任何设备子表）
    await createRaw(ANCHOR_MODEL, [ANCHOR_TABLE]);

    // 期望集 = 库里全部原始子表（含锚表）；deviceId / modelCode 不参与审计比对
    const current = await tableNames(sql);
    const expected: ExpectedSubtable[] = Array.from(
      new Set([...current.raw, ANCHOR_TABLE])
    ).map(name => ({ name, deviceId: '', modelCode: '' }));

    // 前置：库里不能有别的孤儿，否则 --apply 会把它们一并删掉
    const before = await auditSubtables(sql, expected);
    assert.deepEqual(
      before.orphanRaw,
      [],
      `前置不干净：库里已有孤儿原始子表 ${before.orphanRaw.join(', ')}`
    );
    assert.deepEqual(
      before.orphanDs,
      [],
      `前置不干净：库里已有孤儿降采样子表 ${before.orphanDs.join(', ')}`
    );

    // 造两张孤儿（原始 + 降采样各两张）
    await createRaw(ORPHAN_MODEL, ORPHAN_RAW);
    await createDs(ORPHAN_MODEL, ORPHAN_DS);

    const deps = {
      query: { query: (statement: string) => sql.query(statement) },
      exec: (statement: string) => sql.exec(statement)
    };

    // dry-run：名单正确、不执行删除。表是刚造的，保护期置 0（生产路径恒用默认 10 分钟）
    const dry = await cleanupOrphans(deps, expected, {
      apply: false,
      minTableAgeMs: 0
    });
    assert.deepEqual(dry.report.orphanRaw, [...ORPHAN_RAW].sort());
    assert.deepEqual(dry.report.orphanDs, [...ORPHAN_DS].sort());
    assert.deepEqual(dry.dropped, []);
    const afterDry = await tableNames(sql);
    for (const name of [...ORPHAN_RAW, ...ORPHAN_DS]) {
      assert.ok(
        afterDry.raw.includes(name) || afterDry.ds.includes(name),
        `dry-run 不应删除 ${name}`
      );
    }

    // --apply：删除顺序原始优先，名单与 dry-run 逐名一致
    const applied = await cleanupOrphans(deps, expected, {
      apply: true,
      retryDelayMs: 0,
      minTableAgeMs: 0
    });
    assert.deepEqual(applied.dropped, [
      ...[...ORPHAN_RAW].sort(),
      ...[...ORPHAN_DS].sort()
    ]);
    assert.deepEqual(applied.failed, []);

    const afterApply = await tableNames(sql);
    for (const name of [...ORPHAN_RAW, ...ORPHAN_DS]) {
      assert.ok(!afterApply.raw.includes(name), `${name} 应已删除`);
      assert.ok(!afterApply.ds.includes(name), `${name} 应已删除`);
    }

    // 重跑：幂等归零
    const again = await cleanupOrphans(deps, expected, {
      apply: true,
      retryDelayMs: 0,
      minTableAgeMs: 0
    });
    assert.deepEqual(again.report.orphanRaw, []);
    assert.deepEqual(again.report.orphanDs, []);
    assert.deepEqual(again.dropped, []);
  } finally {
    // 删除自己的锚表与可能残留的孤儿超表（DROP STABLE 连带子表）
    await sql
      .exec(`DROP STABLE IF EXISTS ${RAW_DATABASE}.${ORPHAN_MODEL}`)
      .catch(() => undefined);
    await sql
      .exec(`DROP STABLE IF EXISTS ${DS_DATABASE}.${ORPHAN_MODEL}_1m`)
      .catch(() => undefined);
    await sql
      .exec(`DROP STABLE IF EXISTS ${RAW_DATABASE}.${ANCHOR_MODEL}`)
      .catch(() => undefined);
    await sql
      .exec(`DROP STABLE IF EXISTS ${DS_DATABASE}.${ANCHOR_MODEL}_1m`)
      .catch(() => undefined);
    await sql.close();
    destroyTd();
  }
});
