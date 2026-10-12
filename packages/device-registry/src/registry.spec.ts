import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LOCAL_POINT_ID_LENGTH,
  createDeviceRegistry,
  subtableName
} from './registry.js';
import { P1_DEVICE_COUNT, p1DeviceRecords, p1DeviceRegistry } from './p1.js';
import type { DeviceRecord } from './types.js';

const singlePoint: DeviceRecord = {
  localDeviceId: 'sim-001',
  deviceId: 'ZZZZZZZZZZZZZZZZ',
  singlePoint: true,
  points: [{ localPointId: '001', pointKey: '001' }]
};

const multiPoint: DeviceRecord = {
  localDeviceId: 'plc-01',
  deviceId: 'ABCDEF0123456789',
  singlePoint: false,
  points: [
    { localPointId: 'motor', pointKey: '001' },
    { localPointId: 'pump', pointKey: '002' }
  ]
};

const registry = createDeviceRegistry([singlePoint, multiPoint]);

void test('已登记判定按规范化后的编号比较', () => {
  assert.equal(registry.hasDevice('sim-001'), true);
  assert.equal(registry.hasDevice('  SIM-001 '), true);
  assert.equal(registry.hasDevice('sim-999'), false);
});

void test('单点设备缺省 localPointId 时补到它唯一那一点', () => {
  assert.deepEqual(registry.resolve('sim-001'), {
    ok: true,
    deviceId: 'ZZZZZZZZZZZZZZZZ',
    pointKey: '001'
  });
});

void test('多点设备漏 localPointId 被拒（不走缺省）', () => {
  assert.deepEqual(registry.resolve('plc-01'), {
    ok: false,
    reason: 'missing-point'
  });
});

void test('多点设备给出采集点编号时解析到对应 pointKey', () => {
  assert.deepEqual(registry.resolve('plc-01', 'pump'), {
    ok: true,
    deviceId: 'ABCDEF0123456789',
    pointKey: '002'
  });
  // 同一台设备前后大小写/空白不一致 ⇒ 规范化后仍认
  assert.deepEqual(registry.resolve('plc-01', '  PUMP '), {
    ok: true,
    deviceId: 'ABCDEF0123456789',
    pointKey: '002'
  });
});

void test('未登记的采集点被拒', () => {
  assert.deepEqual(registry.resolve('plc-01', 'valve'), {
    ok: false,
    reason: 'unknown-point'
  });
});

void test('未登记的设备被拒', () => {
  assert.deepEqual(registry.resolve('sim-404'), {
    ok: false,
    reason: 'unknown-device'
  });
});

void test('超长 localPointId 被拒而不是截断', () => {
  const tooLong = 'x'.repeat(MAX_LOCAL_POINT_ID_LENGTH + 1);
  assert.deepEqual(registry.resolve('plc-01', tooLong), {
    ok: false,
    reason: 'point-id-too-long'
  });
});

void test('空白 localPointId 按缺失处理', () => {
  assert.deepEqual(registry.resolve('plc-01', '   '), {
    ok: false,
    reason: 'missing-point'
  });
});

void test('档案里 localDeviceId 规范化后重复时构造即失败', () => {
  assert.throws(
    () =>
      createDeviceRegistry([
        singlePoint,
        { ...singlePoint, localDeviceId: 'SIM-001' }
      ]),
    /localDeviceId 重复/
  );
});

void test('子表名折小写（TDengine 标识符不分大小写）', () => {
  assert.equal(subtableName('ABCDEF0123456789', '001'), 'abcdef0123456789_001');
});

void test('P1 档案：台数、标识形状与唯一性', () => {
  const records = p1DeviceRecords();
  assert.equal(records.length, P1_DEVICE_COUNT);

  const deviceIds = records.map(record => record.deviceId);
  assert.equal(new Set(deviceIds).size, P1_DEVICE_COUNT);
  for (const deviceId of deviceIds) {
    // ⚠️ 首字符必须是字母：TDengine 标识符不能以数字开头，而它是子表名的首段
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
});

void test('P1 档案：子表名全部小写且与设备数一致', () => {
  const subtables = p1DeviceRegistry.allSubtables();
  assert.equal(subtables.length, P1_DEVICE_COUNT);
  for (const subtable of subtables) {
    assert.match(subtable.name, /^[0-9a-z]+_001$/);
    // 子表名折小写，但进标签的 deviceId 保留原样大小写
    assert.match(subtable.deviceId, /^[0-9A-Z]{16}$/);
  }
  assert.equal(p1DeviceRegistry.hasDevice('sim-100'), true);
  assert.equal(p1DeviceRegistry.hasDevice('sim-101'), false);
});
