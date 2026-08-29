// pure-web strict 清单断言（设计 3.1）：
// ① 防漏——不在 git HEAD 树中的新文件必须进清单或豁免清单；
// ② 防倒退——HEAD 清单中已有、文件仍存在、却被移出的条目即违规。
// 快照即清单本身的已提交状态，无第二份快照文件。
// 枚举范围与 lint 口径一致：src / build / mock 的 ts/tsx/vue（ambient .d.ts 不参与迁移）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const WEB = 'apps/pure-web';
const ENUM_ROOTS = ['src', 'build', 'mock'];
const EXTS = ['.ts', '.tsx', '.vue'];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry).replace(/\\/g, '/');
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.some(e => full.endsWith(e)) && !full.endsWith('.d.ts'))
      out.push(full);
  }
  return out;
}

const manifestPath = `${WEB}/tsconfig.strict.json`;
const exemptionsPath = `${WEB}/tsconfig.strict.exemptions.json`;
if (!existsSync(manifestPath) || !existsSync(exemptionsPath)) {
  console.error(
    '✖ tsconfig.strict.json 或 tsconfig.strict.exemptions.json 缺失'
  );
  process.exit(1);
}

const toAbs = p => join(WEB, p).replace(/\\/g, '/');
const manifest = new Set(
  JSON.parse(readFileSync(manifestPath, 'utf8')).include.map(toAbs)
);
const exempt = new Set();
for (const pattern of JSON.parse(readFileSync(exemptionsPath, 'utf8')).files) {
  const abs = toAbs(pattern);
  if (abs.endsWith('/**')) {
    const dir = abs.slice(0, -3);
    if (existsSync(dir)) walk(dir).forEach(f => exempt.add(f));
  } else exempt.add(abs);
}

const current = [];
for (const root of ENUM_ROOTS) {
  const dir = join(WEB, root);
  if (existsSync(dir)) walk(dir, current);
}

let failed = false;

// ① 防漏：新文件（不在 HEAD 树中，含未跟踪文件）必须在清单或豁免清单
let headFiles;
let headManifest = [];
try {
  headFiles = new Set(
    execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', `${WEB}/`], {
      encoding: 'utf8'
    })
      .trim()
      .split('\n')
      .filter(Boolean)
  );
  headManifest = JSON.parse(
    execFileSync('git', ['show', `HEAD:${manifestPath}`], {
      encoding: 'utf8'
    })
  ).include.map(toAbs);
} catch {
  headFiles = null; // 清单首次提交前无 HEAD 版本，两条断言均跳过
}

if (headFiles) {
  const missing = current.filter(
    f => !headFiles.has(f) && !manifest.has(f) && !exempt.has(f)
  );
  if (missing.length) {
    failed = true;
    console.error(
      '✖ 新文件未进 strict 清单（加入 tsconfig.strict.json 的 include，或属遗留豁免则加入 tsconfig.strict.exemptions.json）：'
    );
    missing.forEach(f => console.error(`  - ${f}`));
  }

  // ② 防倒退：HEAD 清单已有、文件仍存在、却被移出
  const regressed = headManifest.filter(p => !manifest.has(p) && existsSync(p));
  if (regressed.length) {
    failed = true;
    console.error('✖ strict 清单倒退（已迁入条目被移出）：');
    regressed.forEach(f => console.error(`  - ${f}`));
  }
}

if (failed) process.exit(1);

const unmigrated = current.filter(
  f => !manifest.has(f) && !exempt.has(f) && (!headFiles || headFiles.has(f))
).length;
console.log(
  `✔ strict 清单断言通过（清单 ${manifest.size} 项 / 豁免 ${exempt.size} 项 / 存量待迁移 ${unmigrated} 项）`
);
