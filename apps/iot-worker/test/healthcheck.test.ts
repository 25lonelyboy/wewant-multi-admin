/* eslint-disable @typescript-eslint/require-await -- 替身按同步方式返回值，只为满足 async 接口形状 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runHealthcheck } from '../src/healthcheck.js';
import type { RedisLike } from '../src/redis-store.js';

function storeWith(value: string | null): RedisLike {
  return {
    async set() {
      /* noop */
    },
    async get() {
      return value;
    },
    async del() {
      /* noop */
    },
    disconnect() {
      /* noop */
    }
  };
}

void test('心跳键不存在时判不健康', async () => {
  const logs: string[] = [];
  const code = await runHealthcheck({
    store: storeWith(null),
    host: 'h1',
    log: message => logs.push(message)
  });
  assert.equal(code, 1);
  assert.equal(logs.length, 1);
});

void test('心跳键存在时判健康', async () => {
  const code = await runHealthcheck({
    store: storeWith('{"pid":1}'),
    host: 'h1',
    log() {
      /* noop */
    }
  });
  assert.equal(code, 0);
});
