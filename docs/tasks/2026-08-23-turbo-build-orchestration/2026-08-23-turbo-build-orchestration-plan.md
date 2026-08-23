# Turborepo 构建编排全量迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 `turbo.json` 任务图取代全部 npm pre hook，全仓四端 + 共享包统一纳管；干净仓库下所有命令链路完整，门禁恢复纯校验语义并具备 test 覆盖可见性与 stylelint 阶段。

**Architecture:** 设计见 [2026-08-23-turbo-build-orchestration-design.md](./2026-08-23-turbo-build-orchestration-design.md)（下称"设计"）。四原则：原子自洽管包内前置、图管跨包顺序、入口纪律、容器同构兜底。

**Tech Stack:** Turborepo 2.x（pinned）、pnpm 11 catalog、Node ≥24。

**实施顺序约束（设计 §8，任何任务不得违反）：**

1. Task 1 冒烟失败即止损，不得继续；
2. Task 2（带 `--fix` 清理）必须先于 Task 3（去 `--fix`）完成并提交；
3. Task 3 内部所有改动为一个原子提交（不允许"半图半钩子"中间态入库）；
4. `test:coverage` 链重构与 `test:cov` 删除同一提交（链引用关系，由 Task 3 原子提交覆盖）；
5. 文档与对应代码同一提交（docs-in-same-commit）；
6. 每个提交用 UTF-8 消息文件（`git commit -F`），规避 Windows cmd GBK 回显乱码。

---

### Task 0: 前置提交（设计文档 + 实施计划）

**Files:** `docs/tasks/2026-08-23-turbo-build-orchestration/`（未跟踪）

- [ ] **Step 1: 提交任务过程材料**

消息：`docs(repo): turbo 构建编排全量迁移设计文档与实施计划`
文件：`docs/tasks/2026-08-23-turbo-build-orchestration/` 全部。
理由：使工作区回归干净，保证后续 Task 2 Step 3 与 Task 3 Step 11 / Task 6 Step 5 的 `git status --porcelain` 判据不被本目录干扰。
提交后验证：`git status --porcelain` 输出为空。

---

### Task 1: turbo 骨架与冒烟

**Files:**
- Modify: `pnpm-workspace.yaml`（catalog 增行）
- Modify: `package.json`（根，devDep 增行）
- Modify: `.gitignore`（增 `.turbo`）
- Create: `turbo.json`

- [ ] **Step 1: 确定 turbo 版本（pinned）**

Run: `npm view turbo version`
Expected: 输出 2.x 版本号（如 `2.5.6`）。记录为 `<TURBO_VER>`，本计划后续引用。若主版本非 2，停下核对设计（设计以 2.x `tasks` 键语义为准）。

- [ ] **Step 2: catalog 登记**

在 `pnpm-workspace.yaml` 的 `catalog:` 段（`'tsdown'` 行附近）新增一行：

```yaml
  'turbo': '<TURBO_VER>'
```

pinned（无 `^`），与仓库工具链 pin 惯例一致。

- [ ] **Step 3: 根 devDependency**

在根 `package.json` 的 `devDependencies` 中（`"typescript": "catalog:"` 行后）新增：

```json
    "turbo": "catalog:",
```

- [ ] **Step 4: `.gitignore` 增缓存目录**

在 `.gitignore` 文件末尾（`apps/nestjs-server/src/generated/` 行之后）追加：

```
# Turborepo 本地缓存（默认在 node_modules/.cache/turbo，此为自定义缓存目录兜底）
.turbo
```

- [ ] **Step 5: 创建 `turbo.json`（设计 §4.2 全文）**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", "dist-electron/**"] },
    "build:staging": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "build:dir": { "dependsOn": ["^build"], "cache": false },
    "build:mp-weixin": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "stylelint": {},
    "test": { "dependsOn": ["^build"], "cache": false },
    "test:e2e": { "dependsOn": ["^build"], "cache": false },
    "test:coverage": { "dependsOn": ["^build"], "cache": false },
    "dev": { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    "dev:mp-weixin": { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    "test:watch": { "persistent": true, "cache": false, "dependsOn": ["^build"] },
    "//apps/nestjs-server#build": { "outputs": ["dist/**", "src/generated/**"] },
    "//apps/electron-desktop#build": { "cache": false },
    "//apps/electron-desktop#typecheck": { "dependsOn": [] },
    "//apps/electron-desktop#dev": { "dependsOn": [] }
  }
}
```

- [ ] **Step 6: 安装**

Run: `pnpm install`
Expected: 成功，lockfile 更新，无引擎报错。

- [ ] **Step 7: 冒烟（失败即整体止损）**

Run: `pnpm exec turbo --version` → 输出版本号。
Run: `pnpm exec turbo run build --dry-run` → 列出全部包的 build 任务且拓扑顺序正确（contracts 先于 pure-web / nestjs-server，pure-web 先于 electron-desktop）。
Run: `pnpm exec turbo run typecheck` → 全绿（此阶段旧 pre 钩子仍在，与图并存无冲突）。

- [ ] **Step 8: Commit**

消息（写入 UTF-8 临时文件，`git commit -F`）：

```
build(repo): 引入 turbo 编排骨架（catalog pinned + turbo.json + 冒烟）
```

文件：`pnpm-workspace.yaml` `pnpm-lock.yaml` `package.json` `.gitignore` `turbo.json`。

---

### Task 2: lint 收尾清理（去 --fix 前的最后一次带 --fix 全量跑）

**Files:** 可能被改动的是任意被 `--fix` 修复的源码文件（预期为零或极少）。

- [ ] **Step 1: 带 --fix 全量跑（当前脚本仍带 --fix）**

Run: `pnpm -r run lint`
Expected: 全绿；若产生文件修改即为清理产物。

- [ ] **Step 2: 检查并格式化**

Run: `git status --porcelain`
若有改动：Run `pnpm format`，再 `git status --porcelain` 确认仅剩 lint/prettier 清理产物。

- [ ] **Step 3: 提交或跳过**

若 `git status --porcelain` 为空 → 跳过提交，直接进入 Task 3。
否则提交，消息：`chore(repo): lint --fix 收尾清理（门禁去 --fix 前置）`，文件为全部清理产物。

---

### Task 3: 编排迁移原子提交（核心）

**Files:**
- Modify: `package.json`（根，脚本重写）
- Modify: `apps/pure-web/package.json`、`apps/nestjs-server/package.json`、`apps/uni-mobile/package.json`、`apps/electron-desktop/package.json`、`packages/contracts/package.json`
- Create: `packages/contracts/eslint.config.mjs`
- Modify: `scripts/check.mjs`（重写）

以下全部改动在**一个提交**内完成。

- [ ] **Step 1: 根 `package.json` 脚本块整体替换为**

```json
  "scripts": {
    "dev": "turbo run dev",
    "dev:server": "turbo run dev --filter=@multi-admin/nestjs-server",
    "dev:mobile": "turbo run dev --filter=@multi-admin/uni-mobile",
    "dev:web": "turbo run dev --filter=@multi-admin/pure-web",
    "dev:desktop": "turbo run dev --filter=@multi-admin/electron-desktop",
    "build": "turbo run build",
    "build:desktop": "turbo run build --filter=@multi-admin/electron-desktop",
    "build:web": "turbo run build --filter=@multi-admin/pure-web",
    "check": "node ./scripts/check.mjs",
    "lint": "turbo run lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "turbo run typecheck",
    "clean:cache": "node ./scripts/clean.mjs --del-lock && pnpm install",
    "prepare": "husky"
  },
```

- [ ] **Step 2: `apps/pure-web/package.json` 脚本块整体替换为**（删 `serve` / `preview:build` / `pretypecheck`；`lint` 去 `--fix`；`stylelint` 补 `--max-warnings 0`）

```json
  "scripts": {
    "dev": "cross-env NODE_OPTIONS=--max-old-space-size=4096 vite",
    "build": "rimraf dist && cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build && generate-version-file",
    "build:staging": "rimraf dist && cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build --mode staging",
    "report": "rimraf dist && cross-env NODE_OPTIONS=--max-old-space-size=8192 vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck",
    "svgo": "svgo -f . -r",
    "lint": "eslint --cache --max-warnings 0 src mock build",
    "format": "prettier --write  \"src/**/*.{js,ts,json,tsx,css,scss,vue,html,md}\"",
    "stylelint": "stylelint --cache --max-warnings 0 \"**/*.{html,vue,css,scss}\" --cache-location node_modules/.cache/stylelint/",
    "stylelint:fix": "stylelint --fix \"**/*.{html,vue,css,scss}\" --cache-location node_modules/.cache/stylelint/"
  },
```

- [ ] **Step 3: `apps/nestjs-server/package.json` 脚本块整体替换为**（删 `pretypecheck` / `pretest` / `test:debug` / `test:cov`；generate 嵌入 `dev` / `typecheck` / `test` / `test:watch` / `test:e2e`；`test:coverage` 链重构；`lint` 去 `--fix`）

```json
  "scripts": {
    "build": "prisma generate && nest build",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "prisma db seed",
    "dev": "prisma generate && nest start --watch",
    "start": "nest start",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node dist/main",
    "lint": "eslint . --cache --max-warnings 0",
    "typecheck": "prisma generate && tsc --noEmit",
    "test": "prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:watch": "prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --watch",
    "test:e2e": "prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.cjs",
    "test:coverage": "prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage && prisma generate && node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-e2e.cjs --coverage && node test/merge-coverage.cjs"
  },
```

- [ ] **Step 4: `apps/uni-mobile/package.json` 脚本块整体替换为**（删 30 条变体/别名，保留 h5 默认 + mp-weixin；`lint` 去 `--fix`；`stylelint` 补 `--max-warnings 0`）

```json
  "scripts": {
    "dev": "uni",
    "dev:mp-weixin": "uni -p mp-weixin",
    "build": "uni build",
    "build:mp-weixin": "uni build -p mp-weixin",
    "typecheck": "vue-tsc --noEmit",
    "lint": "eslint \"{src,test}/**/*.{ts,vue}\"",
    "stylelint": "stylelint --max-warnings 0 \"src/**/*.{vue,scss,css}\""
  },
```

- [ ] **Step 5: `apps/electron-desktop/package.json` 脚本块整体替换为**（删 `prebuild` / `prebuild:dir`；`lint` 去 `--fix`）

```json
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "build": "node esbuild.config.mjs && cross-env ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ electron-builder",
    "build:dir": "node esbuild.config.mjs && cross-env ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ electron-builder --dir",
    "lint": "eslint --cache --max-warnings 0 electron",
    "typecheck": "tsc --noEmit"
  },
```

注意连锁影响：根 `dev:mobile` 现状指向 uni 的 `dev:h5`（本步已删）——这正是必须原子提交的原因，Step 1 的根脚本重写已将其改指 `dev`，中间态不得入库。

- [ ] **Step 6: `packages/contracts/package.json` 补门禁脚本与依赖**

`scripts` 块替换为：

```json
  "scripts": {
    "dev": "tsdown --watch",
    "build": "tsdown",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --cache --max-warnings 0",
    "format": "prettier --check ."
  },
```

`devDependencies` 块替换为：

```json
  "devDependencies": {
    "@multi-admin/eslint-config": "workspace:*",
    "@multi-admin/tsconfig": "workspace:*",
    "eslint": "catalog:",
    "prettier": "catalog:",
    "tsdown": "catalog:"
  }
```

注：`prettier` 为设计 §4.4 依赖清单之外的有意补正——`format` 脚本（`prettier --check .`）需要本包内的 prettier 二进制，不加则脚本无法执行。

- [ ] **Step 7: 创建 `packages/contracts/eslint.config.mjs`（薄壳）**

```js
// @ts-check
import { nodeConfig } from '@multi-admin/eslint-config/node';

/**
 * contracts ESLint 薄壳：零参消费仓库 Node 基线（纯类型 + 常量包，零运行时依赖）。
 */
export default [
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  ...nodeConfig({ tsconfigRootDir: import.meta.dirname })
];
```

- [ ] **Step 8: `scripts/check.mjs` 整体重写为**

```js
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
    console.log(`  ${has ? '\u2714' : '\u25cb'} ${pkg.name}：${has ? '有 test 脚本' : '无 test 脚本（跳过）'}`);
  }
}

// 预留插入位：preload 安全不变量验证阶段（另行立项后在此追加）

console.log('\n\u2714 全量校验通过');
```

- [ ] **Step 9: 安装（使 contracts 新依赖生效）**

Run: `pnpm install`
Expected: 成功，`packages/contracts/node_modules` 出现 eslint 链。

- [ ] **Step 10: contracts lint 基线验证（入门禁前先验零违规）**

Run: `pnpm --filter @multi-admin/contracts run lint`
Expected: 退出码 0（纯类型 + 常量包，预期零违规）。若有违规：先在本提交内修掉源码违规（不放宽规则、不加 `--fix`），再继续。

- [ ] **Step 11: 提交前验证（全部通过才允许提交）**

钩子清零检索（验收 #8）：

Run: `Select-String -Path apps\*\package.json, packages\*\package.json -Pattern "pretypecheck|pretest|prebuild"`
Expected: 零命中（检索范围限定各包 package.json，避免命中文档）。
Run: `pnpm check`
Expected: 全绿，输出含 5 个阶段 + test 覆盖枚举（验收 #7）。
Run: `git status --porcelain`（check 跑完后）
Expected: 除本任务自身改动外无新增差异（验收 #6 初步）。

- [ ] **Step 12: Commit（原子）**

消息：`build(repo): turbo 任务图全量迁移（删 pre 钩子 + 入口统一 + 门禁纯校验化 + 脚本精简）`
文件：本任务全部改动（含 lockfile）。

---

### Task 4: Docker 拓扑修复

**Files:**
- Modify: `apps/nestjs-server/Dockerfile:31`
- Modify: `apps/pure-web/Dockerfile:29`

- [ ] **Step 1: nestjs-server Dockerfile**

将 `RUN pnpm --filter @multi-admin/nestjs-server run build` 替换为：

```dockerfile
# `...` 后缀 = 该包及全部依赖，pnpm 按依赖图拓扑序先构建上游（contracts），
# 与本地 turbo 任务图同源于同一份依赖声明（容器内不安装/不运行 turbo）
RUN pnpm --filter @multi-admin/nestjs-server... run build
```

- [ ] **Step 2: pure-web Dockerfile**

将 `RUN pnpm --filter @multi-admin/pure-web run build` 替换为：

```dockerfile
# `...` 后缀 = 该包及全部依赖，pnpm 按依赖图拓扑序先构建上游（contracts），
# 与本地 turbo 任务图同源于同一份依赖声明（容器内不安装/不运行 turbo）
RUN pnpm --filter @multi-admin/pure-web... run build
```

- [ ] **Step 3: 镜像构建验证（可降级）**

Run: `docker build -f apps/pure-web/Dockerfile -t multi-admin/web:migration-check .`
Run: `docker build -f apps/nestjs-server/Dockerfile -t multi-admin/server:migration-check .`
Expected: 两个镜像构建成功（验收 #9）。若本机 Docker 不可用：跳过，在 `docs/governance/backlog.md` 追加一行「turbo 迁移后镜像首验 | 迁移改 `--filter X...` 拓扑构建，本机无 Docker 未验证；触发：下次部署前首验」。

- [ ] **Step 4: Commit**

消息：`build(repo): Docker 构建链改 --filter X... 拓扑（修复 contracts 未先构建的断链）`

---

### Task 5: 文档与 ADR

**Files:**
- Create: `docs/decisions/ADR-005-turbo-build-orchestration.md`
- Modify: `docs/decisions/README.md`、`AGENTS.md`、`docs/engineering/build-and-verify.md`、`docs/architecture/repo-structure.md`、`docs/architecture/contracts.md`、`docs/architecture/desktop-app.md`、`docs/governance/backlog.md`

- [ ] **Step 1: ADR-005（按仓库 ADR 格式撰写，要点如下）**

标题：`ADR-005 构建编排选型：采纳 Turborepo 任务图`。内容要点：
- Status: accepted；日期；关联任务 `docs/tasks/2026-08-23-turbo-build-orchestration/`；
- Context：pre hook 模式结构性失效证据（设计 §2：7 处断链/缺口、组合爆炸、变体陷阱事故）；
- Decision：采纳 `turbo.json` 任务图 + 四原则（原子自洽管包内前置、图管跨包顺序、入口纪律、容器同构兜底）；
- 备选对比：turbo / 补 pre hook / pnpm 原生 `--filter X...` / Nx（结论与被否理由照设计 §3 与决策表）；
- 双链模式正当性：本地 turbo + 容器 pnpm 原生拓扑，同源于依赖声明、执行同一批脚本，接 CI 后收敛；
- **与 ADR-003 的关系**：ADR-003 正文不改（历史快照），其工具链精确 pin 决策继续有效，「构建编排放桌面端 prebuild 钩子」部分由本决策取代。

- [ ] **Step 2: `docs/decisions/README.md` 索引追加一行**

```markdown
| [ADR-005-turbo-build-orchestration.md](ADR-005-turbo-build-orchestration.md) | 构建编排采纳 Turborepo 任务图（取代 pre hook；部分取代 ADR-003 编排条款） | accepted |
```

同时修改 ADR-003 索引行的「决策」列为：`Electron 工具链精确 pin（构建编排条款由 ADR-005 取代；pin 决策继续有效故不标整体 superseded）`。ADR-003 文件本体一字不动（遵守「ADR 不可变」规则；部分取代的信息承载于索引行与 ADR-005 的关系声明）。

- [ ] **Step 3: `AGENTS.md` 更新**

「常用命令」块中以下行替换（其余保留）：

```bash
pnpm build                        # 全量构建（turbo 任务图编排 + 缓存）
pnpm build:desktop                # 打包桌面端安装包（任务图 ^build 自动先构建 pure-web）
pnpm check                        # 本地质量门禁：prettier → typecheck → lint → stylelint → test → test 覆盖枚举，纯校验不改文件
pnpm lint                         # 全 workspace lint（turbo 编排，纯校验）
pnpm typecheck                    # 全 workspace 类型检查（turbo 编排）
```

「架构要点」新增一条（置于「桌面端链路」之后），并将「桌面端链路」条目中 `prebuild` 钩子表述改为任务图表述：

```markdown
- **构建编排（turbo 任务图）**：跨包构建顺序由 `turbo.json` 的 `dependsOn: ["^build"]` 从 workspace 依赖图推导；pre 钩子已全量移除；所有编排入口走 `turbo run <task> [--filter=X]`（根脚本已封装），裸 `pnpm --filter X run <script>` 为非入口专家操作、不保证链路；包内前置（如 `prisma generate`）嵌脚本原子；Docker 容器以 `pnpm --filter X... run build` 原生拓扑兜底（决策见 ADR-005）。
```

「桌面端链路」条目改写：`prebuild` 编排表述替换为「上游产物（pure-web dist）由 turbo 任务图 `^build` 编排；`build` / `build:dir` 任务 `cache: false`」。

- [ ] **Step 4: `docs/engineering/build-and-verify.md` 更新**

- frontmatter `last_verified` 改为当日；`covers` 追加 `turbo.json`；
- 「质量门禁」第 1 条改写：`pnpm check` 按序执行 Prettier 检查 → `turbo run typecheck / lint / stylelint / test` → test 覆盖枚举，纯校验不改写文件；
- 删除「注意 pnpm 生命周期钩子按精确脚本名匹配变体…」整段（钩子已退役），替换为：「历史教训（pre hook 时代）：生命周期钩子按精确脚本名匹配变体；迁移到任务图后，变体（`build:dir` / `build:staging` / `build:mp-weixin`）在 `turbo.json` 显式声明，新增变体必须同步入图。」；
- 「各端构建链」表：electron 行改为「turbo 图 `^build`（上游 pure-web）→ esbuild → electron-builder」；contracts 行改为「消费方由任务图 `^build` 前置构建防陈旧产物参检」；
- 「Lint / 格式化职责分离」补一句：「门禁 lint 纯校验（无 --fix）；提交期修复由 lint-staged（eslint/stylelint --fix + prettier --write）独占（应用侧；packages/ 无样式文件不受影响）。」；
- 「Docker」第一条补：「构建命令用 `--filter X...`（含依赖子图拓扑），与本地任务图同源」；
- 「nestjs-server e2e 测试」前置命令改为：`turbo run test:e2e --filter=@multi-admin/nestjs-server`（库前置不变）；
- 「合并覆盖率」命令改为：`turbo run test:coverage --filter=@multi-admin/nestjs-server`。

- [ ] **Step 5: 架构事实源三处改写**

`docs/architecture/repo-structure.md`：
- mermaid 边 `desktop -- "prebuild 钩子触发 pure-web build" --> web` 改为 `desktop -- "任务图 ^build 编排 pure-web 产物" --> web`；
- 要点首条改为：「**桌面端构建编排由 `turbo.json` 任务图承担**：`build` / `build:dir` 经 `^build` 先构建 pure-web，任何入口（根命令 / `--filter`）均自动编排（决策见 ADR-005）。」

`docs/architecture/contracts.md`：
- 「消费方一律 `workspace:*` 引用；双端 `pretypecheck` / `pretest` 先构建 contracts，防陈旧产物参检。」改为「消费方一律 `workspace:*` 引用；消费方的 typecheck / test / build 任务经 `turbo.json` 的 `^build` 先构建 contracts，防陈旧产物参检（决策见 ADR-005）。」

`docs/architecture/desktop-app.md`：
- 构建链代码块改为：

```text
pnpm build:desktop
→ turbo run build --filter=@multi-admin/electron-desktop   # 任务图 ^build 先构建 pure-web 产物
  → esbuild.config.mjs                                       # 编译主进程/preload
  → electron-builder（--dir 可跳过安装包制作，仅产出目录）
```

（同文档其他提及 `prebuild` 钩子的表述同步改为任务图表述；`last_verified` 更新。）

- [ ] **Step 6: backlog 关闭两行**

`docs/governance/backlog.md`：
- 「electron-desktop prebuild 构建链」行尾追加：`（已关闭，<当日日期>，turbo 任务图取代钩子编排，ADR-005）`；
- 「contracts 包缺 lint / format 脚本」行尾追加：`（已关闭，<当日日期>，补齐 lint / format 脚本与 eslint 薄壳，turbo 迁移任务）`；
- frontmatter `last_verified` 更新。

- [ ] **Step 7: Commit**

消息：`docs(repo): ADR-005 构建编排选型 + 架构/工程文档同步任务图模型 + 关闭两条 backlog`
文件：本任务全部文档。

---

### Task 6: 黄金路径验收（设计 §9）

无代码改动；逐项执行并记录结果，全部通过后本任务方可收口。

- [ ] **Step 1: 清理产物目录（模拟干净仓库）**

```powershell
Remove-Item -Recurse -Force apps/pure-web/dist, apps/nestjs-server/dist, apps/nestjs-server/src/generated, apps/uni-mobile/dist, apps/electron-desktop/dist-electron, apps/electron-desktop/release, packages/contracts/dist, packages/common/dist -ErrorAction SilentlyContinue
```

- [ ] **Step 2: 验收 #2/#4 构建与缓存**

Run: `pnpm build` → 全绿；顺序确认（日志中 contracts 先于 pure-web / nestjs-server，pure-web 先于 electron）。
Run: `pnpm build`（第二次）→ turbo 输出 FULL TURBO / 缓存命中。
改 `packages/contracts/src` 任一文件加一个空行再还原前：先确认下游任务重跑（`pnpm build` 后看 contracts 与 pure-web / nestjs-server 均重跑而非命中），然后 `git checkout` 还原。

- [ ] **Step 3: 验收 #3 桌面端安装包**

Run: `pnpm build:desktop`
Expected: 不断链，`release/` 产出安装包（若 Windows 打包环境异常，参照 build-and-verify「已知环境事实」处理并重跑）。

- [ ] **Step 4: 验收 #5 dev 链路**

依次（每个验证后终止进程）：`pnpm dev:server`（观察 prisma generate + nest 启动）、`pnpm dev:web`、`pnpm dev:mobile`、`pnpm dev`（整体并行）、`pnpm dev:desktop`（交互式）。

- [ ] **Step 5: 验收 #6/#7/#8 门禁与钩子清零**

Run: `git status --porcelain` → 记录；`pnpm check` → 全绿、含 stylelint 阶段与 test 覆盖枚举；再次 `git status --porcelain` → 与记录一致（无文件被改写）。
钩子检索零残留（Task 3 Step 11 已验，此处复核）。

- [ ] **Step 6: 验收 #10 单入口干净链路**

（保持产物已清理状态，或重新执行 Step 1 后）Run: `pnpm build:web`；`pnpm exec turbo run build:staging --filter=@multi-admin/pure-web`；`pnpm exec turbo run build:mp-weixin --filter=@multi-admin/uni-mobile`
Expected: 均不断链。

- [ ] **Step 7: 收尾同步**

- 更新记忆：修订「prebuild 钩子编排实践」等过时记忆（标注被任务图取代）；
- `docs/tasks/README.md` 暂不移动（任务未归档；收口归档时按治理流程执行）。

---

## 验收映射（设计 §9 → 本计划）

| 验收 # | 落点 |
| --- | --- |
| #1 冒烟 | Task 1 Step 7 |
| #2/#4 干净构建 + 缓存 | Task 6 Step 2 |
| #3 build:desktop | Task 6 Step 3 |
| #5 dev 链路 | Task 6 Step 4 |
| #6/#7 门禁纯校验 + 覆盖枚举 | Task 3 Step 11 + Task 6 Step 5 |
| #8 钩子零残留 | Task 3 Step 11 + Task 6 Step 5 |
| #9 Docker | Task 4 Step 3（可降级） |
| #10 单入口链路 | Task 6 Step 6 |
