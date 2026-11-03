import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TdRow } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedDsNames,
  type ExpectedSubtable
} from '../src/subtables/audit.js';

const EXPECTED: ExpectedSubtable[] = [
  { name: 'p1_abc', deviceId: 'ABC', modelCode: 'p1' }
];

function fakeQuery(rows: TdRow[]): { query(sql: string): Promise<TdRow[]> } {
  return { query: () => Promise.resolve(rows) };
}

void test('期望集为空时拒绝判定', async () => {
  await assert.rejects(() => auditSubtables(fakeQuery([]), []), /期望集为空/);
});

void test('期望集的降采样名按三级展开', () => {
  assert.deepEqual(expectedDsNames(EXPECTED), [
    'p1_abc_1m',
    'p1_abc_1h',
    'p1_abc_1d'
  ]);
});

void test('干净环境四桶全空', async () => {
  const rows: TdRow[] = [
    ['p1', 'p1_abc'],
    ['p1_1m', 'p1_abc_1m'],
    ['p1_1h', 'p1_abc_1h'],
    ['p1_1d', 'p1_abc_1d']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report, {
    orphanRaw: [],
    missingRaw: [],
    orphanDs: [],
    missingDs: []
  });
});

void test('多个模型编码各自的超表都参与归类', async () => {
  const expected: ExpectedSubtable[] = [
    ...EXPECTED,
    { name: 'meter_def', deviceId: 'DEF', modelCode: 'meter' }
  ];
  const rows: TdRow[] = [
    ['p1', 'p1_abc'],
    ['meter', 'meter_def'],
    ['p1_1m', 'p1_abc_1m'],
    ['meter_1m', 'meter_def_1m']
  ];
  const report = await auditSubtables(fakeQuery(rows), expected);
  assert.deepEqual(report.orphanRaw, []);
  assert.deepEqual(report.missingRaw, []);
  assert.deepEqual(report.missingDs, [
    'meter_def_1d',
    'meter_def_1h',
    'p1_abc_1d',
    'p1_abc_1h'
  ]);
});

void test('孤儿与缺失分桶，超表自身的行被忽略', async () => {
  const rows: TdRow[] = [
    ['p1', 'p1'],
    ['p1', 'p1_abc'],
    ['p1', 'p1_old'],
    ['p1_1m', 'p1_abc_1m'],
    ['p1_1m', 'p1_old_1m'],
    ['p1_1h', 'p1_abc_1h']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report.orphanRaw, ['p1_old']);
  assert.deepEqual(report.orphanDs, ['p1_old_1m']);
  assert.deepEqual(report.missingRaw, []);
  assert.deepEqual(report.missingDs, ['p1_abc_1d']);
});
