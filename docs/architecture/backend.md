---
status: living
covers:
  - apps/nestjs-server/
last_verified: 2026-08-28
---

# NestJS 后端架构

`apps/nestjs-server` 的模块分层、请求链、API 约定与数据库事实。技术选型决策见 [ADR-004](../decisions/ADR-004-contracts-and-backend-stack.md)，前后端契约见 [contracts.md](contracts.md)，测试与覆盖率流水线见 [build-and-verify.md](../engineering/build-and-verify.md)。

## 模块分层

```text
src/
├── config/          # AppConfigModule（@Global）：Zod 校验 env → AppConfigService 类型安全访问
├── common/          # 横切关注点
│   ├── bootstrap/   # applyAppDefaults：全局前缀 / helmet / 请求体大小限制（json） / ValidationPipe / CORS / Swagger / shutdown 钩子（main.ts 与 e2e 共用）
│   ├── filters/     # AllExceptionsFilter → 统一错误响应格式
│   ├── guards/      # JwtAuthGuard（全局）→ PermissionsGuard（RBAC 权限点）
│   ├── interceptors/# ResponseEnvelopeInterceptor → { code, message, data } 信封
│   ├── decorators/  # @Public() @RequirePermissions() @CurrentUser()
│   ├── errors/      # BizException + BizCode 业务错误体系 + exception-resolver
│   ├── redis/       # RedisModule：ioredis 单例，快速失败，3s 竞速 quit
│   ├── throttler/   # RedisThrottlerGuard/Storage：限流走 Redis 后端（跨实例一致）
│   ├── logging/     # AppLoggerModule：nestjs-pino，dev=pretty / prod=JSON
│   ├── middleware/  # request-id 中间件（X-Request-Id 或自生成 UUID）
│   └── types/       # 共享类型声明
├── database/        # PrismaModule（@Global）：PrismaService 生命周期管理
├── modules/
│   ├── auth/        # 认证域：LocalStrategy + JwtStrategy + TokenService（双令牌轮换）
│   ├── system/      # RBAC 三域 CRUD：user / role / menu（全局软删除）
│   └── health/      # /health 探针（DB + Redis），不受全局前缀约束
└── generated/       # prisma generate 产物（git-ignored）
```

## 请求处理链

`requestId 中间件 → helmet（非生产关 CSP，Swagger UI 依赖内联脚本）→ json 请求体解析（路由级 UPLOAD_BODY_LIMIT 优先于全局 BODY_LIMIT）→ CORS（逗号分隔多来源）→ ValidationPipe(whitelist+transform，自定义 exceptionFactory 展开字段级校验明细) → RedisThrottlerGuard → JwtAuthGuard → PermissionsGuard → Controller → ResponseEnvelopeInterceptor`

## API 约定

- 全局前缀 `api/v1`（`exclude: ['health']`）
- Swagger 仅非生产环境启用，挂载于 `api/docs`（Bearer 认证 scheme）
- 响应统一信封：`{ code: number, message: string, data: T }`
- 校验失败（40001）时 `data.errors` 携带字段级明细 `{ field, message }[]`（field 为点分路径，如 `meta.title`，见 [contracts.md](contracts.md)）；其余错误 `data: null`
- 业务错误走 `BizException`（携带 `BizCode` 枚举），由 `AllExceptionsFilter` 经 exception-resolver 统一格式化；错误码表与信封扩展规则见 [contracts.md](contracts.md)
- 限流：登录同 IP 5 次/分；账号维度连续失败 5 次锁定 15 分钟（自动解锁，锁定中返回 42301）；refresh-token 10 次/分；全局 60 次/分
- 请求体大小：全局 `BODY_LIMIT`（默认 `1mb`），上传路由 `/api/v1/upload` 用 `UPLOAD_BODY_LIMIT`（默认 `10mb`）

## 数据库

Prisma 7 + PostgreSQL，五表（User / Role / Menu / UserRole / RoleMenu）三级 RBAC，全局软删除。

- datasource url 由 `prisma.config.ts` 管理（运行期从 env 读取）；产物输出 `src/generated/`
- 连接池经 driver adapter 自管：`DATABASE_POOL_MAX`（默认 20）显式配置；query 事件经纯函数 `resolveQueryLog` 决策日志——超阈值（`PRISMA_SLOW_QUERY_MS`，默认 500ms）warn 级 `Slow query detected`，`PRISMA_QUERY_LOG=true` 时低于阈值查询以 log 级 `Query log` 输出（排障临时开关）
- seed 走 `tsx` 执行 TS 源码（`prisma/seed.ts`）；首次启动由 `ADMIN_INIT_PASSWORD` 环境变量创建超管
- 库名统一 `multi_admin`（测试库 `multi_admin_test`）；e2e 幂等建库 + migrate deploy + seed，见 [build-and-verify.md](../engineering/build-and-verify.md)
- argon2 密码哈希，永不落日志
