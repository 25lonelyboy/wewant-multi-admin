# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## 应用定位

`apps/nestjs-server` 是多端管理后台 monorepo 的后端应用：NestJS 11 + Prisma 7（PostgreSQL）+ Redis + JWT 双令牌轮换 + 五表三级 RBAC，响应统一 `{ code, message, data }` 信封。

本文件只写本应用特有内容；仓库全局规则（依赖 catalog 判据、commit scope 白名单、Docker 构建 context、文档治理读取顺序）见根 [`AGENTS.md`](../../AGENTS.md)，架构事实源见 [`docs/architecture/backend.md`](../../docs/architecture/backend.md)。

## 常用命令

从仓库根执行（本地开发前置：`docker compose up -d postgres redis`）：

```bash
pnpm --filter @multi-admin/nestjs-server run dev            # watch 启动（prisma generate 先行）
pnpm --filter @multi-admin/nestjs-server run build          # prisma generate + nest build
pnpm --filter @multi-admin/nestjs-server run lint           # eslint --max-warnings 0
pnpm --filter @multi-admin/nestjs-server run typecheck      # prisma generate + tsc --noEmit
pnpm --filter @multi-admin/nestjs-server run test           # 单测（jest，无需外部服务）
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts   # 单个单测文件
pnpm --filter @multi-admin/nestjs-server run test:e2e       # e2e（需 compose postgres/redis）
pnpm --filter @multi-admin/nestjs-server run test:coverage  # 单测+e2e 合并覆盖率，≥80% 硬门槛（需 compose）
pnpm --filter @multi-admin/nestjs-server run prisma:migrate # prisma migrate dev（改 schema 后）
pnpm --filter @multi-admin/nestjs-server run prisma:seed    # 显式 seed（Prisma 7 migrate dev 不再自动 seed）
```

## 架构要点

- **模块分层**（详见 backend.md）：`config/`（AppConfigModule，Zod 校验 env + 类型安全访问）、`common/`（横切：bootstrap 装配 / guards / filters / interceptors / errors / redis / throttler / logging / middleware）、`database/`（PrismaModule）、`modules/`（auth / system / health 三个域）、`generated/`（prisma generate 产物，git-ignored）。
- **组合根**：`app.module.ts` 只 import 三个域聚合模块 + 基础设施模块；全局横切经 `APP_GUARD`（RedisThrottlerGuard → JwtAuthGuard → PermissionsGuard 链）、`APP_FILTER`、`APP_INTERCEPTOR` 注册。新域遵循 `SystemModule` 聚合模式（域聚合模块包 leaf，app.module 只 import 聚合）。
- **装配共享**：`common/bootstrap/apply-app-defaults.ts` 是 main.ts 与 e2e 共用的应用装配（全局前缀 `api/v1`（exclude `health`）/ helmet / 请求体大小（上传路由 UPLOAD_BODY_LIMIT 优先于全局 BODY_LIMIT）/ ValidationPipe / CORS / Swagger / shutdown 钩子），修改应用级中间件时只改这一处。
- **请求链**：`requestId 中间件 → helmet → json → CORS → ValidationPipe → 限流 → JWT → 权限 → Controller → ResponseEnvelopeInterceptor`。
- **Prisma**：datasource url 由 `prisma.config.ts` 从 env 读取；连接池经 driver adapter（`PrismaPg`）自管，`DATABASE_POOL_MAX` 显式配置；query 日志经 `PRISMA_SLOW_QUERY_MS` 阈值 warn + `PRISMA_QUERY_LOG` 全量开关（排障临时用）；seed 走 `tsx` 执行 TS 源码，`ADMIN_INIT_PASSWORD` 创建超管。
- **env 单点声明**：所有环境变量必须在 `src/config/env.schema.ts` 的 zod schema 中声明（校验失败启动即崩）；测试默认值在 `test/setup-env.ts` 注入。

## 硬规则

- **ESM 风格**：相对导入必须带 `.js` 后缀（如 `import { AppModule } from './app.module.js'`）。
- **错误体系**：业务错误一律抛 `BizException(BizCode)`，禁止裸抛 HttpException 或直接返回非信封结构；错误码表与扩展流程见 [`docs/architecture/contracts.md`](../../docs/architecture/contracts.md)。
- **contracts 先行**：接口契约变更（类型、错误码、常量）先改 `packages/contracts`，本应用与 pure-web 再各自接线。
- **认证/权限**：默认所有端点需认证，公开端点必须显式 `@Public()`；权限点用 `@RequirePermissions()`；JWT 双 secret（`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`）必须不同且 ≥32 字符。
- **e2e 串行与隔离**：`maxWorkers: 1` 串行执行，所有 spec 共享测试库 `multi_admin_test` 与同一 Redis——并行会让限流计数、flushdb 互踩。会触发登录的套件必须 `beforeEach flushdb` 重置限流计数；新增登录 e2e 用例不得突破限流配额（不放宽生产限额）。
- **安全不变量**：argon2 密码哈希永不落日志；日志 redact `req.headers.authorization` / `*.password`；软删除无全局中间件，查询必须显式携带 `deletedAt: null` 条件（含嵌套关系过滤，如 `roles: { where: { role: { deletedAt: null } } }`），删除操作写 `deletedAt` 而非物理删行。
- **文档同步**：改变已文档化行为（API 约定、限流数值、env 变量、模块边界）的代码变更，必须同一提交内更新 backend.md 或 contracts.md。

## 文档导航

- 根 [`AGENTS.md`](../../AGENTS.md) → [`docs/README.md`](../../docs/README.md) → 按需读取，不要求通读。
- 本应用事实源：`docs/architecture/backend.md`（分层/请求链/API 约定/数据库）、`docs/architecture/contracts.md`（契约与错误码）、`docs/architecture/backend-evolution.md`（演进路线图）。
- 工程实践：`docs/engineering/build-and-verify.md`（质量门禁 / e2e / 合并覆盖率流水线细节）。
- 待处置项：`docs/governance/backlog.md`（新识别项先进开放表，关闭后移动至关闭表）。
