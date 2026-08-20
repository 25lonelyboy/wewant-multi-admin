// test/merge-coverage.cjs
// 合并单测与 e2e 的 coverage-final.json（istanbul 官方库），输出双报表，
// 合并四指标 ≥80% 硬门槛失败非零退出（分设计 §7）。
const fs = require('node:fs');
const path = require('node:path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const THRESHOLD = 80;
const ROOT = path.join(__dirname, '..');
const UNIT_JSON = path.join(ROOT, 'coverage', 'coverage-final.json');
const E2E_JSON = path.join(ROOT, 'coverage-e2e', 'coverage-final.json');
const MERGED_DIR = path.join(ROOT, 'coverage-merged');

for (const file of [UNIT_JSON, E2E_JSON]) {
  if (!fs.existsSync(file)) {
    console.error(
      `[merge-coverage] 缺少 ${file}；` +
        '请先跑 pnpm --filter @multi-admin/nestjs-server run test:coverage（或分别执行 test:cov 与 test:e2e --coverage）。'
    );
    process.exit(1);
  }
}

function summarize(map) {
  // istanbul-lib-report 官方口径：flat 汇总树根节点 → getCoverageSummary
  const tree = libReport.createContext({ coverageMap: map }).getTree('flat');
  return tree.getRoot().getCoverageSummary();
}

function printRow(label, s) {
  console.log(
    `${label.padEnd(10)} | ` +
      `lines ${s.lines.pct}% (${s.lines.covered}/${s.lines.total}) | ` +
      `branches ${s.branches.pct}% (${s.branches.covered}/${s.branches.total}) | ` +
      `functions ${s.functions.pct}% (${s.functions.covered}/${s.functions.total}) | ` +
      `statements ${s.statements.pct}% (${s.statements.covered}/${s.statements.total})`
  );
}

const unit = libCoverage.createCoverageMap(require(UNIT_JSON));
const e2e = libCoverage.createCoverageMap(require(E2E_JSON));
const merged = libCoverage.createCoverageMap();
merged.merge(unit.toJSON());
merged.merge(e2e.toJSON());
// 防御：两份 json 均无文件条目时根节点 summary 的 pct 为 'Unknown'，
// 数值比较会静默放行——空产物一律拒绝。
if (merged.files().length === 0) {
  console.error(
    '[merge-coverage] 合并覆盖率为空（两份 coverage-final.json 均无文件条目），拒绝放行'
  );
  process.exit(1);
}

console.log('== 双覆盖率报表 ==');
printRow('单测-only', summarize(unit));
printRow('合并', summarize(merged));

// 合并报表落盘 coverage-merged/（text + lcov + json，供人工排查与后续消费）
const context = libReport.createContext({
  dir: MERGED_DIR,
  coverageMap: merged
});
for (const name of ['text', 'lcovonly', 'json']) {
  reports.create(name, {}).execute(context);
}

// 硬门槛：只挂合并四指标 ≥80%（单测-only 列仅展示，下限棘轮留 backlog）
const s = summarize(merged);
const failed = ['lines', 'branches', 'functions', 'statements'].filter(
  metric => s[metric].pct < THRESHOLD
);
if (failed.length > 0) {
  console.error(
    `[merge-coverage] 门禁失败：合并 ${failed.join('/')} 低于 ${THRESHOLD}%，` +
      '缺口文件见上方双报表与 coverage-merged/lcov-report。'
  );
  process.exit(1);
}
console.log(`[merge-coverage] 门禁通过：合并四指标均 ≥${THRESHOLD}%`);
