import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_VARCHAR_BYTES, MetricColumnType } from './column-type.js';

void test('类型档位恰好六档', () => {
  assert.deepEqual(Object.values(MetricColumnType).sort(), [
    'BIGINT',
    'BOOL',
    'DOUBLE',
    'FLOAT',
    'INT',
    'VARCHAR'
  ]);
});

void test('VARCHAR 的 N 上限取本机实测值', () => {
  assert.equal(MAX_VARCHAR_BYTES, 65517);
});
