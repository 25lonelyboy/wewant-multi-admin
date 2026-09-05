# doc-lint 接入门禁链实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 doc-lint 从「依赖自觉执行」升级为「机械保障」——pre-push 阻断 + CI 报警兜底，前置清项让基线归零。

**Architecture:** 双层门禁：`ops:pre-push` 主挂载（阻断式，信号干净）+ CI 独立 doc-lint job（报警式兜底，防跳过 pre-push 直推）。前置清项修复当前 2 项 covers 漂移。三个提交顺序设计确保每个提交完成后 doc-lint 漂移态可解释、最终全绿。

**Tech Stack:** 纯 Node（doc-lint.cjs 零依赖）、GitHub Actions YAML、pnpm scripts。无新依赖。

**漂移动态（本计划的核心机制，实施者必须理解）**：doc-lint ④ 比对的是文档自身与 covers 文件的 **git 最后提交时间**（`git log -1 --format=%ct`），与 frontmatter 字段无关，且 **工作区未提交改动不参与比对**（git log 只看已提交历史）——漂移只随「提交」出现/消除。每个任务的验证分「提交前预期」与「提交后预期」两态。已知漂移链：

- 初始态：红 2 项（backend-evolution.md covers backlog.md、repo-structure.md covers apps/）
- 提交 1 前：红 1 项（backend-evolution.md 工作区已移除 backlog covers 不再报；repo-structure.md 未提交仍报）
- 提交 1 后：全绿（两文档 docTs 变新）
- 提交 2 前：全绿（ci.yml 未提交不参与 git 比对）
- 提交 2 后：红 1 项（ci.yml 已提交 → `backlog.md` covers `.github/workflows/` 漂移，属预期中间态）
- 提交 3 后：全绿（backlog.md 自身 docTs 变新）

---

### Task 0: 前置清项——covers 建模修正与 last_verified 刷新

**Files:**
- Modify: `docs/architecture/backend-evolution.md`（frontmatter + 1 处正文）
- Modify: `docs/architecture/repo-structure.md`（frontmatter）

- [ ] **Step 1: 修正 backend-evolution.md 的 covers 建模**

`backlog.md` 是动态活动清单（每次条目增删都变更），把它放在 covers 会导致无信息量的持续漂移。从 covers 移除（正文第 12、71 行的引用保留），同时把第 32 行过时的「CI 四 job」去掉具体数字（当前实际六 job，本计划后七 job，写死数字会再次过时）。

把 frontmatter：

```yaml
covers:
  - apps/nestjs-server/
  - docs/governance/backlog.md
  - docs/decisions/ADR-007-backend-evolution.md
last_verified: 2026-08-29
```

改为：

```yaml
covers:
  - apps/nestjs-server/
  - docs/decisions/ADR-007-backend-evolution.md
last_verified: 2026-09-05
```

把正文表格行：

```markdown
| 交付自动化 | ★★★☆☆ | CI 四 job 异步安全网 + 镜像冒烟；无 PR 门禁/CD/registry |
```

改为：

```markdown
| 交付自动化 | ★★★☆☆ | CI 异步安全网 + 镜像冒烟；无 PR 门禁/CD/registry |
```

- [ ] **Step 2: 刷新 repo-structure.md 的 last_verified**

内容已核对仍准确（workspace 表、构建依赖关系、目录放置规则均与当前仓库一致，pure-web 测试基建与 P5 直连均已体现）。仅改 frontmatter：

```yaml
last_verified: 2026-09-03
```

改为：

```yaml
last_verified: 2026-09-05
```

- [ ] **Step 3: 提交前基线确认（预期红 1 项）**

Run: `node scripts/doc-lint.cjs .`

Expected: ④ 漂移报 `repo-structure.md` covers apps/ 1 项——**属预期**：backend-evolution.md 工作区已移除 backlog covers（doc-lint 读工作区 frontmatter）不再报；repo-structure.md 改动未提交，git 比对的 docTs 未更新。

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/backend-evolution.md docs/architecture/repo-structure.md
git commit -m "docs(repo): doc-lint 门禁前置清项——covers 建模修正与 last_verified 刷新"
```

- [ ] **Step 5: 提交后验收（预期全绿）**

Run: `node scripts/doc-lint.cjs .`

Expected: 五检查全绿、退出码 0（两文档 docTs 已变新，漂移消除）。

---

### Task 1: 本地挂载与 CI job——pre-push 阻断 + doc:lint 入口 + doc-lint job

**Files:**
- Modify: `scripts/ops/pre-push.mjs`（check 与 audit 之间插一步）
- Modify: `package.json`（scripts 区）
- Modify: `.github/workflows/ci.yml`（新增 job）
- Modify: `docs/engineering/build-and-verify.md`（质量门禁节 + last_verified）

- [ ] **Step 1: pre-push.mjs 插 doc-lint 步**

把：

```js
// 2. 全量门禁（复用 pnpm check）
run('check', 'pnpm', ['check']);

// 3. 依赖审计（报警式，失败不阻断）
```

改为：

```js
// 2. 全量门禁（复用 pnpm check）
run('check', 'pnpm', ['check']);

// 2.5 文档一致性门禁（阻断式：孤儿/死链/frontmatter/漂移/行数预算）
run('doc-lint', 'node', ['scripts/doc-lint.cjs', '.']);

// 3. 依赖审计（报警式，失败不阻断）
```

- [ ] **Step 2: package.json 加 doc:lint 入口**

把：

```json
    "check": "node ./scripts/check.mjs",
    "lint": "turbo run lint",
```

改为：

```json
    "check": "node ./scripts/check.mjs",
    "doc:lint": "node scripts/doc-lint.cjs .",
    "lint": "turbo run lint",
```

- [ ] **Step 3: ci.yml 新增 doc-lint job**

两处修改：

① 第 2 行过时注释修正（写「四 job」，实际已六 job，本计划后七 job）：

把：

```yaml
# 报警式不拦截：仅 push master + 手动触发；无分支保护；四 job 全并行。
```

改为：

```yaml
# 报警式不拦截：仅 push master + 手动触发；无分支保护；七 job 全并行。
```

② 在 `jobs:` 内、`e2e-web` job 之后追加：

```yaml
  doc-lint:
    name: doc-lint（报警式，不红）
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: 文档一致性五检查
        run: node scripts/doc-lint.cjs .
        continue-on-error: true
```

（无需 pnpm install 与 pnpm/action-setup——doc-lint 是零依赖纯 node 脚本；`continue-on-error` 在 step 级，与 audit job 同款。）

- [ ] **Step 4: 语法与接线自检**

Run: `node node_modules/prettier/bin/prettier.cjs --check .github/workflows/ci.yml scripts/ops/pre-push.mjs package.json`

Expected: 全绿（prettier 解析失败会报错，可验证 yaml/mjs/json 语法）。接线确认：`pre-push.mjs` 中 `run('doc-lint', ...)` 位于 `run('check', ...)` 与 `console.log('\n▶ audit（报警式）')` 之间。

- [ ] **Step 5: build-and-verify.md 质量门禁节更新**

三处修改（当前第 24-28 行区域）：

① 小节标题把 push 前校验纳入「本地拦截」语义：

```markdown
1. **实时拦截（本地，每次 commit）**：
```

改为：

```markdown
1. **本地拦截（commit / push 前）**：
```

② husky 条目之后补 pre-push 与 doc:lint 条目（第 26 行后插入）：

```markdown
   - **`pnpm ops:pre-push`**（`scripts/ops/pre-push.mjs`）：push 前 CI 同构校验，顺序执行 frozen-lockfile → `pnpm check` → `pnpm doc:lint` → audit（报警式）。
   - **`pnpm doc:lint`**（`scripts/doc-lint.cjs`，零依赖纯 node）：文档一致性五检查（孤儿/死链/frontmatter/covers 漂移/AGENTS.md 行数预算），pre-push 与 CI doc-lint job 均挂载。
```

③ 第 27 行「五 job」描述修正（原描述漏了 `e2e-web`，本次新增 `doc-lint` 后共七 job）：

把：

```markdown
2. **异步兜底（入库后，每次 push master）**：`.github/workflows/ci.yml` 五 job 并行——`gate`（frozen-lockfile 安装 + `pnpm check` 服务端重验）、`docker-build`（双镜像构建验证 + web/server 双启动冒烟：web curl 200、server /health+entrypoint 三段断言，server 冒烟依赖 job services postgres/redis；不 push）、`coverage`（services 上 `test:coverage` ≥80% 报警式硬门槛）、`coverage-web`（pure-web vitest 覆盖率报警式，`build/utils.ts` 与 `src/utils/tree.ts` glob 键 ≥80%）、`audit`（`pnpm audit --audit-level=high` 报警式）。定位与取舍见 `docs/decisions/ADR-006-github-ci.md`。
```

改为：

```markdown
2. **异步兜底（入库后，每次 push master）**：`.github/workflows/ci.yml` 七 job 并行——`gate`（frozen-lockfile 安装 + `pnpm check` 服务端重验）、`docker-build`（双镜像构建验证 + web/server 双启动冒烟：web curl 200、server /health+entrypoint 三段断言，server 冒烟依赖 job services postgres/redis；不 push）、`coverage`（services 上 `test:coverage` ≥80% 报警式硬门槛）、`coverage-web`（pure-web vitest 覆盖率报警式，`build/utils.ts` 与 `src/utils/tree.ts` glob 键 ≥80%）、`e2e-web`（Playwright E2E 冒烟）、`audit`（`pnpm audit --audit-level=high` 报警式）、`doc-lint`（文档一致性五检查报警式）。定位与取舍见 `docs/decisions/ADR-006-github-ci.md`。
```

④ frontmatter 刷新：

```yaml
last_verified: 2026-09-04
```

改为：

```yaml
last_verified: 2026-09-05
```

- [ ] **Step 6: 负向验证——doc:lint 检出能力**

Run:

```bash
printf '# 临时孤儿文档\n' > docs/architecture/_tmp-orphan.md
pnpm doc:lint; echo "exit=$?"
rm docs/architecture/_tmp-orphan.md
```

Expected: ① 孤儿文件报 `docs/architecture/_tmp-orphan.md`，`exit=1`；删除后复跑 `pnpm doc:lint` 仅剩 1 项预期漂移（backlog.md，见下）。

- [ ] **Step 7: 提交前基线确认（预期全绿）**

Run: `node scripts/doc-lint.cjs .`

Expected: 五检查全绿——ci.yml 等改动未提交，不参与 git 比对，backlog.md 暂不报。

- [ ] **Step 8: Commit**

```bash
git add scripts/ops/pre-push.mjs package.json .github/workflows/ci.yml docs/engineering/build-and-verify.md
git commit -m "feat(repo): doc-lint 接入门禁链——pre-push 阻断 + CI 报警 job + doc:lint 入口"
```

- [ ] **Step 9: 提交后验收（预期红 1 项，属中间态）**

Run: `node scripts/doc-lint.cjs .`

Expected: ④ 漂移报 `docs/governance/backlog.md` 疑似陈旧（covers 的 `.github/workflows/` 因 ci.yml 已提交）——**属预期中间态**，Task 2 提交 backlog.md 后消除。

---

### Task 2: 收口——backlog 关闭与 AGENTS.md 命令登记

**Files:**
- Modify: `docs/governance/backlog.md`（条目移至关闭表 + last_verified）
- Modify: `AGENTS.md`（4 处命令/描述）

- [ ] **Step 1: backlog.md 条目移至关闭表**

从开放表删除：

```markdown
| doc-lint 接入门禁链 | doc-lint 副本（scripts/doc-lint.cjs）已落仓库并登记 AGENTS.md，但依赖文档变更后自觉执行，孤儿/死链/漂移缺机械保障；当前基线全绿接入成本低 | 下一次文档体系维护或治理任务（候选方案：pnpm check 链加步 / ops:pre-push 加步 / CI 报警式 job） | 2026-09-04 |
```

在关闭表末尾追加：

```markdown
| doc-lint 接入门禁链 | doc-lint 副本（scripts/doc-lint.cjs）已落仓库并登记 AGENTS.md，但依赖文档变更后自觉执行，孤儿/死链/漂移缺机械保障；当前基线全绿接入成本低 | 下一次文档体系维护或治理任务（候选方案：pnpm check 链加步 / ops:pre-push 加步 / CI 报警式 job） | 双层门禁：`ops:pre-push` 加 doc-lint 步（阻断）+ CI 独立 doc-lint job（报警式）+ `pnpm doc:lint` 入口；前置清项 2 漂移（backend-evolution.md 移除动态 covers、repo-structure.md 刷新） | 2026-09-05 | 2026-09-04 |
```

frontmatter 刷新：

```yaml
last_verified: 2026-09-04
```

改为：

```yaml
last_verified: 2026-09-05
```

- [ ] **Step 2: AGENTS.md 四处更新**

① 第 46 行 pre-push 描述：

把：

```text
pnpm ops:pre-push                 # push 前 CI 同构校验（frozen-lockfile + check + audit）
```

改为：

```text
pnpm ops:pre-push                 # push 前 CI 同构校验（frozen-lockfile + check + doc-lint + audit）
```

② 第 51-52 行文档自检命令换新入口：

把：

```text
# 文档治理自检（孤儿/死链/frontmatter/covers 漂移/行数；根 "type": "module" 故副本用 .cjs）
node scripts/doc-lint.cjs .
```

改为：

```text
# 文档治理自检（孤儿/死链/frontmatter/covers 漂移/行数；根 "type": "module" 故副本用 .cjs）
pnpm doc:lint
```

③ 第 63 行 CI job 清单修正（原「五 job」漏 `e2e-web`，本次后七 job）：

把：

```text
GitHub CI 异步兜底（`.github/workflows/ci.yml`，push master 触发，五 job：gate / docker-build / coverage / coverage-web / audit，报警式不拦截，[ADR-006](docs/decisions/ADR-006-github-ci.md)）
```

改为：

```text
GitHub CI 异步兜底（`.github/workflows/ci.yml`，push master 触发，七 job：gate / docker-build / coverage / coverage-web / e2e-web / audit / doc-lint，报警式不拦截，[ADR-006](docs/decisions/ADR-006-github-ci.md)）
```

④ 第 83 行文档治理区裸命令简化：

把：

```text
文档变更后跑 `node scripts/doc-lint.cjs .` 验收（副本落后于技能母版时随重组更新）。
```

改为：

```text
文档变更后跑 `pnpm doc:lint` 验收（副本落后于技能母版时随重组更新）。
```

- [ ] **Step 3: Commit**

```bash
git add docs/governance/backlog.md AGENTS.md
git commit -m "chore(repo): doc-lint 门禁收口——backlog 关闭与 AGENTS.md 命令登记"
```

- [ ] **Step 4: 提交后验收**

Run: `node scripts/doc-lint.cjs .`

Expected: 五检查全绿、退出码 0（backlog.md docTs 变新，Task 1 产生的中间漂移消除）。

---

### Task 3: 终验与 CI 首跑观察

**Files:** 无文件改动（纯验证；发现问题则修并追加提交）

- [ ] **Step 1: 全量终验**

Run:

```bash
node scripts/doc-lint.cjs .
node node_modules/prettier/bin/prettier.cjs --check scripts/ops/pre-push.mjs package.json .github/workflows/ci.yml docs/engineering/build-and-verify.md docs/governance/backlog.md AGENTS.md
```

Expected: doc-lint 五检查全绿；prettier 全绿。AGENTS.md 行数仍在预算内（⑤ 检查绿即证明 ≤150）。

- [ ] **Step 2: pre-push 正向全链路（可选，耗时约 5-10 分钟）**

Run: `pnpm ops:pre-push`

Expected: frozen-lockfile → check → doc-lint → audit 顺序全过，尾部输出「✔ pre-push 校验通过，可安全 push」。（check 全量 typecheck/lint/test 耗时较长，时间不允许时可仅验证 doc-lint 步单独绿。）

- [ ] **Step 3: 用户 push 后 CI 首跑观察**

由用户 push master 触发。Run: `pnpm ops:ci`

Expected: 七 job 全绿；`doc-lint` job 绿（报警式 `continue-on-error: true`，红了也不影响其他 job）。

---

## 自审记录

- 规格覆盖：设计「前置清项」→ Task 0；「pre-push 挂载」→ Task 1 Step 1；「doc:lint 入口」→ Task 1 Step 2；「CI 报警 job」→ Task 1 Step 3；「收口（backlog / build-and-verify / AGENTS.md）」→ Task 1 Step 5 + Task 2；「验证四组」→ Task 1 Step 6/7/9（负向+基线）+ Task 3（全量+正向+CI 首跑）。
- 漂移链推演已核验：Task 0 提交消除现有 2 漂移；Task 1 提交触发 backlog.md 漂移（其 covers `.github/workflows/`）；Task 2 提交 backlog.md 自身消除。每个任务的「提交前/提交后」预期已在步骤中写明。
- 既有事实错误顺带修正：ci.yml L2 注释写「四 job」、AGENTS.md 与 build-and-verify.md 的「五 job」描述均过时（实际六 job 且均漏 `e2e-web`），本计划统一修正为七 job（含新增 doc-lint），不改历史记录。
- 无占位符；无新增依赖；commit scope 均用 `repo`（白名单内）。
