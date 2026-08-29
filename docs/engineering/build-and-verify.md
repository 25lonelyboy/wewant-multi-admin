---
status: living
covers:
  - .github/workflows/ci.yml
  - scripts/
  - .husky/
  - .lintstagedrc.json
  - apps/pure-web/Dockerfile
  - apps/nestjs-server/Dockerfile
  - docker-compose.yml
  - packages/contracts/
  - turbo.json
last_verified: 2026-08-29
---

# 构建与验证

命令速查见根 `AGENTS.md`；本文写门禁机制与构建链约束。

## 质量门禁（本地实时 + CI 异步兜底双层）

提交质量由两层机制保证，职责分离：

1. **实时拦截（本地，每次 commit）**：
   - **`pnpm check`**（`scripts/check.mjs`）：按序执行 Prettier 全量检查 → `turbo run typecheck / lint / stylelint` → strict 清单断言（防新文件漏加 + 防清单倒退）→ `turbo run test` → test 覆盖显式枚举，任一失败立即非零退出。纯校验不改文件。提交前必跑。
   - **husky 钩子**：`pre-commit` 跑 lint-staged（配置在 `.lintstagedrc.json`，只处理暂存文件）+ strict 清单断言；`commit-msg` 跑 commitlint（scope 强制 + 白名单，见 `commitlint.config.mjs`）。
2. **异步兜底（入库后，每次 push master）**：`.github/workflows/ci.yml` 四 job 并行——`gate`（frozen-lockfile 安装 + `pnpm check` 服务端重验）、`docker-build`（双镜像构建验证 + web/server 双启动冒烟：web curl 200、server /health+entrypoint 三段断言，server 冒烟依赖 job services postgres/redis；不 push）、`coverage`（services 上 `test:coverage` ≥80% 报警式硬门槛）、`audit`（`pnpm audit --audit-level=high` 报警式）。定位与取舍见 `docs/decisions/ADR-006-github-ci.md`。
3. **纪律条款**：报警式不拦截的代价是红了必须有人看——**CI 红 → 下一项工作先修 CI**；感知窗口为根 README badge 与 GitHub watch 通知。

历史教训（pre hook 时代）：生命周期钩子按**精确脚本名**匹配变体（`prebuild` 与 `prebuild:dir` 需各自声明）；迁移到任务图后，变体（`build:dir` / `build:staging` / `build:mp-weixin`）在 `turbo.json` 显式声明，新增变体必须同步入图。

turbo env 透传约束：Turborepo 不透传自定义 env vars 到 task 子进程——涉及 `prisma generate` 的任务必须在 `turbo.json` 声明 `env: ["DATABASE_URL"]`，测试任务追加 `REDIS_URL`（2026-08-26 教训：缺声明导致 CI 上 prisma generate 拿不到连接串）。

## 各端构建链

| 端 | 构建 | 说明 |
|---|---|---|
| pure-web | `vite build`（NODE_OPTIONS 加大内存） | 产物 `dist/` + `version.json`；staging 模式 `build:staging` |
| nestjs-server | `prisma generate && nest build` | 产物 `dist/`（Prisma Client 由 generate 先行产出） |
| uni-mobile | `uni build`（按平台加 `-p`） | H5 / 小程序多目标 |
| electron-desktop | turbo 图 `^build`（上游 pure-web）→ esbuild → electron-builder | 链路细节见 `docs/architecture/desktop-app.md` |
| contracts | `tsdown` ESM+CJS 双格式 + 双 d.ts | 前后端契约包；消费方由任务图 `^build` 前置构建防陈旧产物参检（细节见 `docs/architecture/contracts.md`） |

## Lint / 格式化职责分离

- **ESLint / Stylelint 只校验**，应用侧配置是引用 `internal/eslint-config` / `internal/stylelint-config` 工厂的薄壳；lint 统一 `--max-warnings 0`。
- **格式化由 Prettier 独占**（根 `.prettierrc.js` + `.prettierignore`）；不要在 ESLint/Stylelint 里开格式化规则。
- 门禁 lint 纯校验（无 `--fix`）；提交期修复由 lint-staged（eslint/stylelint `--fix` + prettier `--write`）独占（应用侧；packages/ 无样式文件不受影响）。

## pure-web 数据源开关（VITE_MOCK）

- 缺省（false / 未定义）：不注册 fake-server 插件，dev server 将 `/api/v1` 代理至 NestJS（`http://localhost:3000`）；`VITE_MOCK=true`：注册 `vite-plugin-fake-server`（`enableProd` 亦注入 prod 构建）。
- mock fixture 与真实后端契约同形（同信封、同路径、同类型标注）；mock-only 端点清单与降级约束见 `docs/architecture/contracts.md`。

## Docker

- **构建 context 必须是仓库根**：`docker build -f apps/pure-web/Dockerfile .`（Dockerfile 内部已按 manifest 分层缓存 + `--filter @multi-admin/pure-web...` 依赖隔离安装）。构建命令用 `--filter X...`（含依赖子图拓扑），与本地任务图同源。
- 基础镜像 `node:24-alpine`，pnpm 版本经 corepack 按 `packageManager` 字段锁定；镜像变量用 `PNPM_CONFIG_REGISTRY` / `COREPACK_NPM_REGISTRY`（`npm_config_*` 对 pnpm 无效）。
- 本机编排：`cp .env.example .env` 填写 `POSTGRES_PASSWORD` 与 `ADMIN_INIT_PASSWORD` 后 `docker compose up`（postgres + redis + server + web 四服务；server 依赖 postgres/redis 双健康，启动链 entrypoint 串 `prisma migrate deploy → prisma db seed → exec node`，幂等可重复）。库名统一 `multi_admin`；存量旧卷（旧库名初始化）需 `docker compose down -v` 重建。
- env 注意：根 `.env` 的 `DATABASE_URL` 若手动设置，内嵌密码须与 `POSTGRES_PASSWORD` 一致（否则 server 连库失败而 postgres 容器正常，排障困难）；根模板的 `REDIS_URL` 经 compose 插值注入 server（`${REDIS_URL:-redis://redis:6379}`）；JWT 双密钥（`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`）必须不同，compose `:?` 强校验必填。
- 镜像源参数化（`ARG PNPM_REGISTRY`），CI 通过 `build-args` 覆盖为官方源。
- 镜像 pin 与非 root：生产镜像统一 `tag@digest`（manifest-list 层级）pin，季度 `pnpm ops:check-digests` 巡检漂移；nestjs-server prod 阶段以 `USER node`（UID 1000）运行，compose 的 server 服务带 `no-new-privileges`；nginx 保留官方镜像 master-root 形态（绑 80 需要），迁至 restricted PSA / OpenShift 时换 nginx-unprivileged。

## ops 自动化脚本（scripts/ops/）

本地高频操作沉淀为可复用脚本，人和 Agent 均可调用。ESM 脚本复用 `@multi-admin/node-utils`，Shell 脚本统一 `#!/usr/bin/env bash` + `set -euo pipefail`。

| 命令 | 脚本 | 职责 |
|---|---|---|
| `pnpm ops:pre-push` | `pre-push.mjs` | push 前 CI 同构校验：frozen-lockfile + check + audit |
| `pnpm ops:ci` | `ci-status.sh` | CI 结果拉取：最近 5 次 run 状态 + 失败自动打印日志 |
| `pnpm ops:ci-logs` | `ci-logs.sh` | CI 失败日志导出：`.ci-failure-<id>.log`（Agent 可读取分析） |
| `pnpm ops:env-up` | `env-up.sh` | 开发环境启动：postgres + redis + migrate + seed |
| `pnpm ops:env-down` | `env-down.sh` | 开发环境停止（`--clean` 清除数据卷） |
| `pnpm ops:smoke` | `docker-smoke.sh` | 本地 Docker 冒烟（`--server` 追加构建 + 运行态冒烟） |
| `pnpm ops:server-smoke` | `server-smoke.sh` | server 镜像运行态冒烟（/health + entrypoint 三段断言；前置：镜像已构建 + ops:env-up） |
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |
| `pnpm ops:check-digests` | `check-digests.sh` | 镜像 digest pin 漂移巡检（季度，`docker buildx imagetools inspect` 比对） |
| `pnpm ops:upstream-diff` | `upstream-diff.sh` | pure-web 上游漂移报告（基线 SHA + target ref → 改动清单/变更地图/冲突面三件套；无基线参数降级仅本地侧） |

前置依赖：gh CLI（ci-status / ci-logs，需首次 `gh auth login`）、Docker Desktop（env-up / smoke / coverage / check-digests）、Git Bash 或 WSL bash（shell 脚本执行；仓库 `.sh` 统一 LF 行尾，见根 `.gitattributes`）、可联网环境（upstream-diff，需 fetch github）。

check-digests 远端比对依赖可联网环境：本机无 Registry 直连时按设计输出「远端 digest 获取失败」exit 1（本地同 tag 一致性检查仍有效）；CI 目前无该巡检 step（设计 D5 不新增 CI 验证逻辑），首次在线巡检需在可联网环境手动执行一次。

教训（2026-08-29，`server-smoke.sh` 实施期实测）：`set -o pipefail` 下 `docker logs X | grep -qF` 断言必假——grep -q 命中即退出使 docker logs 收到 SIGPIPE（exit 141），管道整体非零、`if` 恒假；写法必须是先捕获变量（`LOGS="$(docker logs X 2>&1 || true)"`）再 `echo "${LOGS}" | grep -qF` 断言。

教训（2026-08-29，CI coverage 红）：jest 默认多 worker 并行跑 e2e spec，各套件共享同一 Redis 且限流按客户端 IP 计数时，A 套件的刻意限流用例会耗尽 B 套件登录所需配额（表现为登录必成断言随机 429，同代码可绿可红）；共享全局状态（数据库/Redis/限流计数）的集成测试必须串行执行，或在用例边界重置共享键。

## 已知环境事实

- Windows 下 Electron 打包期可能出现 `dist-electron/` EPERM 文件锁：确保无残留 electron 进程后重跑。
- pnpm 安装含构建脚本的依赖受 `pnpm-workspace.yaml` 的 `allowBuilds` 白名单控制，新增需构建的原生依赖时要登记。

## nestjs-server e2e 测试

- e2e 配置 `test/jest-e2e.cjs`（与单测 `jest.config.cjs` 共享 `test/jest.base.cjs` 基座，Task 4 P3 抽公共配置）；`maxWorkers: 1` 串行执行——所有 spec 共享同一测试库与同一 Redis，并行会让 IP 维度限流计数、flushdb、令牌吊销键跨套件互踩。
- 限流与用例的协作约束：限流按客户端 IP 计数（supertest 全为 127.0.0.1），必须成功的登录所在套件在用例前 `flushdb` 重置计数（如 `system.e2e-spec.ts` 的 `beforeEach`）；`auth.e2e-spec.ts` 的 429/锁定用例依赖计数累积，靠自身 `beforeEach flushdb` 隔离。新增会触发登录的 e2e 用例时遵循同一模式，不要突破登录限流 5 次/分（不放宽生产限额）。
- 前置：`docker compose up -d postgres redis`，再跑 `turbo run test:e2e --filter=@multi-admin/nestjs-server`。
- 全局 setup（`test/global-setup.ts` → `test/e2e-env.ts`）幂等建库 `multi_admin_test` + migrate deploy + seed；全局 teardown（`test/global-teardown.ts` → `test/helpers/cleanup.ts`）全表 truncate + FLUSHDB。
- 测试 env 默认值由 `test/setup-env.ts` 注入（DATABASE_URL / REDIS_URL / ADMIN_INIT_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET），支持真机 env 覆盖。

## nestjs-server 合并覆盖率流水线

- 命令：`turbo run test:coverage --filter=@multi-admin/nestjs-server`，链路：单测 `--coverage`（coverage/）→ e2e `--coverage`（coverage-e2e/）→ `test/merge-coverage.cjs`（istanbul 官方库合并 + 双报表 + 合并四指标 ≥80% 硬门槛，失败非零退出）。
- 前置与 e2e 相同：`docker compose up -d postgres redis`；合并报表产物在 `coverage-merged/`。
- 收集范围与排除清单为 `test/jest.base.cjs` 共享常量（单测 rootDir=src、e2e rootDir=应用根 各自组装）；`*.module.ts` 装配胶水不排除（e2e 运行期真实实例化）。
- `pnpm check` 口径不变（test 门仍只跑单测），覆盖率门禁是独立命令不并入日常门禁。
