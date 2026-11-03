import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  DeviceRegistry,
  DeviceRecord
} from '@multi-admin/device-registry';
import { createDeviceRegistry } from '@multi-admin/device-registry';
import { ResolveCache } from '../src/registry-cache.js';

const record: DeviceRecord = {
  localDeviceId: 'sim-001',
  deviceId: 'ABCDEFGHIJKLMNOP',
  modelCode: 'p1'
};

function countingRegistry(): { registry: DeviceRegistry; calls: () => number } {
  let calls = 0;
  const inner = createDeviceRegistry([record]);
  return {
    calls: () => calls,
    registry: {
      hasDevice: id => inner.hasDevice(id),
      allSubtables: () => inner.allSubtables(),
      resolve: id => {
        calls += 1;
        return inner.resolve(id);
      }
    }
  };
}

void test('同一查询第二次走缓存，不再查档', () => {
  const { registry, calls } = countingRegistry();
  const cache = new ResolveCache(registry, 60_000);

  const first = cache.resolve('sim-001');
  const second = cache.resolve('sim-001');

  assert.deepEqual(first, second);
  assert.equal(calls(), 1);
  assert.equal(cache.size, 1);
});

void test('大小写与空白不同算同一次查询', () => {
  const { registry, calls } = countingRegistry();
  const cache = new ResolveCache(registry, 60_000);

  cache.resolve('sim-001');
  cache.resolve(' SIM-001 ');

  assert.equal(calls(), 1);
});

void test('过了 TTL 重新查档', () => {
  const { registry, calls } = countingRegistry();
  let now = 1_000;
  const cache = new ResolveCache(registry, 5_000, 100, () => now);

  cache.resolve('sim-001');
  now += 4_999;
  cache.resolve('sim-001');
  assert.equal(calls(), 1);

  now += 2;
  cache.resolve('sim-001');
  assert.equal(calls(), 2);
});

void test('未登记设备的结果同样被缓存（不会每条都查档）', () => {
  const { registry, calls } = countingRegistry();
  const cache = new ResolveCache(registry, 60_000);

  assert.deepEqual(cache.resolve('sim-404'), {
    ok: false,
    reason: 'unknown-device'
  });
  assert.deepEqual(cache.resolve('sim-404'), {
    ok: false,
    reason: 'unknown-device'
  });
  assert.equal(calls(), 1);
});

void test('超过条数上限时整体清空（未登记设备会不断产生新键）', () => {
  const { registry } = countingRegistry();
  const cache = new ResolveCache(registry, 60_000, 2);

  cache.resolve('sim-001');
  cache.resolve('sim-002');
  assert.equal(cache.size, 2);

  cache.resolve('sim-003');
  assert.equal(cache.size, 1);
});
