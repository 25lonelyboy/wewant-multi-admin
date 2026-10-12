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

void test('原始超表：每测点「值 + 单位」两列，标签只有 deviceId', () => {
  const statement = createRawStableStatement();

  for (const metric of RAW_METRICS) {
    assert.match(statement, new RegExp(`\\b${metric} FLOAT`));
    assert.match(statement, new RegExp(`\\b${metric}_unit VARCHAR\\(16\\)`));
  }
  assert.match(statement, /TAGS \(deviceId VARCHAR\(16\)\)/);
  assert.doesNotMatch(statement, /location|line|area/);
});

void test('子表名折小写、标签值保留原样', () => {
  const statement = createSubtableStatement({
    name: 'aweawq05e8pf53wh_001',
    deviceId: 'AWEAWQ05E8PF53WH',
    pointKey: '001'
  });

  assert.match(statement, /INTO|USING/);
  assert.match(statement, /USING wewant_iot\.telemetry/);
  assert.match(statement, /TAGS \('AWEAWQ05E8PF53WH'\)/);
});

void test('降采样超表三级同形，共 16 列', () => {
  const statements = createDsStableStatements();
  assert.equal(statements.length, 3);

  for (const statement of statements) {
    for (const metric of RAW_METRICS) {
      assert.match(statement, new RegExp(`sum_${metric} DOUBLE`));
      assert.match(statement, new RegExp(`count_${metric} BIGINT`));
      assert.match(statement, new RegExp(`min_${metric} FLOAT`));
      assert.match(statement, new RegExp(`max_${metric} FLOAT`));
    }
    // ts + 3×(4 聚合) + 3 单位 = 16
    const columnCount = 1 + RAW_METRICS.length * 4 + RAW_METRICS.length;
    assert.equal(columnCount, 16);
  }
});

void test('降采样子表名：仅追加级别后缀，不改动原表名', () => {
  assert.equal(
    dsSubtableName('aweawq05e8pf53wh_001', '1m'),
    'aweawq05e8pf53wh_001_1m'
  );
  assert.equal(
    dsSubtableName('aweawq05e8pf53wh_001', '1d'),
    'aweawq05e8pf53wh_001_1d'
  );
});

void test('降采样子表：每采集点三级各一，名带级别后缀、标签值保留原样', () => {
  const subtable = {
    name: 'aweawq05e8pf53wh_001',
    deviceId: 'AWEAWQ05E8PF53WH',
    pointKey: '001'
  };
  const statements = createDsSubtableStatements(subtable);

  assert.equal(statements.length, DS_LEVELS.length);
  for (const level of DS_LEVELS) {
    assert.ok(
      statements.includes(
        `CREATE TABLE IF NOT EXISTS ${DS_DATABASE}.${subtable.name}_${level} USING ${DS_DATABASE}.telemetry_${level} TAGS ('${subtable.deviceId}')`
      ),
      `缺少 ${level} 的降采样子表建表语句`
    );
  }
});

void test('分钟级超表级 KEEP 小于降采样库级 KEEP', () => {
  assert.ok(DS_MINUTE_KEEP_DAYS < 3650);
  assert.equal(DS_DATABASE, 'wewant_iot_ds');
});
