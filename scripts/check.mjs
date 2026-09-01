// 仓库级全量校验入口（无 CI 场景的本地质量门禁）。
// 按序执行：Prettier 全量格式检查 → turbo 编排的 typecheck / lint / stylelint / test → test 覆盖枚举。
// 任一阶段失败立即退出并以非零码返回；全部阶段纯校验，不改写任何文件。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
run('typecheck', 'pnpm', ['exec', 'turbo', 'run', 'typecheck']);
run('lint', 'pnpm', ['exec', 'turbo', 'run', 'lint']);
run('stylelint', 'pnpm', ['exec', 'turbo', 'run', 'stylelint']);
run('test', 'pnpm', ['exec', 'turbo', 'run', 'test']);

// test 覆盖枚举：逐包显式报告有无 test 脚本，消除静默跳过
console.log('\n\u25b6 test 覆盖枚举');
for (const group of ['apps', 'packages', 'internal']) {
  for (const entry of readdirSync(group)) {
    const pkgPath = join(group, entry, 'package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const has = Boolean(pkg.scripts?.test);
    console.log(
      `  ${has ? '\u2714' : '\u25cb'} ${pkg.name}：${has ? '有 test 脚本' : '无 test 脚本（跳过）'}`
    );
  }
}

// 预留插入位：preload 安全不变量验证阶段（另行立项后在此追加）

console.log('\n\u2714 全量校验通过');
