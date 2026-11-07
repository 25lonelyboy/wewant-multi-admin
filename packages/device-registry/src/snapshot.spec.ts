import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindKindOfColumnType } from './snapshot.js';

void test('六种列类型各归各档，大小写不敏感', () => {
  assert.equal(bindKindOfColumnType('FLOAT'), 'float');
  assert.equal(bindKindOfColumnType('DOUBLE'), 'double');
  assert.equal(bindKindOfColumnType('INT'), 'int');
  assert.equal(bindKindOfColumnType('BIGINT'), 'bigint');
  assert.equal(bindKindOfColumnType('BOOL'), 'bool');
  assert.equal(bindKindOfColumnType('VARCHAR(64)'), 'varchar');
  assert.equal(bindKindOfColumnType('float'), 'float');
  assert.equal(bindKindOfColumnType(' varchar(8) '), 'varchar');
});

void test('认不出的类型返回 null，由调用方判为构建失败', () => {
  assert.equal(bindKindOfColumnType('BINARY(8)'), null);
  assert.equal(bindKindOfColumnType('TIMESTAMP'), null);
  assert.equal(bindKindOfColumnType(''), null);
  // 不接受无长度的 VARCHAR：列宽必须由声明给出
  assert.equal(bindKindOfColumnType('VARCHAR'), null);
});
