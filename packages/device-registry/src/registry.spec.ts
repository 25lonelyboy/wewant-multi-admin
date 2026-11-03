import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeviceRegistry, subtableName } from './registry.js';
import {
  P1_DEVICE_COUNT,
  P1_MODEL_CODE,
  p1DeviceRecords,
  p1DeviceRegistry
} from './p1.js';
import type { DeviceRecord } from './types.js';

const record: DeviceRecord = {
  localDeviceId: 'sim-001',
  deviceId: 'ZZZZZZZZZZZZZZZZ',
  modelCode: 'p1'
};

const registry = createDeviceRegistry([record]);

void test('已登记判定按规范化后的编号比较', () => {
  assert.equal(registry.hasDevice('sim-001'), true);
  assert.equal(registry.hasDevice('  SIM-001 '), true);
  assert.equal(registry.hasDevice('sim-999'), false);
});

void test('查档成功时带出 deviceId、modelCode 与子表名', () => {
  assert.deepEqual(registry.resolve('sim-001'), {
    ok: true,
    deviceId: 'ZZZZZZZZZZZZZZZZ',
    modelCode: 'p1',
    subtable: 'p1_zzzzzzzzzzzzzzzz'
  });
  // 同一台设备前后大小写/空白不一致 ⇒ 规范化后仍认
  assert.deepEqual(registry.resolve('  SIM-001 '), {
    ok: true,
    deviceId: 'ZZZZZZZZZZZZZZZZ',
    modelCode: 'p1',
    subtable: 'p1_zzzzzzzzzzzzzzzz'
  });
});

void test('未登记的设备被拒', () => {
  assert.deepEqual(registry.resolve('sim-404'), {
    ok: false,
    reason: 'unknown-device'
  });
});

void test('档案里 localDeviceId 规范化后重复时构造即失败', () => {
  assert.throws(
    () =>
      createDeviceRegistry([record, { ...record, localDeviceId: 'SIM-001' }]),
    /localDeviceId 重复/
  );
});

void test('子表名：模型编码 + deviceId，折小写', () => {
  assert.equal(subtableName('p1', 'ABCDEF0123456789'), 'p1_abcdef0123456789');
});

void test('P1 档案：台数、标识形状与唯一性', () => {
  const records = p1DeviceRecords();
  assert.equal(records.length, P1_DEVICE_COUNT);

  const deviceIds = records.map(record => record.deviceId);
  assert.equal(new Set(deviceIds).size, P1_DEVICE_COUNT);
  for (const deviceId of deviceIds) {
    // 标识生成规则已冻结：16 位、首字符字母
    assert.match(deviceId, /^[A-Z][0-9A-Z]{15}$/);
  }

  // 与模拟器共用同一个生成函数 ⇒ 编号集合逐字一致，不需要另加对齐断言
  assert.deepEqual(
    records.map(record => record.localDeviceId),
    Array.from(
      { length: P1_DEVICE_COUNT },
      (_, i) => `sim-${String(i + 1).padStart(3, '0')}`
    )
  );
  assert.ok(records.every(record => record.modelCode === P1_MODEL_CODE));
});

void test('P1 档案：子表名带模型编码、全部小写且与设备数一致', () => {
  const subtables = p1DeviceRegistry.allSubtables();
  assert.equal(subtables.length, P1_DEVICE_COUNT);
  for (const subtable of subtables) {
    assert.match(subtable.name, /^p1_[0-9a-z]+$/);
    assert.equal(subtable.modelCode, P1_MODEL_CODE);
    // 子表名折小写，但进标签的 deviceId 保留原样大小写
    assert.match(subtable.deviceId, /^[0-9A-Z]{16}$/);
  }
  assert.equal(p1DeviceRegistry.hasDevice('sim-100'), true);
  assert.equal(p1DeviceRegistry.hasDevice('sim-101'), false);
});
