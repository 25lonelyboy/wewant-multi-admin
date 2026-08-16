// test/e2e-env.ts
// 由 test/global-setup.ts 经 tsx 拉起（子进程，避开 jest transform 对 ESM 包的差异）：
// 幂等 CREATE DATABASE → prisma migrate deploy → runSeed（与生产 seed 同一函数）。
import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from '../prisma/seed.js';

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ADMIN_INIT_PASSWORD ??= 'e2e-admin-password';

const dbName = new URL(TEST_DB_URL).pathname.slice(1);
// 维护连接打到 postgres 默认库（不依赖目标库已存在）
const adminUrl = TEST_DB_URL.replace(`/${dbName}`, '/postgres');

function connect(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

async function main(): Promise<void> {
  const admin = connect(adminUrl);
  try {
    await admin.$connect();
  } catch (err) {
    throw new Error(
      `无法连接 postgres（${adminUrl}）：请先 docker compose up -d postgres redis，` +
        `或用环境变量 DATABASE_URL 覆盖测试默认值。`,
      { cause: err }
    );
  }
  const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
    'SELECT datname FROM pg_database WHERE datname = $1',
    dbName
  );
  if (rows.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`);
  }
  await admin.$disconnect();

  // migrate deploy：CLI 读 prisma.config.ts，连接串经 env 注入
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit'
  });

  const test = connect(TEST_DB_URL);
  await test.$connect();
  await runSeed(test);
  await test.$disconnect();
}

main().catch(err => {
  console.error('[e2e-env] 前置失败:', err);
  process.exit(1);
});
