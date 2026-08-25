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

// 覆盖率对应的 env（与 test/setup-env.ts 默认值对齐）
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';

try {
  if (!skipEnv) {
    console.log('▶ 启动开发环境...');
    execSync('bash scripts/ops/env-up.sh', { stdio: 'inherit' });
  }

  console.log('\n▶ 运行 test:coverage...');
  runSync('pnpm', [
    'exec',
    'turbo',
    'run',
    'test:coverage',
    '--filter=@multi-admin/nestjs-server'
  ]);

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
