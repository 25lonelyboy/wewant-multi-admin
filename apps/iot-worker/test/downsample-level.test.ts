import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DS_LEVELS } from '@multi-admin/device-registry';
import {
  LEVEL_SPECS,
  assertLevelCoverage,
  intervalClause,
  levelSpec
} from '../src/downsample/level.js';

void test('三级齐全：LEVEL_SPECS 覆盖 DS_LEVELS', () => {
  assert.doesNotThrow(() => assertLevelCoverage());
  assert.deepEqual(
    LEVEL_SPECS.map(spec => spec.level).sort(),
    [...DS_LEVELS].sort()
  );
});

void test('读查询的 INTERVAL 子句与窗口口径同源', () => {
  assert.equal(intervalClause(levelSpec('1m')), 'INTERVAL(1m)');
  assert.equal(intervalClause(levelSpec('1h')), 'INTERVAL(1h)');
  // ⭐ 业务日 offset 进查询
  assert.equal(intervalClause(levelSpec('1d')), 'INTERVAL(1d, 8h)');
});

void test('窗口长度与 INTERVAL 的标签一致', () => {
  assert.equal(levelSpec('1m').windowMs, 60_000);
  assert.equal(levelSpec('1h').windowMs, 3_600_000);
  assert.equal(levelSpec('1d').windowMs, 86_400_000);
});

void test('1d 的业务日 offset 同时进查询与边界算术', () => {
  const spec = levelSpec('1d');
  assert.equal(spec.offsetExpr, '8h');
  assert.equal(spec.offsetMs, 8 * 3_600_000);
  for (const other of LEVEL_SPECS.filter(s => s.level !== '1d')) {
    assert.equal(
      other.offsetMs,
      0,
      `${other.level} 不是业务日窗口，offset 应为 0`
    );
    assert.equal(other.offsetExpr, null);
  }
});

void test('调度身份与节拍：ds-1m/ds-1h/ds-1d', () => {
  assert.deepEqual(levelSpec('1m').schedule, { id: 'ds-1m', every: 60_000 });
  assert.deepEqual(levelSpec('1h').schedule, { id: 'ds-1h', every: 3_600_000 });
  assert.deepEqual(levelSpec('1d').schedule, {
    id: 'ds-1d',
    pattern: '0 8 * * *',
    tz: 'Asia/Shanghai'
  });
});

void test('调度 id 不含冒号（BullMQ 队列/键空间限制）', () => {
  for (const spec of LEVEL_SPECS) {
    assert.ok(!spec.schedule.id.includes(':'), `${spec.schedule.id} 含冒号`);
  }
});
