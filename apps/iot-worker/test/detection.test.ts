import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnvelope } from '../src/detection.js';

const raw = (payload: unknown): string => JSON.stringify(payload);

const full = {
  localDeviceId: 'sim-001',
  ts: 1759603200000,
  metrics: [
    { key: 'temperature', value: 62.4, unit: '°C' },
    { key: 'current', value: 4.31, unit: 'A' }
  ]
};

void test('合法报文解析出身份、ts 与原始测点', () => {
  const result = parseEnvelope(raw(full));
  assert.ok(!('reason' in result));
  if ('reason' in result) return;
  assert.equal(result.localDeviceId, 'sim-001');
  assert.equal(result.ts, 1759603200000);
  assert.deepEqual(result.metrics, [
    { key: 'temperature', value: 62.4, unit: '°C' },
    { key: 'current', value: 4.31, unit: 'A' }
  ]);
});

void test('非 JSON / 顶层非对象判为 malformed', () => {
  for (const bad of ['not-json', '42', 'null', '[]']) {
    assert.deepEqual(parseEnvelope(bad), { reason: 'malformed' });
  }
});

void test('localDeviceId 缺失或空白判为 missing-device', () => {
  assert.deepEqual(parseEnvelope(raw({ ts: 1, metrics: [] })), {
    reason: 'missing-device'
  });
  assert.deepEqual(
    parseEnvelope(raw({ localDeviceId: '   ', ts: 1, metrics: [] })),
    { reason: 'missing-device' }
  );
});

void test('ts 非有限数字判为 bad-ts', () => {
  assert.deepEqual(
    parseEnvelope(raw({ localDeviceId: 'a', ts: 'now', metrics: [] })),
    { reason: 'bad-ts' }
  );
  assert.deepEqual(
    parseEnvelope(
      raw({ localDeviceId: 'a', ts: Number.POSITIVE_INFINITY, metrics: [] })
    ),
    { reason: 'bad-ts' }
  );
});

void test('metrics 缺失、非数组或没有有效项判为 no-metrics', () => {
  assert.deepEqual(parseEnvelope(raw({ localDeviceId: 'a', ts: 1 })), {
    reason: 'no-metrics'
  });
  assert.deepEqual(
    parseEnvelope(raw({ localDeviceId: 'a', ts: 1, metrics: 'x' })),
    { reason: 'no-metrics' }
  );
  assert.deepEqual(
    parseEnvelope(raw({ localDeviceId: 'a', ts: 1, metrics: [] })),
    { reason: 'no-metrics' }
  );
  assert.deepEqual(
    parseEnvelope(
      raw({ localDeviceId: 'a', ts: 1, metrics: [{ value: 1 }, 'x', null] })
    ),
    { reason: 'no-metrics' }
  );
});

void test('⭐ 不按测点集合过滤：未知 key 与非法值都原样带出，交给声明层处置', () => {
  const result = parseEnvelope(
    raw({
      ...full,
      metrics: [
        { key: 'pressure', value: 101.3, unit: 'kPa' },
        { key: 'temperature', value: 'hot', unit: '°C' }
      ]
    })
  );
  assert.ok(!('reason' in result));
  if ('reason' in result) return;
  assert.deepEqual(
    result.metrics.map(metric => metric.key),
    ['pressure', 'temperature']
  );
});

void test('单位缺失按空串处理（声明比对会判不符）', () => {
  const result = parseEnvelope(
    raw({
      ...full,
      metrics: [{ key: 'temperature', value: 1 }]
    })
  );
  assert.ok(!('reason' in result));
  if ('reason' in result) return;
  assert.equal(result.metrics[0]?.unit, '');
});
