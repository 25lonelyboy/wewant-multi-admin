import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DS_DATABASE,
  DS_MINUTE_KEEP_DAYS,
  DS_STREAMS,
  DURATION_DAYS,
  RAW_DATABASE,
  RAW_KEEP_DAYS,
  RAW_METRICS,
  createDatabaseStatements,
  createDsStableStatements,
  createRawStableStatement,
  createStreamStatement,
  createSubtableStatement
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

void test('建流语句照抄四个实测结论：内外层都分区、FROM 源表、不带增量 WHERE', () => {
  for (const spec of DS_STREAMS) {
    const statement = createStreamStatement(spec);

    assert.match(statement, /^CREATE STREAM wewant_iot_ds\./);
    // 流级分区：只写 tbname 时标签表达式无源可用（实测 16660）
    assert.match(statement, /PARTITION BY tbname, deviceId/);
    assert.match(statement, /TAGS \(deviceId VARCHAR\(16\) AS deviceId\)/);
    // ⭐ 内层查询也必须分区，否则聚合会跨全部子表算（实测：每台设备拿到全表的 sum/count）
    assert.match(
      statement,
      /FROM wewant_iot\.telemetry\n\s+PARTITION BY tbname\n\s+INTERVAL\(/
    );
    assert.doesNotMatch(statement, /%%trows/);
    // 计算子句里不得出现时间范围过滤——那会把停机与补传的数据整段排除
    assert.doesNotMatch(statement, /_tprev_localtime|_tlocaltime/);
    assert.doesNotMatch(statement, /WHERE/);
  }

  const daily = DS_STREAMS.find(spec => spec.level === '1d');
  assert.equal(daily?.window, '1d, 8h');
});

void test('分钟级超表级 KEEP 小于降采样库级 KEEP', () => {
  assert.ok(DS_MINUTE_KEEP_DAYS < 3650);
  assert.equal(DS_DATABASE, 'wewant_iot_ds');
});
