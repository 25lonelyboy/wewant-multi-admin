// test/global-setup.ts
// jest globalSetup：经 tsx 子进程拉起 e2e-env.ts（幂等建库 + migrate deploy + runSeed），
// 避开 jest transform 对 ESM 包（prisma-client 等）的差异。
import { execSync } from 'node:child_process';
import path from 'node:path';

export default function globalSetup(): void {
  const appRoot = path.resolve(__dirname, '..');
  execSync('pnpm exec tsx test/e2e-env.ts', {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env
  });
}
