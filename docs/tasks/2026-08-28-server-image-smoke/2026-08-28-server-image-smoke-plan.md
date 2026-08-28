# server 镜像启动冒烟 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已构建的 nestjs-server 镜像建立 CI 与本地同源的运行态冒烟（/health 探针 + entrypoint 三段断言）。

**Architecture:** 新建运行态探针脚本 `scripts/ops/server-smoke.sh`（独立可调用），`docker-smoke.sh --server` 构建后调用之，CI docker-build job 加 services（postgres/redis）后调用同一脚本。脚本按 `uname -s` 双分支适配：MINGW 走 `host.docker.internal` + 端口发布，Linux 走 `--network host`。

**Tech Stack:** bash（set -euo pipefail）、Docker、GitHub Actions service containers、curl/grep 断言。

**TDD 适配说明：** 仓库无 bash 测试基建（仅 nestjs-server 有 jest），ops 脚本的验证口径与既有 `scripts/ops/*` 治理一致：`bash -n` 语法门禁 + 真实运行验证（真实冒烟即验收测试）+ `npx prettier --check` 格式门禁。本计划所有「验证」步骤均为可执行的真实验证命令。

**Spec:** `docs/tasks/2026-08-28-server-image-smoke/2026-08-28-server-image-smoke-design.md`（以其中已锁定决策 D1-D7 为准）

---

### Task 0: 提交设计工件（前置）

**Files:**
- Modify: `docs/tasks/README.md`（已登记索引行，纳入提交）
- Include: `docs/tasks/2026-08-28-server-image-smoke/2026-08-28-server-image-smoke-design.md`（untracked）

- [x] **Step 1: 确认工作区状态**（已执行，dc8a4b8）

Run: `git status --short`
Expected: 仅见 `M docs/tasks/README.md` 与 `?? docs/tasks/2026-08-28-server-image-smoke/`（与计划一致；若出现其他文件，停下与用户确认）

- [x] **Step 2: 提交设计工件**（已执行，dc8a4b8）

```bash
git add docs/tasks/2026-08-28-server-image-smoke/ docs/tasks/README.md
git commit -m "docs(server): server 镜像启动冒烟设计工件与热索引登记"
```

Expected: hook（lint-staged prettier 自动格式化 README.md）+ commitlint 通过

### Task 1: 新建运行态探针脚本 server-smoke.sh

**Files:**
- Create: `scripts/ops/server-smoke.sh`

- [ ] **Step 1: 写入完整脚本**

```bash
#!/usr/bin/env bash
set -euo pipefail

# server 镜像运行态冒烟（与 CI docker-build job 同源）
# 用法：bash scripts/ops/server-smoke.sh
# 前置：server 镜像已构建（本地经 docker-smoke.sh --server，或 CI build-push 产物）；postgres/redis 宿主可达（本地先 ops:env-up）。
# 环境变量（均为冒烟专用丢弃值，可覆盖）：
#   IMAGE                缺省 multi-admin-server:ci
#   POSTGRES_PASSWORD    缺省 postgres（本地 compose 默认；如改过密码请以 DATABASE_URL 覆盖）
#   ADMIN_INIT_PASSWORD  缺省 smoke-admin-password
#   JWT_ACCESS_SECRET    缺省 smoke-access-secret-000000000000000000（38 字符，过 min(32)）
#   JWT_REFRESH_SECRET   缺省 smoke-refresh-secret-000000000000000000
#   SMOKE_PORT           缺省 3100（仅 MINGW 分支发布用；Linux --network host 恒 3000）

IMAGE="${IMAGE:-multi-admin-server:ci}"
SMOKE_PORT="${SMOKE_PORT:-3100}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
ADMIN_INIT_PASSWORD="${ADMIN_INIT_PASSWORD:-smoke-admin-password}"
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-smoke-access-secret-000000000000000000}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-smoke-refresh-secret-000000000000000000}"

# 宿主可达性探测：Git Bash（MINGW）走 Docker Desktop host.docker.internal + 端口发布；
# Linux（含 CI runner）走 host 网络，容器内 localhost 即宿主 services 端口映射。
if uname -s | grep -q MINGW; then
  HOST="host.docker.internal"
  RUN_PORT_ARGS=(-p "${SMOKE_PORT}:3000")
  TARGET_URL="http://localhost:${SMOKE_PORT}/health"
else
  HOST="localhost"
  RUN_PORT_ARGS=("--network" "host")
  TARGET_URL="http://localhost:3000/health"
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@${HOST}:5432/multi_admin?schema=public}"
REDIS_URL="${REDIS_URL:-redis://${HOST}:6379}"
export DATABASE_URL REDIS_URL ADMIN_INIT_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET

echo "▶ 清理旧容器（如有）..."
docker rm -f server-smoke 2>/dev/null || true

echo "▶ 启动 server 冒烟容器（IMAGE=${IMAGE}）..."
docker run -d --name server-smoke \
  "${RUN_PORT_ARGS[@]}" \
  -e DATABASE_URL \
  -e REDIS_URL \
  -e ADMIN_INIT_PASSWORD \
  -e JWT_ACCESS_SECRET \
  -e JWT_REFRESH_SECRET \
  "${IMAGE}"

echo "▶ curl /health 重试循环（10 次 × 3s，容忍 migrate+seed+启动冷延迟）..."
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  body=$(curl -s -m 5 "${TARGET_URL}" || true)
  if echo "${body}" | grep -q '"code":0'; then
    ok=1
    break
  fi
  echo "  尝试 ${i}/10：未达 code:0，等待 3s..."
  sleep 3
done

echo "▶ entrypoint 三段标记断言..."
# 注意：不能写成 `docker logs ... | grep -qF`——grep -q 命中即退出会使 docker logs 收到
# SIGPIPE 非零退出，在 pipefail 下管道整体非零、if 恒假（本地实测踩坑后修正）。先捕获再断言。
SMOKE_LOGS="$(docker logs server-smoke 2>&1 || true)"
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] migrate deploy"; then
  echo "  ✔ [entrypoint] migrate deploy"
else
  echo "  ✖ 缺失 [entrypoint] migrate deploy"
  ok=0
fi
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] db seed"; then
  echo "  ✔ [entrypoint] db seed"
else
  echo "  ✖ 缺失 [entrypoint] db seed"
  ok=0
fi
if echo "${SMOKE_LOGS}" | grep -qF "[entrypoint] start server"; then
  echo "  ✔ [entrypoint] start server"
else
  echo "  ✖ 缺失 [entrypoint] start server"
  ok=0
fi

echo "▶ 容器日志（完整）："
echo "${SMOKE_LOGS}"

echo "▶ 清理容器..."
docker rm -f server-smoke

if [ "${ok}" = "1" ]; then
  echo "✔ server 冒烟通过（/health code:0 + entrypoint 三段）"
else
  echo "✖ server 冒烟失败"
  exit 1
fi
```

- [ ] **Step 2: 语法门禁验证**

Run: `bash -n scripts/ops/server-smoke.sh`
Expected: 无输出、exit 0

- [ ] **Step 3: （失败路径自验，仅本地）故意错镜像名验证失败语义**

Run: `IMAGE=multi-admin-server:does-not-exist bash scripts/ops/server-smoke.sh`
Expected: `docker run` 失败触发 `set -e` 中断（此步验证失败即中断语义，无需修；确认后继续）

- [ ] **Step 4: 暂存（提交合并至 Task 4 后统一执行）**

Run: `git add scripts/ops/server-smoke.sh`（与 Task 2-4 改动合并为一个 commit）

### Task 2: 改造 docker-smoke.sh --server 链路

**Files:**
- Modify: `scripts/ops/docker-smoke.sh:5-6`（头部注释）、`scripts/ops/docker-smoke.sh:45-56`（--server 分支）

- [ ] **Step 1: 更新头部用法注释**

将第 5-6 行改为：

```bash
# 用法：bash scripts/ops/docker-smoke.sh [--server]
# --server：追加 nestjs-server 构建 + 运行态冒烟（server-smoke.sh；须先 ops:env-up 提供 postgres/redis）
```

- [ ] **Step 2: --server 分支追加冒烟调用**

将 `--server` 分支尾部（`echo "✔ nestjs-server 镜像构建成功"` 之后）改为：

```bash
  echo "✔ nestjs-server 镜像构建成功"

  echo ""
  echo "▶ server 运行态冒烟..."
  bash "$(dirname "$0")/server-smoke.sh"
```

- [ ] **Step 3: 语法门禁**

Run: `bash -n scripts/ops/docker-smoke.sh`
Expected: 无输出、exit 0

- [ ] **Step 4: 暂存**

Run: `git add scripts/ops/docker-smoke.sh`

### Task 3: 根 package.json 注册别名

**Files:**
- Modify: `package.json:27-28`（ops 别名区）

- [ ] **Step 1: 插入别名**

在 `"ops:smoke": "bash scripts/ops/docker-smoke.sh",` 之后插入：

```json
    "ops:server-smoke": "bash scripts/ops/server-smoke.sh",
```

- [ ] **Step 2: 格式与别名一致性验证**

Run: `npx prettier --check package.json && node -e "const s=require('./package.json').scripts; if(s['ops:server-smoke']!=='bash scripts/ops/server-smoke.sh') process.exit(1); console.log('alias ok')"`
Expected: `Checking formatting...` + `alias ok`，exit 0

- [ ] **Step 3: 暂存**

Run: `git add package.json`

### Task 4: ci.yml docker-build job 加 services 与冒烟 step

**Files:**
- Modify: `.github/workflows/ci.yml:30-71`（docker-build job：+services +冒烟 step）
- Modify: `scripts/ops/check-digests.sh:18,38,62-65`（pin 计数边界 8 → 10，联动）

- [ ] **Step 1: job 级新增 services（置于 timeout-minutes 与 steps 之间）**

```yaml
    services:
      # 镜像沿用 coverage job 同源 digest pin（生产安全基线：全仓镜像引用必须 pin；+2 pin 后 check-digests 计数 8 → 10，见 Step 3）
      postgres:
        image: postgres:15-alpine@sha256:fe0737ba566a2c5b2a28f34433c0a423261900ec17b9bf7ad115e1aae7e57f1b # pin: 2026-08-27 (pnpm ops:check-digests quarterly)
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: multi_admin
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres -d multi_admin"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7-alpine@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf # pin: 2026-08-27 (pnpm ops:check-digests quarterly)
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```

- [ ] **Step 2: server 构建步骤后新增冒烟 step（置于「构建 nestjs-server 镜像」与「web 镜像启动冒烟」之间）**

```yaml
      - name: server 镜像启动冒烟（/health 探针 + entrypoint 三段断言）
        # 冒烟专用丢弃值（非生产秘密，内联安全）；Linux runner 走 --network host，容器内 localhost 即本 job services
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/multi_admin?schema=public
          REDIS_URL: redis://localhost:6379
          ADMIN_INIT_PASSWORD: smoke-admin-password
          JWT_ACCESS_SECRET: smoke-access-secret-000000000000000000
          JWT_REFRESH_SECRET: smoke-refresh-secret-000000000000000000
        run: bash scripts/ops/server-smoke.sh
```

- [ ] **Step 3: 同步 check-digests.sh 计数边界（8 → 10）**

`check-digests.sh` 将全仓 pin 数量硬锁定为 8（`COUNT -ne 8` → exit 1）。本 Task 新增 2 处 pin，不同步边界将令季度巡检必失败。三处修改：

1. 第 18 行 `预期 8 处` → `预期 10 处`
2. 第 38 行注释 `node ×3、postgres ×2、redis ×2` → `node ×3、postgres ×3、redis ×3`
3. 第 62-63 行计数边界与提示文案：

```bash
if [[ "$COUNT" -ne 10 ]]; then
  echo "[check-digests] pin 数量异常：预期 10，实际 ${COUNT}（可能有 pin 被移除）" >&2
  exit 1
fi
```

Run: `bash -n scripts/ops/check-digests.sh`
Expected: 无输出、exit 0

- [ ] **Step 4: 格式与结构验证**

Run: `npx prettier --check .github/workflows/ci.yml scripts/ops/check-digests.sh`
Expected: exit 0；随后人工复核 job 结构：`services` 与 `steps` 同级缩进，后一个 `- name:` 前空行齐整，无多余缩进

Run: `grep -rc '@sha256:' apps/nestjs-server/Dockerfile apps/pure-web/Dockerfile docker-compose.yml .github/workflows/ci.yml`
Expected: nestjs-server 2、pure-web 2、docker-compose 2、ci.yml 4（合计 10，与 check-digests 新边界一致）

- [ ] **Step 5: 暂存**

Run: `git add .github/workflows/ci.yml scripts/ops/check-digests.sh`

### Task 5: 本地验证并提交代码改动

**验证口径：** 真实运行即验收。首次 server 镜像本地构建历时较长（Prisma engines 下载，既往实测约 39 分钟）；若 `docker images` 已存在 `multi-admin-server:ci`，可跳过构建、直接执行冒烟脚本本身（全链路验证在 CI 首跑补位）。

- [ ] **Step 1: 启动本地依赖（幂等）**

Run: `pnpm ops:env-up`
Expected: postgres/redis 就绪 + migrate/seed 成功输出

- [ ] **Step 2: 从根 .env 提取真实密码并运行冒烟**

本地 postgres 卷是首次 `compose up` 时用根 `.env` 的实际密码初始化的（示例模板为 `change_me`），**不能依赖脚本缺省 `postgres`**；CI 侧则由 step 级 env 覆盖、不受影响。

Run: `POSTGRES_PASSWORD=$(grep -E '^POSTGRES_PASSWORD' .env | head -1 | sed -E 's/^[^=]*=\s*//') pnpm ops:server-smoke`
Expected（逐段核对）：
- `▶ 清理旧容器`、`▶ 启动 server 冒烟容器`
- 重试循环不超过 10 次即命中，无「未达 code:0」残留
- 三段 `✔ [entrypoint] ...` 全部出现
- 末尾 `✔ server 冒烟通过（/health code:0 + entrypoint 三段）`

- [ ] **Step 3: 排障预案（仅失败时）**

若失败：`docker logs server-smoke` 已打印完整日志；常见分诊——seed 缺 `ADMIN_INIT_PASSWORD`（检查导出）、数据库密码认证失败（卷初始化的密码与当前 `.env` 不一致时，用 `docker compose exec postgres env | grep POSTGRES_PASSWORD` 取实际值重传，或 `DATABASE_URL=postgresql://postgres:<实际密码>@host.docker.internal:5432/multi_admin?schema=public pnpm ops:server-smoke` 覆盖）、宿主机 3100/3000 占用（`SMOKE_PORT=3101 pnpm ops:server-smoke`）

- [ ] **Step 4: （可选，已存在镜像时跳过）全链路 docker-smoke.sh --server**

Run: `bash scripts/ops/docker-smoke.sh --server`
Expected: web 冒烟通过后，server 构建 + 冒烟同样通过（首次构建耗时长，耐心等待）

- [ ] **Step 5: 提交代码改动**

```bash
git commit -m "ci(repo): server 镜像启动冒烟脚本与 docker-build job 扩展"
```

Expected: lint-staged（prettier .sh 忽略、json/yml 自动格式化）+ commitlint 通过

### Task 6: 活文档同步与 backlog 登记

**Files:**
- Modify: `docs/engineering/build-and-verify.md:27,75`（docker-build 描述 + ops 表）
- Modify: `docs/governance/backlog.md:47`（关闭行尾；其后插入演进行）
- Modify: `docs/tasks/README.md`（进行中 → 最近已完成）

- [ ] **Step 1: build-and-verify.md 更新（两处）**

a. 「异步兜底」段（第 27 行）docker-build job 描述由 `docker-build（双镜像构建验证 + web 启动冒烟，不 push）` 改为 `docker-build（双镜像构建验证 + web/server 双启动冒烟：web curl 200、server /health+entrypoint 三段断言，server 冒烟依赖 job services postgres/redis；不 push）`

b. 第 75 行 ops 表格 `ops:smoke` 行描述改为 `` `--server` 追加构建 + 运行态冒烟 ``，其下新增一行：

```markdown
| `pnpm ops:server-smoke` | `server-smoke.sh` | server 镜像运行态冒烟（/health + entrypoint 三段断言；前置：镜像已构建 + ops:env-up） |
```

- [ ] **Step 2: backlog 关闭与演进行**

`server 镜像启动冒烟` 行尾（「触发：server 镜像首次进入真实部署链路前」之后）追加：

`（已关闭，2026-08-29：docker-build job 加 postgres/redis services（digest pin 沿用安全基线）+ /health 探针冒烟，server-smoke.sh 本地/CI 同源；check-digests 计数边界 8 → 10）`

其后新增一行：

```markdown
| server 冒烟生产级演进 | 现有形态适配「无 registry / 单 job」现状；演进信号：① 镜像开始 push registry（CD 制品策略落地）→ 冒烟拆独立 job、按 digest 拉取同源产物；② 出现事务性冒烟需求（seed 凭据登录 + 业务读写闭环）→ 探测升级；③ 第二运行时依赖（BullMQ）→ 迁移 compose/Testcontainers；触发：任一信号出现时立项 |
```

- [ ] **Step 3: 热索引收口**

`docs/tasks/README.md`（注意：「最近已完成」表首现为「生产安全基线（Tier 2 #6）」行——已由 2026-08-28 收口占据，插入锚点按其行内容对齐，而非表头）：从「进行中」移除本任务行（移除后该表为空时，整表替换为一行 `_（暂无进行中任务）_`），在「最近已完成」表首新增：

```markdown
| server 镜像启动冒烟（Tier 2） | CI 构建即测：/health 探针 + entrypoint 三段断言 + job services 双依赖（digest pin 沿用安全基线），server-smoke.sh 本地/CI 同源；backlog 已关闭并登记演进行；设计 → [design.md](2026-08-28-server-image-smoke/2026-08-28-server-image-smoke-design.md)，计划 → [plan.md](2026-08-28-server-image-smoke/2026-08-28-server-image-smoke-plan.md) |
```

- [ ] **Step 4: 格式门禁**

Run: `npx prettier --check docs/engineering/build-and-verify.md docs/governance/backlog.md docs/tasks/README.md`
Expected: exit 0

- [ ] **Step 5: 提交**

```bash
git add docs/engineering/build-and-verify.md docs/governance/backlog.md docs/tasks/README.md
git commit -m "docs(repo): 冒烟活文档同步与 backlog 关闭及演进行登记"
```

### Task 7: 推送与 CI 首跑验证

- [ ] **Step 1: 推送 master**

Run: `git push`
Expected: push 成功（单分支直推工作流）

- [ ] **Step 2: 观察 CI**

Run: `pnpm ops:ci`（或 GitHub Actions 页面）
Expected: `docker-build` job 绿（时长参考：构建 ~39 分钟 + 冒烟 ~1-2 分钟，timeout 60 分钟）；其余三 job 不受影响

- [ ] **Step 3: 失败预案**

若 docker-build 红：`pnpm ops:ci-logs` 导出失败日志，重点看 server 冒烟 step 输出（脚本已打印完整容器日志）；本地按 Task 5 口径复现后用 systematic-debugging 技能定位

---

## Self-Review 记录（写作期已执行）

1. **Spec 覆盖**：设计 §1→Task 1/2、§2（别名）→Task 3、§3（ci.yml）→Task 4、§4（文档登记）→Task 6、验证与验收→Task 5/7；D1-D7 均落入对应 Task 的代码或注释。
2. **占位符扫描**：无 TBD/TODO/「类似 Task N」；所有代码步骤含完整内容。
3. **类型一致性**：跨 Task 引用的 env 名（IMAGE/SMOKE_PORT/POSTGRES_PASSWORD/ADMIN_INIT_PASSWORD/JWT_ACCESS_SECRET/JWT_REFRESH_SECRET/DATABASE_URL/REDIS_URL）、容器名 `server-smoke`、镜像名 `multi-admin-server:ci`、三段 entrypoint 字面量与 Dockerfile:85 逐字一致。
4. **前提矛盾检查**：Task 0 先提交设计+计划工件（目录整体），避免「工作区不干净」前提卡死；Task 5 已标注首次构建时长与跳过路径。
5. **本地密码适配**：Task 5 Step 2 从根 `.env` 提取真实 postgres 密码（存量卷不认缺省值），CI 由 step 级 env 显式指定，互不干扰。
6. **master 前进影响核实（2026-08-29 再核）**：security-baseline/登录锁定已合并（dc8a4b8..9aeb2d5）——Dockerfile 加 `USER node` 但 entrypoint 三段标记字面量不变（Dockerfile:85 复核）；ci.yml coverage services 已 digest pin（postgres fe07.../redis ff02...），Task 4 新 services 沿用同源 pin 并联动 check-digests.sh 边界 8 → 10（离线计数 sanity 校验）；package.json 新增 `ops:check-digests` 别名，Task 3 插入锚点（ops:smoke 后）仍有效；backlog 冒烟行号 46 → 47；tasks/README「最近已完成」表首已被「生产安全基线」行占用，锚点按内容对齐；build-and-verify.md 27 行 docker-build 描述同步双冒烟。