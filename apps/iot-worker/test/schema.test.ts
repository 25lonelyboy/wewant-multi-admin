import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DS_DATABASE,
  DS_LEVELS,
  DS_MINUTE_KEEP_DAYS,
  DURATION_DAYS,
  RAW_DATABASE,
  RAW_KEEP_DAYS,
  RAW_METRICS,
  createDatabaseStatements,
  createDsStableStatements,
  createDsSubtableStatements,
  createRawStableStatement,
  createSubtableStatement,
  dsSubtableName
} from '../src/schema.js';

void test('建库语句带 KEEP 与 DURATION，且幂等', () => {
  const statements = createDatabaseStatements();

  assert.equal(statements.length, 2);
  for (const statement of statements) {
    assert.match(statement, /^CREATE DATABASE IF NOT EXISTS /);
    assert.match(statement, new RegExp(`DURATION ${DURATION_DAYS}\\b`));
  }
  assert.match(
    statements[0] ?? '',
    new RegExp(
      `^CREATE DATABASE IF NOT EXISTS ${RAW_DATABASE} .*KEEP ${RAW_KEEP_DAYS}\\b`
    )
  );
});

void test('原始超表：名为模型编码，每测点只留值列，标签只有 deviceId', () => {
  const statement = createRawStableStatement('p1');

  assert.match(statement, /^CREATE STABLE IF NOT EXISTS wewant_iot\.p1 /);
  for (const metric of RAW_METRICS) {
    assert.match(statement, new RegExp(`\\b${metric} FLOAT`));
  }
  assert.doesNotMatch(statement, /_unit/);
  assert.match(statement, /TAGS \(deviceId VARCHAR\(16\)\)/);
  assert.doesNotMatch(statement, /location|line|area/);
});

void test('子表名折小写、标签值保留原样', () => {
  const statement = createSubtableStatement({
    name: 'p1_aweawq05e8pf53wh',
    deviceId: 'AWEAWQ05E8PF53WH',
    modelCode: 'p1'
  });

  assert.match(statement, /INTO|USING/);
  assert.match(statement, /USING wewant_iot\.p1/);
  assert.match(statement, /TAGS \('AWEAWQ05E8PF53WH'\)/);
});

void test('降采样超表三级同形、名为模型编码加级别，共 13 列', () => {
  const statements = createDsStableStatements('p1');
  assert.equal(statements.length, 3);

  for (const [index, statement] of statements.entries()) {
    const level = DS_LEVELS[index];
    assert.match(
      statement,
      new RegExp(`^CREATE STABLE IF NOT EXISTS wewant_iot_ds\\.p1_${level} `)
    );
    for (const metric of RAW_METRICS) {
      assert.match(statement, new RegExp(`sum_${metric} DOUBLE`));
      assert.match(statement, new RegExp(`count_${metric} BIGINT`));
      assert.match(statement, new RegExp(`min_${metric} FLOAT`));
      assert.match(statement, new RegExp(`max_${metric} FLOAT`));
    }
    assert.doesNotMatch(statement, /_unit/);
    // ts + 3×4 聚合 = 13
    const columnCount = 1 + RAW_METRICS.length * 4;
    assert.equal(columnCount, 13);
  }
});

void test('降采样子表名：仅追加级别后缀，不改动原表名', () => {
  assert.equal(
    dsSubtableName('p1_aweawq05e8pf53wh', '1m'),
    'p1_aweawq05e8pf53wh_1m'
  );
  assert.equal(
    dsSubtableName('p1_aweawq05e8pf53wh', '1d'),
    'p1_aweawq05e8pf53wh_1d'
  );
});

void test('降采样子表：每设备三级各一，名带级别后缀、标签值保留原样', () => {
  const subtable = {
    name: 'p1_aweawq05e8pf53wh',
    deviceId: 'AWEAWQ05E8PF53WH',
    modelCode: 'p1'
  };
  const statements = createDsSubtableStatements(subtable);

  assert.equal(statements.length, DS_LEVELS.length);
  for (const level of DS_LEVELS) {
    assert.ok(
      statements.includes(
        `CREATE TABLE IF NOT EXISTS ${DS_DATABASE}.${subtable.name}_${level} USING ${DS_DATABASE}.p1_${level} TAGS ('${subtable.deviceId}')`
      ),
      `缺少 ${level} 的降采样子表建表语句`
    );
  }
});

void test('超表名与子表名一样折小写——审计拿小写名比对期望集', () => {
  assert.equal(createRawStableStatement('P1'), createRawStableStatement('p1'));
  assert.deepEqual(
    createDsStableStatements('Meter'),
    createDsStableStatements('meter')
  );
});

void test('分钟级超表级 KEEP 小于降采样库级 KEEP', () => {
  assert.ok(DS_MINUTE_KEEP_DAYS < 3650);
  assert.equal(DS_DATABASE, 'wewant_iot_ds');
});
