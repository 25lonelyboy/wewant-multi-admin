import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dsColumnsOf } from './model-derive.js';
import {
  AGGREGATES,
  type ModelDeclaration,
  type PropertyDecl,
  type PropertyKind
} from './model-types.js';

/** P1 三测点——测试夹具，与种子数据同形 */
const P1_MODEL: ModelDeclaration = {
  modelCode: 'p1',
  properties: [
    {
      key: 'temperature',
      kind: 'float',
      unit: '°C',
      range: { min: -50, max: 200 },
      aggregates: AGGREGATES
    },
    {
      key: 'vibration',
      kind: 'float',
      unit: 'mm/s',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    },
    {
      key: 'current',
      kind: 'float',
      unit: 'A',
      range: { min: 0, max: 100 },
      aggregates: AGGREGATES
    }
  ],
  services: [],
  events: []
};

void test('P1 三测点推出 12 列，列名与列类型逐字一致', () => {
  const result = dsColumnsOf(P1_MODEL.properties);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.columns, [
    { name: 'sum_temperature', type: 'DOUBLE' },
    { name: 'count_temperature', type: 'BIGINT' },
    { name: 'min_temperature', type: 'FLOAT' },
    { name: 'max_temperature', type: 'FLOAT' },
    { name: 'sum_vibration', type: 'DOUBLE' },
    { name: 'count_vibration', type: 'BIGINT' },
    { name: 'min_vibration', type: 'FLOAT' },
    { name: 'max_vibration', type: 'FLOAT' },
    { name: 'sum_current', type: 'DOUBLE' },
    { name: 'count_current', type: 'BIGINT' },
    { name: 'min_current', type: 'FLOAT' },
    { name: 'max_current', type: 'FLOAT' }
  ]);
});

void test('列序固定：聚合按声明无关的固定顺序展开', () => {
  const properties: PropertyDecl[] = [
    { key: 'b', kind: 'float', aggregates: ['max', 'sum'] },
    { key: 'a', kind: 'float', aggregates: ['min', 'count'] }
  ];

  const result = dsColumnsOf(properties);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.columns.map(column => column.name),
    ['sum_b', 'max_b', 'count_a', 'min_a']
  );
});

void test('聚合集为空 ⇒ 不产生任何列', () => {
  const result = dsColumnsOf([
    { key: 'note', kind: 'string', varcharLength: 64, aggregates: [] }
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.columns, []);
});

void test('算不出列类型 ⇒ 整体失败并指出属性路径', () => {
  const result = dsColumnsOf([
    { key: 'power', kind: 'bool', aggregates: ['count', 'sum'] }
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [
    { path: 'properties[0].aggregates', code: 'no-column-type' }
  ]);
});

void test('多处算不出 ⇒ 逐条报出，不只报第一条', () => {
  const result = dsColumnsOf([
    { key: 'power', kind: 'bool', aggregates: ['sum'] },
    { key: 'state', kind: 'enum', enumValues: [1, 2], aggregates: ['sum'] }
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.issues.map(issue => issue.path),
    ['properties[0].aggregates', 'properties[1].aggregates']
  );
});

void test('未经校验的非法档位 ⇒ 返回问题，不抛错', () => {
  const result = dsColumnsOf([
    {
      key: 'x',
      kind: 'array' as unknown as PropertyKind,
      aggregates: ['count']
    }
  ]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [
    { path: 'properties[0].kind', code: 'invalid-kind' }
  ]);
});
