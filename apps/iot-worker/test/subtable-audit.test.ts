import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RegistrySnapshot } from '@multi-admin/device-registry';
import type { TdRow } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedDsNames,
  expectedFromSnapshot,
  type ExpectedSubtable
} from '../src/subtables/audit.js';

const EXPECTED: ExpectedSubtable[] = [
  { name: 'p1_abc', deviceId: 'ABC', modelCode: 'p1' }
];

function fakeQuery(rows: TdRow[]): { query(sql: string): Promise<TdRow[]> } {
  return { query: () => Promise.resolve(rows) };
}

/** 一行 `information_schema.ins_tables`：库名、超表名、表名 */
const raw = (stable: string, table: string): TdRow => [
  'wewant_iot',
  stable,
  table
];
const ds = (stable: string, table: string): TdRow => [
  'wewant_iot_ds',
  stable,
  table
];

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

void test('expectedFromSnapshot：按设备 usage 展开并去重', () => {
  const snapshot = {
    version: 1,
    builtAt: '2026-01-01T00:00:00.000Z',
    models: [],
    devices: [
      {
        localDeviceId: 'dev-1',
        deviceId: 'ABC',
        modelCode: 'p1',
        fromAt: '2026-01-01T00:00:00.000Z',
        toAt: null
      },
      // 换型后同一台设备的历史 usage：旧模型的子表仍合法
      {
        localDeviceId: 'dev-1',
        deviceId: 'ABC',
        modelCode: 'old',
        fromAt: '2025-01-01T00:00:00.000Z',
        toAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  } as RegistrySnapshot;
  assert.deepEqual(expectedFromSnapshot(snapshot), [
    { name: 'p1_abc', deviceId: 'ABC', modelCode: 'p1' },
    { name: 'old_abc', deviceId: 'ABC', modelCode: 'old' }
  ]);
});

void test('干净环境四桶全空', async () => {
  const rows: TdRow[] = [
    raw('p1', 'p1_abc'),
    ds('p1_1m', 'p1_abc_1m'),
    ds('p1_1h', 'p1_abc_1h'),
    ds('p1_1d', 'p1_abc_1d')
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
    raw('p1', 'p1_abc'),
    raw('meter', 'meter_def'),
    ds('p1_1m', 'p1_abc_1m'),
    ds('meter_1m', 'meter_def_1m')
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
    raw('p1', 'p1'),
    raw('p1', 'p1_abc'),
    raw('p1', 'p1_old'),
    ds('p1_1m', 'p1_abc_1m'),
    ds('p1_1m', 'p1_old_1m'),
    ds('p1_1h', 'p1_abc_1h')
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report.orphanRaw, ['p1_old']);
  assert.deepEqual(report.orphanDs, ['p1_old_1m']);
  assert.deepEqual(report.missingRaw, []);
  assert.deepEqual(report.missingDs, ['p1_abc_1d']);
});

void test('⭐ 整个模型退场后，其遗留子表仍被报成孤儿（不再静默）', async () => {
  // 期望集里已经没有 gone 模型的设备，但库里还留着它的子表
  const rows: TdRow[] = [
    raw('p1', 'p1_abc'),
    raw('gone', 'gone_xyz'),
    ds('p1_1m', 'p1_abc_1m'),
    ds('gone_1m', 'gone_xyz_1m')
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report.orphanRaw, ['gone_xyz']);
  assert.deepEqual(report.orphanDs, ['gone_xyz_1m']);
});
