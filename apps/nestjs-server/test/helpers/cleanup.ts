// test/helpers/cleanup.ts
// tsx 直跑（由 test/global-teardown.ts 拉起）：测试库全表 truncate + redis FLUSHDB，
// 给下次运行留净态。连接/执行失败仅告警不阻断收尾（teardown 不应让测试收尾红掉）。
import { PrismaPg } from '@prisma/adapter-pg';
import { Redis } from 'ioredis';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { truncateAll } from './db.js';
import { flushTestRedis } from './redis.js';

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function cleanupDb(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });
  try {
    await prisma.$connect();
    await truncateAll(prisma);
    console.log('[cleanup] 测试库全表 truncate 完成');
  } catch (err) {
    console.warn('[cleanup] DB 清理跳过（连接/执行失败）:', String(err));
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function cleanupRedis(): Promise<void> {
  // lazyConnect + 快速失败：不可达时立即告警，不挂起 teardown
  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  try {
    await redis.connect();
    await flushTestRedis(redis);
    console.log('[cleanup] redis FLUSHDB 完成');
  } catch (err) {
    console.warn('[cleanup] Redis 清理跳过（连接/执行失败）:', String(err));
  } finally {
    redis.disconnect();
  }
}

await cleanupDb();
await cleanupRedis();
