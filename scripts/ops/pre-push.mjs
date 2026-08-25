// push 前 CI 同构校验：模拟 CI gate job 环境，本地跑全量检查。
// 退出码：0 = 可安全 push，非 0 = 有问题。
// 用法：node scripts/ops/pre-push.mjs
import { runSync } from '@multi-admin/node-utils';

// CI 同构 env
process.env.HUSKY = '0';
process.env.DATABASE_URL = 'postgresql://dummy:dummy@localhost:5432/dummy';

/**
 * 以继承 stdio 的方式执行命令，失败即终止
 */
function run(name, cmd, args) {
  console.log(`\n▶ ${name}`);
  try {
    runSync(cmd, args);
  } catch {
    console.error(`\n✖ 失败于：${name}`);
    process.exit(1);
  }
}

// 1. frozen-lockfile 验证（CI gate 第一步）
run('frozen-lockfile', 'pnpm', ['install', '--frozen-lockfile']);

// 2. 全量门禁（复用 pnpm check）
run('check', 'pnpm', ['check']);

// 3. 依赖审计（报警式，失败不阻断）
console.log('\n▶ audit（报警式）');
try {
  runSync('pnpm', ['audit', '--audit-level=high']);
  console.log('\n✔ audit 通过');
} catch {
  console.warn('\n⚠ audit 有告警（不阻断，可安全 push）');
}

console.log('\n✔ pre-push 校验通过，可安全 push');
