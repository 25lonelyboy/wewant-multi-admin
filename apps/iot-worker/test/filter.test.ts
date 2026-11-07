import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PropertyDecl } from '@multi-admin/device-registry';
import { filterByDeclaration } from '../src/filter.js';
import type { EnvelopeMetric } from '../src/detection.js';

const PROPERTIES: PropertyDecl[] = [
  {
    key: 'temperature',
    kind: 'float',
    unit: '°C',
    range: { min: -50, max: 200 },
    aggregates: ['sum']
  },
  { key: 'vibration', kind: 'double', unit: 'mm/s', aggregates: ['sum'] },
  {
    key: 'count',
    kind: 'int',
    unit: 'pcs',
    range: { min: 0, max: 10 },
    aggregates: ['sum']
  },
  { key: 'total', kind: 'bigint', aggregates: ['sum'] },
  { key: 'door', kind: 'bool', aggregates: ['count'] },
  { key: 'mode', kind: 'enum', enumValues: [1, 2], aggregates: ['count'] },
  { key: 'label', kind: 'string', varcharLength: 4, aggregates: ['count'] },
  {
    key: 'config',
    kind: 'struct',
    varcharLength: 32,
    fields: [{ key: 'a', kind: 'int' }],
    aggregates: ['count']
  }
];

function metric(key: string, value: unknown, unit = ''): EnvelopeMetric {
  return { key, value, unit };
}

void test('六档正例各按声明类型与档位收下', () => {
  const result = filterByDeclaration(
    [
      metric('temperature', 62.4, '°C'),
      metric('vibration', 1.5, 'mm/s'),
      metric('count', 3, 'pcs'),
      metric('total', 9_007_199_254_740_991),
      metric('door', true),
      metric('mode', 2),
      metric('label', 'abcd'),
      metric('config', { a: 1 })
    ],
    PROPERTIES
  );

  assert.equal(result.unitMismatch, false);
  assert.deepEqual(result.notInModel, []);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(
    result.accepted.map(item => [item.key, item.bindKind, item.value]),
    [
      ['temperature', 'float', 62.4],
      ['vibration', 'double', 1.5],
      ['count', 'int', 3],
      ['total', 'bigint', 9_007_199_254_740_991],
      ['door', 'bool', true],
      ['mode', 'int', 2],
      ['label', 'varchar', 'abcd'],
      ['config', 'varchar', '{"a":1}']
    ]
  );
});

void test('float / double：非有限数与超量程都判非法', () => {
  const result = filterByDeclaration(
    [
      metric('temperature', Number.NaN, '°C'),
      metric('temperature', Number.POSITIVE_INFINITY, '°C'),
      metric('temperature', 201, '°C'),
      metric('temperature', -51, '°C')
    ],
    PROPERTIES
  );
  assert.deepEqual(result.invalid, [
    'temperature',
    'temperature',
    'temperature',
    'temperature'
  ]);
  assert.equal(result.accepted.length, 0);
});

void test('int / bigint：拒收非整数，int 还受量程约束', () => {
  const result = filterByDeclaration(
    [
      metric('count', 1.5, 'pcs'),
      metric('count', 11, 'pcs'),
      metric('total', 1.2)
    ],
    PROPERTIES
  );
  assert.deepEqual(result.invalid, ['count', 'count', 'total']);
});

void test('bool / enum：类型不符与取值表越界都判非法', () => {
  const result = filterByDeclaration(
    [metric('door', 1), metric('mode', 3), metric('mode', 1.5)],
    PROPERTIES
  );
  assert.deepEqual(result.invalid, ['door', 'mode', 'mode']);
});

void test('⭐ string / struct 超长按 UTF-8 字节拒收，不截断', () => {
  const result = filterByDeclaration(
    [
      metric('label', 'abcde'), // 5 字节 > 4
      metric('label', '温度'), // 6 字节 > 4
      metric('config', { a: 'x'.repeat(30) })
    ],
    PROPERTIES
  );
  assert.deepEqual(result.invalid, ['label', 'label', 'config']);
});

void test('不在该时刻声明里的 key 进 notInModel，不影响合法测点', () => {
  const result = filterByDeclaration(
    [metric('pressure', 101.3, 'kPa'), metric('temperature', 20, '°C')],
    PROPERTIES
  );
  assert.deepEqual(result.notInModel, ['pressure']);
  assert.deepEqual(
    result.accepted.map(item => item.key),
    ['temperature']
  );
});

void test('⭐ 单位不符标记整条：不符的测点不进 accepted', () => {
  const result = filterByDeclaration(
    [metric('temperature', 62.4, 'K'), metric('vibration', 1, 'mm/s')],
    PROPERTIES
  );
  assert.equal(result.unitMismatch, true);
  assert.deepEqual(
    result.accepted.map(item => item.key),
    ['vibration']
  );
});

void test('声明没有 range ⇒ 不校验量程', () => {
  const result = filterByDeclaration(
    [metric('vibration', 1_000_000, 'mm/s')],
    PROPERTIES
  );
  assert.equal(result.invalid.length, 0);
  assert.equal(result.accepted.length, 1);
});

void test('全部被过滤时 accepted 为空（调用方据此丢整条）', () => {
  assert.deepEqual(filterByDeclaration([], PROPERTIES).accepted, []);
  assert.deepEqual(
    filterByDeclaration([metric('pressure', 1, 'kPa')], PROPERTIES).accepted,
    []
  );
});
