# 2026-08-28 server 镜像启动冒烟设计（Tier 2）

## 背景与目标

- 现状：ci.yml 的 docker-build job 构建 server 镜像（`multi-admin-server:ci`，`load` 不 push）但**从不运行**；本地 `ops:smoke --server` 仅构建（脚本注释明示「不冒烟，仅验证构建」）。entrypoint 链（migrate deploy → db seed → node dist/main.js）的问题要到真实部署才暴露。
- 目标：CI 与本地对**已构建的 server 镜像**做运行态冒烟——容器能起、entrypoint 三段全部执行、`/health` 返回 200 且信封 `code:0`。

## 现状定位与演进方向

本方案适配当前现状（无 registry、无 CD、单 job 报警式 CI、单人直推），是过渡形态而非生产级终态：

| 维度 | 生产级终态 | 本方案（现状适配） |
|---|---|---|
| 制品消费 | push 私有 registry，下游按 digest 拉取同源产物 | load 不 push，冒烟即唯一消费者 |
| 流水线结构 | build/smoke/scan/deploy 分 job，制品经 registry 传递 | 单 job 构建即测（by-digest：测的正是构建产物） |
| 探测深度 | 事务性冒烟（seed 凭据登录 + 业务读写闭环） | /health 探针 + entrypoint 标记断言 |
| 依赖编排 | compose/Testcontainers 管理运行时依赖 | CI service containers + bash 探针脚本 |

演进方向登记于 backlog「server 冒烟生产级演进」行（实施收口时同步登记），触发信号：① 镜像开始 push registry（CD 制品策略落地）→ 冒烟拆独立 job、按 digest 拉取；② 出现部署后业务验证需求 → 探测升级为事务性冒烟；③ 第二运行时依赖引入（BullMQ）→ 迁移 compose/Testcontainers 编排。

## 已锁定决策

- **D1 验证深度**：/health 探针级（HTTP 200 + body 含 `"code":0`），并 grep entrypoint 三段标记（`[entrypoint] migrate deploy` / `db seed` / `start server`）防链路未跑完；**不做**事务性登录级冒烟（此处为现状适配，见上节）。
- **D2 落点**：扩展现有 docker-build job——复用已构建镜像，符合 by-digest 原则，不引入 gha 缓存重建；style 与既有 web 冒烟一致。
- **D3 本地同源**：新建 `scripts/ops/server-smoke.sh`（运行态探针，前提镜像已构建、postgres/redis 可达）；`docker-smoke.sh --server` 构建后调用之；CI 调用同一脚本，杜绝双实现漂移。
- **D4 单脚本双环境适配**：宿主可达性自动探测——`uname -s` 含 MINGW（Windows Git Bash + Docker Desktop）→ 容器以 `host.docker.internal` 访问宿主端口并 `-p ${SMOKE_PORT}:3000` 发布（见 D7）；Linux（含 CI runner）→ `--network host`（容器内 localhost 即 runner 的 services 端口映射）。
- **D5 失败语义**：冒烟失败 job 红 = 报警（与既有 web 冒烟 `test "$code" = "200"` 一致），延续「报警式不拦截 push master」的 CI 定位。
- **D6 冒烟默认值**：JWT secret 用 ≥32 字符固定字面量（`smoke-access-secret-000000000000000000` / `smoke-refresh-secret-000000000000000000`，38 字符、过 min(32) 校验）；`ADMIN_INIT_PASSWORD=smoke-admin-password`；`DATABASE_URL`/`REDIS_URL` 由脚本按所探测 HOST 构造，调用侧可覆盖。
- **D7 默认凭据与端口**：`POSTGRES_PASSWORD` env 缺省 `postgres` 参与默认连接串构造（对齐本地 compose 默认；密码非默认时以 `DATABASE_URL` 覆盖，脚本用法注释注明）；`SMOKE_PORT` 缺省 `3100`，MINGW 分支 `-p ${SMOKE_PORT}:3000` 并 curl 该端口（避开常驻 dev:server 的 3000），Linux `--network host` 分支 curl 3000。

## 组件设计

### 1. `scripts/ops/server-smoke.sh`（新建）

契约：入参无；`IMAGE` 默认 `multi-admin-server:ci` 可被覆盖；环境变量 `DATABASE_URL`、`REDIS_URL`、`POSTGRES_PASSWORD`（缺省 `postgres`）、`ADMIN_INIT_PASSWORD`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`（缺省用 D6 字面量）；`SMOKE_PORT` 缺省 3100。

流程（`set -euo pipefail`）：

1. `docker rm -f server-smoke 2>/dev/null || true` 幂等清理。
2. 宿主探测：MINGW → `HOST=host.docker.internal`，run 加 `-p ${SMOKE_PORT}:3000`、curl 目标 `localhost:${SMOKE_PORT}`；Linux → `docker run --network host`、`HOST=localhost`、curl 目标 `localhost:3000`。
3. `docker run -d --name server-smoke -e DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@${HOST}:5432/multi_admin?schema=public -e REDIS_URL=redis://${HOST}:6379 -e ADMIN_INIT_PASSWORD -e JWT_ACCESS_SECRET -e JWT_REFRESH_SECRET ${IMAGE}`（默认连接串在脚本内先导出再透传）。
4. curl 重试：按分支选定的目标 URL 请求 `/health`，10 次 × 3s（容忍 migrate+seed+启动冷延迟）；断言 HTTP 200 且 body grep `"code":0`。
5. 轻断言：`docker logs server-smoke` grep 三个 entrypoint 标记，任一缺失即失败。
6. `docker logs server-smoke` 完整输出（供失败排查）。
7. `docker rm -f server-smoke` 清理，失败 exit 1。

### 2. `scripts/ops/docker-smoke.sh`（改造）

- `--server` 分支：构建成功后追加 `bash "$(dirname "$0")/server-smoke.sh"`；注释由「仅验证构建」改为「构建 + 运行态冒烟」。
- 头部用法注释补前置说明：server 冒烟需先 `ops:env-up`（提供 postgres/redis 宿主端口）。
- 根 package.json 新增别名 `"ops:server-smoke": "bash scripts/ops/server-smoke.sh"`。

### 3. `.github/workflows/ci.yml`（docker-build job 扩展）

- job 级新增 `services:`（与 coverage job 同模式）：
  - `postgres: postgres:15-alpine`：env `POSTGRES_USER=postgres`/`POSTGRES_PASSWORD=postgres`/`POSTGRES_DB=multi_admin`，ports 5432:5432，healthcheck `pg_isready -U postgres -d multi_admin`（DB 名与 compose 统一，migrate deploy 依赖库已存在）。
  - `redis: redis:7-alpine`：ports 6379:6379，healthcheck `redis-cli ping`。
- server 构建步骤后新增 step「server 镜像启动冒烟（/health 探针）」：`run: bash scripts/ops/server-smoke.sh`；step 级 env **显式五件套**（冒烟专用丢弃值，非生产秘密，可直接内联并加注释说明）：`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/multi_admin?schema=public`、`REDIS_URL=redis://localhost:6379`、`ADMIN_INIT_PASSWORD` 与两个 JWT secret 取 D6 字面量，可读后脚本构建语义一致。
  - 脚本默认值仅服务于 `ops:smoke --server` 本地单命令体验；CI 环境语义与本地完全一致，五变量均「调用侧覆盖优先」。
- job 内 web 冒烟步骤保持不动（范围纪律）。

### 4. 文档与登记（实施收口时）

- `docs/engineering/build-and-verify.md` 补充 `ops:server-smoke` 一句说明（含前置 `ops:env-up`）。
- backlog：「server 镜像启动冒烟」行尾追加关闭标注（2026-08-28，实现形态一句话）；新增「server 冒烟生产级演进」行（三信号 + 触发条件）。
- `docs/tasks/README.md` 热索引登记与收口。

## 验证与验收

- 本地（Windows Git Bash MINGW 分支）：`ops:env-up` → `bash scripts/ops/docker-smoke.sh --server` 全绿。
- 门禁：`npx prettier --check .github/workflows/ci.yml`；`bash -n scripts/ops/server-smoke.sh scripts/ops/docker-smoke.sh`。
- CI：推送 master 后 docker-build job 首跑绿（构建 ~39 分钟 + 冒烟 ~1-2 分钟，仍在 60 分钟 timeout 内）。

## 边界（不做）

- 不 push 镜像、不拆独立 job、不做事务性登录冒烟、不改动 web 冒烟与其余三个 job。
- postgres/redis 镜像引用不做 digest pin（属既有 backlog「生产安全基线加固」#2 范围）。
- 不引入 compose/Testcontainers（演进信号 ③ 触发时再评估）。