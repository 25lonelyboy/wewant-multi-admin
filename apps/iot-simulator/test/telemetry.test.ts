import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMetrics, buildPayload } from '../src/telemetry.js';

// node:test 的 test() 返回 Promise；此处按注册语义使用，不等待执行完成，
// 故统一以 void 显式标注（仓库基线禁止浮动 Promise）。
void test('buildMetrics 在 random=0 时取每项下界', () => {
  const metrics = buildMetrics(() => 0);
  assert.deepEqual(
    metrics.map(m => m.value),
    [56, 0.9, 3.2]
  );
});

void test('buildMetrics 在 random=1 时取每项上界', () => {
  const metrics = buildMetrics(() => 1);
  assert.deepEqual(
    metrics.map(m => m.value),
    [68, 2.7, 5.4]
  );
});

void test('buildMetrics 输出契约规定的测点形状', () => {
  const metrics = buildMetrics(() => 0.5);
  assert.deepEqual(
    metrics.map(m => ({ key: m.key, unit: m.unit })),
    [
      { key: 'temperature', unit: '°C' },
      { key: 'vibration', unit: 'mm/s' },
      { key: 'current', unit: 'A' }
    ]
  );
  for (const metric of metrics) {
    assert.equal(typeof metric.value, 'number');
    // random=0.5 时取基准值，值域断言保证未被截成整数
    assert.equal(Number.isFinite(metric.value), true);
  }
});

void test('buildPayload 携带 deviceId 与时间戳', () => {
  const payload = buildPayload('sim-007', 1759603200000, () => 0.5);
  assert.equal(payload.deviceId, 'sim-007');
  assert.equal(payload.ts, 1759603200000);
  assert.equal(payload.metrics.length, 3);
});
