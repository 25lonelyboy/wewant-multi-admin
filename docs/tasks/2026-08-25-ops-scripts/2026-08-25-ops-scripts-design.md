---
status: draft
covers:
  - scripts/ops/
  - package.json
  - .gitignore
  - docs/engineering/build-and-verify.md
last_verified: 2026-08-25
---

# scripts/ops 自动化操作集设计

## 背景

项目已有完善的本地门禁（`pnpm check` + husky）和 CI 兜底（`.github/workflows/ci.yml`），但两者之间存在操作断点：

- push 后需手动打开 GitHub 页面或调 MCP 工具查看 CI 结果
- 本地 e2e/coverage 需手动分步启动 docker services + 设置环境变量
- CI 失败日志需手动逐层获取和分析
- 本地无法复现 CI 的 Docker 镜像冒烟验证

本方案将 6 类高频操作沉淀为 `scripts/ops/` 下的可复用脚本，人和 AI Agent 均可调用。

## 目标

1. 消除 push → CI 结果 → 诊断 → 修复循环中的手动断点
2. 本地开发环境一键启停，降低新人上手成本
3. 本地可复现 CI 的 Docker 冒烟和覆盖率验证
4. 脚本同时服务人（`pnpm ops:xxx`）和 Agent（直接执行脚本文件）

## 技术选型

按复杂度分层：

| 格式 | 适用场景 | 本方案中的脚本 |
|------|----------|---------------|
| **ESM（.mjs）** | 有逻辑复用、需要跨平台可靠性、调用 `@multi-admin/node-utils` | pre-push、coverage |
| **Shell（.sh）** | 纯 CLI 编排（gh / docker compose / curl）、与 CI yaml 同源 | ci-status、ci-logs、env-up、env-down、docker-smoke |

Shell 脚本统一 `#!/usr/bin/env bash` + `set -euo pipefail`。Windows 下通过 Git Bash 执行（husky 已依赖）。

## 文件结构

```
scripts/
├── check.mjs              # 已有：本地全量门禁
├── clean.mjs              # 已有：清理产物
└── ops/                   # 新增：自动化操作集
    ├── pre-push.mjs        # A: push 前 CI 同构校验
    ├── ci-status.sh        # B: CI 结果拉取（人用）
    ├── ci-logs.sh          # C: CI 失败日志导出（Agent 用）
    ├── env-up.sh           # D: 开发环境启动
    ├── env-down.sh         # D: 开发环境停止
    ├── docker-smoke.sh     # E: 本地 Docker 冒烟
    └── coverage.mjs        # F: 本地覆盖率一键跑
```

## 各脚本设计

### A. pre-push.mjs — push 前 CI 同构校验

**消费者**：人 + Agent
**退出码**：0 = 可安全 push，非 0 = 有问题

步骤：
1. 设置 CI 同构环境变量：`HUSKY=0`、`DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy`
2. 执行 `pnpm install --frozen-lockfile`（验证 lockfile 一致性）
3. 执行 `pnpm check`（全量门禁：prettier → typecheck → lint → stylelint → test → 覆盖枚举）
4. 执行 `pnpm audit --audit-level=high`（报警式，`continue-on-error`，失败不阻断）

与现有 `check.mjs` 的关系：`pre-push` 是 `check` 的超集，额外加了 frozen-lockfile 验证和 audit。

### B. ci-status.sh — CI 结果拉取

**消费者**：人 + Agent
**参数**：`$1` 可选 run_id（默认取最新 5 次）

步骤：
1. 检查 `gh auth status`，未认证 → 打印 `gh auth login` 提示并以非零退出
2. `gh run list --workflow=CI --limit=5 --json databaseId,status,conclusion,name,createdAt`
3. 格式化表格输出每个 run 的 job 状态
4. 若最新 run 有失败 → 自动打印失败 job 最后 50 行日志（`gh run view <id> --log-failed`）

### C. ci-logs.sh — CI 失败日志导出

**消费者**：Agent 为主，人可用
**参数**：`$1` 可选 run_id（默认取最新失败的 run）

步骤：
1. 检查 `gh auth status`
2. 无参数时：`gh run list --workflow=CI --limit=10 --json databaseId,conclusion` 筛选第一个 conclusion=failure
3. `gh run view <id> --log-failed > scripts/ops/.ci-failure-<id>.log`
4. 打印：文件路径 + 失败 job 列表 + 文件大小

产物 `.ci-failure-*.log` 加入 `.gitignore`。

### D. env-up.sh / env-down.sh — 开发环境启停

**消费者**：人 + Agent

**env-up.sh** 步骤：
1. `docker compose up -d postgres redis`
2. 健康等待循环：`pg_isready -U postgres` + `redis-cli ping`，每 2s 重试，最多 30s
3. `pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy`
4. `pnpm --filter @multi-admin/nestjs-server exec prisma db seed`
5. 输出就绪提示

**env-down.sh** 步骤：
1. `docker compose stop postgres redis`（保留数据）
2. `--clean` 参数：`docker compose down -v`（清除数据卷）

### E. docker-smoke.sh — 本地 Docker 冒烟

**消费者**：人 + Agent
**参数**：`--server` 额外构建 nestjs-server 镜像

步骤（与 `.github/workflows/ci.yml` docker-build job 同源）：
1. `docker build -f apps/pure-web/Dockerfile . -t multi-admin-web:ci`（仓库根 context）
2. `docker run -d --name web-smoke -p 8848:80 multi-admin-web:ci`
3. curl 重试循环：5 次，间隔 2s，检查 HTTP 200
4. 打印容器日志
5. `docker rm -f web-smoke`
6. `--server` 时追加构建 nestjs-server 镜像（不冒烟，仅验证构建成功）

### F. coverage.mjs — 本地覆盖率一键跑

**消费者**：人 + Agent
**参数**：`--skip-env`（跳过环境启停，用于已启动 services 的情况）

步骤：
1. 无 `--skip-env` → 调用 `env-up.sh` 启动 postgres + redis
2. 设置 `DATABASE_URL` + `REDIS_URL` 环境变量
3. 执行 `pnpm exec turbo run test:coverage --filter=@multi-admin/nestjs-server`
4. 无 `--skip-env` → 调用 `env-down.sh` 清理
5. 输出覆盖率摘要（从 merge-coverage 输出中提取）

## 注册方式

根 `package.json` 添加 ops 脚本别名：

```json
"ops:pre-push": "node scripts/ops/pre-push.mjs",
"ops:ci": "bash scripts/ops/ci-status.sh",
"ops:ci-logs": "bash scripts/ops/ci-logs.sh",
"ops:env-up": "bash scripts/ops/env-up.sh",
"ops:env-down": "bash scripts/ops/env-down.sh",
"ops:smoke": "bash scripts/ops/docker-smoke.sh",
"ops:coverage": "node scripts/ops/coverage.mjs"
```

## 前置依赖

| 依赖 | 用途 | 状态 |
|------|------|------|
| gh CLI >= 2.x | ci-status / ci-logs | 已安装（`C:\Program Files\GitHub CLI\gh.exe`），需首次 `gh auth login` |
| Git Bash | shell 脚本执行 | husky 已依赖，自动可用 |
| Docker Desktop | env-up / env-down / docker-smoke / coverage | 本地开发必备 |
| Node.js >= 24 | ESM 脚本 | 项目约束 |

## 变更清单

| 文件 | 操作 |
|------|------|
| `scripts/ops/pre-push.mjs` | 新增 |
| `scripts/ops/ci-status.sh` | 新增 |
| `scripts/ops/ci-logs.sh` | 新增 |
| `scripts/ops/env-up.sh` | 新增 |
| `scripts/ops/env-down.sh` | 新增 |
| `scripts/ops/docker-smoke.sh` | 新增 |
| `scripts/ops/coverage.mjs` | 新增 |
| `package.json` | 修改（加 7 个 ops:* 别名） |
| `.gitignore` | 修改（追加 `.ci-failure-*.log`） |
| `docs/engineering/build-and-verify.md` | 修改（追加 ops 脚本章节） |
