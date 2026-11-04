import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_METRIC_KEY_LENGTH,
  MAX_MODEL_CODE_LENGTH,
  checkMetricKey,
  checkModelCode
} from './identifier.js';

void test('属性 key：长度上限 58 通过、59 拒', () => {
  const atLimit = 'a'.repeat(MAX_METRIC_KEY_LENGTH);
  const overLimit = 'a'.repeat(MAX_METRIC_KEY_LENGTH + 1);

  assert.deepEqual(checkMetricKey(atLimit), { ok: true, value: atLimit });
  assert.deepEqual(checkMetricKey(overLimit), {
    ok: false,
    reason: 'too-long'
  });
});

void test('属性 key：保留词 ts / deviceId 被拒，大小写不敏感', () => {
  assert.deepEqual(checkMetricKey('ts'), { ok: false, reason: 'reserved' });
  assert.deepEqual(checkMetricKey('TS'), { ok: false, reason: 'reserved' });
  assert.deepEqual(checkMetricKey('deviceId'), {
    ok: false,
    reason: 'reserved'
  });
});

void test('属性 key：归一化为小写，接受首尾空白', () => {
  assert.deepEqual(checkMetricKey('  P1_Temp  '), {
    ok: true,
    value: 'p1_temp'
  });
});

void test('属性 key：字符集非法', () => {
  for (const raw of ['1abc', '_abc', 'a-b', 'a.b', '温度']) {
    assert.deepEqual(
      checkMetricKey(raw),
      { ok: false, reason: 'charset' },
      raw
    );
  }
});

void test('属性 key：空串与纯空白', () => {
  assert.deepEqual(checkMetricKey(''), { ok: false, reason: 'empty' });
  assert.deepEqual(checkMetricKey('   '), { ok: false, reason: 'empty' });
});

void test('模型编码：长度上限 172 通过、173 拒', () => {
  const atLimit = 'm'.repeat(MAX_MODEL_CODE_LENGTH);
  const overLimit = 'm'.repeat(MAX_MODEL_CODE_LENGTH + 1);

  assert.deepEqual(checkModelCode(atLimit), { ok: true, value: atLimit });
  assert.deepEqual(checkModelCode(overLimit), {
    ok: false,
    reason: 'too-long'
  });
});

void test('模型编码：没有保留词，ts 合法', () => {
  assert.deepEqual(checkModelCode('ts'), { ok: true, value: 'ts' });
});

void test('模型编码：字符集与归一化同属性 key', () => {
  assert.deepEqual(checkModelCode('P1'), { ok: true, value: 'p1' });
  assert.deepEqual(checkModelCode('-p1'), { ok: false, reason: 'charset' });
  assert.deepEqual(checkModelCode('   '), { ok: false, reason: 'empty' });
});
