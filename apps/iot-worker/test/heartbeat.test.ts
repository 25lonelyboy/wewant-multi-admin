/* eslint-disable @typescript-eslint/require-await -- 替身按同步方式返回值，只为满足 async 接口形状 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS,
  heartbeatKey,
  startHeartbeat,
  type HeartbeatTimer
} from '../src/heartbeat.js';
import type { RedisLike } from '../src/redis-store.js';

function fakeTimer(): HeartbeatTimer & { tick(): void; cleared(): boolean } {
  let fn: (() => void) | undefined;
  let cleared = false;
  return {
    setInterval(handler) {
      fn = handler;
      return 1;
    },
    clearInterval() {
      cleared = true;
    },
    tick() {
      fn?.();
    },
    cleared() {
      return cleared;
    }
  };
}

function fakeStore(
  failing = false
): RedisLike & { sets: string[]; dels: string[] } {
  const sets: string[] = [];
  const dels: string[] = [];
  return {
    sets,
    dels,
    async set(key) {
      if (failing) throw new Error('down');
      sets.push(key);
    },
    async get() {
      return null;
    },
    async del(key) {
      dels.push(key);
    },
    disconnect() {
      /* noop */
    }
  };
}

/** 让已排队的微任务跑完——比 `await Promise.resolve()` 稳 */
const flush = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

void test('心跳键带队列前缀与容器主机名', () => {
  const key = heartbeatKey('abc123');
  assert.equal(key, 'wewant:worker:hb:abc123');
});

void test('TTL 大于刷新间隔且不超过三倍', () => {
  const ttlMs = HEARTBEAT_TTL_SECONDS * 1000;
  assert.ok(ttlMs > HEARTBEAT_INTERVAL_MS);
  assert.ok(ttlMs <= HEARTBEAT_INTERVAL_MS * 3);
});

void test('启动立即写一次，之后按间隔刷新；stop 清定时器并删键', async () => {
  const store = fakeStore();
  const timer = fakeTimer();
  const heartbeat = startHeartbeat(
    store,
    {
      warn() {
        /* noop */
      }
    },
    {
      host: 'h1',
      timer
    }
  );
  await flush();
  assert.deepEqual(store.sets, ['wewant:worker:hb:h1']);

  timer.tick();
  await flush();
  assert.equal(store.sets.length, 2);

  await heartbeat.stop();
  assert.equal(timer.cleared(), true);
  assert.deepEqual(store.dels, ['wewant:worker:hb:h1']);
});

void test('连续失败只记一次 warn', async () => {
  const warnings: string[] = [];
  const timer = fakeTimer();
  startHeartbeat(
    fakeStore(true),
    {
      warn(_obj: object, msg: string) {
        warnings.push(msg);
      }
    },
    { host: 'h1', timer }
  );
  await flush();
  timer.tick();
  await flush();
  timer.tick();
  await flush();
  assert.equal(warnings.length, 1);
});
