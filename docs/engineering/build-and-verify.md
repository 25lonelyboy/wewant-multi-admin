---
status: living
covers:
  - .github/workflows/ci.yml
  - scripts/
  - .husky/
  - .lintstagedrc.json
  - apps/pure-web/Dockerfile
  - apps/nestjs-server/Dockerfile
  - apps/iot-worker/Dockerfile
  - docker-compose.yml
  - packages/contracts/
  - turbo.json
last_verified: 2026-11-07
---

# 构建与验证

命令速查见根 `AGENTS.md`；本文写门禁机制与构建链约束。

## 质量门禁（本地实时 + CI 异步兜底双层）

提交质量由两层机制保证，职责分离：

1. **本地拦截（commit / push 前）**：
   - **`pnpm check`**（`scripts/check.mjs`）：按序执行 Prettier 全量检查 → `turbo run typecheck / lint / stylelint` → `turbo run test` → test 覆盖显式枚举，任一失败立即非零退出。纯校验不改文件。提交前必跑。
   - **husky 钩子**：`pre-commit` 跑 lint-staged（配置在 `.lintstagedrc.json`，只处理暂存文件）；`commit-msg` 跑 commitlint（scope 强制 + 白名单，见 `commitlint.config.mjs`）。
   - **`pnpm ops:pre-push`**（`scripts/ops/pre-push.mjs`）：push 前 CI 同构校验，顺序执行 frozen-lockfile → `pnpm check` → `pnpm doc:lint` → audit（报警式）。
   - **`pnpm doc:lint`**（`scripts/doc-lint.cjs`，零依赖纯 node）：文档一致性与新鲜度校验（可达性 / 死链 / frontmatter / covers 漂移（文档 last_verified 早于被覆盖路径的最后变更日）/ 入口文件行数预算 / 终态痕迹 / 引用与定位符（含代码行号） / 索引一致性（含索引行精确计数） / 活文档体积基线），pre-push 与 CI doc-lint job 均挂载；检查项以脚本头部注释为准，终态痕迹词表在同目录 `final-state-rules.json`。副本与技能母版以 `--version` 比对，随治理任务同步。
2. **异步兜底（入库后，push master + nightly）**：`.github/workflows/ci.yml` 八 job 并行——`gate`（frozen-lockfile 安装 + `pnpm check` 服务端重验）、`docker-build`（三镜像构建验证（web / server / iot-worker）+ web/server 双启动冒烟：web curl 200、server /health+entrypoint 三段断言，server 冒烟依赖 job services postgres 与带认证的步骤容器 redis；不 push）、`coverage`（job services 含 postgres/emqx/redis-queue/tdengine，redis 以带认证的步骤容器启动；先跑 `tdengine:init` 建库建表，再跑 server 合并覆盖率、iot-worker 单测覆盖率、iot-worker e2e 三步，覆盖率两步 ≥80% 报警式硬门槛）、`coverage-web`（pure-web vitest 覆盖率报警式，全局聚合 ≥80% + crown-jewel 6 键 ≥90%）、`e2e-web`（Playwright Tier A mock 冒烟，grep `@mock-only`）、`e2e-web-real`（Tier B 真实后端冒烟，grep `@real-backend`，报警式 + nightly，双层 E2E 见 [ADR-008](../decisions/ADR-008-tiered-e2e-testing.md)）、`audit`（`pnpm audit --audit-level=high` 报警式）、`doc-lint`（文档一致性与新鲜度校验报警式）。定位与取舍见 `docs/decisions/ADR-006-github-ci.md`。⚠️ 业务缓存 Redis 在 `docker-build` / `coverage` / `e2e-web-real` 三个 job 里以**步骤容器**启动（`docker run … redis-server --requirepass "$REDIS_PASSWORD"` + 带认证的就绪等待），而非 `services:`——GH Actions service 容器不支持自定义启动参数、无法传 `--requirepass`；本地 compose 的 redis 绑全部接口，故必须认证（暴露面规则与残余风险见根 AGENTS.md）。
3. **纪律条款**：报警式不拦截的代价是红了必须有人看——**CI 红 → 下一项工作先修 CI**；感知窗口为根 README badge 与 GitHub watch 通知。
   - **报警式的实现前提**：`continue-on-error` 标在**步骤**上，拦的是那一步的退出码；同一 job 内**其他任何步骤失败仍会把 job 打成失败、整轮随之变红**——包括 action 自身的 post 步骤。因此报警式 job 不应引入与该 job 目标无关的步骤（2026-10-05 实例：`audit` job 的 `setup-node` 配了 `cache: pnpm`，而该 job 刻意不 install、无 pnpm store 可缓存，缓存 post 步骤路径校验失败 → 整轮 CI 变红）。

构建变体（`build:dir` / `build:staging` / `build:mp-weixin`）必须在 `turbo.json` 显式声明——新增变体不同步入图即不会被编排。

turbo env 透传约束：`envMode` 为 strict，只有声明过的环境变量才会传给 task 子进程——涉及 `prisma generate` 的任务必须在 `turbo.json` 声明 `env: ["DATABASE_URL"]`，测试任务追加 `REDIS_URL`；漏声明则该任务取不到连接串。

## 各端构建链

| 端 | 构建 | 说明 |
|---|---|---|
| pure-web | `vite build`（NODE_OPTIONS 加大内存） | 产物 `dist/` + `version.json`；staging 模式 `build:staging`；测试 `vitest run`（独立配置，不加载构建期插件）；覆盖率 `test:coverage`（全局聚合 + 文件级键，口径见 [frontend-testing-standard.md](frontend-testing-standard.md)） |
| nestjs-server | `prisma generate && nest build` | 产物 `dist/`（Prisma Client 由 generate 先行产出） |
| iot-worker | `tsc -p tsconfig.build.json` | 独立消费者进程产物 `dist/`（不打包，直接 `node dist/index.js` 运行）；turbo `^build` 先构建 contracts / device-registry |
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
- 本机编排：`cp .env.example .env` 填写 `POSTGRES_PASSWORD`、`REDIS_PASSWORD` 与 `ADMIN_INIT_PASSWORD` 后 `docker compose up`（postgres + redis + redis-queue + emqx + tdengine + server + worker + web **八服务**；server 依赖 postgres/redis 双健康，启动链 entrypoint 串 `prisma migrate deploy → prisma db seed → exec node`（幂等可重复）；worker 依赖 redis / redis-queue / tdengine 三健康，**无 migrate / seed、不碰 PG**）。库名统一 `multi_admin`；存量旧卷（旧库名初始化）需 `docker compose down -v` 重建。tdengine 容器设 `TZ: Asia/Shanghai`——窗口对齐取服务器时区，配错不报错只会把数据分进错的窗口。暴露面：`redis-queue` / `emqx` / `tdengine` 只绑宿主回环；`postgres` / `redis` 绑全部接口，故各自带认证（`POSTGRES_PASSWORD` / `REDIS_PASSWORD`）——规则与残余风险见根 AGENTS.md。
- env 注意：根 `.env` 的 `DATABASE_URL` 若手动设置，内嵌密码须与 `POSTGRES_PASSWORD` 一致（否则 server 连库失败而 postgres 容器正常，排障困难）；根 `.env` 的 `REDIS_URL` 须带凭据（`redis://:<REDIS_PASSWORD>@redis:6379`，空用户名落到 `default` 用户）并经 compose 插值注入 **server 与 worker**（`${REDIS_URL:?…}`），与 redis 的 `--requirepass` 同源；JWT 双密钥（`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`）必须不同，compose `:?` 强校验必填。server 与 worker 都读 `TDENGINE_URL`：容器内必须显式指向 `tdengine:6041`（compose 已传），指向 `127.0.0.1` 会连到容器自己；server 是**懒连接**，tdengine 未起不影响它启动，注册请求才失败。
- 镜像源参数化（`ARG PNPM_REGISTRY`），CI 通过 `build-args` 覆盖为官方源。
- 镜像 pin 与非 root：生产镜像统一 `tag@digest`（manifest-list 层级）pin，季度 `pnpm ops:check-digests` 巡检漂移；nestjs-server prod 阶段以 `USER node`（UID 1000）运行，compose 的 server 服务带 `no-new-privileges`；nginx 保留官方镜像 master-root 形态（绑 80 需要），迁至 restricted PSA / OpenShift 时换 nginx-unprivileged。

## ops 自动化脚本（scripts/ops/）

本地高频操作沉淀为可复用脚本，人和 Agent 均可调用。ESM 脚本复用 `@multi-admin/node-utils`，Shell 脚本统一 `#!/usr/bin/env bash` + `set -euo pipefail`。

| 命令 | 脚本 | 职责 |
|---|---|---|
| `pnpm ops:pre-push` | `pre-push.mjs` | push 前 CI 同构校验：frozen-lockfile + check + doc-lint + audit |
| `pnpm ops:ci` | `ci-status.sh` | CI 结果拉取：最近 5 次 run 状态 + 失败自动打印日志 |
| `pnpm ops:ci-logs` | `ci-logs.sh` | CI 失败日志导出：`.ci-failure-<id>.log`（Agent 可读取分析） |
| `pnpm ops:env-up` | `env-up.sh` | 开发环境启动：postgres + redis + redis-queue + emqx + tdengine + migrate + seed + tdengine:init |
| `pnpm ops:env-down` | `env-down.sh` | 开发环境停止（`--clean` 清除数据卷） |
| `pnpm ops:tdengine-init` | 转发 `@multi-admin/iot-worker` 的 `tdengine:init`（`apps/iot-worker/scripts/tdengine-init.ts`） | 建 TDengine 库 / 超表 / 子表 / 降采样子表，并清理遗留的降采样流（幂等，可反复执行；只建不删库）；`ops:env-up` 已串 |
| `pnpm ops:smoke` | `docker-smoke.sh` | 本地 Docker 冒烟（`--server` 追加构建 + 运行态冒烟） |
| `pnpm ops:server-smoke` | `server-smoke.sh` | server 镜像运行态冒烟（/health + entrypoint 三段断言；前置：镜像已构建 + ops:env-up） |
| `pnpm ops:coverage` | `coverage.mjs` | 本地覆盖率一键跑（`--skip-env` 跳过环境启停） |
| `pnpm ops:check-digests` | `check-digests.sh` | 镜像 digest pin 漂移巡检（季度，`docker buildx imagetools inspect` 比对） |
| `pnpm ops:upstream-diff` | `upstream-diff.sh` | pure-web 上游漂移报告（基线 SHA + target ref → 改动清单/变更地图/冲突面三件套；无基线参数降级仅本地侧） |
| `pnpm ops:worktree-init` | `worktree-init.sh` | 通用仓库就绪：`.git` 类型自动判定双场景（worktree 检出后初始化：依赖安装 + 主仓库 env 类文件白名单同步 + 钩子兜底；新克隆引导：技术栈探测 + `.env.example` 生成）；零依赖单文件，可复制到其他仓库；engines 校验读目标仓库 `package.json`；Windows 下经 WSL bash 执行，调用方须自仓库根以相对路径调用 |

⚠️ **降采样库一次性迁移**：降采样由 worker 侧定时重算、不用流。带旧开发卷的环境，`wewant_iot_ds` 内的聚合产自流机制、**不可信**，须手动 `DROP DATABASE wewant_iot_ds` 后重跑 `ops:tdengine-init` 重建。该 DROP 是**一次性人工动作、不进脚本**——`ops:env-up` 每次启动都调脚本，DROP 进脚本会把归档一并清掉；`wewant_iot` 原始库不受影响。

前置依赖：gh CLI（ci-status / ci-logs，需首次 `gh auth login`）、Docker Desktop（env-up / smoke / coverage / check-digests）、Git Bash 或 WSL bash（shell 脚本执行；仓库 `.sh` 统一 LF 行尾，见根 `.gitattributes`）、可联网环境（upstream-diff，需 fetch github）。

check-digests 远端比对依赖可联网环境：本机无 Registry 直连时按设计输出「远端 digest 获取失败」exit 1（本地同 tag 一致性检查仍有效）；CI 无该巡检 step（不在 CI 内新增验证逻辑），首次在线巡检需在可联网环境手动执行一次。

设备接入 e2e（iot 域）连真实 Broker：本地需 `pnpm ops:env-up`（含 redis-queue 与 tdengine），CI 的 `coverage` job 已配 emqx / redis-queue / tdengine 三个 service 并先跑 `tdengine:init`。链路跨两个应用：nestjs-server 侧的设备接入 e2e 验证「订阅 + 投队列」，iot-worker 侧的单测 / e2e 覆盖「解析 → 按声明过滤 → 攒批写入」（`turbo run test --filter` 与 `test:coverage` 分层口径见下）。`docker-build` 与 `e2e-web-real` 不需要 EMQX——接入链路连不上 Broker 只记 warn 并自动重连，不阻断应用启动（见 [backend.md](../architecture/backend.md) 设备接入链路）。

`set -o pipefail` 下 `docker logs X | grep -qF` 断言必假：grep -q 命中即退出使 docker logs 收到 SIGPIPE（exit 141），管道整体非零、`if` 恒假。写法必须是先捕获变量（`LOGS="$(docker logs X 2>&1 || true)"`）再 `echo "${LOGS}" | grep -qF` 断言。

共享全局状态（数据库 / Redis / 限流计数）的集成测试必须串行执行，或在用例边界重置共享键：jest 默认多 worker 并行时，A 套件的刻意限流用例会耗尽 B 套件登录所需配额，表现为登录必成断言随机 429、同代码可绿可红。

## 验证探针（scripts/probe/）

把官方文档说不清、又与决策相关的**服务端行为**跑成可复现的证据。约定：**零依赖**（只用 Node 内建 `fetch` 或仓库已有依赖）、走服务端自有接口、结论落进 `docs/tasks/` 并把查证状态登记到知识库的查证台账。

| 脚本 | 职责 |
|---|---|
| `tdengine-semantics.mjs` | TDengine 语义：省略列 / `NONE` 与 `NULL`、`ALTER STABLE` 代价、虚拟表能力边界、跨超表查询约束（走 taosAdapter REST） |
| `tdengine-lifecycle.mjs` | TDengine 生命周期：社区版审计能力、`ALTER DATABASE` 能力边界（`KEEP` 可改 / `DURATION` 不可改）、跨库查询、三级链式降采样、`avg of avg` 偏差、窗口 offset 与时区 |
| `tdengine-container.sh` | 起临时容器 → 等 taosAdapter 就绪 → 跑探针；`--down` 停掉 |
| `taosdump-roundtrip.sh` | `taosdump` 备份 / 恢复往返（内容全部在容器内执行）：`-M all` 往返、`-S`/`-E` 时间范围归档、`-M ext-meta` 备份流定义、`-W` 改名恢复、**`-M` 两侧不一致时的静默失效**。⚠️ 与 `tdengine-container.sh` 共用同一个容器 |

⚠️ **另有四个探针在应用目录下**，不在此目录——它们需要某个**按 catalog 判据只属于该应用**的依赖，仓库根没有，Node 从脚本所在目录向上解析依赖：

- `apps/iot-simulator/scripts/`：`mqtt-protocol-probe.mjs` / `mqtt-credential-probe.mjs`（需要 `mqtt`）。凭据探针还需一个**配了认证器的独立 Broker**（开发环境那台默认无认证，不适用）
- `apps/nestjs-server/scripts/tdengine-stmt-probe.mjs`（需要 `@tdengine/websocket`）：TDengine STMT 写入形态——一次 exec 跨多子表、两种跨子表写法、`USING` 语法自动建表、单次 bind/exec 的行数上限。⚠️ 它建自己的库 `probe_stmt` 并反复重建超表，**不要指向有数据的实例**
- `apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs`（需要 `@tdengine/websocket`）：TDengine「形态②」（`INSERT INTO <stb> (tbname, tag…, ts, …)` 且 `tbname` 作普通绑定参数）的两项行为——缺子表时**报错还是静默建表**、一次 `exec` 能否跨多个子表；**STMT2（连接器默认）与 STMT1（写入器强制）两条路径都测**。⚠️ 它建**自己的临时库** `probe_stmt_tb` 并跑完**整库删掉**，另快照 `wewant_iot` / `wewant_iot_ds` 的建表指纹验证真实库未被波及，**不要指向有数据的实例**

## 已知环境事实

- Windows 下 Electron 打包期可能出现 `dist-electron/` EPERM 文件锁：确保无残留 electron 进程后重跑。
- pnpm 安装含构建脚本的依赖受 `pnpm-workspace.yaml` 的 `allowBuilds` 白名单控制，新增需构建的原生依赖时要登记。

## pure-web 测试基建

- **单元测试**：vitest + @vue/test-utils + jsdom；配置 `apps/pure-web/vitest.config.ts`（独立于 `vite.config.ts`，不加载构建期插件）；覆盖范围 `src/**/*.{ts,tsx,vue}` + `build/*.ts` + `mock/*.ts`；阈值全局聚合 ≥80% + crown-jewel 6 键 ≥90%，exclude 治理与双层 E2E 细则见 [frontend-testing-standard.md](frontend-testing-standard.md)。
- **E2E 测试**：Playwright（`apps/pure-web/e2e/`）；登录全链路 + 关键页面冒烟（验证码 / 二维码 / 打印行为级由 E2E 覆盖；cropper 深度交互为永久豁免）。
- **TypeScript strict 单一配置**：`apps/pure-web/tsconfig.json` extends `@multi-admin/tsconfig/web.json`（继承 `strict: true` + `noUnusedLocals` / `noUnusedParameters` / `noImplicitOverride` / `noFallthroughCasesInSwitch` / `moduleDetection: "force"` 等开关）；无双 config、无清单断言、无豁免文件。typecheck 脚本：`tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck`。

## nestjs-server e2e 测试

- e2e 配置 `test/jest-e2e.cjs`（与单测 `jest.config.cjs` 共享 `test/jest.base.cjs` 基座）；`maxWorkers: 1` 串行执行——所有 spec 共享同一测试库与同一 Redis，并行会让 IP 维度限流计数、flushdb、令牌吊销键跨套件互踩。
- 限流与用例的协作约束：限流按客户端 IP 计数（supertest 全为 127.0.0.1），必须成功的登录所在套件在用例前 `flushdb` 重置计数（如 `system.e2e-spec.ts` 的 `beforeEach`）；`auth.e2e-spec.ts` 的 429/锁定用例依赖计数累积，靠自身 `beforeEach flushdb` 隔离。新增会触发登录的 e2e 用例时遵循同一模式，不要突破登录限流 5 次/分（不放宽生产限额）。
- 前置：`docker compose up -d postgres redis`，再跑 `turbo run test:e2e --filter=@multi-admin/nestjs-server`。
- 全局 setup（`test/global-setup.ts` → `test/e2e-env.ts`）幂等建库 `multi_admin_test` + migrate deploy + seed；全局 teardown（`test/global-teardown.ts` → `test/helpers/cleanup.ts`）全表 truncate + FLUSHDB。
- 测试 env 默认值由 `test/setup-env.ts` 注入（DATABASE_URL / REDIS_URL / ADMIN_INIT_PASSWORD / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET），支持真机 env 覆盖。其中 `REDIS_URL` 缺省取自应用 `.env`（业务缓存已开认证，测试与运行中的应用共用同一实例）；其余为测试专用缺省值。

## nestjs-server 合并覆盖率流水线

- 命令：`turbo run test:coverage --filter=@multi-admin/nestjs-server`，链路：单测 `--coverage`（coverage/）→ e2e `--coverage`（coverage-e2e/）→ `test/merge-coverage.cjs`（istanbul 官方库合并 + 双报表 + 合并四指标 ≥80% 硬门槛，失败非零退出）。
- 前置与 e2e 相同：`docker compose up -d postgres redis`；合并报表产物在 `coverage-merged/`。
- 收集范围与排除清单为 `test/jest.base.cjs` 共享常量（单测 rootDir=src、e2e rootDir=应用根 各自组装）；`*.module.ts` 装配胶水不排除（e2e 运行期真实实例化）。
- `pnpm check` 口径不变（test 门仍只跑单测），覆盖率门禁是独立命令不并入日常门禁。

## iot-worker 测试与覆盖率

- 单测 / e2e 走 Node 内建 `node --test`（`test/*.test.ts` 与 `test/*.e2e.ts`）；`test:coverage` 由 `apps/iot-worker/scripts/coverage.mjs` 驱动，只统计本应用 `src/**`，门槛行 ≥90% / 函数 ≥85% / 分支 ≥80%（用数组参数启动子进程，避免 shell 展开 `src/**` 使报告变空）。
- ⚠️ **覆盖率度量的是"单测进程加载过并执行到"的 `src/**`，不是"被测代码运行到的全部"**：Node 的 `--test-coverage-include` 是对**已加载文件**做过滤，故门禁只跑单测（`test/*.test.ts`）、**不计入 e2e 的执行**——e2e 连真实队列 Redis 与 TDengine，收进来会让门禁必须先起这两个服务、无法独立通过；e2e 由 `test:e2e` 单独跑。由此，**此前靠 e2e 顺带计入的那些执行不再进覆盖率**，两处最容易误解的要看清：
  - `src/index.ts`（运行时入口）**从不**在报告里——它以独立进程运行、不被任何测试 `import`，改动前后都度量不到。
  - `src/tdengine/client.ts` **仍在报告内**（`downsample/ring.ts` 被单测加载，连带加载它），但它的连接函数（`connectTd` 等）只由 e2e 执行 ⇒ 这部分的覆盖数值下移、实际由 `test:e2e`（CI coverage job 的对应步骤）覆盖，**不**由覆盖率门禁度量。
  即：**门禁是下限，不是运行期路径的完整度量**；消费/降采样链路的真实接线以 `test:e2e` 为准。
- **降采样逐条对账**（判据②，`apps/iot-worker/scripts/downsample-verify.ts`）：`pnpm --filter @multi-admin/iot-worker run downsample:verify` [选项]。对每个模型编码、最近 N 个窗口，把「原始表按子表窗口聚合」与降采样表**逐字段**比对（sum/count/min/max + deviceId 标签），差异化即报出 `(子表, 窗口, 字段, 期望, 实际)`；各模型三条输出表存在性 + 非空一并查。窗口口径与降采样环**同源**（复用 `window.ts` / `query.ts`），默认**跳过最新一个已闭合窗口**（吸收调度触发抖动）、比对 `K-1` 个窗口；`--now <ms|iso>` 可复算历史段，`--windows` / `--skip` / `--level` 可覆盖默认。浮点列（sum/min/max）取 `1e-9` 相对容差、`count` 精确比较（见脚本注释）。
  - **K 内 / K 外**：只有落在**环每轮重算的最近 K 个窗口**内的差异判失败、非零退出；`--windows > K` 把范围伸进「环不再维护」的窗口时，那里的差异（晚到数据造成的良性陈旧）只作 `⚠` 提示、不判失败。退出码 0 = K 契约区内无差异、**两侧计数均非 0**（原始侧 0 个 `(子表, 窗口)` 或降采样侧 0 行即判失败：「空对账不构成证据」，无 `--allow-empty` 逃生口）、各模型三条输出表存在且非空。
  - **一致性边界**：原始侧与降采样侧是两条独立语句。发现差异时脚本先**重读两侧**再比，只有重读后仍存的差异才报——排除「两次读之间发生一次写入」的假警报。前提是**管道相对静止**；活数据持续到达时，晚到数据造成的差异会在环下一轮重算 + 下次对账后消失。设计 §9 提出用单条 join 消除这条缝，但本机实测该 join 不受支持——约束在**形状**不在库位置：TDengine 要求 join 两侧都是合法时序输入、主时间戳在等值条件里，而**聚合 / 窗口子查询不是这样的输入**（报 `9828 Not supported join…`；纯子查询 ⋈ 同库超表、基础超表跨库 `on ts=` 均可），故用「重读两侧」这条等价做法。
- **只读子表审计**（`apps/iot-worker/scripts/subtable-audit.ts`）：`pnpm --filter @multi-admin/iot-worker run subtable:audit` [选项]。期望集来自**业务 Redis 的档案快照**；比对「库内全部子表」与「期望集」的四桶（孤儿 / 缺失 × 原始 / 降采样），任一非空退出码 1；`--json` 输出机器可读报告、`--list-all` 打全量名单（默认每桶最多列 20 张）。只读，**不含删除能力**——开发环境清库用重建卷，正式删除路径是 `subtable:cleanup`。⚠️ 没有快照时退出码 2；期望集为空时**拒绝判定**，否则整库都会被误报成孤儿。按库内全部子表比对，所以整个模型退场后它的遗留子表仍会被报出来。快照纳入退役设备（`ACTIVE` + `RETIRED`），注销后的子表不会被判成孤儿。
- **孤儿清理脚本**（`apps/iot-worker/scripts/subtable-cleanup.ts`）：`pnpm --filter @multi-admin/iot-worker run subtable:cleanup` [`--apply`] [`--json`] [`--list-all`]。**缺省 dry-run**：打印审计四桶与待删名单（`orphanRaw` + `orphanDs`），不执行任何删除；`--apply` 才删，结束后重新跑一次审计并打印剩余。**闸门**：快照不存在（退出码 2，与审计同口径）、期望集为空（退出码 1）、快照不新鲜（`builtAt` 超过 10 分钟、`built` 缺失或 `rev ≠ built`，退出码 1——防止拿滞后快照把刚注册的表删掉）。**新表保护期**：创建不足 10 分钟的表不进删除名单（注册是「先建 TD 表、后提交 PG」，快照看不到这段在途创建），dry-run 与 `--apply` 都列在「跳过」里；创建时间读不出的表按新表处理。**删除顺序原始优先、降采样随后**：中断时残留为孤儿降采样子表，它不被降采样读取，是惰性的；反过来先删降采样，会让降采样读到孤儿原始子表却写不进目标表、**整级重算失败**。单表删除重试 3 次、仍失败记 error 并继续，退出码非 0；只删名单里的名字，不按前缀匹配。`--apply` 之后只有「保护期外仍有孤儿或删除失败」才退出 1，缺失桶不属清理职责。
- 消费者 e2e（`test/consumer.e2e.ts`）连真实队列与 TDengine：前置 `docker compose up -d redis-queue tdengine` 并 `pnpm ops:tdengine-init`，另需导出**宿主可达**的业务 Redis `REDIS_URL`（快照来源；`.env` 里的 compose 服务名在宿主机解析不到）；队列与 TDengine 无假实现可用，这段接线是本应用唯一带真实外部依赖的部分，本地整体前置即 `pnpm ops:env-up`。CI coverage job 已配对应 service 并先跑 `tdengine:init`。
- ⭐ `test:e2e` 以 `--test-concurrency=1` **串行跑各文件**：多个 e2e 共享同一队列与同一 TDengine，并行会让 `obliterate` / 计数断言互相踩（与 nestjs-server e2e 的 `maxWorkers:1` 同一原因）。四处真实依赖的用例各司其职：
  - `consumer-kill.e2e.ts`——**判据③**：拉起**真实 worker 进程**（`node --import tsx src/index.ts`），在它把一批报文攒在内存、**尚未落库也尚未 ack** 的当口 `SIGKILL`，再起一个 worker，断言重投后**一条不丢、一条不重**（先断言杀前库里 0 行，证明报文只在内存里）。
  - `consumer-snapshot.e2e.ts`——**判据 A / C 的运行期证据**：只换快照、不重启消费者，新模型的 BOOL 与枚举测点按声明类型写入并回读；v1 区间的报文仍按 v1 声明解释。
  - `downsample-verify.e2e.ts`——**判据②**：驱动 F6 的逐条对账脚本（`verifyLevel`）对账，并**注入一处缺失、断言脚本必须报出**（只报"干净"的脚本证明不了什么），随后还原。
  - `downsample-worker.e2e.ts`——降采样队列的**真实 job 路径**：起真实 worker，让调度器产出的 `recompute` job 由真实 `Worker` 消费、走到 `onJob` 并落库（其余降采样 e2e 都注入 inert worker/queue，这条传导线此前只靠人工读回）。
  - `subtable-cleanup.e2e.ts`——清理脚本的真 TDengine 路径：造两张孤儿（原始 + 降采样）→ dry-run 名单 → `--apply` 逐名一致地删除 → 重跑归零；期望集取自库里现有的全部原始子表，前置审计若有别的孤儿即**直接失败**而不是顺手删掉，`finally` 清掉自己造的表。
