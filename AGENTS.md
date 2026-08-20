# AGENTS.md

This file provides guidance to Lingma (lingma.aliyun.com) when working with code in this repository.

## 项目概览

多端管理后台 pnpm monorepo，由四应用 + 两类共享包组成：

| Workspace               | 说明                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pure-web`         | Vue3 管理后台（vue-pure-admin 基底：Element Plus + Tailwind + Pinia），当前用 vite-plugin-fake-server mock 数据，尚未接入真实后端                                   |
| `apps/nestjs-server`    | NestJS 后端：骨架与横切基建、Prisma + Redis、认证链（JWT 双令牌轮换 + RBAC 守卫链）、system RBAC CRUD（全局软删除）与单测/e2e 合并覆盖率门禁均已交付，前端联调待 P5 |
| `apps/uni-mobile`       | uni-app 多端应用（H5 + 各家小程序），基于 Vue3                                                                                                                      |
| `apps/electron-desktop` | Electron 桌面端，托管 pure-web 构建产物作为渲染层                                                                                                                   |
| `packages/common`       | 跨端共享 TS 代码（tsdown 构建），暂无应用实际引用                                                                                                                   |
| `internal/*`            | 仓库内部工具：`eslint-config` / `stylelint-config` / `tsconfig` / `node-utils`                                                                                      |

环境约束：Node >=24、pnpm >=11（`engines` 字段 + 根 `.npmrc` 的 `engine-strict=true` 强制）；registry 与 Electron 二进制镜像已在根 `.npmrc` 配置，无需额外设置。

## 常用命令

```bash
pnpm install                      # 安装依赖
pnpm dev:web                      # 启动 pure-web
pnpm dev:server                   # 启动 NestJS（watch 模式）
pnpm dev:mobile                   # 启动 uni-app H5
pnpm dev:desktop                  # 启动 Electron 桌面端
pnpm build                        # 全量构建所有 workspace
pnpm build:web                    # 仅构建 pure-web
pnpm build:desktop                # 打包桌面端安装包（prebuild 自动先构建 pure-web）
pnpm check                        # 本地质量门禁：prettier → typecheck → lint → test，任一失败即终止
pnpm lint                         # 全 workspace lint
pnpm typecheck                    # 全 workspace 类型检查
pnpm format                       # Prettier 全量格式化

# nestjs-server 本地开发前置：先 docker compose up -d postgres redis（或全量 up）
pnpm --filter @multi-admin/nestjs-server run prisma:migrate   # 本地迁移（prisma migrate dev）
pnpm --filter @multi-admin/nestjs-server run prisma:seed      # 显式 seed（Prisma 7 起 migrate dev 不再自动 seed）

# 运行单个测试文件（目前仅 nestjs-server 有 jest 基建）
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts
pnpm --filter @multi-admin/nestjs-server run test:e2e   # e2e 测试（jest-e2e.cjs，需 docker compose up -d postgres redis）
pnpm --filter @multi-admin/nestjs-server run test:coverage  # 单测+e2e 合并覆盖率（≥80% 门禁），前置 compose postgres/redis
```

## 架构要点

- **版本治理**：多消费者/框架级依赖统一走 `pnpm-workspace.yaml` 的 `catalog:`；uni-app 的 Vite 5.2.8 用 named catalog `catalog:uni-app` 隔离；jest 30.4.1 被 catalog + overrides 双重 pin。
- **桌面端链路**：`electron-desktop` 的 `prebuild` 钩子编排 pure-web 构建 → esbuild 编译主进程/preload（`esbuild.config.mjs`）→ electron-builder 打包（`electron-builder.yml`）；渲染层由自定义协议（`electron/main/protocol.ts`）托管 pure-web 产物；单实例锁 + 托盘常驻（关窗隐藏不退出）。
- **安全不变量**：preload 仅暴露具名方法，禁止 `ipcRenderer` 泛通道透传；Electron 生态依赖（electron / electron-builder）精确 pin，不加 `^`。
- **Lint 薄壳模式**：各应用 eslint / stylelint 配置一行引用 `@multi-admin/eslint-config` / `@multi-admin/stylelint-config` 工厂函数；职责分离——ESLint 只校验，格式化由 Prettier 独占；lint 带 `--max-warnings 0`。
- **Docker**：web / server 镜像构建必须以仓库根为 context（如 `docker build -f apps/pure-web/Dockerfile .`）；本机编排 `docker compose up`（先复制根 `.env.example` 为 `.env` 并填写密码）。compose 含 postgres / redis / server / web 四服务，server 启动链 entrypoint：`prisma migrate deploy → prisma db seed → exec node`（幂等可重复）。库名统一 `multi_admin`（测试库 `multi_admin_test`）；历史上用过旧库名（`multi-admin` 等）的存量 postgres 卷需 `docker compose down -v` 重建后才会以 `multi_admin` 初始化（存量卷的 `POSTGRES_DB` 不生效）。红线：本地 compose 的 redis 无密码且映射宿主 6379，仅限本地开发，生产/共享网络禁止直接暴露。env 模板两处注意：根 `.env` 的 `DATABASE_URL` 若手动设置，内嵌密码须与 `POSTGRES_PASSWORD` 一致（否则 server 连库失败而 postgres 容器正常，排障困难）；根模板的 `REDIS_URL` 经 compose 插值注入 server（`docker-compose.yml` 中 `${REDIS_URL:-redis://redis:6379}`）。
- **无 CI/CD**：质量门禁只有本地 `pnpm check` + husky 钩子（pre-commit 跑 lint-staged，commit-msg 跑 commitlint）。

## 硬规则

- 提交信息遵循 conventional commits 且必须携带 scope，白名单见 `commitlint.config.mjs`：`server` / `mobile` / `web` / `desktop` / `common` / `internal` / `repo` / `deps` / `release` / `docs`。
- 新增依赖先过 catalog 判据（≥2 个 workspace 消费 / 框架级依赖 / 刻意固定版本），不满足则留在应用本地 package.json；禁止靠根 package.json hoisting 共享（会产生幻影依赖）。
- catalog 中刻意 pin 的包保持 pinned，不要擅自补 `^`；版本大不兼容时用 named catalog 隔离而非强行统一。
- 改变已文档化行为的代码变更，必须在同一提交内更新对应文档。
- 文档禁止写入密钥、token、内网地址。

## 文档治理

- 读取顺序：本文件 → [docs/README.md](docs/README.md) → 对应领域 README → 最小主题文件；按需读取，不要求通读。
- 事实源：架构事实在 `docs/architecture/`，工程实践在 `docs/engineering/`，决策在 `docs/decisions/`（ADR），过程材料在 `docs/tasks/`。
- 文档与代码冲突时以代码为准，并修复文档；信任活文档 frontmatter 的 `last_verified`，不信任编辑时间。
- 新文档必须归位到对应层目录，并登记进该目录 README 索引。
