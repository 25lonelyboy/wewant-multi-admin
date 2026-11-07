import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Redis } from 'ioredis';
import type { WorkerConfig } from '../src/config.js';
import type { Logger } from '../src/logger.js';
import { RegistrySnapshotClient } from '../src/snapshot/client.js';

const BUILT_KEY = 'iot:registry:built';
const SNAPSHOT_KEY = 'iot:registry:snapshot';

function payload(version: number): string {
  return JSON.stringify({
    version,
    builtAt: new Date(version).toISOString(),
    models: [],
    devices: []
  });
}

class FakeRedis {
  built: string | null = '5';
  snapshot: string | null = payload(5);
  snapshotReads = 0;

  get(key: string): Promise<string | null> {
    if (key === BUILT_KEY) return Promise.resolve(this.built);
    if (key === SNAPSHOT_KEY) {
      this.snapshotReads += 1;
      return Promise.resolve(this.snapshot);
    }
    return Promise.resolve(null);
  }

  set(): Promise<'OK'> {
    return Promise.resolve('OK');
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }

  disconnect(): void {}
}

const config = {
  redisUrl: 'redis://127.0.0.1:6379',
  registryPollMs: 60_000,
  registryStaleAlertMs: 10_000
} as unknown as WorkerConfig;
const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {}
} as unknown as Logger;

void test('⭐ Redis 全量重置后 built 变小，仍要换入新快照', async () => {
  const redis = new FakeRedis();
  const client = new RegistrySnapshotClient(config, logger, {
    redis: redis as unknown as Redis
  });
  await client.start();
  assert.equal(client.currentIndex().snapshot.version, 5);

  // 全量 flush 后重建器从 0 重新计数；用 `built > 本地` 会永远停在 5
  redis.built = '0';
  redis.snapshot = payload(0);
  await client.poll();
  assert.equal(client.currentIndex().snapshot.version, 0);

  await client.close();
});

void test('built 与本地版本相同时不重复拉取快照', async () => {
  const redis = new FakeRedis();
  const client = new RegistrySnapshotClient(config, logger, {
    redis: redis as unknown as Redis
  });
  await client.start();
  const readsAfterStart = redis.snapshotReads;
  assert.equal(readsAfterStart, 1);

  await client.poll();
  assert.equal(redis.snapshotReads, readsAfterStart);

  await client.close();
});
