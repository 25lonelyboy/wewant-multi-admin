# GitHub CI 落地实施计划（异步安全网）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 approved 设计（同目录 `2026-08-23-github-cicd-design.md` / `2026-08-23-github-cicd-roadmap.md`）落地 GitHub Actions CI：push master 触发、四 job 并行、报警式不拦截、CD 不发布。

**Architecture:** 薄封装复用既有资产——`pnpm check` 为质量门入口，Dockerfile×2 做构建验证（ARG 参数化镜像源 + production-stage 缓存清理），`test:coverage` 配 GH Actions services 做覆盖率门禁，`pnpm audit` 免安装扫描。业务代码零改动，Dockerfile 仅构建期配置优化。

**Tech Stack:** GitHub Actions（actions/checkout@v4、pnpm/action-setup@v4、actions/setup-node@v4、docker/setup-buildx-action@v3、docker/build-push-action@v6）、pnpm 11.18.0（packageManager 字段）、turbo、Docker。

**前置事实（执行者必读）：**
- 默认分支 **master**；仓库 public；提交走 conventional commits + scope 白名单（`repo` / `docs` 可用，见 `commitlint.config.mjs`）。
- 工作流仅 `push: master` + `workflow_dispatch` 触发——**本地无法预跑 workflow，首跑验证必须推送到远端**；推送动作由用户执行（计划中标注）。
- `pnpm check` 是既有根入口（`scripts/check.mjs`），任何情况下**不要修改**它来适配 CI。
- ADR 格式参照 `docs/decisions/ADR-005-turbo-build-orchestration.md`（frontmatter: status/date；章节：背景/决策/被否决的替代方案/影响）。

---

### Task 0: 设计工件入库（前置，必须先于 Task 1）

**Files:**
- Commit: `docs/tasks/2026-08-23-github-cicd/`（2026-08-23-github-cicd-design.md / ...-roadmap.md / ...-evolution.dot / 本计划）
- Modify: `docs/tasks/README.md`（热索引登记进行中任务）

- [ ] **Step 1: 登记热索引（治理规则：新文档必须登记目录 README）**

`docs/tasks/README.md`「进行中」表将「| （暂无） | — |」行替换为：

```markdown
| [GitHub CI 落地（异步安全网）](./) | 设计/路线图/实施计划见任务目录；决策收口为 ADR-006 |
```

- [ ] **Step 2: 校验并提交设计工件**

Run: `pnpm exec prettier --check docs/tasks/2026-08-23-github-cicd/`（若报差异先 `--write` 再重跑）
随后：

```bash
git add docs/tasks/2026-08-23-github-cicd/ docs/tasks/README.md
git commit -m "docs(repo): GitHub CI 演进设计与实施计划工件"
```

说明：此时 `.github/workflows/` 尚不存在，本提交不会触发任何 CI，时序安全；提交后 Task 1 Step 1 的「工作区干净」前提才成立。

---

### Task 1: S0 本地冒烟（切片 S0，不产生提交）

**Files:** 无（纯验证）

- [ ] **Step 1: 确认工作区干净且依赖最新**

Run: `git status --short && pnpm install --frozen-lockfile`
Expected: git status 无未提交改动（有则先与用户确认处置）；install 成功，无 lockfile 变更。

- [ ] **Step 2: 本地全量门禁**

Run: `pnpm check`
Expected: 依次通过 prettier → typecheck → lint → stylelint → test，末行输出 `✔ 全量校验通过`。失败则停止，先修本地问题。

- [ ] **Step 3: 双镜像构建冒烟**

Run（仓库根，两条依次执行，每条预计 5~15 分钟，`tee` 顺带捕获日志供 Step 4 审计。注：`tee`/`grep` 需 bash 环境，Git Bash 或 WSL）:
```bash
docker build -f apps/pure-web/Dockerfile -t multi-admin-web:smoke . 2>&1 | tee web-build.log
docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server:smoke . 2>&1 | tee server-build.log
```
Expected: 两条均以 `Successfully built / exporting to image` 结束、退出码 0。失败则按报错修复（此步就是为把问题挡在 runner 外），修复后重跑。

- [ ] **Step 4: 镜像依赖审计（排查无关依赖污染）**

目的：monorepo 的 `--filter X...` 会拉入该包的全部传递依赖，可能包含与目标应用无关的包（如 nestjs-server 镜像中混入 dcloud/uniapp、electron 相关依赖）。此步从构建日志中提取实际安装的包清单并审计。

Run（直接分析 Step 3 已捕获的日志，无需重新构建）：
```bash
# nestjs-server：从安装日志中提取实际安装的包名
grep -E "^\+ " server-build.log | sort > server-deps-installed.txt
# 排查与 nestjs-server 运行时无关的包域：
grep -iE "dcloud|uniapp|uni-|electron|@electron|desktop|@dcloudio" server-deps-installed.txt
```

对 pure-web 同理：
```bash
grep -E "^\+ " web-build.log | sort > web-deps-installed.txt
grep -iE "dcloud|uniapp|uni-|electron|@electron|desktop|@dcloudio|@nestjs|prisma|argon2" web-deps-installed.txt
```

Expected:
- **理想**：grep 无输出 = 无跨域污染依赖。
- **发现问题**：如果 grep 命中（如 nestjs-server 中安装了 `@dcloudio/uni-mp-weixin`、`@electron/remote` 等），**立即中断，不进入 Step 5**，通知用户讨论优化方案。

发现无关依赖时的优化建议（供讨论参考）：
1. **`--filter` 精度不足**：`--filter @multi-admin/nestjs-server...` 的 `...` 会拉入全部 workspace 上游依赖（`internal/*`、`packages/common`）。如果上游包引入了桌面端依赖，需要检查 `internal/` 和 `packages/` 的 `package.json` 是否有跨域引用。
2. **依赖提升泄漏**：pnpm 虚拟 store 中 `node_modules` 的符号链接可能让无关包变得可解析。考虑在 production-stage 的 `pnpm install` 追加 `--no-optional` 或显式排除特定 workspace 包。
3. **构建期 vs 运行期差异**：build-stage 的 `--filter X...` 安装全量（含 devDeps）用于编译，production-stage 的 `--filter X --prod` 只安装 production deps。如果可疑包出现在 build-stage 但不在 production-stage，则不影响最终镜像体积，但仍需确认是否拖慢构建。

- [ ] **Step 5: web 镜像本地冒烟（预演 CI 冒烟逻辑）**

Run:
```bash
docker rm -f web-smoke
docker run -d --name web-smoke -p 8848:80 multi-admin-web:smoke
timeout /t 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:8848
docker rm -f web-smoke
```
Expected: 首行清理残留同名容器（无残留时报错可忽略）；curl 输出 `200`。非 200 则检查 `apps/pure-web/nginx.conf` 与构建产物后重跑。

---

### Task 2: ADR-006 先行（切片 S1-pre）

**Files:**
- Create: `docs/decisions/ADR-006-github-ci.md`

- [ ] **Step 1: 写入 ADR-006 全文**（frontmatter 的 `date` 以实际实施日为准，下方模板值为起草日）

```markdown
---
status: accepted
date: 2026-08-24
---

# ADR-006 GitHub CI：入库后异步安全网

## 背景

仓库质量门禁原只有本地两层（`pnpm check` + husky 钩子，见 `docs/engineering/build-and-verify.md`）。单人工作流为直推 master / branch+worktree 本地合并，不走 GitHub PR，导致：

1. 「直接修改后直推」场景可完全绕过本地钩子（`--no-verify` 或遗忘），无服务端兜底。
2. Windows 本地与 Linux 生产镜像链的环境差异（换行符、原生依赖、Dockerfile 腐化）无持续验证手段。
3. 两个 Dockerfile 的构建链正确性只在本地偶发验证，腐化静默发生。

## 决策

接入 GitHub Actions CI，定位为**入库后异步安全网**（报警式，不拦截）：

1. **触发**：仅 `push: branches: [master]` + `workflow_dispatch`；无 `pull_request` 触发、不设分支保护（对直推无效且明确不要卡点）、不设 concurrency 组（每次 push 都应被验证，取消旧跑制造验证空洞）、不用 paths filter（public 免费、逻辑简单、避免未来引入分支保护时的跳过死锁）。
2. **Job 拓扑**：四 job 全并行、无 `needs` 依赖（public 仓库分钟数无限，反馈延迟是唯一成本）：
   - `gate`：`pnpm install --frozen-lockfile` + `pnpm check`（本地/服务端口径结构性一致）；
   - `docker-build`：buildx 构建两镜像，**不 push 任何 registry**（CD 不发布），web 镜像加启动冒烟；
   - `coverage`：GH Actions services（postgres:15 + redis:7）+ `test:coverage`，≥80% 四指标为报警式硬门槛；
   - `audit`：`pnpm audit --audit-level=high`，免 install，`continue-on-error` 报警式。
3. **全局 `HUSKY: '0'`**：声明式跳过钩子安装，不依赖 husky 在 CI 下的行为假设。
4. **audit 两段式**：v1 报警（上游不可行动漏洞不造成红疲劳），噪音基线复盘后再决定是否收紧为失败级。
5. **失败感知配套**：根 README CI badge + watch 邮件 + 纪律条款「CI 红 → 下一项工作先修 CI」（写入 build-and-verify.md）。

## 被否决的替代方案

| 方案 | 否决理由 |
|---|---|
| 合并前门禁（PR 触发 + 分支保护） | 与直推/本地合并工作流不匹配；分支保护对直推无效 |
| gate 先行、docker 串行 `needs` | public 免费场景下串行只增加反馈延迟；配额紧张时再议（可逆） |
| runner 内 `docker compose up` 跑 e2e | services 是一等公民（健康检查/端口映射），与 `test/setup-env.ts` 默认值零改动对齐 |
| CI 内重新拼装 lint/test 命令 | 与本地 `pnpm check` 入口分叉，产生口径漂移面 |
| audit 直接失败级 | 上游未修复漏洞导致不可行动的红，击穿「红了必看」纪律 |

## 影响

- 新增 `.github/workflows/ci.yml`；工程代码零改动（check.mjs / turbo.json / Dockerfile / lockfile 原样复用）。
- `docs/engineering/build-and-verify.md` 门禁章节改写为双层（本地实时 + CI 异步兜底）+ 纪律条款。
- 治理 backlog 两项关闭：「CI/CD 落地」「依赖漏洞扫描」。
- 未来演进留口：推镜像发布仅需在 docker-build 加 push 步骤 + GHCR `GITHUB_TOKEN`；引入协作时门禁现成可升级为合并前拦截。
```

- [ ] **Step 2: 校验格式**

Run: `pnpm exec prettier --check docs/decisions/ADR-006-github-ci.md`
Expected: 输出 All matched files use Prettier code style（若报格式差异，执行 `pnpm exec prettier --write docs/decisions/ADR-006-github-ci.md` 后重跑）。

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/ADR-006-github-ci.md
git commit -m "docs(repo): ADR-006 GitHub CI 异步安全网决策"
```

---

### Task 3: CI v1 workflow（切片 S1）

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 写入 workflow 全文**

```yaml
# GitHub CI：入库后异步安全网（决策见 docs/decisions/ADR-006-github-ci.md）
# 报警式不拦截：仅 push master + 手动触发；无分支保护；四 job 全并行。
name: CI

on:
  push:
    branches: [master]
  workflow_dispatch:

env:
  HUSKY: '0'

jobs:
  gate:
    name: gate（pnpm check 全量门禁）
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check

  docker-build:
    name: docker-build（构建验证，不 push）
    runs-on: ubuntu-latest
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - name: 构建 pure-web 镜像
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/pure-web/Dockerfile
          push: false
          load: true
          tags: multi-admin-web:ci
          build-args: |
            PNPM_REGISTRY=https://registry.npmjs.org
            COREPACK_NPM_REGISTRY=https://registry.npmjs.org
      - name: 构建 nestjs-server 镜像
        uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/nestjs-server/Dockerfile
          push: false
          load: true
          tags: multi-admin-server:ci
          build-args: |
            PNPM_REGISTRY=https://registry.npmjs.org
            COREPACK_NPM_REGISTRY=https://registry.npmjs.org
            PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
      - name: web 镜像启动冒烟（重试循环，容忍冷启动延迟）
        run: |
          docker run -d --name web-smoke -p 8848:80 multi-admin-web:ci
          code=000
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8848) || true
            [ "$code" = "200" ] && break
            sleep 2
          done
          docker logs web-smoke
          docker rm -f web-smoke
          test "$code" = "200"

  audit:
    name: audit（报警式，不红）
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - name: pnpm audit（只解析 lockfile，免 install）
        run: pnpm audit --audit-level=high
        continue-on-error: true
```

- [ ] **Step 2: 本地校验（格式 + YAML 语法）**

Run: `pnpm exec prettier --check .github/workflows/ci.yml`
Expected: 通过。若报差异先 `--write` 再重跑（prettier 解析失败会直接报 YAML 语法错误，兼作语法校验）。

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(repo): GitHub Actions CI v1（gate + docker-build + audit 并行）"
```

- [ ] **Step 4: 首跑验证（需用户推送到 master）**

用户执行 `git push origin master`（或随后续提交推送）。到 `https://github.com/25lonelyboy/wewant-multi-admin/actions` 观察：
Expected: 三 job 并行；`gate` 绿；`docker-build` 绿（两镜像产出、冒烟 200）；`audit` 绿（有漏洞时 step 黄/红但 job 绿）。
失败处置：
- `gate` 失败多为环境差异（对照本地 `pnpm check` 输出定位）；注意安装阶段会下载 electron Linux 二进制（约 100MB，走 GitHub Releases）与触发原生依赖构建脚本（argon2 等走预编译包），首跑耗时包含这段，勿误判为卡死。
- `docker-build` 失败优先看 buildx/Docker Hub 连通性（Dockerfile ARG 已默认国内源，CI 通过 `build-args` 覆盖为官方源，registry 不是问题点）。
- `audit` step 若报「需要安装上下文」类错误（pnpm audit 直读 lockfile 行为异常），降级为该 job 内先 `pnpm install --frozen-lockfile` 再 audit。

**修复闭环前不进入 Task 4。**

---

### Task 4: coverage job 并入（切片 S2）

**Files:**
- Modify: `.github/workflows/ci.yml`（jobs 段追加一个 job，不动既有三个）

- [ ] **Step 1: 在 ci.yml 的 jobs 段末尾（`audit` job 之后）追加**

```yaml
  coverage:
    name: coverage（≥80% 报警式硬门槛）
    runs-on: ubuntu-latest
    timeout-minutes: 40
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec turbo run test:coverage --filter=@multi-admin/nestjs-server
```

零配置改动依据：`test/setup-env.ts` 默认值（`postgres:postgres@localhost:5432`、`redis://localhost:6379`）与上述 services 完全对齐；`test/global-setup.ts` 幂等建库 `multi_admin_test`。

- [ ] **Step 2: 本地校验**

Run: `pnpm exec prettier --check .github/workflows/ci.yml`
Expected: 通过。

- [ ] **Step 3: 本地前置验证（可选但推荐）**

Run: `docker compose up -d postgres redis && pnpm exec turbo run test:coverage --filter=@multi-admin/nestjs-server`
Expected: 合并报表四指标 ≥80%，退出码 0。跑完 `docker compose down`。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(repo): coverage job 并入（services + test:coverage ≥80% 报警式门禁）"
```

- [ ] **Step 5: 推送验证（用户执行）**

用户推送后观察 Actions：`coverage` job 应走完 services 健康检查 → migrate deploy → seed → 单测+e2e → 合并报表 ≥80%。
失败处置：services 未就绪看 `options` healthcheck 日志；用例失败与本地 `test:coverage` 输出对照。**绿后进入 Task 5。**

---

### Task 5: 收尾——感知窗口与文档同步（切片 S3）

**Files:**
- Modify: `README.md`（头部追加 badge）
- Modify: `docs/engineering/build-and-verify.md`（门禁章节改写 + frontmatter）
- Modify: `AGENTS.md`（「无 CI/CD」条目改写）
- Modify: `docs/governance/backlog.md`（两项关闭标注）

- [ ] **Step 1: README.md 头部追加 badge**

在 `# wewant-multi-admin` 标题行之后、简介段落之前插入空行 + ：

```markdown
![CI](https://github.com/25lonelyboy/wewant-multi-admin/actions/workflows/ci.yml/badge.svg)
```

- [ ] **Step 2: build-and-verify.md 改写**

2a. frontmatter 的 `covers` 列表首行插入 `  - .github/workflows/ci.yml`，`last_verified` 改为当天日期。

2b. 将「## 质量门禁（无 CI 的替代）」整节（含两层机制描述）替换为：

```markdown
## 质量门禁（本地实时 + CI 异步兜底双层）

提交质量由两层机制保证，职责分离：

1. **实时拦截（本地，每次 commit）**：
   - **`pnpm check`**（`scripts/check.mjs`）：按序执行 Prettier 全量检查 → `turbo run typecheck / lint / stylelint / test` → test 覆盖显式枚举，任一失败立即非零退出。纯校验不改文件。提交前必跑。
   - **husky 钩子**：`pre-commit` 跑 lint-staged（配置在 `.lintstagedrc.json`，只处理暂存文件）；`commit-msg` 跑 commitlint（scope 强制 + 白名单，见 `commitlint.config.mjs`）。
2. **异步兜底（入库后，每次 push master）**：`.github/workflows/ci.yml` 四 job 并行——`gate`（frozen-lockfile 安装 + `pnpm check` 服务端重验）、`docker-build`（双镜像构建验证 + web 启动冒烟，不 push）、`coverage`（services 上 `test:coverage` ≥80% 报警式硬门槛）、`audit`（`pnpm audit --audit-level=high` 报警式）。定位与取舍见 `docs/decisions/ADR-006-github-ci.md`。
3. **纪律条款**：报警式不拦截的代价是红了必须有人看——**CI 红 → 下一项工作先修 CI**；感知窗口为根 README badge 与 GitHub watch 通知。
```

- [ ] **Step 3: AGENTS.md 改写**

将「- **无 CI/CD**：质量门禁只有本地 `pnpm check` + husky 钩子（pre-commit 跑 lint-staged，commit-msg 跑 commitlint）。」替换为：

```markdown
- **质量门禁双层**：本地实时（`pnpm check` + husky 钩子）+ GitHub CI 异步兜底（`.github/workflows/ci.yml`，仅 push master 触发，四 job 并行报警式不拦截，决策见 `docs/decisions/ADR-006-github-ci.md`）。
```

- [ ] **Step 4: backlog.md 关闭两项**

4a. 「CI/CD 落地」行改为（行尾追加关闭标注）：

```
| CI/CD 落地 | 质量门禁仅本地 `pnpm check` + husky，无自动化构建/扫描/镜像发布；AGENTS.md 明示无 CI 现状；触发：用户决策引入 CI 基础设施（已关闭，2026-08-24，实现形态为 `.github/workflows/ci.yml` 四 job 异步安全网，ADR-006） |
```

4b. 「依赖漏洞扫描」行改为：

```
| 依赖漏洞扫描 | `pnpm check` 门禁无 audit 环节，供应链风险无感知；触发：生产部署前或 CI 落地时（已关闭，2026-08-24，实现形态为 CI `audit` job：`pnpm audit --audit-level=high` 报警式，收紧复盘见 S3 记录） |
```

- [ ] **Step 5: 全量校验**

Run: `pnpm check`
Expected: 全绿（prettier 会校验上述 markdown 改动）。失败则 `pnpm exec prettier --write <对应文件>` 后重跑。

- [ ] **Step 6: Commit**

```bash
git add README.md docs/engineering/build-and-verify.md AGENTS.md docs/governance/backlog.md
git commit -m "docs(repo): CI 落地收尾（README badge + 门禁双层文档同步 + backlog 关项）"
```

- [ ] **Step 7: 推送验证（用户执行）**

用户推送后确认：badge 显示绿色；四 job 全绿（或 audit 报警但 job 绿）。

---

### Task 6: S3 复盘项登记（不阻塞收尾）

**Files:** 无（记录性质，写入本计划尾部即可）

- [ ] **Step 1: 记录两项待复盘事项**

在首跑稳定一周后由用户择机处理（无需代码改动）：
1. **audit 噪音基线**：查看 Actions 中 audit step 输出，统计 high/critical 数量与可行动性；若噪音可控（≤3 项且可行动），移除 `continue-on-error` 收紧为失败级。
2. **docker 构建时长**：若 `docker-build` job 常态 >20 分钟成为反馈痛点，为两个 `docker/build-push-action` 追加 `cache-from: type=gha` / `cache-to: type=gha,mode=max`（注：BuildKit `--mount=type=cache` 跨 run 不生效，必须用 `type=gha`）。
3. **Dockerfile ARG 参数化评估**：两个 Dockerfile 已将镜像源参数化（ARG 默认国内源、CI `build-args` 覆盖官方源），首跑后确认 `PRISMA_ENGINES_MIRROR` 在 CI 生效、engines 下载走 `binaries.prisma.sh` 而非 npmmirror。
4. **镜像瘦身验证**：production-stage 安装后已清理 pnpm 缓存（`/root/.cache` + store），首跑后确认 nestjs-server 镜像 ~571MB（原 ~1.18GB）；后续可评估 Prisma 7.x 捆绑依赖（`@prisma/studio-core` 42MB、`pglite` 23MB、`typescript` 23MB）是否可通过 Prisma 配置裁剪。
5. **镜像依赖审计结论（2026-08-25 已确认）**：本地 docker build 日志中 `@dcloudio/*` 和 `@prisma/*` 的 WARN 消息是 pnpm `--frozen-lockfile` 供应链策略验证阶段的 registry 元数据 HTTP 请求（扫描全量 lockfile 2220 条目），**不是实际安装**。`--filter X...` 严格控制安装范围：nestjs-server build-stage 1115 包 / production-stage 331 包，pure-web build-stage 877 包 / production-stage 零安装（仅 COPY dist）。审计脚本 `grep -E "^\+ "` 对 pnpm 无效（npm 专属格式），如需更精确审计应改为 `docker run --rm <image> ls /repo/node_modules/.pnpm`。结论：无跨域依赖污染，Dockerfile 无需修改。

---

## 自审记录（writing-plans self-review）

1. **Spec 覆盖**：S0→S3 全部切片有对应 Task（S0=Task1、S1-pre=Task2、S1=Task3、S2=Task4、S3=Task5+6）；E1:B/E2:B/E3:B/E4:B/E5 全部落位（coverage 在 Task4、web 冒烟在 Task3、audit 在 Task3、仅 push master 触发在 Task3）。
2. **占位符**：无；所有代码块为完整可粘贴内容。
3. **一致性**：job 名（gate/docker-build/audit/coverage）、镜像 tag（`*:ci`）、命令（`pnpm check` / `test:coverage`）与三份设计工件逐一核对一致。
4. **已知修正**：根 `README.md` 已存在，badge 为「追加」而非「新建」（设计工件已同步修正）。
5. **审查修订（2026-08-24）**：① 新增 Task 0（设计工件先入库，修复 Task 1 「工作区干净」前提矛盾）；② Task 1 Step 4 前置清理残留容器；③ CI 冒烟改 5 次重试循环；④ Task 3 失败处置补 electron 二进制下载说明与 audit 降级方案；⑤ ADR date 标注以实施日为准。
6. **命名对齐治理规范（2026-08-24）**：任务目录与四份工件按 `docs/README.md` 命名规则（任务目录/过程文件日期前缀）重命名为 `2026-08-23-github-cicd/` + `*-design/-roadmap/-plan/-evolution` 系列；Task 0 补 `docs/tasks/README.md` 热索引登记步骤。
7. **Dockerfile 镜像源参数化（2026-08-24）**：两个 Dockerfile 硬编码的 `registry.npmmirror.com` 改为 `ARG` 参数化（默认国内源），新增 `PRISMA_ENGINES_MIRROR` ARG；ci.yml `build-args` 覆盖为官方源（`registry.npmjs.org` + `binaries.prisma.sh`）；docker-compose.yml 无需改动（直接用 ARG 默认值）。
8. **镜像瘦身 + 文档同步（2026-08-24）**：① nestjs-server production-stage 安装后追加 `rm -rf /root/.cache /root/.local/share/pnpm/store /tmp`（镜像从 ~1.18GB 降至 ~571MB，节省 ~606MB）；② 设计文档同步更新：registry 策略标「已落地」、风险表更新、影响面从「零改动」修正为「业务代码零改动 + Dockerfile 构建期优化」；③ 计划 Architecture 段同步 Dockerfile 优化说明。
9. **镜像依赖审计步骤（2026-08-24）**：Task 1 新增 Step 4（镜像依赖审计），在双镜像构建后从日志中 grep 无关包域（dcloud/uniapp/electron 等）；Step 3 加 `tee` 捕获日志；原 Step 4（web 冒烟）顺延为 Step 5。发现跨域污染依赖时中断流程通知用户讨论。

## 实施执行记录（2026-08-25）

| Task | 状态 | Commit | 备注 |
|------|------|--------|------|
| Task 0: 设计工件入库 | ✅ | `9e963e7` + `fabf3d7` | 前一会话完成 |
| Task 1: 本地冒烟 | ✅ | — | Step 1-2 通过（pnpm check 全绿）；Step 3-5 docker 构建由用户执行；Step 4 审计结论：WARN = lockfile 验证，非污染 |
| Task 2: ADR-006 | ✅ | `ac12a56` | frontmatter date=2026-08-25 |
| Task 3: CI v1 workflow | ✅ | `59629fb` | timeout-minutes: 60（docker-build，按 @prisma/engines 实测调优） |
| Task 4: coverage job | ✅ | `5dbc33b` | services: postgres:15-alpine + redis:7-alpine |
| Task 5: 文档同步 | ✅ | `2ca8c58` | README badge + build-and-verify 双层门禁 + AGENTS.md + backlog 关项 |
| Task 6: 复盘项 | ✅ | — | 5 项复盘事项已登记（含审计结论） |
