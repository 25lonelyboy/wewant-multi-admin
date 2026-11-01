/* eslint-disable @typescript-eslint/require-await -- 替身按同步方式返回值，只为满足 async 接口形状 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRedis,
  wrapRedis,
  type RedisClientLike
} from '../src/redis-store.js';

void test('createRedis 用快速失败的选项建连并吞掉 error 事件', () => {
  let options: Record<string, unknown> | undefined;
  let errorHandler: (() => void) | undefined;
  const fake: RedisClientLike = {
    async set() {
      return 'OK';
    },
    async get() {
      return null;
    },
    async del() {
      return 1;
    },
    disconnect() {
      /* noop */
    },
    on(event, handler) {
      if (event === 'error') errorHandler = handler;
    }
  };
  const store = createRedis('redis://x', (url, opts) => {
    assert.equal(url, 'redis://x');
    options = opts;
    return fake;
  });
  assert.deepEqual(options, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000
  });
  assert.equal(typeof errorHandler, 'function');
  store.disconnect();
});

void test('wrapRedis 把 TTL 转成 EX 参数并透传返回值', async () => {
  const calls: unknown[][] = [];
  const client: RedisClientLike = {
    async set(...args) {
      calls.push(args);
      return 'OK';
    },
    async get() {
      return 'v';
    },
    async del() {
      return 1;
    },
    disconnect() {
      /* noop */
    },
    on() {
      /* noop */
    }
  };
  const store = wrapRedis(client);
  await store.set('k', 'v', 30);
  assert.deepEqual(calls[0], ['k', 'v', 'EX', 30]);
  assert.equal(await store.get('k'), 'v');
});
