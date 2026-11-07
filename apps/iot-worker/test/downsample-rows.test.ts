import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dsSubtableName,
  type Aggregate,
  type DsLevel,
  type SnapshotDsColumn
} from '@multi-admin/device-registry';
import { DS_DATABASE } from '../src/schema.js';
import { DS_CODEC, parseAggregateRows } from '../src/downsample/rows.js';

const METRICS = ['temperature', 'vibration', 'current'] as const;

const BIND: Record<Aggregate, SnapshotDsColumn['bindKind']> = {
  sum: 'double',
  count: 'bigint',
  min: 'float',
  max: 'float'
};

function columns(level: DsLevel = '1m'): SnapshotDsColumn[] {
  return METRICS.flatMap(property =>
    (['sum', 'count', 'min', 'max'] as const).map(aggregate => ({
      level,
      name: `${aggregate}_${property}`,
      aggregate,
      property,
      bindKind: BIND[aggregate]
    }))
  );
}

/**
 * 一行读查询结果——列序与 `buildAggregateSql` 的 SELECT 一致：
 * `tbname, ts, [列清单里的聚合列]…`
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

void test('解析：_wstart(BigInt)→epoch 毫秒，COUNT→bigint，按列名取值', () => {
  const [row] = parseAggregateRows([aggRow()], '1m', columns());
  assert.ok(row);
  assert.equal(row.tbname, 'p1_m5obq5cr2hcze10j');
  assert.equal(row.ts, 1_791_818_580_000);
  assert.equal(row.level, '1m');
  assert.deepEqual(
    {
      sum: row.metrics.sum_temperature,
      count: row.metrics.count_temperature,
      min: row.metrics.min_temperature,
      max: row.metrics.max_temperature
    },
    { sum: 373.1, count: 6n, min: 61.1, max: 62.4 }
  );
});

void test('解析：字符串 "NULL" 当成缺值，不当成一个叫 NULL 的数值', () => {
  const [row] = parseAggregateRows(
    [aggRowWithMissingMetric()],
    '1h',
    columns('1h')
  );
  assert.ok(row);
  assert.equal(row.metrics.sum_vibration, null);
  assert.equal(row.metrics.count_vibration, 0n);
  assert.equal(row.metrics.min_vibration, null);
  assert.equal(row.metrics.max_vibration, null);
});

void test('⭐ 列清单顺序改变时结果按列名不变', () => {
  const forward = parseAggregateRows([aggRow()], '1m', columns());
  const reversedColumns = [...columns()].reverse();
  const values = aggRow();
  // 反转列清单时同步反转聚合值段（前两列是 tbname / ts）
  const reversedRow = [values[0], values[1], ...values.slice(2).reverse()];
  const reversed = parseAggregateRows([reversedRow], '1m', reversedColumns);
  assert.deepEqual(forward[0]?.metrics, reversed[0]?.metrics);
});

void test('降采样列描述：13 列，绑定类型来自列清单', () => {
  const [row] = parseAggregateRows([aggRow()], '1d', columns('1d'));
  assert.ok(row);
  const written = DS_CODEC.columns(row);

  assert.equal(written.length, 13, 'ts + 3×(sum/count/min/max) = 13');
  assert.equal(written[0]?.name, 'ts');
  assert.equal(written[0]?.kind, 'timestamp');

  const byName = new Map(written.map(column => [column.name, column.kind]));
  for (const metric of METRICS) {
    assert.equal(byName.get(`sum_${metric}`), 'double');
    assert.equal(byName.get(`count_${metric}`), 'bigint');
    assert.equal(byName.get(`min_${metric}`), 'float');
    assert.equal(byName.get(`max_${metric}`), 'float');
    assert.equal(byName.has(`${metric}_unit`), false);
  }
});

void test('降采样列描述：库/子表/签名', () => {
  const [row] = parseAggregateRows([aggRow()], '1h', columns('1h'));
  assert.ok(row);
  assert.equal(DS_CODEC.database, DS_DATABASE);
  assert.equal(DS_CODEC.subtable(row), dsSubtableName(row.tbname, '1h'));
  assert.match(DS_CODEC.signature(row), /^1h:/);
});

void test('降采样列描述：count 用 bigint 承载（非 number）', () => {
  const [row] = parseAggregateRows([aggRow()], '1m', columns());
  assert.ok(row);
  const countColumn = DS_CODEC.columns(row).find(
    column => column.name === 'count_temperature'
  );
  assert.equal(typeof countColumn?.value, 'bigint');
});

void test('BOOL 列按布尔绑定：min/max 为 bool 档位', () => {
  const boolColumns: SnapshotDsColumn[] = [
    {
      level: '1m',
      name: 'min_door',
      aggregate: 'min',
      property: 'door',
      bindKind: 'bool'
    },
    {
      level: '1m',
      name: 'max_door',
      aggregate: 'max',
      property: 'door',
      bindKind: 'bool'
    }
  ];
  const [row] = parseAggregateRows(
    [['m1_abc', 1n, 'true', 1]],
    '1m',
    boolColumns
  );
  assert.ok(row);
  assert.equal(row.metrics.min_door, true);
  assert.equal(row.metrics.max_door, true);
  const written = DS_CODEC.columns(row);
  assert.equal(written[1]?.kind, 'bool');
  assert.equal(written[1]?.value, true);
});
