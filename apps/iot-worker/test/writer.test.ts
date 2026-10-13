import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAW_DATABASE } from '../src/schema.js';
import { RAW_CODEC, insertSql } from '../src/tdengine/writer.js';

void test('insertSql：库限定 + 列名写死 + 占位符', () => {
  const sql = insertSql(RAW_DATABASE, 'aweawq05e8pf53wh_001', [
    'ts',
    'temperature',
    'temperature_unit'
  ]);
  assert.equal(
    sql,
    `INSERT INTO ${RAW_DATABASE}.aweawq05e8pf53wh_001 (ts, temperature, temperature_unit) VALUES (?, ?, ?)`
  );
  // STMT1 形态：不带 USING/tbname（那会静默建表，顶掉「表存在 ⇔ 已注册」）
  assert.doesNotMatch(sql, /USING|tbname/i);
});

void test('原始列描述：只写该行带了的测点，列类型随超级表', () => {
  const columns = RAW_CODEC.columns({
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1_791_818_580_000,
    metrics: { temperature: { value: 62.4, unit: '°C' } }
  });

  assert.deepEqual(
    columns.map(column => [column.name, column.kind]),
    [
      ['ts', 'timestamp'],
      ['temperature', 'float'],
      ['temperature_unit', 'varchar']
    ]
  );
});

void test('原始列描述：多测点列随之增多，签名按测点集合区分', () => {
  const row = {
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1_791_818_580_000,
    metrics: {
      temperature: { value: 62.4, unit: '°C' },
      current: { value: 4.31, unit: 'A' }
    }
  };
  assert.equal(RAW_CODEC.columns(row).length, 5); // ts + 2×(值+单位)
  assert.equal(RAW_CODEC.signature(row), 'temperature+current');
  // 只带一个测点的行与带两个测点的行分属不同签名 ⇒ 各自一条语句
  assert.equal(
    RAW_CODEC.signature({
      ...row,
      metrics: { temperature: { value: 1, unit: '°C' } }
    }),
    'temperature'
  );
});

void test('原始列描述：库名与子表名取自行', () => {
  const row = {
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1,
    metrics: { temperature: { value: 1, unit: '°C' } }
  };
  assert.equal(RAW_CODEC.database, RAW_DATABASE);
  assert.equal(RAW_CODEC.subtable(row), 'aweawq05e8pf53wh_001');
});
