import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Redis } from 'ioredis';
import { loadConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import {
  DOWNSAMPLE_LEADER_KEY,
  DownsampleLeader,
  type DownsampleRing
} from '../src/downsample/ring.js';
import { p1SnapshotSource } from './snapshot-fixture.js';

/**
 * 只实现选主用到的命令：`SET NX PX`、两段 Lua（续期 / 释放）、`quit`。
 *
 * ⚠️ Lua 在这里按**语义**实现，不是真的执行脚本：用例要钉的是「比较 value 再动」这条不变量，
 * 不是 Redis 的脚本引擎。
 */
class FakeRedis {
  value: string | null = null;
  expiresAt = 0;

  set(
    _key: string,
    value: string,
    _px: 'PX',
    ttlMs: number,
    nx: 'NX'
  ): Promise<'OK' | null> {
    if (nx !== 'NX') throw new Error('只支持 NX');
    if (this.value !== null) return Promise.resolve(null);
    this.value = value;
    this.expiresAt = Date.now() + ttlMs;
    return Promise.resolve('OK');
  }

  eval(
    script: string,
    _keys: number,
    _key: string,
    ...args: string[]
  ): Promise<number> {
    if (script.includes('PEXPIRE')) {
      if (this.value !== args[0]) return Promise.resolve(0);
      this.expiresAt = Date.now() + Number(args[1]);
      return Promise.resolve(1);
    }
    if (script.includes('DEL')) {
      if (this.value !== args[0]) return Promise.resolve(0);
      this.value = null;
      return Promise.resolve(1);
    }
    throw new Error(`未实现的脚本：${script}`);
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }

  disconnect(): void {
    // no-op
  }
}

function asRedis(fake: FakeRedis): Redis {
  return fake as unknown as Redis;
}

function fakeRing(counters: { started: number; closed: number }) {
  return {
    start: (): Promise<void> => {
      counters.started += 1;
      return Promise.resolve();
    },
    close: (): Promise<void> => {
      counters.closed += 1;
      return Promise.resolve();
    }
  } as unknown as DownsampleRing;
}

const config = loadConfig({
  ...process.env,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  LOG_LEVEL: 'silent'
});
const logger = createLogger(config);

function makeLeader(
  redis: FakeRedis,
  counters: { started: number; closed: number }
): DownsampleLeader {
  return new DownsampleLeader(config, logger, p1SnapshotSource(), {
    redis: asRedis(redis),
    ttlMs: 60_000,
    retryMs: 1,
    createRing: () => fakeRing(counters)
  });
}

void test('两实例只有一个抢到 leader，只有它构造并启动环', async () => {
  const redis = new FakeRedis();
  const counters = { started: 0, closed: 0 };
  const first = makeLeader(redis, counters);
  const second = makeLeader(redis, counters);

  await first.tick();
  await second.tick();

  assert.equal(counters.started, 1, '只有一个实例构造环');
  assert.ok(redis.value !== null, '锁应在 Redis 里');
  assert.equal(DOWNSAMPLE_LEADER_KEY, 'iot:downsample:leader');

  await first.close();
  await second.close();
});

void test('⭐ 续期失败 ⇒ 关闭环、转回 follower（不带着可能失效的锁继续写）', async () => {
  const redis = new FakeRedis();
  const counters = { started: 0, closed: 0 };
  const leader = makeLeader(redis, counters);

  await leader.tick(); // 抢到
  assert.equal(counters.started, 1);

  // 锁被他人改写（或本实例的锁已过期后被他人抢走）
  redis.value = 'someone-else';
  await leader.tick();
  assert.equal(counters.closed, 1, '续期失败必须关闭环');

  // 下一轮以 follower 身份抢锁：锁在别人手里 ⇒ 抢不到
  await leader.tick();
  assert.equal(counters.started, 1, '仍不应再构造环');

  await leader.close();
});

void test('续期成功 ⇒ 环保持运行，不重复构造', async () => {
  const redis = new FakeRedis();
  const counters = { started: 0, closed: 0 };
  const leader = makeLeader(redis, counters);

  await leader.tick();
  await leader.tick();
  await leader.tick();

  assert.equal(counters.started, 1);
  assert.equal(counters.closed, 0);
  await leader.close();
});

void test('close ⇒ 关闭环并释放自己的锁', async () => {
  const redis = new FakeRedis();
  const counters = { started: 0, closed: 0 };
  const leader = makeLeader(redis, counters);

  await leader.tick();
  await leader.close();

  assert.equal(counters.closed, 1);
  assert.equal(redis.value, null, 'close 应释放锁');
});
