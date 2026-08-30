// 用途：TS 5.9 无 per-reference noCheck（`--noCheck` 为 TS 5.6 起的整项目跳过开关）。
// tsconfig.strict.json 的 include 仅含已迁移清单文件，但 TS 会对 program 内所有文件报错
// （import 链拉入的 layout/store 等存量宽松文件）。本脚本运行 vue-tsc 后仅保留
// strict include 清单域内文件的诊断行，清单外诊断丢弃并计数。
// 注意：豁免文件（tsconfig.strict.exemptions.json）的诊断按「清单外」滤除——豁免条目的
// 防漏由 assert-strict-manifest.mjs 登记保证，其存量诊断不属于「清单域内必零错误」承诺
// （如 print.ts 依赖的 jsdom 不可达 API），域内口径只算 include、不含豁免 glob。
// 未来仓库 TypeScript 升级至支持 per-reference `noCheck` 的版本后可移除本脚本。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'apps', 'pure-web');
const strict = JSON.parse(
  readFileSync(path.join(APP, 'tsconfig.strict.json'), 'utf8')
);

// 仅将 include 条目归一化为小写前缀：exact 命中 或 `前缀/` 命中。
// 豁免 glob 不参与「域内必零错误」计算——豁免条目防漏由 assert-strict-manifest.mjs 保证。
const prefixes = strict.include.map(p =>
  p
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\/\*\*$/, '')
);
const inScope = file => {
  const rel = file.replace(/\\/g, '/').toLowerCase();
  return prefixes.some(p => rel === p || rel.startsWith(`${p}/`));
};

const res = spawnSync(
  'pnpm',
  [
    'exec',
    'vue-tsc',
    '-p',
    'tsconfig.strict.json',
    '--noEmit',
    '--skipLibCheck'
  ],
  {
    cwd: APP,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' }
  }
);

const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
const kept = [];
let keptErrors = 0;
let dropped = 0;
// vue-tsc 相对 cwd 输出，形如 `src/router/utils.ts(63,11): error TS7008: ...`
const ERROR_RE = /^([^(]+\((\d+),(\d+)\)): (error TS\d+): (.+)$/m;

// 失败传播防假绿：vue-tsc 无法启动（未安装/环境损坏）时拒绝放行
if (res.error) {
  process.stderr.write(
    `check-strict-web: 无法启动 vue-tsc：${res.error.message}\n`
  );
  process.exit(1);
}
// 退出码非零但输出中无任何可解析诊断（如 TS18003 配置错误行不携带行列号）→ 视为工具/配置失败
if (res.status !== 0 && !ERROR_RE.test(output)) {
  process.stderr.write(
    `check-strict-web: vue-tsc 退出码 ${res.status} 且无 (行,列) 形态诊断，疑似配置/环境错误，原样输出：\n${output}\n`
  );
  process.exit(1);
}
for (const line of output.split(/\r?\n/)) {
  const m = line.match(ERROR_RE);
  if (!m) {
    if (line.trim()) kept.push(line); // 非诊断行（汇总信息等）原样保留
    continue;
  }
  if (inScope(m[1].slice(0, m[1].indexOf('(')))) {
    kept.push(line);
    keptErrors++;
  } else {
    dropped++;
  }
}

if (keptErrors > 0) {
  process.stdout.write(kept.join('\n') + '\n');
  process.stderr.write(
    `check-strict-web: 清单域内存在 ${keptErrors} 条诊断（另滤除清单外诊断 ${dropped} 条）。\n`
  );
  process.exit(1);
} else {
  process.stdout.write(
    `check-strict-web: strict 清单零错误（滤除清单外存件诊断 ${dropped} 条）。\n`
  );
}
