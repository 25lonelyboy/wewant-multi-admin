# nestjs-server

多端管理后台 monorepo 的后端应用：NestJS 11 + Prisma 7（PostgreSQL）+ Redis，提供 JWT 双令牌认证、五表三级 RBAC 与 system 域 CRUD（全局软删除），响应统一 `{ code, message, data }` 信封。

## 技术栈

| 层     | 选型                                                             |
| ------ | ---------------------------------------------------------------- |
| 框架   | NestJS 11（Express 平台），ESM 模块                              |
| 数据库 | Prisma 7 + PostgreSQL（driver adapter `PrismaPg` 自管连接池）    |
| 缓存   | Redis（ioredis）：限流计数、refresh token 注册表、登录失败锁定   |
| 认证   | passport-local + passport-jwt，JWT 双令牌轮换（argon2 密码哈希） |
| 校验   | zod（env 启动校验）+ class-validator（DTO）                      |
| 日志   | nestjs-pino 结构化日志（dev 可读 / 生产纯 JSON）                 |
| 契约   | `@multi-admin/contracts`（workspace 包，前后端同源类型与错误码） |

## 快速开始

前置：仓库根执行 `pnpm install`，Node ≥24、pnpm ≥11（根 `.npmrc` 已配置 registry 镜像）。

1. 启动依赖服务（PostgreSQL + Redis）：

   ```bash
   docker compose up -d postgres redis    # 或 pnpm ops:env-up（含 migrate + seed）
   ```

2. 配置环境变量：复制 `apps/nestjs-server/.env.example` 为 `.env` 并填写（详见下文「环境变量」）。
3. 迁移与 seed：

   ```bash
   pnpm --filter @multi-admin/nestjs-server run prisma:migrate
   pnpm --filter @multi-admin/nestjs-server run prisma:seed
   ```

   seed 由 `ADMIN_INIT_PASSWORD` 创建超管（仅首次生效，不覆盖已有用户）。

4. 启动：

   ```bash
   pnpm --filter @multi-admin/nestjs-server run dev
   ```

   服务默认监听 3000 端口；非生产环境 Swagger 挂载于 `api/docs`，健康探针 `/health`（不受 `api/v1` 前缀约束）。

## 命令速查

```bash
pnpm --filter @multi-admin/nestjs-server run dev            # watch 启动（prisma generate 先行）
pnpm --filter @multi-admin/nestjs-server run build          # prisma generate + nest build
pnpm --filter @multi-admin/nestjs-server run lint           # eslint --max-warnings 0
pnpm --filter @multi-admin/nestjs-server run typecheck      # prisma generate + tsc --noEmit
pnpm --filter @multi-admin/nestjs-server run test           # 单测（jest，无需外部服务）
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts   # 单个单测文件
pnpm --filter @multi-admin/nestjs-server run test:e2e       # e2e（前置：docker compose up -d postgres redis）
pnpm --filter @multi-admin/nestjs-server run test:coverage  # 单测+e2e 合并覆盖率（≥80% 硬门槛，前置同上）
pnpm --filter @multi-admin/nestjs-server run prisma:migrate # prisma migrate dev（改 schema 后）
pnpm --filter @multi-admin/nestjs-server run prisma:seed    # 显式 seed（Prisma 7 migrate dev 不再自动 seed）
```

## 环境变量

所有变量在 `src/config/env.schema.ts` 以 zod 声明，校验失败启动即崩；`apps/nestjs-server/.env.example` 含完整注释版。

| 变量                                       | 说明                                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| `PORT`                                     | 服务端口，默认 3000                                   |
| `NODE_ENV`                                 | development / test / production                       |
| `LOG_LEVEL`                                | fatal / error / warn / info / debug / trace           |
| `CORS_ORIGIN`                              | 逗号分隔多来源，默认 `http://localhost:8848`          |
| `DATABASE_URL`                             | PostgreSQL 连接串（本机开发指向 compose 映射的 5432） |
| `REDIS_URL`                                | Redis 连接串                                          |
| `ADMIN_INIT_PASSWORD`                      | seed 超管初始口令（仅首次生效）                       |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 双密钥，必须不同且 ≥32 字符                           |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`       | 默认 `15m` / `7d`                                     |
| `BODY_LIMIT`                               | 全局请求体大小，默认 `1mb`                            |
| `UPLOAD_BODY_LIMIT`                        | 上传路由 `/api/v1/upload` 大小，默认 `10mb`           |
| `PRISMA_SLOW_QUERY_MS`                     | 慢查询阈值，默认 500ms                                |
| `DATABASE_POOL_MAX`                        | 连接池最大连接数，默认 20                             |
| `PRISMA_QUERY_LOG`                         | 全量查询日志开关（排障临时用，默认 false）            |

## 测试

- **单测**（`test`）：jest，无需外部服务；mock Prisma/Redis。
- **e2e**（`test:e2e`）：前置 `docker compose up -d postgres redis`；`maxWorkers: 1` 串行执行，所有 spec 共享测试库 `multi_admin_test` 与同一 Redis——新增会触发登录的套件必须 `beforeEach flushdb` 重置限流计数，不得突破限流配额。
- **合并覆盖率**（`test:coverage`）：单测 + e2e 合并报表，四指标 ≥80% 硬门槛（失败非零退出）。

细节见 [`docs/engineering/build-and-verify.md`](../../docs/engineering/build-and-verify.md)。

## 架构与文档

- 模块分层 / 请求链 / API 约定 / 数据库事实：[`docs/architecture/backend.md`](../../docs/architecture/backend.md)
- 契约与错误码表：[`docs/architecture/contracts.md`](../../docs/architecture/contracts.md)
- 演进路线图：[`docs/architecture/backend-evolution.md`](../../docs/architecture/backend-evolution.md)
- 待处置项：[`docs/governance/backlog.md`](../../docs/governance/backlog.md)
- AI 协作指南（硬规则）：本目录 [`AGENTS.md`](./AGENTS.md)
