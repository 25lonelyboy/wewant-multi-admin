import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TdRow } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedDsNames,
  type ExpectedSubtable
} from '../src/subtables/audit.js';

const EXPECTED: ExpectedSubtable[] = [{ name: 'abc_001', deviceId: 'ABC' }];

function fakeQuery(rows: TdRow[]): { query(sql: string): Promise<TdRow[]> } {
  return { query: () => Promise.resolve(rows) };
}

void test('期望集为空时拒绝判定', async () => {
  await assert.rejects(() => auditSubtables(fakeQuery([]), []), /期望集为空/);
});

void test('期望集的降采样名按三级展开', () => {
  assert.deepEqual(expectedDsNames(EXPECTED), [
    'abc_001_1m',
    'abc_001_1h',
    'abc_001_1d'
  ]);
});

void test('干净环境四桶全空', async () => {
  const rows: TdRow[] = [
    ['telemetry', 'abc_001'],
    ['telemetry_1m', 'abc_001_1m'],
    ['telemetry_1h', 'abc_001_1h'],
    ['telemetry_1d', 'abc_001_1d']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report, {
    orphanRaw: [],
    missingRaw: [],
    orphanDs: [],
    missingDs: []
  });
});

void test('孤儿与缺失分桶，超表自身的行被忽略', async () => {
  const rows: TdRow[] = [
    ['telemetry', 'telemetry'],
    ['telemetry', 'abc_001'],
    ['telemetry', 'old_001'],
    ['telemetry_1m', 'abc_001_1m'],
    ['telemetry_1m', 'old_001_1m'],
    ['telemetry_1h', 'abc_001_1h']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report.orphanRaw, ['old_001']);
  assert.deepEqual(report.orphanDs, ['old_001_1m']);
  assert.deepEqual(report.missingRaw, []);
  assert.deepEqual(report.missingDs, ['abc_001_1d']);
});
