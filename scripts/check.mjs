// 仓库级全量校验入口（无 CI 场景的本地质量门禁）。
// 按序执行：Prettier 全量格式检查 → 各 workspace 的 typecheck / lint / test（脚本存在才执行）。
// 任一阶段失败立即退出并以非零码返回。
import { runSync } from '@multi-admin/node-utils';

/***
 * 以继承 stdio 的方式执行命令，失败即终止
 */
function run(name, cmd, args) {
  console.log(`\n\u25b6 ${name}`);
  try {
    runSync(cmd, args);
  } catch {
    console.error(`\n\u2716 失败于：${name}`);
    process.exit(1);
  }
}

run('prettier', 'pnpm', ['exec', 'prettier', '--check', '.']);
run('typecheck', 'pnpm', ['-r', 'run', 'typecheck']);
run('lint', 'pnpm', ['-r', 'run', 'lint']);
run('test', 'pnpm', ['-r', '--if-present', 'run', 'test']);

console.log('\n\u2714 全量校验通过');
