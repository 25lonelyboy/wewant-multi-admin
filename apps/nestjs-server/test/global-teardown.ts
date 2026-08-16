// test/global-teardown.ts
// 收尾清理：truncate 全表 + FLUSHDB，给下次运行留净态（库本身保留，重跑幂等更快）。
import { execSync } from 'node:child_process';
import path from 'node:path';

export default function globalTeardown(): void {
  const appRoot = path.resolve(__dirname, '..');
  execSync('pnpm exec tsx test/helpers/cleanup.ts', {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env
  });
}
