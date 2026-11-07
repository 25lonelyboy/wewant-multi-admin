import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOCAL_DEVICE_ID_MAX_LENGTH,
  checkLocalDeviceId,
  normalizeLocalId
} from './device-id.js';

void test('空串与纯空白被判 empty', () => {
  assert.deepEqual(checkLocalDeviceId(''), { ok: false, reason: 'empty' });
  assert.deepEqual(checkLocalDeviceId('   '), { ok: false, reason: 'empty' });
});

void test('长度上限 64 通过、65 拒', () => {
  const atLimit = 'a'.repeat(LOCAL_DEVICE_ID_MAX_LENGTH);
  const overLimit = 'a'.repeat(LOCAL_DEVICE_ID_MAX_LENGTH + 1);
  assert.deepEqual(checkLocalDeviceId(atLimit), { ok: true, value: atLimit });
  assert.deepEqual(checkLocalDeviceId(overLimit), {
    ok: false,
    reason: 'too-long'
  });
});

void test('非法字符：斜杠、问号、空格、非 ASCII 一律 invalid-char', () => {
  const invalid = ['a/b', 'a?b', 'a b', '设备-1', 'a#b', 'a@b', '-abc', '.abc'];
  for (const raw of invalid) {
    assert.deepEqual(
      checkLocalDeviceId(raw),
      { ok: false, reason: 'invalid-char' },
      raw
    );
  }
});

void test('允许的字符集：字母数字与 . _ : -', () => {
  for (const raw of ['sim-0001', 'a.b', 'a_b', 'a:b', '1abc']) {
    assert.deepEqual(checkLocalDeviceId(raw), { ok: true, value: raw }, raw);
  }
});

void test('大写与首尾空白先归一化再校验，不因大写被拒', () => {
  assert.deepEqual(checkLocalDeviceId('  SIM-0001  '), {
    ok: true,
    value: 'sim-0001'
  });
  assert.deepEqual(checkLocalDeviceId('Sim.A_1:B-2'), {
    ok: true,
    value: 'sim.a_1:b-2'
  });
});

void test('归一化与 normalizeLocalId 同源', () => {
  assert.deepEqual(checkLocalDeviceId(' SIM-1 '), {
    ok: true,
    value: normalizeLocalId(' SIM-1 ')
  });
});
