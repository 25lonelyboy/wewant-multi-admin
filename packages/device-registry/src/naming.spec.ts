import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DS_LEVELS,
  dsLevelSuffix,
  dsStableName,
  dsSubtableName,
  rawStableName
} from './naming.js';

void test('原始超表名折小写', () => {
  assert.equal(rawStableName('P1_Temp'), 'p1_temp');
});

void test('降采样超表名 = 模型编码 + 级别，折小写', () => {
  assert.equal(dsStableName('P1', '1m'), 'p1_1m');
  assert.equal(dsStableName('P1', '1d'), 'p1_1d');
});

void test('降采样子表名带级别后缀', () => {
  assert.equal(dsLevelSuffix('1h'), '_1h');
  assert.equal(
    dsSubtableName('p1_aweawq05e8pf53wh', '1h'),
    'p1_aweawq05e8pf53wh_1h'
  );
  assert.equal(
    dsSubtableName('p1_aweawq05e8pf53wh', '1d'),
    'p1_aweawq05e8pf53wh_1d'
  );
});

void test('三级固定为一分钟 / 一小时 / 一天', () => {
  assert.deepEqual([...DS_LEVELS], ['1m', '1h', '1d']);
});
