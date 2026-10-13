// 本地覆盖率一键跑：启动 services → 跑 test:coverage → 清理
// 用法：node scripts/ops/coverage.mjs [--skip-env]
// --skip-env：跳过环境启停（适用于 services 已在运行的情况）
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from '@multi-admin/node-utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skipEnv = process.argv.includes('--skip-env');

// 覆盖率对应的 env：DATABASE_URL 指向测试库——**只在覆盖率子进程注入，不写进 process.env**。
// 写进 process.env 会随 execSync 泄漏给 env-up.sh 的 `prisma db seed`（prisma.config 的 dotenv
// 不覆盖已存在值），把超管 seed 落到测试库、口令取 dev .env；e2e 的 create-only seed 随后不会
// 纠正 ⇒ 登录 401。
// REDIS_URL 同样不在此设置：由 test/setup-env.ts 的缺省值取自应用 .env（含认证凭据），
// 在此硬编码会以无凭据值覆盖它（setup-env 的 setIfAbsent 不会反向覆盖）。
const TEST_DB_URL =
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

try {
  if (!skipEnv) {
    console.log('▶ 启动开发环境...');
    execSync('bash scripts/ops/env-up.sh', { stdio: 'inherit' });
  }

  console.log('\n▶ 运行 test:coverage...');
  runSync(
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'test:coverage',
      '--filter=@multi-admin/nestjs-server'
    ],
    { env: { ...process.env, DATABASE_URL: TEST_DB_URL } }
  );

  // 输出覆盖率摘要
  const summaryPath = join(
    __dirname,
    '..',
    '..',
    'apps',
    'nestjs-server',
    'coverage-merged',
    'coverage-summary.json'
  );
  if (existsSync(summaryPath)) {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const total = summary.total;
    console.log('\n▶ 覆盖率摘要：');
    console.log(`  Lines:      ${total.lines.pct}%`);
    console.log(`  Statements: ${total.statements.pct}%`);
    console.log(`  Functions:  ${total.functions.pct}%`);
    console.log(`  Branches:   ${total.branches.pct}%`);
  }
} finally {
  if (!skipEnv) {
    console.log('\n▶ 清理开发环境...');
    execSync('bash scripts/ops/env-down.sh', { stdio: 'inherit' });
  }
}

console.log('\n✔ 覆盖率跑取完成');
