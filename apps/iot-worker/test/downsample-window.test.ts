import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_SPECS, levelSpec } from '../src/downsample/level.js';
import {
  SERVER_TZ_OFFSET_MS,
  closedWindowRange,
  lastClosedBoundary
} from '../src/downsample/window.js';

/** 2026-10-13T00:06:51.067Z（= 2026-10-13 08:06:51 +08:00） */
const NOW = 1_791_850_011_067;
/** 2026-10-13T00:00:00Z（= 08:00 +08:00，业务日边界） */
const SH_0800 = 1_791_849_600_000;
/** 2026-10-12T23:59:59.999Z（= 07:59:59.999 +08:00，边界前 1ms） */
const BEFORE_0800 = SH_0800 - 1;

void test('1m：最后一个已闭合窗口的右边界对齐到分钟', () => {
  const boundary = lastClosedBoundary(NOW, levelSpec('1m'));
  assert.equal(boundary, 1_791_849_960_000); // 2026-10-13T00:06:00Z
  assert.equal(boundary % 60_000, 0);
  assert.ok(boundary <= NOW, '右边界必须 ≤ now（否则是未闭合窗口）');
});

void test('1h：最后一个已闭合窗口的右边界对齐到整点', () => {
  const boundary = lastClosedBoundary(NOW, levelSpec('1h'));
  assert.equal(boundary, SH_0800); // 2026-10-13T00:00:00Z
  assert.equal(boundary % 3_600_000, 0);
  assert.ok(boundary <= NOW);
});

void test('1d：业务日边界落在 08:00（+08:00）＝ 00:00Z', () => {
  const spec = levelSpec('1d');
  assert.equal(spec.offsetMs, 8 * 3_600_000);

  // 边界时刻本身已闭合 ⇒ 上一个业务日算完整
  assert.equal(lastClosedBoundary(SH_0800, spec), SH_0800);
  // 边界前 1ms ⇒ 仍属上一个业务日
  assert.equal(lastClosedBoundary(BEFORE_0800, spec), 1_791_763_200_000); // 2026-10-12T00:00:00Z
});

void test('每日窗口围绕 08:00 边界翻转（未闭合窗口被排除）', () => {
  const spec = levelSpec('1d');
  // 07:59:59.999（+08:00）→ 最近闭合窗口的右边界是**今天** 08:00 之前的那个 00:00Z
  const before = closedWindowRange(BEFORE_0800, spec, 1);
  assert.equal(before.endMs, 1_791_763_200_000); // 2026-10-12T00:00:00Z
  // 08:00:00.000（+08:00）→ 边界刚过，右边界进到 2026-10-13T00:00:00Z
  const after = closedWindowRange(SH_0800, spec, 1);
  assert.equal(after.endMs, SH_0800);
  assert.equal(after.startMs, 1_791_763_200_000);
});

void test('closedWindowRange：覆盖最近 K 个窗口，右边界 ≤ now', () => {
  const k = 3;
  for (const spec of LEVEL_SPECS) {
    const { startMs, endMs } = closedWindowRange(NOW, spec, k);
    assert.equal(endMs - startMs, k * spec.windowMs);
    assert.ok(endMs <= NOW, `${spec.level}：右边界必须已闭合`);
    // 两端都必须是合法的窗口边界（边界的充要条件：向下取整后等于自身）
    assert.equal(lastClosedBoundary(startMs, spec), startMs);
    assert.equal(lastClosedBoundary(endMs, spec), endMs);
  }
});

void test('时区偏移参与边界计算：换个服务器时区，同一 INTERVAL 的窗口就变了', () => {
  const spec = levelSpec('1d');
  // 部署时区 +08:00（断言值）：`INTERVAL(1d, 8h)` 的窗口从 08:00 +08:00＝00:00Z 起
  const sh = lastClosedBoundary(NOW, spec, SERVER_TZ_OFFSET_MS);
  assert.equal(sh, SH_0800);
  // 服务器若在 UTC：同一 `INTERVAL(1d, 8h)` 的窗口改从 08:00Z 起 ⇒ 边界不同
  const utc = lastClosedBoundary(NOW, spec, 0);
  assert.equal(utc, 1_791_792_000_000); // 2026-10-12T08:00:00Z
  assert.notEqual(sh, utc, '时区不参与计算是错的：边界应随时区改变');
});
