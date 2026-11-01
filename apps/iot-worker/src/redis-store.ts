import { Redis } from 'ioredis';

/** 心跳与探针共用的一层薄封装——把 ioredis 的多余能力挡在外面，也让单测能注入替身 */
export interface RedisLike {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  disconnect(): void;
}

export interface RedisClientLike {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  disconnect(): void;
  on(event: 'error', handler: () => void): void;
}

export type RedisClientOptions = {
  enableOfflineQueue: boolean;
  maxRetriesPerRequest: number;
  connectTimeout: number;
};

export function wrapRedis(client: RedisClientLike): RedisLike {
  return {
    async set(key, value, ttlSeconds) {
      await client.set(key, value, 'EX', ttlSeconds);
    },
    async get(key) {
      return await client.get(key);
    },
    async del(key) {
      await client.del(key);
    },
    disconnect() {
      client.disconnect();
    }
  };
}

/**
 * 建一条**快速失败**的连接：`enableOfflineQueue:false` 让 Redis 不可达时立刻抛，
 * 而不是把命令挂进离线队列（心跳宁可报错，也不要静默堆积）。
 */
export function createRedis(
  url: string,
  makeClient: (url: string, options: RedisClientOptions) => RedisClientLike = (
    target,
    options
  ) => new Redis(target, options)
): RedisLike {
  const client = makeClient(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000
  });
  // ioredis 的 error 事件不接会冒成未捕获异常
  client.on('error', () => undefined);
  return wrapRedis(client);
}
