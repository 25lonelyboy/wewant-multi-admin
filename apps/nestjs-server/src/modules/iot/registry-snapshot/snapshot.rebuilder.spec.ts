import { decideRebuild } from './snapshot.rebuilder.js';

void test('无变化时不重建', () => {
  expect(
    decideRebuild({ rev: 5, built: 5, payloadExists: true, forced: false })
  ).toEqual({ rebuild: false, version: 5 });
});

void test('rev 前进时按 rev 重建', () => {
  expect(
    decideRebuild({ rev: 6, built: 5, payloadExists: true, forced: false })
  ).toEqual({ rebuild: true, version: 6 });
});

void test('⭐ 兜底重建必须抬高一版：rev == built 时等版本写入会被条件写拒绝', () => {
  expect(
    decideRebuild({ rev: 5, built: 5, payloadExists: true, forced: true })
  ).toEqual({ rebuild: true, version: 6 });
});

void test('⭐ payload 被单独淘汰：等版本也要重写', () => {
  expect(
    decideRebuild({ rev: 5, built: 5, payloadExists: false, forced: false })
  ).toEqual({ rebuild: true, version: 5 });
});

void test('rev 被单独淘汰：版本取 built 的上界，等兜底抬版修复', () => {
  expect(
    decideRebuild({ rev: 1, built: 5, payloadExists: true, forced: false })
  ).toEqual({ rebuild: false, version: 5 });
  expect(
    decideRebuild({ rev: 1, built: 5, payloadExists: true, forced: true })
  ).toEqual({ rebuild: true, version: 6 });
});

void test('Redis 全量丢失：从 0 重建；首轮兜底从 1 开始', () => {
  expect(
    decideRebuild({ rev: 0, built: -1, payloadExists: false, forced: false })
  ).toEqual({ rebuild: true, version: 0 });
  expect(
    decideRebuild({ rev: 0, built: -1, payloadExists: false, forced: true })
  ).toEqual({ rebuild: true, version: 1 });
});
