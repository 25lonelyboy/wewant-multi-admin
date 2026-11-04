import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGGREGATE_COLUMN_TYPE,
  AGGREGATES,
  PROPERTY_KINDS,
  isTerminalStatus,
  isVersionStatus
} from './model-types.js';

void test('声明档位恰好八档，array 不在其中', () => {
  assert.deepEqual([...PROPERTY_KINDS].sort(), [
    'bigint',
    'bool',
    'double',
    'enum',
    'float',
    'int',
    'string',
    'struct'
  ]);
  assert.equal((PROPERTY_KINDS as readonly string[]).includes('array'), false);
});

void test('聚合恰好四类，顺序固定', () => {
  assert.deepEqual([...AGGREGATES], ['sum', 'count', 'min', 'max']);
});

void test('数值档位四类聚合齐全，sum 落 DOUBLE，count 落 BIGINT', () => {
  for (const kind of ['float', 'double', 'int', 'bigint'] as const) {
    assert.deepEqual(Object.keys(AGGREGATE_COLUMN_TYPE[kind]).sort(), [
      'count',
      'max',
      'min',
      'sum'
    ]);
    assert.equal(AGGREGATE_COLUMN_TYPE[kind].count, 'BIGINT');
  }
  assert.equal(AGGREGATE_COLUMN_TYPE.float.sum, 'DOUBLE');
  assert.equal(AGGREGATE_COLUMN_TYPE.double.sum, 'DOUBLE');
  // 整数求和取 BIGINT，防 32 位溢出
  assert.equal(AGGREGATE_COLUMN_TYPE.int.sum, 'BIGINT');
  assert.equal(AGGREGATE_COLUMN_TYPE.bigint.sum, 'BIGINT');
});

void test('min / max 与源列同类型', () => {
  assert.equal(AGGREGATE_COLUMN_TYPE.float.min, 'FLOAT');
  assert.equal(AGGREGATE_COLUMN_TYPE.double.max, 'DOUBLE');
  assert.equal(AGGREGATE_COLUMN_TYPE.int.min, 'INT');
  assert.equal(AGGREGATE_COLUMN_TYPE.bigint.max, 'BIGINT');
  assert.equal(AGGREGATE_COLUMN_TYPE.bool.min, 'BOOL');
  assert.equal(AGGREGATE_COLUMN_TYPE.enum.max, 'INT');
});

void test('布尔 / 枚举没有 sum；字符串与结构体只有 count', () => {
  assert.equal(AGGREGATE_COLUMN_TYPE.bool.sum, undefined);
  assert.equal(AGGREGATE_COLUMN_TYPE.enum.sum, undefined);
  assert.deepEqual(Object.keys(AGGREGATE_COLUMN_TYPE.string), ['count']);
  assert.deepEqual(Object.keys(AGGREGATE_COLUMN_TYPE.struct), ['count']);
});

void test('版本状态：FAILED 是终态，ACTIVE 不是', () => {
  assert.equal(isTerminalStatus('FAILED'), true);
  assert.equal(isTerminalStatus('ACTIVE'), false);
  assert.equal(isTerminalStatus('PENDING'), false);

  assert.equal(isVersionStatus('ACTIVE'), true);
  assert.equal(isVersionStatus('DONE'), false);
  assert.equal(isVersionStatus(undefined), false);
});
