# 生产安全基线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 容器非 root 运行 + 镜像 digest pin 全量落位 + check-digests 漂移巡检脚本落地

**Architecture:** 4 个提交：docs 工件入库 → nestjs-server USER node 非 root 化（含 /tmp 重建、compose no-new-privileges）→ 8 处 tag@digest pin（两 Dockerfile + compose + ci.yml）→ check-digests 巡检脚本 + 文档登记 → 全量验收与 backlog 标注

**Tech Stack:** Docker（buildx / imagetools）、bash（Git Bash）、docker-compose、GitHub Actions 语法

**规格：** [2026-08-27-server-security-baseline-design.md](2026-08-27-server-security-baseline-design.md)

**前置：** Docker Desktop 运行中；根 `.env` 已存在（env-up 需要）；工作区除本计划与设计工件外干净

**备注：** nestjs-server 镜像冷构建 30~60 分钟（@prisma/engines 下载），命令设置超时不小于 90 分钟

---

### Task 1: 设计工件入库

**Files:**
- Modify: `docs/tasks/README.md`（安全基线行补计划链接）
- 已存在未提交：`docs/tasks/2026-08-27-server-security-baseline/2026-08-27-server-security-baseline-design.md`、本计划文件

- [ ] **Step 1.1: 确认工作区状态**

Run: `git status --porcelain`
Expected: 仅列出 `docs/tasks/2026-08-27-server-security-baseline/` 与 `docs/tasks/README.md`，无其他文件。

- [ ] **Step 1.2: 补索引计划链接**

SearchReplace `docs/tasks/README.md`：

```markdown
| 生产安全基线（Tier 2 #6） | 容器非 root（`USER node`）+ 镜像 digest pin（8 处 tag@digest）+ check-digests 刷新兜底脚本；设计 → [design.md](2026-08-27-server-security-baseline/2026-08-27-server-security-baseline-design.md) |
```

改为：

```markdown
| 生产安全基线（Tier 2 #6） | 容器非 root（`USER node`）+ 镜像 digest pin（8 处 tag@digest）+ check-digests 刷新兜底脚本；设计 → [design.md](2026-08-27-server-security-baseline/2026-08-27-server-security-baseline-design.md)，计划 → [plan.md](2026-08-27-server-security-baseline/2026-08-27-server-security-baseline-plan.md) |
```

- [ ] **Step 1.3: 格式校验**

Run: `npx prettier --check docs/tasks/2026-08-27-server-security-baseline/ docs/tasks/README.md`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 1.4: 提交**

```bash
git add docs/tasks/2026-08-27-server-security-baseline/ docs/tasks/README.md
git commit -m "docs(server): 生产安全基线设计与实施计划工件"
```

Expected: 提交成功（husky pre-commit 跑 lint-staged：`prettier --write --ignore-unknown` 自动格式化暂存文件；commit-msg 跑 commitlint 校验 scope 白名单）。

---

### Task 2: nestjs-server 容器非 root 化

**Files:**
- Modify: `apps/nestjs-server/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 2.1: 清理 RUN 尾部重建 /tmp**

SearchReplace `apps/nestjs-server/Dockerfile`：

```
    && rm -rf /root/.cache /root/.local/share/pnpm/store /tmp
```

改为：

```
    && rm -rf /root/.cache /root/.local/share/pnpm/store /tmp && mkdir -p /tmp && chmod 1777 /tmp
```

- [ ] **Step 2.2: prod 阶段末尾加 USER node**

SearchReplace `apps/nestjs-server/Dockerfile`：

```
WORKDIR /repo/apps/nestjs-server
EXPOSE 3000
CMD ["/entrypoint.sh"]
```

改为：

```
WORKDIR /repo/apps/nestjs-server
EXPOSE 3000

USER node

CMD ["/entrypoint.sh"]
```

- [ ] **Step 2.3: compose server 服务加 no-new-privileges**

SearchReplace `docker-compose.yml`：

```
  server:
    build:
      context: .
      dockerfile: apps/nestjs-server/Dockerfile
    restart: unless-stopped
```

改为：

```
  server:
    build:
      context: .
      dockerfile: apps/nestjs-server/Dockerfile
    restart: unless-stopped
    security_opt:
      - no-new-privileges:true
```

- [ ] **Step 2.4: compose 配置校验**

Run: `docker compose config --quiet`
Expected: exit 0，无输出。

- [ ] **Step 2.5: 构建镜像并断言非 root（冷构建 30~60 分钟）**

Run: `docker build -f apps/nestjs-server/Dockerfile -t multi-admin-server .`
Expected: 构建成功（可能因 /tmp 重建或 USER 指令新增层）。

Run: `docker run --rm --entrypoint id multi-admin-server`
Expected: 输出 `uid=1000(node) gid=1000(node)`。若显示 uid=0，回退 Step 2.2 检查插入位置。

- [ ] **Step 2.6: 提交**

```bash
git add apps/nestjs-server/Dockerfile docker-compose.yml
git commit -m "feat(server): 容器非 root 化与非 root 配套"
```

---

### Task 3: 镜像 digest pin 全量落位

**Files:**
- Modify: `apps/nestjs-server/Dockerfile`（2 处 FROM）
- Modify: `apps/pure-web/Dockerfile`（2 处 FROM）
- Modify: `docker-compose.yml`（postgres/redis）
- Modify: `.github/workflows/ci.yml`（coverage job 的 postgres/redis service）

- [ ] **Step 3.1: server Dockerfile 两处 pin**

Run（Git Bash，单行执行）：

```
bash -c 'd=$(docker buildx imagetools inspect node:24-alpine | grep -E "^Digest:" | head -n1 | awk "{print \$2}"); sed -i "s|^FROM node:24-alpine AS \\([^[:space:]]*\\)[[:space:]]*$|FROM node:24-alpine@${d} AS \1  # pin: 2026-08-27 (pnpm ops:check-digests quarterly)|" apps/nestjs-server/Dockerfile'
```

Expected: `apps/nestjs-server/Dockerfile` 第 7、45 行变为 `FROM node:24-alpine@sha256:<64位hex> AS build-stage/production-stage  # pin: ...`。

- [ ] **Step 3.2: web Dockerfile 两处 pin**

Run：

```
bash -c 'd=$(docker buildx imagetools inspect node:24-alpine | grep -E "^Digest:" | head -n1 | awk "{print \$2}"); sed -i "s|^FROM node:24-alpine AS \\([^[:space:]]*\\)[[:space:]]*$|FROM node:24-alpine@${d} AS \1  # pin: 2026-08-27 (pnpm ops:check-digests quarterly)|" apps/pure-web/Dockerfile'
```

```
bash -c 'd=$(docker buildx imagetools inspect nginx:stable-alpine | grep -E "^Digest:" | head -n1 | awk "{print \$2}"); sed -i "s|^FROM nginx:stable-alpine AS \\([^[:space:]]*\\)[[:space:]]*$|FROM nginx:stable-alpine@${d} AS \1  # pin: 2026-08-27 (pnpm ops:check-digests quarterly)|" apps/pure-web/Dockerfile'
```

Expected: 第 6、39 行同样形态。

- [ ] **Step 3.3: compose + ci.yml 的 postgres/redis pin（同源同 digest）**

Run：

```
bash -c 'd=$(docker buildx imagetools inspect postgres:15-alpine | grep -E "^Digest:" | head -n1 | awk "{print \$2}"); sed -i "s|image: postgres:15-alpine[[:space:]]*$|image: postgres:15-alpine@${d}  # pin: 2026-08-27 (pnpm ops:check-digests quarterly)|" docker-compose.yml .github/workflows/ci.yml'
```

```
bash -c 'd=$(docker buildx imagetools inspect redis:7-alpine | grep -E "^Digest:" | head -n1 | awk "{print \$2}"); sed -i "s|image: redis:7-alpine[[:space:]]*$|image: redis:7-alpine@${d}  # pin: 2026-08-27 (pnpm ops:check-digests quarterly)|" docker-compose.yml .github/workflows/ci.yml'
```

Expected: 两个文件中各 2 处 pin 完成（compose 缩进保留）。

- [ ] **Step 3.4: 逐行核对 diff**

Run: `git diff apps/nestjs-server/Dockerfile apps/pure-web/Dockerfile docker-compose.yml .github/workflows/ci.yml`
Expected: 仅 FROM/image 行的 digest 与注释变化；同一镜像（node ×3、postgres ×2、redis ×2）digest 各自一致；无其他行被改动。

- [ ] **Step 3.5: 校验 compose 与 workflow 语法**

Run: `docker compose config --quiet`
Expected: exit 0。

Run: `npx prettier --check .github/workflows/ci.yml`
Expected: `All matched files use Prettier code style!`（prettier 的 YAML 解析器在语法破坏时报 parse error；GH workflow 语义由 push 后 GH 侧解析校验，异步安全网）。

- [ ] **Step 3.6: 快速验证构建（仅 web，快镜像）**

Run: `docker build -f apps/pure-web/Dockerfile -t multi-admin-web .`
Expected: 构建成功（digest pin 不影响构建行为）。

- [ ] **Step 3.7: 提交**

```bash
git add apps/nestjs-server/Dockerfile apps/pure-web/Dockerfile docker-compose.yml .github/workflows/ci.yml
git commit -m "feat(repo): 镜像 digest pin 全量落位"
```

---

### Task 4: check-digests 巡检脚本与登记

**Files:**
- Create: `scripts/ops/check-digests.sh`
- Modify: `package.json`（注册别名）
- Modify: `docs/engineering/build-and-verify.md`（ops 表格 + 前置依赖 + Docker 节约定）

- [ ] **Step 4.1: 创建脚本**

Write `scripts/ops/check-digests.sh`：

```bash
#!/usr/bin/env bash
# 镜像 digest pin 漂移巡检（季度）：对比仓库内 tag@digest 与远端最新 manifest-list digest。
# 用法：pnpm ops:check-digests；退出码 0 = 全部一致；1 = 漂移 / pin 缺失 / 远端获取失败。
# 退役条件：供应链加固落地 Renovate（:pinDigests）后由 bot 接管，届时删除本脚本。
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

FILES=(
  apps/nestjs-server/Dockerfile
  apps/pure-web/Dockerfile
  docker-compose.yml
  .github/workflows/ci.yml
)

PINS=$(grep -HnE '(^FROM[[:space:]]+|image:[[:space:]]*)[^#[:space:]]+@sha256:[0-9a-f]{64}' "${FILES[@]}" || true)
if [[ -z "$PINS" ]]; then
  echo "[check-digests] 未发现任何 digest pin（预期 8 处）" >&2
  exit 1
fi

declare -A PINNED_OF
STATUS=0
COUNT=0

while IFS= read -r PIN_LINE; do
  SRC="${PIN_LINE%%:*}"
  REST="${PIN_LINE#*:}"
  LINE_NO="${REST%%:*}"
  if [[ ! "$PIN_LINE" =~ ([^[:space:]]+@sha256:[0-9a-f]{64}) ]]; then
    continue
  fi
  TOKEN="${BASH_REMATCH[1]}"
  TAG="${TOKEN%@*}"
  PINNED_DIGEST="${TOKEN##*@}"
  COUNT=$((COUNT + 1))

  # 同一 tag 的多处 pin 必须一致（node ×3、postgres ×2、redis ×2）
  if [[ -n "${PINNED_OF[$TAG]+x}" && "${PINNED_OF[$TAG]}" != "$PINNED_DIGEST" ]]; then
    echo "[check-digests] 同一 tag pin 不一致：${SRC}:${LINE_NO} $TAG" >&2
    echo "  当前: $PINNED_DIGEST" >&2
    echo "  他处: ${PINNED_OF[$TAG]}" >&2
    STATUS=1
    continue
  fi
  PINNED_OF[$TAG]="$PINNED_DIGEST"

  LATEST=$(docker buildx imagetools inspect "$TAG" 2>/dev/null | grep -E '^Digest:' | head -n1 | awk '{print $2}' || true)
  if [[ -z "$LATEST" ]]; then
    echo "[check-digests] 远端 digest 获取失败：$TAG（请确认 Docker Desktop 运行且网络可达）" >&2
    STATUS=1
    continue
  fi
  if [[ "$LATEST" != "$PINNED_DIGEST" ]]; then
    echo "[check-digests] 漂移：${SRC}:${LINE_NO} $TAG" >&2
    echo "  pin   : $PINNED_DIGEST" >&2
    echo "  latest: $LATEST" >&2
    STATUS=1
  fi
done <<<"$PINS"

if [[ "$STATUS" -eq 0 ]]; then
  echo "[check-digests] 全部一致（共 $COUNT 处 pin）"
fi
exit "$STATUS"
```

- [ ] **Step 4.2: 注册别名**

SearchReplace `package.json`：

```
    "ops:coverage": "node scripts/ops/coverage.mjs"
```

改为：

```
    "ops:coverage": "node scripts/ops/coverage.mjs",
    "ops:check-digests": "bash scripts/ops/check-digests.sh"
```

- [ ] **Step 4.3: build-and-verify.md 三处登记**

SearchReplace `docs/engineering/build-and-verify.md`（分三处）：

表格新增一行（ops:coverage 行后）：

```
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |
```

改为：

```
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |
| `pnpm ops:check-digests` | `check-digests.sh` | 镜像 digest pin 漂移巡检（季度，`docker buildx imagetools inspect` 比对） |
```

前置依赖行：

```
前置依赖：gh CLI（ci-status / ci-logs，需首次 `gh auth login`）、Docker Desktop（env-up / smoke / coverage）、Git Bash（shell 脚本执行）。
```

改为：

```
前置依赖：gh CLI（ci-status / ci-logs，需首次 `gh auth login`）、Docker Desktop（env-up / smoke / coverage / check-digests）、Git Bash（shell 脚本执行）。
```

Docker 节末尾追加一条约定（镜像源参数化 bullet 之后）：

```
- 镜像源参数化（`ARG PNPM_REGISTRY`），CI 通过 `build-args` 覆盖为官方源。
```

改为：

```
- 镜像源参数化（`ARG PNPM_REGISTRY`），CI 通过 `build-args` 覆盖为官方源。
- 镜像 pin 与非 root：生产镜像统一 `tag@digest`（manifest-list 层级）pin，季度 `pnpm ops:check-digests` 巡检漂移；nestjs-server prod 阶段以 `USER node`（UID 1000）运行，compose 的 server 服务带 `no-new-privileges`；nginx 保留官方镜像 master-root 形态（绑 80 需要），迁至 restricted PSA / OpenShift 时换 nginx-unprivileged。
```

- [ ] **Step 4.4: 语法与格式校验**

Run: `bash -n scripts/ops/check-digests.sh && npx prettier --check package.json docs/engineering/build-and-verify.md`
Expected: 均 exit 0。

- [ ] **Step 4.5: 首次巡检**

Run: `pnpm ops:check-digests`
Expected: 输出 `[check-digests] 全部一致（共 8 处 pin）`。

- [ ] **Step 4.6: 提交**

```bash
git add scripts/ops/check-digests.sh package.json docs/engineering/build-and-verify.md
git commit -m "feat(repo): check-digests 镜像 digest 巡检脚本"
```

---

### Task 5: 全量验收与 backlog 标注

**Files:**
- Modify: `docs/governance/backlog.md`（第 17 行部分关闭标注）

- [ ] **Step 5.1: 全量门禁**

Run: `pnpm check`
Expected: prettier / typecheck / lint / test 全绿（本主题不改应用代码）。

- [ ] **Step 5.2: 真实链路验收（舱内 entrypoint 链非 root 跑通）**

Run: `docker compose up -d --wait --build postgres redis server web`（冷构建 30~60 分钟；含服务健康等待）
Expected: 四容器启动，`--wait` 等待 server/web 健康成功退出，无错误。

Run: `docker compose exec -T server id`
Expected: `uid=1000(node) gid=1000(node)`（非 root 生效；若 uid=0 则回退 Task 2 检查）。

Run: `docker compose logs server`
Expected: 依次含 `[entrypoint] migrate deploy`、`[entrypoint] db seed`、`[entrypoint] start server` 三段。

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health`
Expected: `200`。

- [ ] **Step 5.3: 全栈停机**

Run: `docker compose down`
Expected: 四容器停止（数据卷保留）。

- [ ] **Step 5.5: 巡检复核**

Run: `pnpm ops:check-digests`
Expected: `全部一致（共 8 处 pin）`。

- [ ] **Step 5.6: backlog 部分关闭标注（③ 待 Tier 1 实施，仍开放）**

SearchReplace `docs/governance/backlog.md`：

```
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明；触发：生产部署前 |
```

改为：

```
| 生产安全基线加固 | ① Dockerfile 无 `USER` 指令容器以 root 运行；② `node:24-alpine`/`postgres:15-alpine`/`redis:7-alpine` 无 digest pin（不可复现构建）；③ 请求体大小依赖 Express 默认 100kb 未显式声明；触发：生产部署前（①②已关闭，2026-08-27，非 root + digest pin 落地，见 docs/tasks/2026-08-27-server-security-baseline/；③ 已由 2026-08-26 速赢设计覆盖，待实施） |
```

- [ ] **Step 5.7: 提交**

```bash
git add docs/governance/backlog.md
git commit -m "docs(repo): backlog 生产安全基线①②关闭标注"
```

---

## 自审记录

- 计划审查（2026-08-27）修正：K1 Task 1 提交钩子描述（lint-staged/commitlint 实况）；K2 Task 3 语法校验改用 `npx prettier --check ci.yml`（ruby/python YAML 1.1 会把 `on:` 当布尔，且本机可能缺二进制）；K3 验收路径重写为 `docker compose up -d --wait --build`（`ops:env-up` 宿主机 migrate/seed、`ops:smoke --server` 仅构建不运行，两者并集不覆盖容器内 entrypoint 链），同步修正设计文档验收 #2；M1 消除重复冷构建（compose 构建一次性覆盖 server+web）

- 与设计变更矩阵 1:1（matrix #1~#5 = Task 2~4，#6 = Task 4 Step 4.3 + Task 5 Step 5.6）
- 提交序列：docs → feat(server) → feat(repo) ×2 → docs(repo)，每步可独立回滚；scope 拆分（原设计 F5 留白）已按「非 root 主题归 server、跨 workspace 基建归 repo」定案
- digest 值经实施时单命令获取并同 tag 复用（node/postgres/redis 多处一致由第 3.4 步 diff 核对 + 第 4.5 步脚本一致性检查双重保障）
- 项目规则符合性：提交信息 scope 全部在白名单；shell 脚本 `#!/usr/bin/env bash` + `set -euo pipefail` 对齐既有 ops 风格；文档登记面（build-and-verify.md）与仓库治理一致