# pure-web 测试基建与 strict 迁移：批次 A0/A + B0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地设计文档（同目录 `-design.md`）的首批执行单元：批次 A0（上游基线 + 差异报告脚本）、批次 A（strict 增量迁移机制）、B0（vitest 基建与样板模块全量测试）。

**Architecture:** 双 tsconfig 分层（`tsconfig.json` 宽松存量豁免区 + `tsconfig.strict.json` 已清零清单，清单即快照、断言对比 git HEAD 防漏防倒退）；vitest 独立 `vitest.config.ts`（不合并 vite.config.ts，隔离 Rolldown 专属配置）；CI 新增 `coverage-web` 报警式 job。

**Tech Stack:** vitest 4.1.x（peer 兼容 vite 8）、@vue/test-utils 2.x（registry 实测 latest 2.5.0，无 3.x）、@vitest/coverage-v8（provider v8）、eslint-plugin-vitest、vue-tsc / tsc 双 config、bash ops 脚本。

**执行环境事实（Agent 必读）：**

- 命令块经 Git Bash 执行（仓库既有模式：ops 脚本统一 `bash scripts/ops/*.sh`，`.sh` 统一 LF 行尾，见 `docs/engineering/build-and-verify.md` 前置依赖行）；执行者交互 shell 为 pwsh 时用 `bash -c '…'` 包裹命令块。
- 工作目录基准为仓库根 `d:/WorkSpace/AI/wewant-multi-admin`，命令未标注 `cd` 时均在根目录执行。
- commit message：conventional commits + scope 白名单（本计划用 `repo` / `web` / `docs`），中文 subject 可；**subject 不得大写英文开头**（commitlint `subject-case` 历史教训）。
- 每个 Task 结束前必须跑该 Task 列出的验证命令并核对输出，再提交。
- 设计文档事实源：同目录 `2026-08-29-pure-web-testing-foundation-design.md`（以下简称「设计」），冲突时以设计 + 本计划的实测步骤为准。

**任务依赖与并行性：** Task 1（A0）→ Task 2（A1）→ Task 3（A2）严格串行（A2 初始清单依赖 A1 数据）；Task 4（A3）依赖 Task 1 报告产物 + Task 3 提交；Task 5（B0）依赖 Task 3（测试文件从第一天进清单）。Task 4 与 Task 5 之间无依赖；但 Task 5 按 Q2 口径会修改 `tsconfig.strict.json`（B0 两模块迁入），清单为冲突热点——并行时后合者负责对齐，串行则无此顾虑。

---

## Task 1: A0 上游基线建立与差异报告脚本

**目标**：登记上游基线版本、落地 `upstream-diff.sh` 报告脚本、产出首次差异全景报告。

**Files:**

- Create: `scripts/ops/upstream-diff.sh`
- Create: `docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-baseline.md`
- Create: `docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff/`（脚本输出目录）
- Modify: `package.json`（根，追加 `ops:upstream-diff` 脚本）
- Modify: `docs/engineering/build-and-verify.md`（ops 表登记）

- [ ] **Step 1: 验证 backlog 条目已在（只验证不新增）**

Run:

```bash
grep -n 'pure-web 上游同步周期评估' docs/governance/backlog.md
```

Expected: 命中 1 行（开放表条目，2026-08-29 登记）。若无命中，先在开放表补登记（格式对齐同表既有条目），再继续。

- [ ] **Step 2: 编写 `scripts/ops/upstream-diff.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

# pure-web 上游漂移报告（设计 4 章）
# 用法：bash scripts/ops/upstream-diff.sh [baseline-sha] [target-ref]
#   baseline-sha 省略 → 无基线模式：仅产出本地侧变更清单
#   target-ref 默认 upstream/main
# 输出：docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff/ 三件套

LOCAL_BASE="${LOCAL_BASE:-94a2cf9}" # pure-web template 接入提交（可用 git log 复核）
BASE="${1:-}"
TARGET="${2:-upstream/main}"
OUT_DIR="${OUT_DIR:-docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff}"
WEB_DIR="apps/pure-web"

echo "▶ 确保 upstream remote 并 fetch..."
if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream https://github.com/pure-admin/vue-pure-admin.git
fi
git fetch upstream --tags --quiet

mkdir -p "$OUT_DIR"

echo "▶ 本地侧变更清单（自接入提交 ${LOCAL_BASE}）..."
git diff --name-only "${LOCAL_BASE}..HEAD" -- "$WEB_DIR" |
  sed "s|^${WEB_DIR}/||" | sort -u >"$OUT_DIR/local-changed.txt"
echo "  本地变更文件数：$(wc -l <"$OUT_DIR/local-changed.txt")"

if [ -z "$BASE" ]; then
  echo "⚠ 未提供基线，无基线模式：跳过上游差异分析"
  echo "✔ 输出目录：$OUT_DIR（仅 local-changed.txt）"
  exit 0
fi

echo "▶ 上游改动清单（${BASE}..${TARGET}，四类切分）..."
git log --oneline "${BASE}..${TARGET}" -- src/layout >"$OUT_DIR/upstream-log-layout.txt"
git log --oneline "${BASE}..${TARGET}" -- src/components >"$OUT_DIR/upstream-log-components.txt"
git log --oneline "${BASE}..${TARGET}" -- src/utils src/router src/store src/config src/plugins src/directives build mock >"$OUT_DIR/upstream-log-utils-src.txt"
git log --oneline "${BASE}..${TARGET}" -- package.json >"$OUT_DIR/upstream-log-deps.txt"

echo "▶ 文件变更地图..."
git diff --stat --find-renames "${BASE}..${TARGET}" >"$OUT_DIR/diff-stat.txt"
git diff --name-status --find-renames "${BASE}..${TARGET}" >"$OUT_DIR/diff-name-status.txt"

echo "▶ 冲突面清单（两方改动交集）..."
git diff --name-only --find-renames "${BASE}..${TARGET}" | sort -u >"$OUT_DIR/upstream-changed.txt"
comm -12 "$OUT_DIR/local-changed.txt" "$OUT_DIR/upstream-changed.txt" >"$OUT_DIR/conflict-surface.txt"

echo "✔ 三件套输出完成：$OUT_DIR"
echo "  上游变更文件数：$(wc -l <"$OUT_DIR/upstream-changed.txt")"
echo "  冲突面文件数：$(wc -l <"$OUT_DIR/conflict-surface.txt")"
```

- [ ] **Step 3: 语法门禁 + 无基线模式试跑（红→绿第一环）**

```bash
bash -n scripts/ops/upstream-diff.sh
bash scripts/ops/upstream-diff.sh
```

Expected（网络可用）：`bash -n` 无输出（语法通过）；无基线模式输出「本地变更文件数：N」（N > 0）与「无基线模式：跳过上游差异分析」，`exit 0`。

Expected（网络不可用）：脚本在 `git fetch upstream` 处非零退出（`set -euo pipefail`），记录失败原因与日志，脚本仍入库（设计 8 章的缓解「无基线模式」是基线定位不依赖网络，但 fetch 本身仍需网络；本地侧清单待网络恢复后补跑）。

- [ ] **Step 4: 根 `package.json` 登记脚本**

在 `scripts` 块 `ops:check-digests` 之后追加一行：

```json
"ops:upstream-diff": "bash scripts/ops/upstream-diff.sh"
```

- [ ] **Step 5: `docs/engineering/build-and-verify.md` ops 表登记**

在「## ops 自动化脚本」表格 `check-digests` 行之后追加：

```markdown
| `pnpm ops:upstream-diff` | `upstream-diff.sh` | pure-web 上游漂移报告（基线 SHA + target ref → 改动清单/变更地图/冲突面三件套；无基线参数降级仅本地侧） |
```

同节「前置依赖」行追加 `可联网环境（upstream-diff，需 fetch github）`。

- [ ] **Step 6: 定位基线 SHA 并登记活文档**

```bash
git log upstream/main --before='2026-08-10' -1 --format='%H %ad %s' --date=short
git tag --sort=-creatordate --format='%(refname:short) %(creatordate:short)' | head -5
```

取接入日期（2026-08-10）前最近的上游提交作为基线；结合 tag 列表确认最接近的版本号。创建 `docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-baseline.md`：

```markdown
# pure-web 上游基线记录（活文档）

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/pure-admin/vue-pure-admin |
| 接入提交（本仓） | 94a2cf9（2026-08-10，template 衍生，无 merge 历史） |
| 基线提交（上游） | <Step 6 实测 SHA> |
| 基线参考版本 | <Step 6 实测最接近 tag，如 v2.x.y> |
| 定位日期 | <执行日期> |

基线用途：`pnpm ops:upstream-diff <基线SHA> [target-ref]` 的第一个参数。
更新规则：吸收上游变更并合入后，将基线推进到所吸收的 target ref（追加一行历史记录，不改写）。
```

- [ ] **Step 7: 跑首次差异全景报告**

```bash
bash scripts/ops/upstream-diff.sh <Step 6 的基线 SHA>
```

Expected: 输出目录生成 9 个文件（`local-changed.txt` / `upstream-log-*.txt` ×4 / `diff-stat.txt` / `diff-name-status.txt` / `upstream-changed.txt` / `conflict-surface.txt`），末尾打印三个计数。

- [ ] **Step 8: 全量校验 + 提交**

说明：`git add` 整个任务目录会一并入库同目录的设计文档与本计划文件：设计文档已提交（7690671），但其工作区手改（strict 实测数据、依赖表等）尚未提交，属有意一并纳入；本计划文件为首次入库。提交前确保两文件均通过 `prettier --check`（不通过则先 `pnpm exec prettier --write` 修正）。

```bash
pnpm exec prettier --check package.json docs/engineering/build-and-verify.md docs/tasks/2026-08-29-pure-web-testing-foundation/
git add scripts/ops/upstream-diff.sh package.json docs/engineering/build-and-verify.md docs/tasks/2026-08-29-pure-web-testing-foundation/
git commit -m "feat(repo): pure-web 上游漂移报告脚本与基线登记，首次差异全景报告入库"
```

---

## Task 2: A1 `.vue` 全量 strict 错误补测

**目标**：取得含 `.vue` 的 strict 精确错误总量与分布（A2 初始清单与批次 B 排期的输入）。纯测量任务，不改代码。

**Files:**

- Create: `docs/tasks/2026-08-29-pure-web-testing-foundation/2026-08-29-a1-vue-strict-measurement.md`

- [ ] **Step 1: 全量跑 `vue-tsc --strict`（带内存参数）**

```bash
cd apps/pure-web
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc --noEmit --skipLibCheck --strict > /tmp/pureweb-vue-strict.log 2>&1
echo "exit: $?"
grep -c 'error TS' /tmp/pureweb-vue-strict.log
```

Expected: 进程跑完（预计 5-15 分钟，77 个 .vue 模板类型推导慢）；`grep -c` 输出错误总数（纯 TS 部分已知 384，总量预计 700-1000）。

**若进程再次异常退出（上次无内存参数时发生过）**：先重跑一次；仍失败则降级分批——用临时 `tsconfig` 仅 include `src/views/**`、`src/components/**`、`src/layout/**` 三段分别跑，把三段结果合并计数。无论哪条路径，必须拿到总数才能进 Step 2。

- [ ] **Step 2: 统计分布**

```bash
grep -oE 'error TS[0-9]+' /tmp/pureweb-vue-strict.log | sort | uniq -c | sort -rn | head -15
grep -E '\.(ts|tsx|vue)\(' /tmp/pureweb-vue-strict.log | sed -E 's/\(.*//' | sort | uniq -c | sort -rn | head -20
```

Expected: 得到错误码分布表与文件分布表（Top 15/20）。

- [ ] **Step 3: 枚举零错误文件（A2 初始清单候选）**

```bash
cd apps/pure-web
comm -23 \
  <(find src build mock -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.vue' \) ! -name '*.d.ts' | sort) \
  <(grep -oE '^[^(]+\.(ts|tsx|vue)' /tmp/pureweb-vue-strict.log | sort -u) \
  > /tmp/pureweb-zero-error-files.txt
wc -l /tmp/pureweb-zero-error-files.txt
```

Expected: 输出零错误文件清单与数量。**注意**：该清单是「未出现在错误日志」的文件，A2 迁入时仍以实际 `vue-tsc -p` 复核为准（web.json 基线含 `noUnusedLocals` 等 `--strict` 之外的开关，可能新增错误）。

- [ ] **Step 4: 落档 + 提交**

创建 `2026-08-29-a1-vue-strict-measurement.md`，内容：总量、错误码分布表（Step 2）、文件分布 Top 20（Step 2）、零错误文件全清单（Step 3，即 A2 初始清单候选）、测量命令与参数、异常与降级路径记录（如有）。

```bash
git add docs/tasks/2026-08-29-pure-web-testing-foundation/2026-08-29-a1-vue-strict-measurement.md
git commit -m "docs(repo): A1 vue-tsc strict 全量实测落档，A2 初始清单候选就绪"
```

---

## Task 3: A2 strict 增量迁移机制

**目标**：落地双 tsconfig + 清单断言 + 双 config typecheck，机制即刻生效且不误伤存量。

**关键语义（执行者必须理解）**：防漏断言的可执行口径是「**新文件**（不在 `git HEAD` 树中的文件）必须进清单或豁免清单」——不是「全部存量文件立即进清单」（后者会在本任务阻断 `pnpm check`）。快照即 `tsconfig.strict.json` 的已提交状态，断言对比 `git HEAD`，无需第二份快照文件（设计 3.1）。断言挂两个通道：`pnpm check`（Step 7）与 **pre-commit**（Step 7）——本仓库 CI 为报警式不拦截（ADR-006），pre-commit 提交边界拦截是防漏的真正兜底。全量迁入完成后的最终态收口（拆除双 config + 断言）已登记 backlog。

**Files:**

- Create: `apps/pure-web/tsconfig.strict.json`
- Create: `apps/pure-web/tsconfig.strict.exemptions.json`
- Create: `scripts/assert-strict-manifest.mjs`
- Modify: `scripts/check.mjs:24`（stylelint 与 test 之间插入断言阶段）
- Modify: `.husky/pre-commit`（lint-staged 之后追加断言，提交边界拦截）
- Modify: `apps/pure-web/package.json`（devDependencies 追加 `@multi-admin/tsconfig@workspace:*`；typecheck 双 config）
- Modify: `docs/engineering/build-and-verify.md`（质量门禁段落同步）

- [ ] **Step 1: 创建 `apps/pure-web/tsconfig.strict.json`**

`extends` 解析 `@multi-admin/tsconfig/web.json` 要求该包在 pure-web 可解析——pure-web 尚无此 devDep（nestjs-server 既有惯例 `workspace:*`），先声明：

```bash
pnpm --filter @multi-admin/pure-web add -D @multi-admin/tsconfig@workspace:*
```

初始 include 以 Task 2 Step 3 的零错误清单为准，至少包含 `src/utils/tree.ts` 与 `types/*.d.ts`（ambient 全局类型 `Recordable` / `ViteEnv` 是清单内文件的编译前提）；若零错误清单含 `build/utils.ts` 则**不要**加入（它实测有 2 个错误，属 Task 2 测量口径差异，留 B0 修复并当场迁入，Q2 口径）。文件不带注释（断言脚本 `JSON.parse` 解析）。

```json
{
  "extends": "@multi-admin/tsconfig/web.json",
  "compilerOptions": {
    "noEmit": true,
    "skipLibCheck": true,
    "jsxImportSource": "vue",
    "allowSyntheticDefaultImports": true,
    "paths": {
      "@/*": ["./src/*"],
      "@build/*": ["./build/*"]
    },
    "types": [
      "node",
      "vite/client",
      "element-plus/global",
      "@pureadmin/table/volar",
      "unplugin-icons/types/vue",
      "@pureadmin/descriptions/volar"
    ]
  },
  "include": ["src/utils/tree.ts", "types/*.d.ts"]
}
```

- [ ] **Step 2: 创建 `apps/pure-web/tsconfig.strict.exemptions.json`**

```json
{
  "reason": "pure-admin 遗留组件（零引用，删除决策见 docs/governance/backlog.md「pure-web 遗留组件处置」）；目录删除后本条豁免自然失效（断言枚举不到对应文件），应同步移除条目保持清单整洁",
  "files": [
    "src/components/ReBarcode/**",
    "src/components/ReDrawer/**",
    "src/components/ReFlop/**",
    "src/components/ReSeamlessScroll/**",
    "src/components/ReSelector/**",
    "src/components/ReSplitPane/**",
    "src/components/ReTreeLine/**",
    "src/components/ReCropper/**",
    "src/components/ReVxeTableBar/**"
  ]
}
```

- [ ] **Step 3: 创建 `scripts/assert-strict-manifest.mjs`**

```js
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
    else if (
      EXTS.some(e => full.endsWith(e)) &&
      !full.endsWith('.d.ts')
    )
      out.push(full);
  }
  return out;
}

const manifestPath = `${WEB}/tsconfig.strict.json`;
const exemptionsPath = `${WEB}/tsconfig.strict.exemptions.json`;
if (!existsSync(manifestPath) || !existsSync(exemptionsPath)) {
  console.error('✖ tsconfig.strict.json 或 tsconfig.strict.exemptions.json 缺失');
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
    execFileSync('git', ['show', `HEAD:${manifestPath}`], { encoding: 'utf8' })
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
```

- [ ] **Step 4: 提交 A——机制入库（断言生效的前提）**

断言脚本在「清单无 HEAD 版本」时跳过两条断言（脚本内已注明），因此红绿探针必须发生在首次提交**之后**。本步先把机制三件套入库：

```bash
node scripts/assert-strict-manifest.mjs
echo "exit: $?"
```

Expected: 通过（清单首次提交前两条断言按设计跳过，输出 `✔ strict 清单断言通过（清单 2 项 / 豁免 N 项 / 存量待迁移 M 项）`）。

```bash
pnpm exec prettier --check apps/pure-web/tsconfig.strict.json apps/pure-web/tsconfig.strict.exemptions.json scripts/assert-strict-manifest.mjs
git add apps/pure-web/tsconfig.strict.json apps/pure-web/tsconfig.strict.exemptions.json scripts/assert-strict-manifest.mjs
git commit -m "feat(web): pure-web strict 迁移清单与防漏防倒退断言脚本"
```

- [ ] **Step 5: 红——构造「新文件漏加清单」场景验证断言触发**

```bash
echo 'export const probe = 1;' > apps/pure-web/src/utils/__probe__.ts
node scripts/assert-strict-manifest.mjs
echo "exit: $?"
```

Expected: 非零退出，错误信息含 `- apps/pure-web/src/utils/__probe__.ts`（HEAD 已有清单，防漏断言生效）。

- [ ] **Step 6: 绿——删除探针，断言通过**

```bash
rm apps/pure-web/src/utils/__probe__.ts
node scripts/assert-strict-manifest.mjs
```

Expected: `✔ strict 清单断言通过（清单 2 项 / 豁免 40+ 项 / 存量待迁移 N 项）`（清单 2 项 = `src/utils/tree.ts` + `types/*.d.ts`；豁免项数 = 9 个遗留组件目录内文件总数；N = 存量未迁移文件数）。

- [ ] **Step 7: `scripts/check.mjs` 与 `.husky/pre-commit` 双接入**

`scripts/check.mjs`：在 `run('stylelint', ...)` 与 `run('test', ...)` 之间插入：

```js
run('strict manifest 断言', 'node', ['scripts/assert-strict-manifest.mjs']);
```

`.husky/pre-commit`：在 `pnpm exec lint-staged` 之后追加一行（全仓提交边界；断言仅枚举 pure-web 三目录，非 pure-web 提交开销可忽略）：

```bash
node scripts/assert-strict-manifest.mjs
```

说明：pre-commit 在清单首次提交前自动跳过断言（脚本内已处理）；自提交 B 起，任何使「新文件漏加清单」的提交都会在提交边界被拦截——弥补 CI 报警式不拦截的缺口（ADR-006）。

- [ ] **Step 8: `apps/pure-web/package.json` typecheck 双 config**

将 `typecheck` 脚本改为：

```json
"typecheck": "tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck && cross-env NODE_OPTIONS=--max-old-space-size=8192 vue-tsc -p tsconfig.strict.json --noEmit --skipLibCheck"
```

- [ ] **Step 9: 验证双 config typecheck 与清单零错误**

```bash
pnpm --filter @multi-admin/pure-web run typecheck
```

Expected: 三段全部通过。若第三段报出清单内文件的错误（`web.json` 基线的 `noUnusedLocals` 等开关比 `--strict` 更严，可能命中），把该文件移出 include（回退到确认为零的文件集），并在 A1 测量文档补记差异，不得放宽基线开关。

- [ ] **Step 10: 全量门禁验证**

```bash
pnpm check
```

Expected: prettier → typecheck → lint → stylelint → **strict manifest 断言** → test → 覆盖枚举 全通过；覆盖枚举中 `@multi-admin/pure-web` 仍为「无 test 脚本（跳过）」（B0 才改变）。

- [ ] **Step 11: 文档同步 + 提交 B**

`docs/engineering/build-and-verify.md`「质量门禁」第 1 条 `pnpm check` 的阶段描述追加「→ strict 清单断言（防新文件漏加 + 防清单倒退，机制见 `docs/tasks/2026-08-29-pure-web-testing-foundation/` 设计 3.1）」，`last_verified` 更新为当日。

```bash
git add apps/pure-web/package.json scripts/check.mjs .husky/pre-commit docs/engineering/build-and-verify.md
git commit -m "feat(web): pnpm check 与 pre-commit 接入 strict 清单断言，typecheck 双 config 串行"
```

---

## Task 4: A3 组件盘点落档

**目标**：24 个组件目录的在用/遗留清单 + 依赖复杂度 + 上游差异交叉验证落档；顺带完成防倒退断言的提交后回归验证。

**Files:**

- Create: `docs/tasks/2026-08-29-pure-web-testing-foundation/component-inventory.md`

- [ ] **Step 1: 防倒退断言回归验证（借 Task 3 已提交状态）**

```bash
node -e "const { readFileSync, writeFileSync } = require('node:fs'); const p = 'apps/pure-web/tsconfig.strict.json'; const j = JSON.parse(readFileSync(p, 'utf8')); j.include = j.include.filter(f => f !== 'src/utils/tree.ts'); writeFileSync(p, JSON.stringify(j, null, 2) + '\n');"
node scripts/assert-strict-manifest.mjs
echo "exit: $?"
```

Expected: 非零退出，错误信息含「清单倒退」与 `apps/pure-web/src/utils/tree.ts`。随后恢复：

```bash
git checkout -- apps/pure-web/tsconfig.strict.json
node scripts/assert-strict-manifest.mjs
```

Expected: 断言恢复通过。

- [ ] **Step 2: 组件引用盘点命令复核**

```bash
for dir in apps/pure-web/src/components/*/; do
  name=$(basename "$dir")
  refs=$(grep -rlw "$name" apps/pure-web/src apps/pure-web/mock \
    --include='*.vue' --include='*.ts' --include='*.tsx' 2>/dev/null \
    | grep -v "src/components/$name" | wc -l)
  echo "$name: $refs"
done
```

Expected: 15 个组件引用数 > 0（在用），9 个为 0（遗留：ReBarcode / ReDrawer / ReFlop / ReSeamlessScroll / ReSelector / ReSplitPane / ReTreeLine / ReCropper / ReVxeTableBar）。**注意**：`main.ts` 全局注册的组件（ReAuth / RePerms 等）以注册语句计为引用。若实测与设计 15/9 不符，以实测为准，并同步更新 `tsconfig.strict.exemptions.json` 与 backlog 遗留组件条目。

- [ ] **Step 3: 上游差异交叉验证**

```bash
grep 'src/components/' docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff/conflict-surface.txt
grep 'src/components/' docs/tasks/2026-08-29-pure-web-testing-foundation/upstream-diff/upstream-changed.txt | head -30
```

Expected: 得到「上游近期改动 ∩ 本地改动」的组件路径（高危区）与上游单方改动的组件路径。无命中则记录「无交集」。

- [ ] **Step 4: 落档 `component-inventory.md`**

内容结构（数据全部来自 Step 2/3 实测与 Task 2 日志）：

1. 在用组件表（15 行）：组件名 | 引用数 | 依赖复杂度（轻：无第三方重依赖 / 中：element-plus 级 / 重：@pureadmin/table、cropperjs、qrcode 等）| strict 错误数（Task 2 日志按 `src/components/<name>/` 聚合）| 上游高危标记（Step 3 交集命中）
2. 遗留组件表（9 行）：组件名 | 目录文件数（`find apps/pure-web/src/components/<name> -type f | wc -l`）| 豁免状态（已在 `tsconfig.strict.exemptions.json`）
3. 交叉验证结论：高危区组件 = B3 测试重点；遗留组件删除决策指向 backlog 条目。

- [ ] **Step 5: 提交**

```bash
git add docs/tasks/2026-08-29-pure-web-testing-foundation/component-inventory.md
git commit -m "docs(web): A3 组件盘点落档——在用 15 / 遗留 9 与上游差异交叉验证"
```

---

## Task 5: B0 vitest 基建与样板模块全量测试

**目标**：vitest 依赖 + 独立配置 + scripts + eslint 测试块 + 样板模块全量测试（`build/utils.ts` 与 `src/utils/tree.ts` 行+分支 ≥80% glob 键阈值，Q2 口径）+ `coverage-web` CI job；`build/utils.ts` 2 个 strict 错误当场修复，两模块源码与 spec 一并迁入清单（三合一验收），`pnpm check` 全绿、覆盖枚举转 ✔。

**Files:**

- Create: `apps/pure-web/vitest.config.ts`
- Create: `apps/pure-web/build/utils.spec.ts`
- Create: `apps/pure-web/src/utils/tree.spec.ts`
- Modify: `apps/pure-web/build/utils.ts`（2 个 strict 错误修复 + getPackageSize 闭包重构）
- Modify: `apps/pure-web/package.json`（devDependencies + scripts）
- Modify: `apps/pure-web/eslint.config.js`（vitest 测试块）
- Modify: `.github/workflows/ci.yml`（coverage-web job）
- Modify: `apps/pure-web/tsconfig.strict.json`（2 个 spec + 2 个源码文件进清单）
- Modify: `docs/engineering/build-and-verify.md`（CI job 描述同步）

- [ ] **Step 1: 安装依赖**

```bash
pnpm --filter @multi-admin/pure-web add -D vitest@^4.1.11 @vue/test-utils@^2.5 jsdom @vitest/coverage-v8@^4.1.11 eslint-plugin-vitest
```

Expected: 安装成功；`apps/pure-web/package.json` devDependencies 出现 5 个新依赖（`@vitest/coverage-v8` 与 `vitest` 保持同版本线）。registry 实测 `@vue/test-utils` latest = 2.5.0（无 3.x），其 devDeps 与 vitest 4.1 / vue 3.5 / jsdom 同线。若 `eslint-plugin-vitest` 最新版与 eslint 10 不兼容（运行 lint 时报错），降到最近的兼容版本并在此记录。

- [ ] **Step 2: 创建 `apps/pure-web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';
import { alias, __APP_INFO__ } from './build/utils';

// 独立于 vite.config.ts（设计 3.2）：测试环境不加载 fake-server / cdn-import /
// compression 等构建期插件，不继承 rolldownOptions 等 Vite 8 专属构建配置
export default defineConfig({
  resolve: { alias },
  plugins: [vue(), vueJsx()],
  define: {
    __INTLIFY_PROD_DEVTOOLS__: false,
    __APP_INFO__: JSON.stringify(__APP_INFO__)
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'build/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx,vue}', 'build/*.ts'],
      exclude: ['**/*.d.ts', '**/*.spec.ts'],
      thresholds: {
        // vitest 4 的 glob 阈值键必须是顶层形式（`coverage.thresholds[glob-pattern]`），
        // 嵌套 `thresholds.glob: {}` 会被当作字面 glob 模式 'glob' 匹配 0 文件而静默失效
        'build/utils.ts': { lines: 80, branches: 80 },
        'src/utils/tree.ts': { lines: 80, branches: 80 }
      }
    }
  }
});
```

说明：B0 即启用 glob 键阈值（Q2 口径，设计 3.2「按模块分组 threshold」的最小落位）——两样板模块行+分支 ≥80%，不达标 vitest 非零退出；其余模块阈值自 B1 各模块任务随迁入逐个追加，B0 不设包级全局阈值。

- [ ] **Step 3: 编写测试 `apps/pure-web/build/utils.spec.ts`（wrapperEnv 全分支 + 同步导出）**

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { root, pathResolve, alias, __APP_INFO__, wrapperEnv } from './utils';

describe('wrapperEnv', () => {
  afterEach(() => {
    delete process.env.VITE_PORT;
    delete process.env.VITE_MOCK;
    delete process.env.VITE_CDN;
    delete process.env.VITE_PUBLIC_PATH;
    delete process.env.VITE_HIDE_HOME;
    delete process.env.VITE_ROUTER_HISTORY;
    delete process.env.VITE_COMPRESSION;
  });

  it('空输入返回全部默认值', () => {
    const env = wrapperEnv({});
    expect(env.VITE_PORT).toBe(8848);
    expect(env.VITE_PUBLIC_PATH).toBe('');
    expect(env.VITE_ROUTER_HISTORY).toBe('');
    expect(env.VITE_CDN).toBe(false);
    expect(env.VITE_HIDE_HOME).toBe('false');
    expect(env.VITE_COMPRESSION).toBe('none');
    expect(env.VITE_MOCK).toBe(false);
  });

  it('"true"/"false" 字符串转布尔', () => {
    const env = wrapperEnv({ VITE_MOCK: 'true', VITE_CDN: 'false' });
    expect(env.VITE_MOCK).toBe(true);
    expect(env.VITE_CDN).toBe(false);
  });

  it('\\n 字面量转换为真实换行', () => {
    const env = wrapperEnv({ VITE_ROUTER_HISTORY: 'a\\nb' });
    expect(env.VITE_ROUTER_HISTORY).toBe('a\nb');
  });

  it('VITE_PORT 转数字', () => {
    const env = wrapperEnv({ VITE_PORT: '9000' });
    expect(env.VITE_PORT).toBe(9000);
  });

  it('字符串值同步写入 process.env', () => {
    wrapperEnv({ VITE_PUBLIC_PATH: '/admin/' });
    expect(process.env.VITE_PUBLIC_PATH).toBe('/admin/');
  });

  it('布尔与数字值不写入 process.env（仅字符串与对象写入）', () => {
    wrapperEnv({ VITE_MOCK: 'true', VITE_PORT: '9000' });
    expect(process.env.VITE_MOCK).toBeUndefined();
    expect(process.env.VITE_PORT).toBeUndefined();
  });
});

describe('root / pathResolve / alias / __APP_INFO__', () => {
  it('root 即 process.cwd()', () => {
    expect(root).toBe(process.cwd());
  });

  it('pathResolve 默认解析 build 目录绝对路径', () => {
    expect(pathResolve()).toMatch(/[\\/]build$/);
  });

  it('pathResolve 目录片段在 build 外时返回拼接绝对路径', () => {
    expect(pathResolve('../src')).toMatch(/[\\/]src$/);
  });

  it('pathResolve 目录片段在 build 内时短路返回调用者自身路径', () => {
    expect(pathResolve('build')).toMatch(/[\\/]build[\\/]utils\.spec\.ts$/);
  });

  it('alias 映射 @ 到 src、@build 到 build', () => {
    expect(alias['@']).toMatch(/[\\/]src$/);
    expect(alias['@build']).toMatch(/[\\/]build$/);
  });

  it('__APP_INFO__ 携带包信息与构建时间格式', () => {
    expect(__APP_INFO__.pkg.name).toBe('@multi-admin/pure-web');
    expect(__APP_INFO__.lastBuildTime).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
    );
  });
});
```

- [ ] **Step 4: 编写测试 `apps/pure-web/src/utils/tree.spec.ts`（全 6 导出函数）**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  extractPathList,
  deleteChildren,
  buildHierarchyTree,
  getNodeByUniqueId,
  appendFieldByUniqueId,
  handleTree
} from './tree';

describe('buildHierarchyTree', () => {
  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(buildHierarchyTree('not-a-tree' as unknown as unknown[])).toEqual(
      []
    );
    expect(warn).toHaveBeenCalledWith('tree must be an array');
    warn.mockRestore();
  });

  it('空数组直接返回空数组', () => {
    expect(buildHierarchyTree([])).toEqual([]);
  });

  it('扁平节点注入 id/parentId/pathList', () => {
    const result = buildHierarchyTree([{ name: 'a' }, { name: 'b' }]);
    expect(result[0]).toMatchObject({ id: 0, parentId: null, pathList: [0] });
    expect(result[1]).toMatchObject({ id: 1, parentId: null, pathList: [1] });
  });

  it('嵌套子节点递归注入层级信息', () => {
    const tree = [{ name: 'root', children: [{ name: 'child' }] }];
    buildHierarchyTree(tree);
    expect(tree[0].pathList).toEqual([0]);
    expect(tree[0].children[0]).toMatchObject({
      id: 0,
      parentId: 0,
      pathList: [0, 0]
    });
  });

  it('children 为空数组时不递归、保留原数组', () => {
    const tree = [{ name: 'a', children: [] }];
    buildHierarchyTree(tree);
    expect(tree[0].id).toBe(0);
    expect(tree[0].children).toEqual([]);
  });
});

describe('extractPathList', () => {
  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractPathList('x' as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('tree must be an array');
    warn.mockRestore();
  });

  it('收集每层节点 uniqueId', () => {
    expect(extractPathList([{ uniqueId: 1 }, { uniqueId: 2 }])).toEqual([1, 2]);
  });

  it('有子节点时先递归子层再收集本层', () => {
    const tree = [{ uniqueId: 'a', children: [{ uniqueId: 'b' }] }];
    expect(extractPathList(tree)).toEqual(['b', 'a']);
  });
});

describe('deleteChildren', () => {
  it('单子节点删除 children 并组装 uniqueId', () => {
    const tree = [{ name: 'a', children: [{ name: 'a1' }] }];
    deleteChildren(tree);
    expect(tree[0].children).toBeUndefined();
    expect(tree[0].uniqueId).toBe(0);
  });

  it('多子节点保留 children 且层级 uniqueId 用连字符', () => {
    const tree = [
      { name: 'a', children: [{ name: 'b' }, { name: 'c' }] }
    ];
    deleteChildren(tree);
    expect(tree[0].children.length).toBe(2);
    expect(tree[0].children[0].uniqueId).toBe('0-0');
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(deleteChildren(null as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('menuTree must be an array');
    warn.mockRestore();
  });
});

describe('getNodeByUniqueId', () => {
  it('命中当前层节点直接返回', () => {
    const node = { uniqueId: 'x' };
    expect(getNodeByUniqueId([node], 'x')).toBe(node);
  });

  it('未命中时向子层递归查找', () => {
    const child = { uniqueId: 'y' };
    const tree = [{ uniqueId: 'x', children: [child] }];
    expect(getNodeByUniqueId(tree, 'y')).toBe(child);
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getNodeByUniqueId('x' as unknown as unknown[], 'a')).toEqual([]);
    warn.mockRestore();
  });
});

describe('appendFieldByUniqueId', () => {
  it('命中节点追加字段', () => {
    const tree = [{ uniqueId: 'x' }];
    appendFieldByUniqueId(tree, 'x', { disabled: true });
    expect(tree[0]).toMatchObject({ disabled: true });
  });

  it('fields 非普通对象时不追加', () => {
    const tree = [{ uniqueId: 'x' }];
    appendFieldByUniqueId(tree, 'x', 'not-object');
    expect(tree[0]).toEqual({ uniqueId: 'x' });
  });

  it('子层命中时递归追加', () => {
    const tree = [{ uniqueId: 'x', children: [{ uniqueId: 'y' }] }];
    appendFieldByUniqueId(tree, 'y', { hidden: true });
    expect(tree[0].children[0]).toMatchObject({ hidden: true });
  });
});

describe('handleTree', () => {
  it('扁平数据组装为树（缺省字段名）', () => {
    const data = [
      { id: 1, parentId: null },
      { id: 2, parentId: 1 }
    ];
    const tree = handleTree(data);
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].id).toBe(2);
  });

  it('自定义字段名', () => {
    const data = [
      { key: 1, pId: null },
      { key: 2, pId: 1 }
    ];
    const tree = handleTree(data, 'key', 'pId', 'kids');
    expect(tree[0].kids[0].key).toBe(2);
  });

  it('非数组输入告警并返回空数组', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(handleTree('x' as unknown as unknown[])).toEqual([]);
    expect(warn).toHaveBeenCalledWith('data must be an array');
    warn.mockRestore();
  });
});
```

说明：上述用例覆盖 6 个导出函数的主行为与边界（非数组告警、递归层级、字段名定制），是 B0 达标 `src/utils/tree.ts` 行+分支 ≥80% 的主体（Q2 口径）。

- [ ] **Step 5: `build/utils.ts` strict 修复 + getPackageSize 闭包重构 + 其测试补全**

修复 2 个 strict 错误（设计 B1.1 实测值，Q2 口径下提至 B0）：

1. `TS7053:71`（`ret[envName] = realName;`，ViteEnv 无索引签名）：改为 `(ret as Recordable)[envName] = realName;`（`Recordable` 为 ambient 全局类型，strict 段已 include `types/*.d.ts`）；
2. `TS7006:84`（`getPackageSize` 的 `options` 隐式 any）：定义参数类型 `{ folder?: string; callback: (size: number) => void; format?: boolean }`。

getPackageSize 闭包重构（可测性与正确性）：模块级 `fileListTotal` 移入每次调用内部（经内部递归函数传递），消除跨调用累积污染。重构前先确认调用点无「多次调用累积同一数组」依赖（预期仅构建期单次调用）：

```bash
grep -rn 'getPackageSize' apps/pure-web --include='*.ts' --include='*.vue'
```

`utils.spec.ts` 顶部追加 `node:fs` mock（vi.mock 需在 import 前 hoisted，实际置于文件顶部），文件末尾追加 getPackageSize 测试：

```ts
import { readdir, stat } from 'node:fs';

vi.mock('node:fs', () => ({
  readdir: vi.fn(),
  stat: vi.fn()
}));

import { getPackageSize } from './utils';

describe('getPackageSize', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('单层目录：文件大小求和后回调格式化结果', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation((_p: string, cb: any) =>
      cb(null, ['a.js'])
    );
    vi.mocked(stat).mockImplementation((_p: string, cb: any) =>
      cb(null, { isFile: () => true, isDirectory: () => false, size: 10 })
    );
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0]).toContain('B');
  });

  it('目录递归：子目录文件计入总和', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation((p: string, cb: any) =>
      p.includes('sub') ? cb(null, ['b.js']) : cb(null, ['a.js', 'sub/'])
    );
    vi.mocked(stat).mockImplementation((p: string, cb: any) =>
      cb(null, {
        isFile: () => !p.endsWith('/'),
        isDirectory: () => p.endsWith('/'),
        size: 5
      })
    );
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('空目录：回调 0', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation((_p: string, cb: any) => cb(null, []));
    getPackageSize({ folder: 'dist', callback });
    expect(callback).toHaveBeenCalledWith(0);
  });

  it('format: false 时回调原始字节数', () => {
    const callback = vi.fn();
    vi.mocked(readdir).mockImplementation((_p: string, cb: any) =>
      cb(null, ['a.js'])
    );
    vi.mocked(stat).mockImplementation((_p: string, cb: any) =>
      cb(null, { isFile: () => true, isDirectory: () => false, size: 10 })
    );
    getPackageSize({ folder: 'dist', callback, format: false });
    expect(callback).toHaveBeenCalledWith(10);
  });

  it('readdir 出错：抛出原错误', () => {
    vi.mocked(readdir).mockImplementation((_p: string, cb: any) =>
      cb(new Error('boom'))
    );
    expect(() =>
      getPackageSize({ folder: 'dist', callback: vi.fn() })
    ).toThrow('boom');
  });
});
```

验证（strict 修复临时验证 + 测试全绿）：

```bash
cd apps/pure-web
# 临时将 build/utils.ts 追加进 strict 清单验证零错误，随后还原（正式迁入在 Step 9）
node -e "const {readFileSync,writeFileSync}=require('node:fs');const p='tsconfig.strict.json';const j=JSON.parse(readFileSync(p,'utf8'));j.include.push('build/utils.ts');writeFileSync(p,JSON.stringify(j,null,2)+'\n');"
cross-env NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vue-tsc -p tsconfig.strict.json --noEmit --skipLibCheck
git checkout -- tsconfig.strict.json
pnpm exec vitest run build/utils.spec.ts
```

Expected: 临时清单下 `vue-tsc` 对 `build/utils.ts` 零错误（清单内其它文件同零），还原后断言状态不变；`utils.spec.ts` 全绿（wrapperEnv 6 + 同步导出 6 + getPackageSize 5 用例）。

- [ ] **Step 6: 运行测试验证（vitest + vite 8 组合首验）**

```bash
cd apps/pure-web
pnpm exec vitest run
```

Expected: 2 个测试文件全部用例通过（`utils.spec.ts` 17 例 / `tree.spec.ts` 20 例，以实测为准）。若报 `rolldownOptions`/插件相关错误，检查是否误合并了 `vite.config.ts`（vitest 存在 `vitest.config.ts` 时不应读取它；若仍读取，把 `vitest.config.ts` 改为 `vitest.config.mts` 重试）。

- [ ] **Step 7: 覆盖率报表验证（glob 阈值首验）**

```bash
cd apps/pure-web
cross-env NODE_OPTIONS=--max-old-space-size=8192 pnpm exec vitest run --coverage
```

Expected: 控制台输出 text 报表（含 `build/utils.ts` 与 `src/utils/tree.ts` 行），`coverage/` 目录生成 html + lcov；**glob 键阈值校验通过**——text 报表中两文件行+分支均 ≥80%，不达标 vitest 非零退出并点名缺口文件（补齐 Step 3/4/5 用例直至达标，不得下调阈值）。

- [ ] **Step 8: `apps/pure-web/package.json` 追加 scripts**

在 `stylelint:fix` 之后追加：

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "cross-env NODE_OPTIONS=--max-old-space-size=8192 vitest run --coverage"
```

- [ ] **Step 9: spec 与源码文件进 strict 清单 + 断言验证**

`tsconfig.strict.json` 的 include 追加 `"build/utils.spec.ts"`、`"src/utils/tree.spec.ts"` 与两模块源码 `"build/utils.ts"`、`"src/utils/tree.ts"`（Q2 口径：B0 即完成三合一验收——测试 ≥80% + strict 零错误 + 迁入清单；co-located spec 从第一天强类型，设计 3.1）。然后：

```bash
node scripts/assert-strict-manifest.mjs
```

Expected: 通过（4 个新文件均已进清单）。

- [ ] **Step 10: eslint vitest 测试块**

`apps/pure-web/eslint.config.js` 顶部追加 import：

```js
import vitestPlugin from 'eslint-plugin-vitest';
```

在 `...tailwindConfig(...)` 之前追加配置块：

```js
{
  // vitest 测试文件规则：显式 import { describe, it } 风格，不注入 globals
  files: ['**/*.spec.ts'],
  plugins: { vitest: vitestPlugin },
  rules: {
    ...vitestPlugin.configs.recommended.rules
  }
},
```

验证：

```bash
pnpm --filter @multi-admin/pure-web run lint
```

Expected: 通过（`--max-warnings 0`）。若 `vitestPlugin.configs.recommended.rules` 结构在当前版本变化（如改名为 `flat/recommended`），按其 README 调整，保持「只启用 recommended 规则集」语义。

- [ ] **Step 11: `.github/workflows/ci.yml` 追加 coverage-web job**

在 `coverage` job 之后（文件末尾）追加：

```yaml
  coverage-web:
    name: coverage-web（pure-web 报警式）
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec turbo run test:coverage --filter=@multi-admin/pure-web
```

说明：无 services（前端测试零外部依赖）；报警式与既有四 job 一致（设计 3.3）。

- [ ] **Step 12: turbo 集成验证 + 全量门禁**

```bash
pnpm exec turbo run test --filter=@multi-admin/pure-web
pnpm check
```

Expected: turbo test 跑通（`test` 任务 `dependsOn: ["^build"]` 会先构建 contracts）；`pnpm check` 全绿，覆盖枚举中 `@multi-admin/pure-web` 变为「✔ 有 test 脚本」。

- [ ] **Step 13: 文档同步**

`docs/engineering/build-and-verify.md`：

1. 「质量门禁」第 2 条的四 job 描述改为五 job，追加：`coverage-web`（pure-web `test:coverage`，无 services，报警式；B0 起 glob 键逐模块阈值 ≥80%，随批次 B 逐个追加）；
2. 「各端构建链」表 `pure-web` 行的说明列追加：测试 `test` / `test:coverage`（vitest 4.x，独立 `vitest.config.ts` 不合并构建配置）；
3. `last_verified` 更新为当日。

设计文档同目录追加一行执行记录（`2026-08-29-pure-web-testing-foundation-design.md` 文末不加章节；改在本计划文件末尾由执行者勾选追踪）。

- [ ] **Step 14: prettier + 提交**

```bash
pnpm exec prettier --check apps/pure-web .github/workflows/ci.yml docs/engineering/build-and-verify.md
git add apps/pure-web/package.json apps/pure-web/vitest.config.ts apps/pure-web/build/utils.spec.ts apps/pure-web/src/utils/tree.spec.ts apps/pure-web/eslint.config.js apps/pure-web/tsconfig.strict.json .github/workflows/ci.yml docs/engineering/build-and-verify.md pnpm-lock.yaml
git commit -m "feat(web): vitest 测试基建落地——独立配置 + 样板测试 + eslint 测试块 + coverage-web CI job"
```

注意 lockfile 在仓库根（`pnpm-lock.yaml`），`apps/pure-web/` 下没有独立 lockfile。

- [ ] **Step 15: push 后 CI 观察（报警式，不阻塞）**

```bash
git push
pnpm ops:ci
```

Expected: 五 job 出现；`coverage-web` 绿。若红，按纪律「CI 红 → 下一项工作先修 CI」，用 `pnpm ops:ci-logs` 拉日志定位。

---

## 验收映射（设计 → 计划）

| 设计条目 | 计划任务 |
| --- | --- |
| 设计 4 章 A0 三件套 + 周期机制 | Task 1 |
| 设计 5 章 A1（.vue 补测） | Task 2 |
| 设计 5 章 A2（双 tsconfig + 断言 + 双 config typecheck） | Task 3 |
| 设计 5 章 A3（组件盘点） | Task 4 |
| 设计 6 章 B0（vitest 基建 + 样板模块全量测试 + CI） | Task 5（Q2 口径：两模块 ≥80% + strict 清零 + 当场迁入清单） |
| 设计 3.1 双重断言语义 | Task 3 Step 3（实现口径：防漏 = 新文件对比 HEAD，见 Task 3 开头说明） |
| 设计 3.3 coverage-web | Task 5 Step 11 |
| backlog 四条登记 | 已存在（Task 1 Step 1 验证），本计划不新增 |

口径澄清：设计 B0 验收「样板模块覆盖率达标」已按 Q2 口径落位为——B0 即测全 `tree.ts` + `build/utils.ts`（含 getPackageSize 闭包重构），vitest.config 配置 glob 键阈值 ≥80% 并实测达标，两模块（含 2 个 spec）当场迁入 strict 清单（三合一验收）；B1 相应缩为 4 任务（原 B1.1/B1.2 已在 B0 完成）。防漏断言按 Q1 口径挂 `pnpm check` + pre-commit 双通道（CI 报警式不拦截，提交边界拦截是真正兜底），「最终态收口」已登记 backlog。

## 后续批次（不在本计划范围）

B1 纯函数组（4 任务，原 B1.1 `build/utils.ts` / B1.2 `utils/tree.ts` 已在 B0 完成）/ B2 状态机组 / B3 组件组：各模块执行前按设计「总→分」原则另出分级计划；每模块验收 = 测试 ≥80% + strict 清零 + 迁入清单（三合一）。
