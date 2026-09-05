# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## 项目概览

多端管理后台 pnpm monorepo，由四应用 + 两类共享包组成：

| Workspace               | 说明                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pure-web`         | Vue3 管理后台（vue-pure-admin 基底），缺省直连真实后端（代理 `/api/v1`），`VITE_MOCK=true` 切离线 mock（契约同形）；vitest 单测 + Playwright E2E；应用级见 [apps/pure-web/AGENTS.md](apps/pure-web/AGENTS.md)                         |
| `apps/nestjs-server`    | NestJS 后端：Prisma + Redis、JWT 双令牌轮换 + RBAC、system 三域 CRUD（软删除）、单测/e2e 合并覆盖率门禁；应用级见 [apps/nestjs-server/AGENTS.md](apps/nestjs-server/AGENTS.md)，架构细节见 [backend.md](docs/architecture/backend.md) |
| `apps/uni-mobile`       | uni-app 多端应用（H5 + 各家小程序），基于 Vue3                                                                                                                                                                                        |
| `apps/electron-desktop` | Electron 桌面端，托管 pure-web 构建产物作为渲染层                                                                                                                                                                                     |
| `packages/common`       | 跨端共享 TS 代码（tsdown 构建），暂无应用实际引用                                                                                                                                                                                     |
| `packages/contracts`    | 前后端接口契约包（纯类型 + BizCode/MenuType 常量），nestjs-server 与 pure-web 以 `workspace:*` 消费                                                                                                                                   |
| `internal/*`            | 仓库内部工具：`eslint-config` / `stylelint-config` / `tsconfig` / `node-utils`                                                                                                                                                        |

环境约束：Node >=24（`.nvmrc` pin 24.18.1）、pnpm >=11（`engines` + 根 `.npmrc` `engine-strict=true` 强制）；registry 与 Electron 二进制镜像已在根 `.npmrc` 配置。

## 常用命令

```bash
pnpm install
pnpm dev:web / dev:server / dev:mobile / dev:desktop   # 各端启动（turbo 编排）
pnpm build                        # 全量构建（turbo 任务图 + 缓存）
pnpm build:web / build:desktop    # build:desktop 经任务图 ^build 自动先构建 pure-web
pnpm check                        # 本地质量门禁：prettier → typecheck → lint → stylelint → test → test 覆盖枚举，纯校验不改文件
pnpm lint / typecheck             # turbo 编排的全 workspace 校验
pnpm format / format:check        # Prettier 写入 / 纯校验（CI 用 format:check）

# nestjs-server 本地开发前置：docker compose up -d postgres redis（或 pnpm ops:env-up）
pnpm --filter @multi-admin/nestjs-server run prisma:migrate   # prisma migrate dev
pnpm --filter @multi-admin/nestjs-server run prisma:seed      # 显式 seed（Prisma 7 起 migrate dev 不再自动 seed）

# 运行单个测试文件（nestjs-server 为 jest，pure-web 为 vitest；分层口径见 docs/engineering/build-and-verify.md）
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts
pnpm --filter @multi-admin/pure-web run test -- src/utils/auth.spec.ts
pnpm --filter @multi-admin/nestjs-server run test:e2e         # 需 compose postgres/redis
pnpm --filter @multi-admin/nestjs-server run test:coverage    # 单测+e2e 合并覆盖率（≥80% 门禁）
pnpm --filter @multi-admin/pure-web run test:coverage         # vitest v8 覆盖率（glob 阈值 ≥80%）
pnpm --filter @multi-admin/pure-web run test:e2e              # Playwright E2E（自启 mock 模式 dev server）

# 运维辅助脚本（完整表见 docs/engineering/build-and-verify.md）
pnpm ops:env-up / ops:env-down    # 开发环境启停（postgres + redis + migrate + seed）
pnpm ops:pre-push                 # push 前 CI 同构校验（frozen-lockfile + check + doc-lint + audit）
pnpm ops:ci / ops:ci-logs         # CI 状态拉取 / 失败日志导出
pnpm ops:smoke / ops:coverage     # Docker 冒烟 / 覆盖率报表
pnpm ops:check-digests            # 镜像 digest pin 季度漂移巡检（新建 Dockerfile/compose/CI 镜像引用时同步维护）

# 文档治理自检（孤儿/死链/frontmatter/covers 漂移/行数；根 "type": "module" 故副本用 .cjs）
pnpm doc:lint
```

## 架构要点

- **构建编排（turbo 任务图）**：跨包顺序由 `turbo.json` `dependsOn: ["^build"]` 推导，pre 钩子已全量移除；入口一律 `turbo run <task> [--filter=X]`（根脚本已封装），裸 `pnpm --filter X run <script>` 为非入口专家操作、不保证链路。Turborepo 不透传自定义 env——涉及 `prisma generate` 的任务必须声明 `env: ["DATABASE_URL"]`（测试任务加 `REDIS_URL`）；Docker 容器内以 `pnpm --filter X... run build` 原生拓扑兜底（[ADR-005](docs/decisions/ADR-005-turbo-build-orchestration.md)）。
- **contracts 先行**：契约变更先改 `packages/contracts`（纯类型 + 常量），双端再实现/接线；mock 与真实后端契约同形，扩展流程与错误码表见 [contracts.md](docs/architecture/contracts.md)。
- **NestJS 后端**：模块分层、请求链、API 约定（全局前缀 `api/v1`、信封 `{ code, message, data }`）、数据库事实见 [backend.md](docs/architecture/backend.md)。
- **桌面端链路**：turbo `^build` 编排 pure-web 产物 → esbuild 编译主进程（ESM）/preload（CJS，sandbox 要求）→ 复制 dist 到 `dist-electron/web/` → electron-builder 打包；渲染层由自定义 `app://` 协议托管（含路径穿越防护）；单实例锁 + 托盘常驻（关窗隐藏不退出）。细节见 [desktop-app.md](docs/architecture/desktop-app.md)。
- **Lint 薄壳模式**：各应用 eslint / stylelint 一行引用 `internal/*` 工厂；ESLint 只校验（`--max-warnings 0`），格式化由 Prettier 独占。
- **Docker**：镜像构建必须以仓库根为 context；compose 含 postgres / redis / server / web 四服务，server 启动链 `prisma migrate deploy → prisma db seed → exec node`（幂等）；库名统一 `multi_admin`（存量旧卷需 `down -v` 重建）；本地 redis 无密码映射宿主 6379，禁止暴露生产/共享网络。env 注意事项见 [build-and-verify.md](docs/engineering/build-and-verify.md)。
- **质量门禁双层**：本地实时（`pnpm check` + husky lint-staged）+ GitHub CI 异步兜底（`.github/workflows/ci.yml`，push master 触发，七 job：gate / docker-build / coverage / coverage-web / e2e-web / audit / doc-lint，报警式不拦截，[ADR-006](docs/decisions/ADR-006-github-ci.md)）。**CI 红 → 下一项工作先修 CI。**

## 安全不变量

- preload 仅暴露具名方法，禁止 `ipcRenderer` 泛通道透传；新增 IPC 能力需主进程 handler、preload 具名方法、`types/ipc.d.ts` 三处同步
- Electron 生态依赖（electron / electron-builder）精确 pin，不加 `^`
- argon2 密码哈希永不落日志

## 硬规则

- 提交信息遵循 conventional commits 且必须携带 scope，白名单见 `commitlint.config.mjs`：`server` / `mobile` / `web` / `desktop` / `common` / `internal` / `repo` / `deps` / `release` / `docs`。
- 新增依赖先过 catalog 判据（≥2 个 workspace 消费 / 框架级依赖 / 刻意固定版本），不满足则留在应用本地；禁止靠根 package.json hoisting 共享。
- catalog 中刻意 pin 的包保持 pinned，不擅自补 `^`；版本大不兼容时用 named catalog 隔离（如 `catalog:uni-app`）。
- 改变已文档化行为的代码变更，必须在同一提交内更新对应文档。
- 文档禁止写入密钥、token、内网地址。

## 文档治理

- 读取顺序：本文件 → [docs/README.md](docs/README.md) → 对应领域 README → 最小主题文件；按需读取，不要求通读。在某个应用内工作时，优先读该应用的 AGENTS.md（已有：[apps/pure-web](apps/pure-web/AGENTS.md) / [apps/nestjs-server](apps/nestjs-server/AGENTS.md)）。
- 事实源：架构事实在 `docs/architecture/`，工程实践在 `docs/engineering/`，决策在 `docs/decisions/`（ADR），过程材料在 `docs/tasks/`，backlog 在 `docs/governance/`。
- 文档与代码冲突时以代码为准，并修复文档；信任活文档 frontmatter 的 `last_verified`，不信任编辑时间。文档变更后跑 `pnpm doc:lint` 验收（副本落后于技能母版时随重组更新）。
- 新文档必须归位到对应层目录，并登记进该目录 README 索引。
