---
status: living
covers:
  - apps/pure-web/Dockerfile
  - apps/nestjs-server/Dockerfile
  - apps/iot-worker/Dockerfile
  - docker-compose.yml
  - .env.example
last_verified: 2026-11-08
---

# 部署与本机编排

镜像构建、compose 服务、环境注入与暴露面。质量门禁与各端构建链见 [build-and-verify.md](../engineering/build-and-verify.md)，ops 脚本与验证探针见 [ops-scripts.md](ops-scripts.md)。

## Docker

- **构建 context 必须是仓库根**：`docker build -f apps/pure-web/Dockerfile .`（Dockerfile 内部已按 manifest 分层缓存 + `--filter @multi-admin/pure-web...` 依赖隔离安装）。构建命令用 `--filter X...`（含依赖子图拓扑），与本地任务图同源。
- 基础镜像 `node:24-alpine`，pnpm 版本经 corepack 按 `packageManager` 字段锁定；镜像变量用 `PNPM_CONFIG_REGISTRY` / `COREPACK_NPM_REGISTRY`（`npm_config_*` 对 pnpm 无效）。
- 本机编排：`cp .env.example .env` 填写 `POSTGRES_PASSWORD`、`REDIS_PASSWORD`、`ADMIN_INIT_PASSWORD`，并替换 `EMQX_DASHBOARD_PASSWORD` 与两把 JWT 密钥的示例值后 `docker compose up`（postgres + redis + redis-queue + emqx + tdengine + server + worker + web **八服务**；
  server 依赖 postgres/redis 双健康，启动链 entrypoint 串 `prisma migrate deploy → prisma db seed → exec node`（幂等可重复）；
  worker 依赖 redis / redis-queue / tdengine 三健康，**无 migrate / seed、不碰 PG**）。
  库名统一 `multi_admin`；存量旧卷（旧库名初始化）需 `docker compose down -v` 重建。tdengine 容器设 `TZ: Asia/Shanghai`——窗口对齐取服务器时区；`ops:tdengine-init` 启动时显式断言服务器时区，配错直接初始化失败（退出码 1），不再静默写进错窗口。
  暴露面：`redis-queue` / `emqx` / `tdengine` 只绑宿主回环；`postgres` / `redis` 绑全部接口，故各自带认证（`POSTGRES_PASSWORD` / `REDIS_PASSWORD`）——规则与残余风险见本节。
- env 注意：根 `.env` 的 `DATABASE_URL` 若手动设置，内嵌密码须与 `POSTGRES_PASSWORD` 一致（否则 server 连库失败而 postgres 容器正常，排障困难）；
  根 `.env` 的 `REDIS_URL` 须带凭据（`redis://:<REDIS_PASSWORD>@redis:6379`，空用户名落到 `default` 用户）并经 compose 插值注入 **server 与 worker**（`${REDIS_URL:?…}`），与 redis 的 `--requirepass` 同源；
  JWT 双密钥（`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`）必须不同且 ≥32 字符；`env.schema` 启动校验，compose 的 `:?` 只强校验必填。
  server 与 worker 都读 `TDENGINE_URL`：容器内必须显式指向 `tdengine:6041`（compose 已传），指向 `127.0.0.1` 会连到容器自己；server 是**懒连接**，tdengine 未起不影响它启动，注册请求才失败。
- 镜像源参数化（`ARG PNPM_REGISTRY`），CI 通过 `build-args` 覆盖为官方源。
- 镜像 pin 与非 root：生产镜像统一 `tag@digest`（manifest-list 层级）pin，季度 `pnpm ops:check-digests` 巡检漂移；
  nestjs-server prod 阶段以 `USER node`（UID 1000）运行，compose 的 server 服务带 `no-new-privileges`；
  nginx 保留官方镜像 master-root 形态（绑 80 需要），迁至 restricted PSA / OpenShift 时换 nginx-unprivileged。

## 数据卷与迁移

- compose 数据卷：`postgres-data` / `redis-data` / `redis-queue-data` / `emqx-data` / `tdengine-data` / `server-spill`。
- `server-spill` 承接队列不可达时的本地落盘缓冲；容器重建不丢卷，但目录容量与轮转仍由 backlog 管理。
- 数据库迁移由 server 容器 entrypoint 的 `prisma migrate deploy` 执行；seed 在同一入口执行，create-only 幂等。
- TDengine 建库 / 超表 / 子表由 `ops:tdengine-init` 执行；降采样库的一次性迁移约束见 [ops-scripts.md](ops-scripts.md)。
