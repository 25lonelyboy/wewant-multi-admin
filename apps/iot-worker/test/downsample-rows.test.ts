import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DS_DATABASE, RAW_METRICS, dsSubtableName } from '../src/schema.js';
import {
  DS_CODEC,
  parseAggregateRows,
  type DsAggregateRow
} from '../src/downsample/rows.js';

/**
 * 一行读查询结果——列序与 `buildAggregateSql` 的 SELECT 一致：
 * `tbname, ts, [每测点 sum/count/min/max]…`
 */
function aggRow(): unknown[] {
  return [
    'p1_m5obq5cr2hcze10j',
    1_791_818_580_000n, // _wstart：连接器给 BigInt
    373.1,
    6n,
    61.1,
    62.4, // temperature
    10.92,
    6n,
    1.8,
    1.84, // vibration
    25.86,
    6n,
    4.3,
    4.32 // current
  ];
}

/** 有测点整段缺值：SUM/MIN/MAX 落成字符串 'NULL'（连接器口径）、COUNT 为 0 */
function aggRowWithMissingMetric(): unknown[] {
  return [
    'p1_m5obq5cr2hcze10j',
    1_791_818_580_000n,
    373.1,
    6n,
    61.1,
    62.4, // temperature
    'NULL',
    0n,
    'NULL',
    'NULL', // vibration 整段缺值
    25.86,
    6n,
    4.3,
    4.32 // current
  ];
}

void test('解析：_wstart(BigInt)→epoch 毫秒，COUNT→bigint，缺值→空', () => {
  const [row] = parseAggregateRows([aggRow()], '1m');
  assert.ok(row);
  assert.equal(row.tbname, 'p1_m5obq5cr2hcze10j');
  assert.equal(row.ts, 1_791_818_580_000);
  assert.equal(row.level, '1m');
  assert.deepEqual(row.metrics.temperature, {
    sum: 373.1,
    count: 6n,
    min: 61.1,
    max: 62.4
  });
});

void test('解析：字符串 "NULL" 当成缺值，不当成一个叫 NULL 的数值', () => {
  const [row] = parseAggregateRows([aggRowWithMissingMetric()], '1h');
  assert.ok(row);
  assert.deepEqual(row.metrics.vibration, {
    sum: null,
    count: 0n,
    min: null,
    max: null
  });
});

void test('降采样列描述：13 列，类型按超级表定义，目标子表带级别后缀', () => {
  const [row] = parseAggregateRows([aggRow()], '1d');
  assert.ok(row);
  const columns = DS_CODEC.columns(row);

  assert.equal(columns.length, 13, 'ts + 3×(sum/count/min/max) = 13');
  assert.equal(columns[0]?.name, 'ts');
  assert.equal(columns[0]?.kind, 'timestamp');

  const byName = new Map(columns.map(column => [column.name, column.kind]));
  for (const metric of RAW_METRICS) {
    assert.equal(byName.get(`sum_${metric}`), 'double');
    assert.equal(byName.get(`count_${metric}`), 'bigint');
    assert.equal(byName.get(`min_${metric}`), 'float');
    assert.equal(byName.get(`max_${metric}`), 'float');
    assert.equal(byName.has(`${metric}_unit`), false);
  }
});

void test('降采样列描述：库/子表/签名', () => {
  const [row] = parseAggregateRows([aggRow()], '1h') as [DsAggregateRow];
  assert.equal(DS_CODEC.database, DS_DATABASE);
  assert.equal(DS_CODEC.subtable(row), dsSubtableName(row.tbname, '1h'));
  assert.equal(DS_CODEC.signature(row), '1h');
});

void test('降采样列描述：count 用 bigint 承载（非 number）', () => {
  const [row] = parseAggregateRows([aggRow()], '1m') as [DsAggregateRow];
  const countColumn = DS_CODEC.columns(row).find(
    column => column.name === 'count_temperature'
  );
  assert.equal(typeof countColumn?.value, 'bigint');
});
