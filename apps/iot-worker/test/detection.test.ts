import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detect } from '../src/detection.js';

const raw = (payload: unknown): string => JSON.stringify(payload);

const full = {
  localDeviceId: 'sim-001',
  ts: 1759603200000,
  metrics: [
    { key: 'temperature', value: 62.4, unit: '°C' },
    { key: 'current', value: 4.31, unit: 'A' }
  ]
};

void test('合法报文解析出测点', () => {
  const result = detect(raw(full));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sample.localDeviceId, 'sim-001');
  assert.equal(result.sample.metrics.length, 2);
  assert.deepEqual(result.sample.unknownMetricKeys, []);
});

void test('非 JSON / 顶层非对象判为 malformed', () => {
  for (const bad of ['not-json', '42', 'null', '[]']) {
    assert.deepEqual(detect(bad), {
      ok: false,
      reason: 'malformed',
      unknownMetricKeys: []
    });
  }
});

void test('localDeviceId 缺失或空白判为 missing-device', () => {
  assert.deepEqual(detect(raw({ ts: 1, metrics: [] })), {
    ok: false,
    reason: 'missing-device',
    unknownMetricKeys: []
  });
  assert.deepEqual(detect(raw({ localDeviceId: '   ', ts: 1, metrics: [] })), {
    ok: false,
    reason: 'missing-device',
    unknownMetricKeys: []
  });
});

void test('ts 非有限数字判为 bad-ts', () => {
  assert.deepEqual(
    detect(raw({ localDeviceId: 'a', ts: 'now', metrics: [] })),
    {
      ok: false,
      reason: 'bad-ts',
      unknownMetricKeys: []
    }
  );
  assert.deepEqual(
    detect(
      raw({ localDeviceId: 'a', ts: Number.POSITIVE_INFINITY, metrics: [] })
    ),
    { ok: false, reason: 'bad-ts', unknownMetricKeys: [] }
  );
});

void test('localPointId 存在但非字符串判为 malformed', () => {
  assert.deepEqual(detect(raw({ ...full, localPointId: 7 })), {
    ok: false,
    reason: 'malformed',
    unknownMetricKeys: []
  });
});

void test('localPointId 原样带出', () => {
  const result = detect(raw({ ...full, localPointId: '002' }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.sample.localPointId, '002');
});

void test('未知测点只丢那一个，同一条里合法的测点照留', () => {
  const result = detect(
    raw({
      ...full,
      metrics: [
        { key: 'temperature', value: 62.4, unit: '°C' },
        { key: 'pressure', value: 101.3, unit: 'kPa' }
      ]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sample.unknownMetricKeys, ['pressure']);
  assert.deepEqual(
    result.sample.metrics.map(metric => metric.key),
    ['temperature']
  );
});

void test('值非有限数的测点被丢掉，但不算"未知测点"', () => {
  const result = detect(
    raw({
      ...full,
      metrics: [
        { key: 'temperature', value: 'hot', unit: '°C' },
        { key: 'current', value: 4.31, unit: 'A' }
      ]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.sample.unknownMetricKeys, []);
  assert.deepEqual(
    result.sample.metrics.map(metric => metric.key),
    ['current']
  );
});

void test('测点全不可用时判为 no-metrics', () => {
  assert.deepEqual(
    detect(
      raw({ ...full, metrics: [{ key: 'pressure', value: 1, unit: 'kPa' }] })
    ),
    { ok: false, reason: 'no-metrics', unknownMetricKeys: ['pressure'] }
  );
  assert.deepEqual(detect(raw({ ...full, metrics: [] })), {
    ok: false,
    reason: 'no-metrics',
    unknownMetricKeys: []
  });
  assert.deepEqual(detect(raw({ ...full, metrics: 'x' })), {
    ok: false,
    reason: 'no-metrics',
    unknownMetricKeys: []
  });
});

void test('⭐ 全列皆未知 ⇒ 失败结果带上 unknownMetricKeys（告警必须带 key）', () => {
  const result = detect(
    raw({
      ...full,
      metrics: [
        { key: 'pressure', value: 1, unit: 'kPa' },
        { key: 'flow', value: 2, unit: 'L/min' }
      ]
    })
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'no-metrics');
  assert.deepEqual(result.unknownMetricKeys, ['pressure', 'flow']);
});

void test('⭐ 数值超量程的测点被丢掉（量程可配）', () => {
  // 默认量程：temperature −50..200 ℃、current 0..100 A
  const result = detect(
    raw({
      ...full,
      metrics: [
        { key: 'temperature', value: 62.4, unit: '°C' },
        { key: 'current', value: 999_999, unit: 'A' }
      ]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.sample.metrics.map(metric => metric.key),
    ['temperature'],
    '超量程的 current 被丢，合法的 temperature 照留'
  );
});

void test('⭐ 量程可配：自定义上下限覆盖默认', () => {
  // 把 temperature 收窄到 0..50 ⇒ 62.4 落到量程外
  const result = detect(
    raw({
      ...full,
      metrics: [{ key: 'temperature', value: 62.4, unit: '°C' }]
    }),
    { temperature: { min: 0, max: 50 } }
  );
  assert.deepEqual(result, {
    ok: false,
    reason: 'no-metrics',
    unknownMetricKeys: []
  });
});
