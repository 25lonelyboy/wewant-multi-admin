import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  PropertyDecl,
  RegistrySnapshot
} from '@multi-admin/device-registry';
import { resolvePoint } from '../src/resolve.js';
import { buildIndex } from '../src/snapshot/client.js';

const v1: PropertyDecl = {
  key: 'temperature',
  kind: 'float',
  unit: '°C',
  aggregates: ['sum']
};
const v2: PropertyDecl = {
  key: 'door',
  kind: 'bool',
  aggregates: ['count']
};

const SNAPSHOT: RegistrySnapshot = {
  version: 1,
  builtAt: '2026-01-01T00:00:00.000Z',
  models: [
    {
      modelCode: 'm1',
      rawColumns: [],
      dsColumns: [],
      versions: [
        {
          version: 1,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveTo: '2026-01-20T00:00:00.000Z',
          properties: [v1]
        },
        {
          version: 2,
          effectiveFrom: '2026-01-20T00:00:00.000Z',
          effectiveTo: null,
          properties: [v2]
        }
      ]
    }
  ],
  devices: [
    {
      localDeviceId: 'dev-1',
      deviceId: 'ABCDEFGHIJKLMNOP',
      modelCode: 'm1',
      fromAt: '2026-01-15T00:00:00.000Z',
      toAt: '2026-01-25T00:00:00.000Z'
    },
    {
      localDeviceId: 'dev-1',
      deviceId: 'ABCDEFGHIJKLMNOP',
      modelCode: 'm1',
      fromAt: '2026-01-25T00:00:00.000Z',
      toAt: null
    },
    {
      localDeviceId: 'dev-2',
      deviceId: 'QRSTUVWXYZ234567',
      modelCode: 'm1',
      fromAt: '2026-01-10T00:00:00.000Z',
      toAt: '2026-01-12T00:00:00.000Z'
    }
  ]
};

const index = buildIndex(SNAPSHOT);
const at = (iso: string): number => Date.parse(iso);

void test('usage 区间 × 版本区间：命中正确的声明', () => {
  const first = resolvePoint(index, 'dev-1', at('2026-01-16T00:00:00.000Z'));
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.deviceId, 'ABCDEFGHIJKLMNOP');
    assert.equal(first.subtable, 'm1_abcdefghijklmnop');
    assert.deepEqual(first.properties, [v1]);
  }

  // 同一条 usage 跨过版本边界 ⇒ 按 ts 落到 v2
  const second = resolvePoint(index, 'dev-1', at('2026-01-22T00:00:00.000Z'));
  assert.equal(second.ok, true);
  if (second.ok) assert.deepEqual(second.properties, [v2]);
});

void test('一台设备两条 usage：按 ts 选对，open usage 延伸到无限', () => {
  const later = resolvePoint(index, 'dev-1', at('2026-02-01T00:00:00.000Z'));
  assert.equal(later.ok, true);
  if (later.ok) {
    assert.equal(later.subtable, 'm1_abcdefghijklmnop');
    assert.deepEqual(later.properties, [v2]);
  }
});

void test('localDeviceId 先规范化：大写输入也能查到', () => {
  const result = resolvePoint(index, 'DEV-1', at('2026-01-16T00:00:00.000Z'));
  assert.equal(result.ok, true);
});

void test('设备不在快照 ⇒ unknown-device', () => {
  assert.deepEqual(
    resolvePoint(index, 'nope', at('2026-01-16T00:00:00.000Z')),
    {
      ok: false,
      reason: 'unknown-device'
    }
  );
});

void test('设备在快照但 ts 不落在任何 usage 区间 ⇒ out-of-range-ts', () => {
  // 早于第一条 usage
  assert.deepEqual(
    resolvePoint(index, 'dev-1', at('2026-01-14T00:00:00.000Z')),
    {
      ok: false,
      reason: 'out-of-range-ts'
    }
  );
  // 只有一条已关闭 usage 的设备，之后没有覆盖
  assert.deepEqual(
    resolvePoint(index, 'dev-2', at('2026-01-13T00:00:00.000Z')),
    {
      ok: false,
      reason: 'out-of-range-ts'
    }
  );
});

void test('半开区间：toAt 与 effectiveTo 的边界不归前一区间', () => {
  assert.deepEqual(
    resolvePoint(index, 'dev-1', at('2026-01-25T00:00:00.000Z')),
    {
      ok: true,
      deviceId: 'ABCDEFGHIJKLMNOP',
      modelCode: 'm1',
      subtable: 'm1_abcdefghijklmnop',
      properties: [v2]
    }
  );
  // 版本边界：01-20 归 v2
  const boundary = resolvePoint(index, 'dev-1', at('2026-01-20T00:00:00.000Z'));
  assert.equal(boundary.ok, true);
  if (boundary.ok) assert.deepEqual(boundary.properties, [v2]);
});
