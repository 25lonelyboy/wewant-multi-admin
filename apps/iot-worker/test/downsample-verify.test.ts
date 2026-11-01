import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAW_METRICS, dsSubtableName } from '../src/schema.js';
import { levelSpec } from '../src/downsample/level.js';
import { buildAggregateSql } from '../src/downsample/query.js';
import { lastClosedBoundary } from '../src/downsample/window.js';
import {
  DS_DEVICE_ID_INDEX,
  buildDsReadSql,
  checkTablesNonEmpty,
  checkedWindowRange,
  compareAggregates,
  dsSelectColumns,
  emptySideFailures,
  expectedRows,
  parseDsRows,
  partitionMismatches,
  verifyLevel,
  type VerifyMismatch,
  type VerifyQuery
} from '../src/downsample/verify.js';
import { parseAggregateRows } from '../src/downsample/rows.js';

/** 2026-10-13T00:06:51.067Z（= 2026-10-13 08:06:51 +08:00），与 window.test 同源 */
const NOW = 1_791_850_011_067;

/**
 * 原始聚合读的一行——列序同 `buildAggregateSql`：
 * `tbname, ts, [每测点 sum/count/min/max]…, [每测点 unit]…`
 */
function rawRow(tbname: string, ts: number, sumT = 373.1): unknown[] {
  return [
    tbname,
    ts,
    sumT,
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
    4.32, // current
    '°C',
    'mm/s',
    'A'
  ];
}

/** 降采样表读的一行——列序同 `buildDsReadSql`：原始 16 列 + `deviceId` */
function dsRow(
  tbname: string,
  ts: number,
  overrides: Partial<Record<string, unknown>> = {},
  deviceId: unknown = null
): unknown[] {
  const row = [...rawRow(tbname, ts), deviceId];
  for (const [field, value] of Object.entries(overrides)) {
    const index = DS_COLUMN_INDEX[field];
    assert.ok(index !== undefined, `未知字段 ${field}`);
    row[index] = value;
  }
  return row;
}

/** 降采样行里各字段的列下标（测试用；与 `buildDsReadSql` 的列序对齐） */
const DS_COLUMN_INDEX: Record<string, number> = {
  tbname: 0,
  ts: 1,
  sum_temperature: 2,
  count_temperature: 3,
  min_temperature: 4,
  max_temperature: 5,
  sum_vibration: 6,
  count_vibration: 7,
  min_vibration: 8,
  max_vibration: 9,
  sum_current: 10,
  count_current: 11,
  min_current: 12,
  max_current: 13,
  temperature_unit: 14,
  vibration_unit: 15,
  current_unit: 16,
  deviceId: 17
};

const RAW_NAME = 'm5obq5cr2hcze10j_001';
const DS_1M = dsSubtableName(RAW_NAME, '1m');
const WINDOW = 1_791_849_780_000;

void test('checkedWindowRange：锚定 now、默认跳过最新窗口、比对 K-1 个', () => {
  const range = checkedWindowRange(NOW, levelSpec('1m'), { lookback: 3 });
  assert.equal(range.windows, 2, '默认 N = K-1');
  assert.equal(range.skip, 1);
  assert.equal(range.endMs, 1_791_849_900_000); // 00:05:00Z（最新已闭合窗口往回 1 格）
  assert.equal(range.startMs, 1_791_849_780_000); // 00:03:00Z
  assert.equal(range.guaranteed, true);
  // 默认 N=K-1 时整段都在 K 契约区内 ⇒ 契约区左边界即范围左边界
  assert.equal(range.contractStartMs, range.startMs);
  // 两端都是合法窗口边界（与环同一套算术）
  const spec = levelSpec('1m');
  assert.equal(lastClosedBoundary(range.startMs, spec), range.startMs);
  assert.equal(lastClosedBoundary(range.endMs, spec), range.endMs);
});

void test('checkedWindowRange：日级业务日边界（offset 8h）也一致', () => {
  const range = checkedWindowRange(NOW, levelSpec('1d'), { lookback: 3 });
  assert.equal(range.endMs, 1_791_763_200_000); // 2026-10-12T00:00:00Z
  assert.equal(range.startMs, 1_791_590_400_000); // 2026-10-10T00:00:00Z
  assert.equal(range.windows, 2);
});

void test('checkedWindowRange：skip=0 时不保证覆盖（最新窗口有触发抖动）', () => {
  const range = checkedWindowRange(NOW, levelSpec('1m'), {
    lookback: 3,
    skip: 0,
    windows: 3
  });
  assert.equal(range.guaranteed, false);
});

void test('checkedWindowRange：S+N>K 时不保证覆盖', () => {
  const range = checkedWindowRange(NOW, levelSpec('1m'), {
    lookback: 3,
    skip: 1,
    windows: 3
  });
  assert.equal(range.guaranteed, false);
});

void test('buildDsReadSql：读降采样超表，含 deviceId，边界用 epoch 毫秒', () => {
  const sql = buildDsReadSql(levelSpec('1m'), 1000, 2000);
  assert.match(sql, /FROM wewant_iot_ds\.telemetry_1m/);
  assert.match(sql, /WHERE ts >= 1000 AND ts < 2000/);
  assert.match(sql, /deviceId/);
  for (const metric of RAW_METRICS) {
    for (const agg of ['sum', 'count', 'min', 'max']) {
      assert.match(sql, new RegExp(`${agg}_${metric}`));
    }
    assert.match(sql, new RegExp(`${metric}_unit`));
  }
  assert.doesNotMatch(sql, /COUNT\(\s*DISTINCT/i);
});

void test('parseDsRows：解析 deviceId 标签并还原原始子表名', () => {
  const [row] = parseDsRows(
    [dsRow(DS_1M, WINDOW, {}, 'ABCDEFGHIJKLMNOP')],
    '1m'
  );
  assert.ok(row);
  assert.equal(row.rawName, RAW_NAME);
  assert.equal(row.deviceId, 'ABCDEFGHIJKLMNOP');
  assert.equal(row.ts, WINDOW);
  assert.deepEqual(row.metrics.temperature, {
    sum: 373.1,
    count: 6n,
    min: 61.1,
    max: 62.4,
    unit: '°C'
  });
});

void test('expectedRows：键取它应当落进的降采样子表名', () => {
  const rows = parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m');
  const [expected] = expectedRows(rows, '1m');
  assert.ok(expected);
  assert.equal(expected.rawName, RAW_NAME);
  assert.equal(expected.key, `${DS_1M}@${WINDOW}`);
});

void test('compareAggregates：完全一致 ⇒ 无差异', () => {
  const expected = parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m');
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, {}, 'ABCDEFGHIJKLMNOP')],
    '1m'
  );
  const mismatches = compareAggregates(
    '1m',
    expectedRows(expected, '1m'),
    actual,
    () => 'ABCDEFGHIJKLMNOP'
  );
  assert.deepEqual(mismatches, []);
});

void test('compareAggregates：浮点表示级差异在容差内 ⇒ 无差异', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, { sum_temperature: 373.1 + 1e-12 })],
    '1m'
  );
  assert.deepEqual(compareAggregates('1m', expected, actual), []);
});

void test('compareAggregates：超过容差 ⇒ 报出字段/期望/实际', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, { sum_temperature: 374.1 })],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.subtable, RAW_NAME);
  assert.equal(mismatches[0]?.ts, WINDOW);
  assert.equal(mismatches[0]?.field, 'sum_temperature');
  assert.equal(mismatches[0]?.expected, '373.1');
  assert.equal(mismatches[0]?.actual, '374.1');
  assert.equal(mismatches[0]?.kind, 'field');
});

void test('compareAggregates：一个 FLOAT 表示误差（~1e-7 相对）也报 —— 容差够紧', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, { min_temperature: 61.1 * (1 + 1.2e-7) })],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.field, 'min_temperature');
});

void test('compareAggregates：count 精确比较（不容差）', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, { count_temperature: 7n })],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.field, 'count_temperature');
  assert.equal(mismatches[0]?.expected, '6');
  assert.equal(mismatches[0]?.actual, '7');
});

void test('compareAggregates：单位列不等即报', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, { temperature_unit: 'K' })],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.field, 'temperature_unit');
  assert.equal(mismatches[0]?.expected, '°C');
  assert.equal(mismatches[0]?.actual, 'K');
});

void test('compareAggregates：deviceId 标签不等即报', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW, {}, 'WRONGDEVICEID___')],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual, () => 'RIGHT');
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.field, 'deviceId');
  assert.equal(mismatches[0]?.expected, 'RIGHT');
  assert.equal(mismatches[0]?.actual, 'WRONGDEVICEID___');
});

void test('compareAggregates：原始有窗口、降采样缺行 ⇒ missing-row', () => {
  const expected = expectedRows(
    parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, [], () => 'X');
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.kind, 'missing-row');
  assert.equal(mismatches[0]?.subtable, RAW_NAME);
  assert.equal(mismatches[0]?.ts, WINDOW);
});

void test('compareAggregates：降采样多行、原始无该窗口 ⇒ extra-row', () => {
  const actual = parseDsRows([dsRow(DS_1M, WINDOW)], '1m');
  const mismatches = compareAggregates('1m', [], actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.kind, 'extra-row');
  assert.equal(mismatches[0]?.subtable, RAW_NAME);
  assert.equal(mismatches[0]?.ts, WINDOW);
});

void test('compareAggregates：同一子表多个窗口各比各的', () => {
  const window2 = WINDOW + 60_000;
  const expected = expectedRows(
    [
      ...parseAggregateRows([rawRow(RAW_NAME, WINDOW)], '1m'),
      ...parseAggregateRows([rawRow(RAW_NAME, window2)], '1m')
    ],
    '1m'
  );
  // 第二个窗口的 sum 被改错
  const actual = parseDsRows(
    [dsRow(DS_1M, WINDOW), dsRow(DS_1M, window2, { sum_temperature: 999 })],
    '1m'
  );
  const mismatches = compareAggregates('1m', expected, actual);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.ts, window2);
  assert.equal(mismatches[0]?.field, 'sum_temperature');
});

/** 造一个按 SQL 分流返回的假查询 */
function fakeQuery(rawRows: unknown[][], dsRows: unknown[][]): VerifyQuery {
  return {
    query: (sql: string): Promise<unknown[][]> =>
      Promise.resolve(sql.includes('wewant_iot_ds') ? dsRows : rawRows)
  };
}

void test('verifyLevel：分流读原始与降采样，逐条比后无差异', async () => {
  const result = await verifyLevel(
    fakeQuery(
      [rawRow(RAW_NAME, WINDOW)],
      [dsRow(DS_1M, WINDOW, {}, 'ABCDEFGHIJKLMNOP')]
    ),
    '1m',
    NOW,
    { lookback: 3 },
    () => 'ABCDEFGHIJKLMNOP'
  );
  assert.equal(result.level, '1m');
  assert.equal(result.expectedCount, 1);
  assert.equal(result.actualCount, 1);
  assert.deepEqual(result.mismatches, []);
  // 范围与 checkedWindowRange 一致（同一个 now）
  const range = checkedWindowRange(NOW, levelSpec('1m'), { lookback: 3 });
  assert.deepEqual(result.range, range);
});

void test('verifyLevel：降采样值被改 ⇒ 报出该条', async () => {
  const result = await verifyLevel(
    fakeQuery(
      [rawRow(RAW_NAME, WINDOW)],
      [dsRow(DS_1M, WINDOW, { sum_temperature: 12345 })]
    ),
    '1m',
    NOW,
    { lookback: 3 }
  );
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0]?.field, 'sum_temperature');
});

void test('checkTablesNonEmpty：三条都有数据 ⇒ 无问题', async () => {
  const query: VerifyQuery = {
    query: () => Promise.resolve([[1]])
  };
  assert.deepEqual(await checkTablesNonEmpty(query), []);
});

void test('checkTablesNonEmpty：空表 ⇒ empty', async () => {
  const query: VerifyQuery = {
    query: () => Promise.resolve([])
  };
  const issues = await checkTablesNonEmpty(query);
  assert.equal(issues.length, 3);
  assert.ok(issues.every(issue => issue.kind === 'empty'));
});

void test('checkTablesNonEmpty：查询抛错 ⇒ missing', async () => {
  const query: VerifyQuery = {
    query: () => Promise.reject(new Error('table not exist'))
  };
  const issues = await checkTablesNonEmpty(query);
  assert.equal(issues.length, 3);
  assert.ok(issues.every(issue => issue.kind === 'missing'));
});

// ---------- 范围与 K 契约区 ----------

void test('checkedWindowRange：N > K 时范围伸进 K 外，契约区左边界仍守在最近 K 个窗口', () => {
  const range = checkedWindowRange(NOW, levelSpec('1m'), {
    lookback: 3,
    windows: 5,
    skip: 1
  });
  assert.equal(range.guaranteed, false);
  // 边界 = 00:06:00Z；契约区左边界 = 边界 - K 个窗口 = 00:03:00Z
  assert.equal(range.contractStartMs, 1_791_849_780_000);
  // 范围左边界再往前伸到边界 - (skip+N) 个窗口 = 00:01:00Z
  assert.equal(range.startMs, 1_791_849_600_000);
  assert.ok(range.startMs < range.contractStartMs);
});

function mismatchAt(ts: number): VerifyMismatch {
  return {
    level: '1m',
    subtable: RAW_NAME,
    ts,
    field: 'sum_temperature',
    expected: '1',
    actual: '2',
    kind: 'field'
  };
}

void test('partitionMismatches：K 契约区内判失败、区外只提示', () => {
  const range = checkedWindowRange(NOW, levelSpec('1m'), {
    lookback: 3,
    windows: 5,
    skip: 1
  });
  const inside = range.contractStartMs; // 恰在契约区左边界 ⇒ 内
  const outside = range.contractStartMs - 60_000; // 区外一个窗口
  const { failures, informational } = partitionMismatches(range, [
    mismatchAt(inside),
    mismatchAt(outside)
  ]);
  assert.deepEqual(
    failures.map(m => m.ts),
    [inside]
  );
  assert.deepEqual(
    informational.map(m => m.ts),
    [outside]
  );
});

// ---------- 两条读之间的一致性边界 ----------

void test('verifyLevel：首轮差异若重读后消失（跨了一次写入）⇒ 不报', async () => {
  let dsCalls = 0;
  const query: VerifyQuery = {
    query: (sql: string) => {
      if (sql.includes('wewant_iot_ds')) {
        dsCalls += 1;
        // 降采样侧：首轮给错值，重读给对值——模拟两次读之间环完成了一次重算
        return Promise.resolve([
          dsRow(DS_1M, WINDOW, dsCalls === 1 ? { sum_temperature: 999 } : {})
        ]);
      }
      return Promise.resolve([rawRow(RAW_NAME, WINDOW)]);
    }
  };
  const result = await verifyLevel(query, '1m', NOW, { lookback: 3 });
  assert.ok(dsCalls >= 2, '发现差异后应重读两侧');
  assert.deepEqual(result.mismatches, []);
});

void test('verifyLevel：两侧都在两次读之间变化 ⇒ 只重读一侧仍会误报', async () => {
  // 取值刻意让「只重读一侧」仍留下差异：raw 100→300、ds 200→300，两轮都改。
  // 只重读降采样侧 ⇒ 100(旧 raw) ≠ 300(新 ds)；只重读原始侧 ⇒ 300(新 raw) ≠ 200(旧 ds)；
  // 两侧都重读 ⇒ 300 = 300，差异消除。任缺一侧，本用例即失败。
  let rawCalls = 0;
  let dsCalls = 0;
  const query: VerifyQuery = {
    query: (sql: string) => {
      if (sql.includes('wewant_iot_ds')) {
        dsCalls += 1;
        return Promise.resolve([
          dsRow(DS_1M, WINDOW, { sum_temperature: dsCalls === 1 ? 200 : 300 })
        ]);
      }
      rawCalls += 1;
      return Promise.resolve([
        rawRow(RAW_NAME, WINDOW, rawCalls === 1 ? 100 : 300)
      ]);
    }
  };
  const result = await verifyLevel(query, '1m', NOW, { lookback: 3 });
  assert.ok(rawCalls >= 2, '原始侧必须重读');
  assert.ok(dsCalls >= 2, '降采样侧必须重读');
  assert.deepEqual(result.mismatches, []);
});

// ---------- 与 query.ts 的列序耦合 ----------

/** 从 SQL 的 SELECT 段取列名（`AS` 后的别名，否则整项） */
function selectColumns(sql: string): string[] {
  const select = sql.slice(
    sql.indexOf('SELECT ') + 'SELECT '.length,
    sql.indexOf(' FROM ')
  );
  return select.split(',').map(part => {
    const asIndex = part.toUpperCase().indexOf(' AS ');
    return (asIndex === -1 ? part : part.slice(asIndex + ' AS '.length)).trim();
  });
}

void test('降采样读列序与原始聚合读列序对齐（与 query.ts 的耦合漂移即失败）', () => {
  const rawCols = selectColumns(buildAggregateSql(levelSpec('1m'), 0, 1));
  const dsCols = selectColumns(buildDsReadSql(levelSpec('1m'), 0, 1));
  // 原始侧 ['tbname','ts', 聚合…, 单位…]；降采样侧仅末尾多一列 deviceId
  assert.deepEqual(dsCols.slice(0, -1), rawCols);
  assert.equal(dsCols[dsCols.length - 1], 'deviceId');
  // 列下标常量与 SELECT 列数绑死（改一处不同步即失败）
  assert.equal(DS_DEVICE_ID_INDEX, dsCols.length - 1);
  // 与 dsSelectColumns 同源
  assert.deepEqual(dsSelectColumns(), dsCols);
});

void test('两侧计数为 0 判失败——空对账不是证据', () => {
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 0, actualCount: 0 }).length,
    2
  );
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 5, actualCount: 0 }).length,
    1
  );
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 5, actualCount: 5 }).length,
    0
  );
});
