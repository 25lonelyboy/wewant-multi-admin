# ops 脚本自动化操作集实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 沉淀 7 个自动化脚本到 `scripts/ops/`，消除 push → CI → 诊断循环中的手动断点，人和 Agent 均可调用。

**Architecture:** 5 Shell + 2 ESM 分层。Shell 处理纯 CLI 编排（gh / docker / curl），ESM 处理有逻辑复用的场景（调用 node-utils 的 `runSync`）。所有脚本在 `package.json` 注册 `ops:*` 别名。

**Tech Stack:** Bash (`set -euo pipefail`)、Node.js ESM (`@multi-admin/node-utils`)、gh CLI v2.x、Docker Compose

**Design doc:** `docs/tasks/2026-08-25-ops-scripts/2026-08-25-ops-scripts-design.md`

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `scripts/ops/env-up.sh` | 新增 | 开发环境启动（postgres + redis + migrate + seed） |
| `scripts/ops/env-down.sh` | 新增 | 开发环境停止 |
| `scripts/ops/ci-status.sh` | 新增 | CI 结果拉取（gh CLI） |
| `scripts/ops/ci-logs.sh` | 新增 | CI 失败日志导出 |
| `scripts/ops/pre-push.mjs` | 新增 | push 前 CI 同构校验 |
| `scripts/ops/docker-smoke.sh` | 新增 | 本地 Docker 镜像冒烟 |
| `scripts/ops/coverage.mjs` | 新增 | 本地覆盖率一键跑 |
| `package.json` | 修改 | 添加 7 个 `ops:*` 脚本别名 |
| `docs/engineering/build-and-verify.md` | 修改 | 追加 ops 脚本使用章节 |

**无需修改 `.gitignore`**：已有 `**/*.log` + `**/*.log*` 覆盖 `.ci-failure-*.log`。

---

### Task 1: env-up.sh + env-down.sh — 开发环境启停

**Files:**
- Create: `scripts/ops/env-up.sh`
- Create: `scripts/ops/env-down.sh`

- [ ] **Step 1: 创建 scripts/ops/ 目录和 env-up.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# 开发环境一键启动：postgres + redis → 健康等待 → prisma migrate → seed
# 用法：bash scripts/ops/env-up.sh

echo "▶ 启动 postgres + redis..."
docker compose up -d postgres redis

echo "▶ 等待健康检查（最多 30s）..."
elapsed=0
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge 30 ]; then
    echo "✖ postgres 30s 内未就绪"
    exit 1
  fi
done
echo "  ✔ postgres 就绪"

until docker compose exec -T redis redis-cli ping >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge 30 ]; then
    echo "✖ redis 30s 内未就绪"
    exit 1
  fi
done
echo "  ✔ redis 就绪"

echo "▶ 执行 prisma migrate deploy..."
pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy

echo "▶ 执行 prisma db seed..."
pnpm --filter @multi-admin/nestjs-server exec prisma db seed

echo ""
echo "✔ 开发环境就绪"
echo "  postgres: localhost:5432 (multi_admin)"
echo "  redis:    localhost:6379"
```

- [ ] **Step 2: 创建 env-down.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# 开发环境停止：停止 postgres + redis（保留数据）
# --clean：清除数据卷
# 用法：bash scripts/ops/env-down.sh [--clean]

if [ "${1:-}" = "--clean" ]; then
  echo "▶ 停止全部 compose 服务并清除数据卷..."
  docker compose down -v
  echo "✔ 已停止并清除 postgres + redis 数据卷"
else
  echo "▶ 停止 postgres + redis（数据保留）..."
  docker compose stop postgres redis
  echo "✔ 已停止（数据保留）。如需清除数据：bash scripts/ops/env-down.sh --clean"
fi
```

- [ ] **Step 3: 验证 env-up.sh 可执行**

Run:
```bash
bash scripts/ops/env-up.sh
```
Expected: postgres 和 redis 容器启动，健康检查通过，prisma migrate deploy + seed 执行成功。

- [ ] **Step 4: 验证 env-down.sh 可执行**

Run:
```bash
bash scripts/ops/env-down.sh
```
Expected: 容器停止但数据保留。

Run:
```bash
bash scripts/ops/env-down.sh --clean
```
Expected: 容器停止且数据卷清除。

- [ ] **Step 5: Commit**

```bash
git add scripts/ops/env-up.sh scripts/ops/env-down.sh
git commit -m "feat(repo): 新增 scripts/ops 开发环境启停脚本"
```

---

### Task 2: ci-status.sh — CI 结果拉取

**Files:**
- Create: `scripts/ops/ci-status.sh`

- [ ] **Step 1: 创建 ci-status.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# CI 结果拉取：获取最新 CI 运行状态，失败时自动打印日志
# 用法：bash scripts/ops/ci-status.sh [run_id]

# 前置：检查 gh 认证
if ! gh auth status >/dev/null 2>&1; then
  echo "✖ gh 未认证。请先运行：gh auth login"
  exit 1
fi

if [ -n "${1:-}" ]; then
  # 指定 run_id
  run_id="$1"
  echo "▶ 查看 CI run #${run_id}..."
  echo ""
  gh run view "$run_id" --json jobs --jq '
    .jobs[] | "  \(.name)  \(.status)  \(.conclusion // "-")  \(.startedAt)"
  '

  # 检查是否有失败 job
  failed=$(gh run view "$run_id" --json jobs --jq '[.jobs[] | select(.conclusion == "failure")] | length')
  if [ "$failed" -gt 0 ]; then
    echo ""
    echo "▶ 失败 job 日志（最后 50 行）："
    gh run view "$run_id" --log-failed 2>/dev/null | tail -50 || true
  fi
else
  # 默认：最近 5 次
  echo "▶ 最近 CI 运行："
  echo ""
  gh run list --workflow=CI --limit=5 --json databaseId,status,conclusion,createdAt,headBranch --jq '
    .[] | "  #\(.databaseId)  \(.status)  \(.conclusion // "-")  \(.headBranch)  \(.createdAt)"
  '

  # 取最新一次 run，检查是否有失败
  conclusion=$(gh run list --workflow=CI --limit=1 --json conclusion --jq '.[0].conclusion // empty')
  id=$(gh run list --workflow=CI --limit=1 --json databaseId --jq '.[0].databaseId')

  if [ "$conclusion" = "failure" ]; then
    echo ""
    echo "▶ 最新 run #${id} 有失败，拉取失败日志（最后 50 行）："
    gh run view "$id" --log-failed 2>/dev/null | tail -50 || true
  fi
fi
```

- [ ] **Step 2: 前置检查 gh 认证**

Run:
```bash
gh auth status
```
Expected: 如果未认证，需先执行 `gh auth login`（选 GitHub.com → HTTPS → Login with a web browser）。

- [ ] **Step 3: 验证 ci-status.sh 无参数模式**

Run:
```bash
bash scripts/ops/ci-status.sh
```
Expected: 输出最近 5 次 CI run 的表格，若最新 run 失败则自动打印失败日志。

- [ ] **Step 4: 验证 ci-status.sh 指定 run_id**

Run:
```bash
bash scripts/ops/ci-status.sh <run_id>
```
Expected: 输出指定 run 的 job 状态表格。

- [ ] **Step 5: Commit**

```bash
git add scripts/ops/ci-status.sh
git commit -m "feat(repo): 新增 ci-status.sh CI 结果拉取脚本"
```

---

### Task 3: ci-logs.sh — CI 失败日志导出

**Files:**
- Create: `scripts/ops/ci-logs.sh`

- [ ] **Step 1: 创建 ci-logs.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# CI 失败日志导出：导出失败 job 日志到本地文件，供 Agent 分析
# 用法：bash scripts/ops/ci-logs.sh [run_id]
# 产物：scripts/ops/.ci-failure-<run_id>.log

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 前置：检查 gh 认证
if ! gh auth status >/dev/null 2>&1; then
  echo "✖ gh 未认证。请先运行：gh auth login"
  exit 1
fi

if [ -n "${1:-}" ]; then
  run_id="$1"
else
  # 自动查找最新失败的 run
  echo "▶ 查找最新失败的 CI run..."
  run_id=$(gh run list --workflow=CI --limit=10 --json databaseId,conclusion \
    --jq '[.[] | select(.conclusion == "failure")][0].databaseId // empty')

  if [ -z "$run_id" ]; then
    echo "✔ 最近 10 次 CI run 均无失败"
    exit 0
  fi
  echo "  找到失败 run #${run_id}"
fi

output="${SCRIPT_DIR}/.ci-failure-${run_id}.log"

echo "▶ 导出失败日志到 ${output}..."
gh run view "$run_id" --log-failed > "$output" 2>/dev/null || {
  echo "✖ 无失败日志可导出（run #${run_id} 可能全部通过或 run 不存在）"
  rm -f "$output"
  exit 1
}

# 输出摘要
lines=$(wc -l < "$output" | tr -d ' ')

echo ""
echo "✔ 日志已导出"
echo "  文件：${output}"
echo "  行数：${lines}"
echo ""
echo "Agent 可直接读取该文件进行分析。"
```

- [ ] **Step 2: 验证 ci-logs.sh 自动模式**

Run:
```bash
bash scripts/ops/ci-logs.sh
```
Expected: 找到最近失败的 run 并导出日志到 `.ci-failure-<id>.log`。如果最近无失败，输出"均无失败"。

- [ ] **Step 3: 验证 ci-logs.sh 指定 run_id**

Run:
```bash
bash scripts/ops/ci-logs.sh 32861617099
```
Expected: 导出指定 run 的失败日志。

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/ci-logs.sh
git commit -m "feat(repo): 新增 ci-logs.sh CI 失败日志导出脚本"
```

---

### Task 4: pre-push.mjs — push 前 CI 同构校验

**Files:**
- Create: `scripts/ops/pre-push.mjs`

- [ ] **Step 1: 创建 pre-push.mjs**

```js
// push 前 CI 同构校验：模拟 CI gate job 环境，本地跑全量检查。
// 退出码：0 = 可安全 push，非 0 = 有问题。
// 用法：node scripts/ops/pre-push.mjs
import { runSync } from '@multi-admin/node-utils';

// CI 同构 env
process.env.HUSKY = '0';
process.env.DATABASE_URL =
  'postgresql://dummy:dummy@localhost:5432/dummy';

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
```

- [ ] **Step 2: 验证 pre-push.mjs 可执行**

Run:
```bash
node scripts/ops/pre-push.mjs
```
Expected: frozen-lockfile → prettier → typecheck → lint → stylelint → test → audit 按序执行。全部通过输出"可安全 push"。

- [ ] **Step 3: Commit**

```bash
git add scripts/ops/pre-push.mjs
git commit -m "feat(repo): 新增 pre-push.mjs CI 同构校验脚本"
```

---

### Task 5: docker-smoke.sh — 本地 Docker 冒烟

**Files:**
- Create: `scripts/ops/docker-smoke.sh`

- [ ] **Step 1: 创建 docker-smoke.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# 本地 Docker 镜像冒烟验证（与 CI docker-build job 同源）
# 用法：bash scripts/ops/docker-smoke.sh [--server]
# --server：额外构建 nestjs-server 镜像（不冒烟，仅验证构建）

echo "▶ 构建 pure-web 镜像（仓库根 context）..."
docker build \
  -f apps/pure-web/Dockerfile . \
  -t multi-admin-web:ci \
  --build-arg PNPM_REGISTRY=https://registry.npmjs.org \
  --build-arg COREPACK_NPM_REGISTRY=https://registry.npmjs.org

echo "▶ 启动 web 冒烟容器..."
docker rm -f web-smoke 2>/dev/null || true
docker run -d --name web-smoke -p 8848:80 multi-admin-web:ci

echo "▶ curl 重试循环（5 次，间隔 2s）..."
code="000"
for i in 1 2 3 4 5; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8848) || true
  if [ "$code" = "200" ]; then
    break
  fi
  echo "  尝试 ${i}/5：HTTP ${code}，等待 2s..."
  sleep 2
done

echo ""
echo "▶ 容器日志："
docker logs web-smoke

echo ""
echo "▶ 清理容器..."
docker rm -f web-smoke

if [ "$code" = "200" ]; then
  echo "✔ pure-web 冒烟通过（HTTP 200）"
else
  echo "✖ pure-web 冒烟失败（HTTP ${code}）"
  exit 1
fi

# --server：额外构建 nestjs-server 镜像
if [ "${1:-}" = "--server" ]; then
  echo ""
  echo "▶ 构建 nestjs-server 镜像..."
  docker build \
    -f apps/nestjs-server/Dockerfile . \
    -t multi-admin-server:ci \
    --build-arg PNPM_REGISTRY=https://registry.npmjs.org \
    --build-arg COREPACK_NPM_REGISTRY=https://registry.npmjs.org \
    --build-arg PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
  echo "✔ nestjs-server 镜像构建成功"
fi
```

- [ ] **Step 2: 验证 docker-smoke.sh 基础模式**

Run:
```bash
bash scripts/ops/docker-smoke.sh
```
Expected: 构建 pure-web 镜像 → 启动冒烟容器 → curl 200 → 清理。输出"冒烟通过"。

注意：首次构建耗时较长（pnpm install + vite build），后续 Docker layer cache 生效后会快很多。

- [ ] **Step 3: Commit**

```bash
git add scripts/ops/docker-smoke.sh
git commit -m "feat(repo): 新增 docker-smoke.sh 本地 Docker 冒烟脚本"
```

---

### Task 6: coverage.mjs — 本地覆盖率一键跑

**Files:**
- Create: `scripts/ops/coverage.mjs`

- [ ] **Step 1: 创建 coverage.mjs**

```js
// 本地覆盖率一键跑：启动 services → 跑 test:coverage → 清理
// 用法：node scripts/ops/coverage.mjs [--skip-env]
// --skip-env：跳过环境启停（适用于 services 已在运行的情况）
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSync } from '@multi-admin/node-utils';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skipEnv = process.argv.includes('--skip-env');

// 覆盖率对应的 env（与 test/setup-env.ts 默认值对齐）
process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';

try {
  if (!skipEnv) {
    console.log('▶ 启动开发环境...');
    execSync('bash scripts/ops/env-up.sh', { stdio: 'inherit' });
  }

  console.log('\n▶ 运行 test:coverage...');
  runSync('pnpm', [
    'exec',
    'turbo',
    'run',
    'test:coverage',
    '--filter=@multi-admin/nestjs-server'
  ]);

  // 输出覆盖率摘要
  const summaryPath = join(
    __dirname,
    '..',
    '..',
    'apps',
    'nestjs-server',
    'coverage-merged',
    'coverage-summary.json'
  );
  if (existsSync(summaryPath)) {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    const total = summary.total;
    console.log('\n▶ 覆盖率摘要：');
    console.log(`  Lines:      ${total.lines.pct}%`);
    console.log(`  Statements: ${total.statements.pct}%`);
    console.log(`  Functions:  ${total.functions.pct}%`);
    console.log(`  Branches:   ${total.branches.pct}%`);
  }
} finally {
  if (!skipEnv) {
    console.log('\n▶ 清理开发环境...');
    execSync('bash scripts/ops/env-down.sh', { stdio: 'inherit' });
  }
}

console.log('\n✔ 覆盖率跑取完成');
```

- [ ] **Step 2: 验证 coverage.mjs（需要 Docker Desktop 运行中）**

Run:
```bash
node scripts/ops/coverage.mjs
```
Expected: 自动启动 postgres + redis → 跑 test:coverage → 输出覆盖率摘要 → 自动清理环境。

- [ ] **Step 3: 验证 --skip-env 模式**

先手动启动 services：
```bash
bash scripts/ops/env-up.sh
```

然后：
```bash
node scripts/ops/coverage.mjs --skip-env
```
Expected: 跳过环境启停，直接跑 test:coverage。

- [ ] **Step 4: Commit**

```bash
git add scripts/ops/coverage.mjs
git commit -m "feat(repo): 新增 coverage.mjs 本地覆盖率一键跑脚本"
```

---

### Task 7: 收尾 — package.json 注册 + 文档同步

**Files:**
- Modify: `package.json:6-21`
- Modify: `docs/engineering/build-and-verify.md`

- [ ] **Step 1: 注册 ops 脚本别名到 package.json**

在 `package.json` 的 `scripts` 块追加 7 个 `ops:*` 别名：

```json
{
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
    "prepare": "husky",
    "ops:pre-push": "node scripts/ops/pre-push.mjs",
    "ops:ci": "bash scripts/ops/ci-status.sh",
    "ops:ci-logs": "bash scripts/ops/ci-logs.sh",
    "ops:env-up": "bash scripts/ops/env-up.sh",
    "ops:env-down": "bash scripts/ops/env-down.sh",
    "ops:smoke": "bash scripts/ops/docker-smoke.sh",
    "ops:coverage": "node scripts/ops/coverage.mjs"
  }
}
```

- [ ] **Step 2: 更新 docs/engineering/build-and-verify.md**

在 `## 已知环境事实` 之前，追加一节：

```markdown
## ops 自动化脚本（scripts/ops/）

本地高频操作沉淀为可复用脚本，人和 Agent 均可调用。ESM 脚本复用 `@multi-admin/node-utils`，Shell 脚本统一 `#!/usr/bin/env bash` + `set -euo pipefail`。

| 命令 | 脚本 | 职责 |
|---|---|---|
| `pnpm ops:pre-push` | `pre-push.mjs` | push 前 CI 同构校验：frozen-lockfile + check + audit |
| `pnpm ops:ci` | `ci-status.sh` | CI 结果拉取：最近 5 次 run 状态 + 失败自动打印日志 |
| `pnpm ops:ci-logs` | `ci-logs.sh` | CI 失败日志导出：`.ci-failure-<id>.log`（Agent 可读取分析） |
| `pnpm ops:env-up` | `env-up.sh` | 开发环境启动：postgres + redis + migrate + seed |
| `pnpm ops:env-down` | `env-down.sh` | 开发环境停止（`--clean` 清除数据卷） |
| `pnpm ops:smoke` | `docker-smoke.sh` | 本地 Docker 冒烟（`--server` 追加 nestjs-server 构建） |
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |

前置依赖：gh CLI（ci-status / ci-logs，需首次 `gh auth login`）、Docker Desktop（env-up / smoke / coverage）、Git Bash（shell 脚本执行）。
```

同时更新 frontmatter 的 `last_verified` 为当天日期。

- [ ] **Step 3: 验证 package.json 别名注册**

Run:
```bash
pnpm ops:env-down
```
Expected: 执行 env-down.sh 无报错（即使没有运行中的容器）。

- [ ] **Step 4: 验证文档一致性**

确认 `docs/engineering/build-and-verify.md` 中的 ops 表格与实际脚本一一对应。

- [ ] **Step 5: Commit**

```bash
git add package.json docs/engineering/build-and-verify.md
git commit -m "feat(repo): 注册 ops 脚本别名并同步 build-and-verify 文档"
```
