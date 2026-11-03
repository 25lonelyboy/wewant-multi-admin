import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RAW_METRICS } from '../src/schema.js';
import { levelSpec } from '../src/downsample/level.js';
import { buildAggregateSql } from '../src/downsample/query.js';

const START = 1_791_813_600_000;
const END = 1_791_813_660_000;

void test('每测点四个可再聚合量，按子表分组', () => {
  const sql = buildAggregateSql('p1', levelSpec('1m'), START, END);

  for (const metric of RAW_METRICS) {
    assert.match(sql, new RegExp(`SUM\\(${metric}\\) AS sum_${metric}`));
    assert.match(sql, new RegExp(`COUNT\\(${metric}\\) AS count_${metric}`));
    assert.match(sql, new RegExp(`MIN\\(${metric}\\) AS min_${metric}`));
    assert.match(sql, new RegExp(`MAX\\(${metric}\\) AS max_${metric}`));
  }
  assert.doesNotMatch(sql, /_unit/);
  assert.match(sql, /SELECT tbname, _wstart AS ts,/);
  assert.match(sql, /FROM wewant_iot\.p1\b/);
  assert.match(sql, /PARTITION BY tbname/);
});

void test('⭐ 不同模型编码读各自的原始超表', () => {
  assert.match(
    buildAggregateSql('p1', levelSpec('1m'), START, END),
    /FROM wewant_iot\.p1\b/
  );
  assert.match(
    buildAggregateSql('meter', levelSpec('1m'), START, END),
    /FROM wewant_iot\.meter\b/
  );
});

void test('⭐ COUNT(<metric>) 而不是 COUNT(*)', () => {
  const sql = buildAggregateSql('p1', levelSpec('1m'), START, END);
  assert.doesNotMatch(sql, /COUNT\(\*\)/);
  assert.match(sql, /COUNT\(temperature\)/);
});

void test('⭐ 时间边界用 epoch 毫秒内联，不是字符串', () => {
  const sql = buildAggregateSql('p1', levelSpec('1m'), START, END);
  assert.match(sql, new RegExp(`WHERE ts >= ${START} AND ts < ${END}`));
  // 边界周围不得出现引号（字符串会被按服务器时区解释、查空）
  assert.doesNotMatch(sql, new RegExp(`'${START}'|"${START}"`));
});

void test('INTERVAL 子句随级别变化，1d 带业务日 offset', () => {
  assert.match(
    buildAggregateSql('p1', levelSpec('1m'), START, END),
    /INTERVAL\(1m\)/
  );
  assert.match(
    buildAggregateSql('p1', levelSpec('1h'), START, END),
    /INTERVAL\(1h\)/
  );
  assert.match(
    buildAggregateSql('p1', levelSpec('1d'), START, END),
    /INTERVAL\(1d, 8h\)/
  );
});
