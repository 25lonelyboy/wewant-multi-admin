import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_VARCHAR_BYTES,
  MetricColumnType,
  rawColumnOf
} from './column-type.js';
import type { PropertyDecl, PropertyKind } from './model-types.js';

function property(
  kind: PropertyKind,
  extra: Partial<PropertyDecl> = {}
): PropertyDecl {
  return { key: 'temperature', kind, aggregates: [], ...extra };
}

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

void test('原始列：六个存储档位与枚举', () => {
  const cases: Array<[PropertyKind, string]> = [
    ['float', 'FLOAT'],
    ['double', 'DOUBLE'],
    ['int', 'INT'],
    ['bigint', 'BIGINT'],
    ['bool', 'BOOL'],
    ['enum', 'INT']
  ];
  for (const [kind, type] of cases) {
    const result = rawColumnOf(property(kind));
    assert.deepEqual(result, {
      ok: true,
      column: { name: 'temperature', type }
    });
  }
});

void test('字符串与结构体落 VARCHAR(n)，宽度取声明的 varcharLength', () => {
  assert.deepEqual(rawColumnOf(property('string', { varcharLength: 64 })), {
    ok: true,
    column: { name: 'temperature', type: 'VARCHAR(64)' }
  });
  assert.deepEqual(
    rawColumnOf(
      property('struct', {
        varcharLength: 512,
        fields: [{ key: 'x', kind: 'int' }]
      })
    ),
    { ok: true, column: { name: 'temperature', type: 'VARCHAR(512)' } }
  );
});

void test('缺 varcharLength 不回落默认值', () => {
  assert.deepEqual(rawColumnOf(property('string')), {
    ok: false,
    issues: [{ path: 'varcharLength', code: 'missing-varchar-length' }]
  });
  assert.deepEqual(rawColumnOf(property('struct')), {
    ok: false,
    issues: [{ path: 'varcharLength', code: 'missing-varchar-length' }]
  });
});

void test('八档之外的档位报 invalid-kind，不抛错', () => {
  const dirty = {
    key: 'x',
    kind: 'array',
    aggregates: []
  } as unknown as PropertyDecl;
  assert.deepEqual(rawColumnOf(dirty), {
    ok: false,
    issues: [{ path: 'kind', code: 'invalid-kind' }]
  });
});
