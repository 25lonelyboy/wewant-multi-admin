---
status: draft
covers:
  - apps/nestjs-server/
last_verified: 2026-08-27
---

# Server 基建速赢实施计划

> 对应设计：[2026-08-26-server-infra-quickwins-design.md](2026-08-26-server-infra-quickwins-design.md)

## 前提

- 工作区干净（`git status` 无未提交改动），设计文档已提交。
- `pnpm install` 已执行，`docker compose up -d postgres redis` 可连接。
- 每次提交后运行 `pnpm --filter @multi-admin/nestjs-server run test` 验证。

## Task 0：前置确认

**Step 1**：确认工作区干净

```bash
git status --short
# 应无输出（设计文档已提交）
```

**Step 2**：确认 nestjs-server 单测可通过

```bash
pnpm --filter @multi-admin/nestjs-server run test
# 全绿，记录当前基线
```

---

## Task 1：校验错误返回字段级明细

**目标**：ValidationPipe 校验失败时，响应 `data.errors` 返回 `{ field, message }` 数组。

**改动文件**（3 个源码 + 2 个测试）：

| 文件 | 动作 |
|---|---|
| `src/common/bootstrap/apply-app-defaults.ts` | ValidationPipe 加 `detailedOutputMessages` + `exceptionFactory` |
| `src/common/errors/exception-resolver.ts` | `ResolvedError` 加 `data?: unknown`；BadRequest 分支提取 errors |
| `src/common/filters/all-exceptions.filter.ts` | 解构 `data` 并透传到响应体 |
| `src/common/errors/exception-resolver.spec.ts` | 新增 2 case |
| `src/common/filters/all-exceptions.filter.spec.ts`（新建） | 验证 data 透传 |

### Step 1：写失败测试

`exception-resolver.spec.ts` 新增：

```ts
it('BadRequestException 带 errors 数组时透传 data', () => {
  const errors = [
    { field: 'username', message: '用户名不能为空' },
    { field: 'email', message: '邮箱格式不正确' }
  ];
  const ex = new BadRequestException({
    statusCode: 400,
    message: '参数校验失败',
    errors
  });
  const resolved = resolveException(ex);
  expect(resolved.data).toEqual({ errors });
});

it('BadRequestException 无 errors 时 data 为 undefined', () => {
  const resolved = resolveException(new BadRequestException('简单错误'));
  expect(resolved.data).toBeUndefined();
});
```

### Step 2：实现代码

**2a. `exception-resolver.ts`**：

```ts
export interface ResolvedError {
  status: number;
  code: number;
  message: string;
  data?: unknown;
}
```

`BadRequestException` 分支改为：

```ts
if (exception instanceof BadRequestException) {
  const response = exception.getResponse() as {
    errors?: Array<{ field: string; message: string }>;
  };
  return {
    status: HttpStatus.BAD_REQUEST,
    code: BizCode.VALIDATION_FAILED,
    message: '参数校验失败',
    data: response.errors?.length ? { errors: response.errors } : undefined
  };
}
```

**2b. `all-exceptions.filter.ts`**：

```ts
const { status, code, message, data } = resolveException(exception);
// ...
res.status(status).json({ code, message, data: data ?? null });
```

**2c. `apply-app-defaults.ts`**（ValidationPipe 改造）：

需新增 `import type { ValidationError } from 'class-validator'`，替换现有 `useGlobalPipes`：

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    detailedOutputMessages: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const details = errors.flatMap(err =>
        Object.values(err.constraints ?? {}).map(msg => ({
          field: err.property,
          message: msg
        }))
      );
      return new BadRequestException({
        statusCode: 400,
        message: '参数校验失败',
        errors: details
      });
    }
  })
);
```

### Step 3：验证

```bash
pnpm --filter @multi-admin/nestjs-server run test
```

### Step 4：提交

```
feat(server): 校验错误返回字段级明细

ValidationPipe 开启 detailedOutputMessages + exceptionFactory，将
ValidationError[] 映射为 { field, message } 数组，透传到响应
data.errors。ResolvedError 接口新增 data?: unknown。
```

---

## Task 2：JWT secret 强度校验 min(32)

**目标**：启动时拒绝短于 32 字符的 JWT secret。

**改动文件**（4 个）：

| 文件 | 动作 |
|---|---|
| `src/config/env.schema.ts` | `min(1)` → `min(32)` × 2 |
| `.env.example` | 更新示例为 32+ 字符 |
| `test/setup-env.ts` | `e2e-access-secret` → 32+ 字符 |
| `.env`（本地） | 更新开发者本地值（不入 git） |

**注意**：`docker-compose.yml` 使用 `${JWT_ACCESS_SECRET:?...}` 强制要求设置（无默认值），无需修改；CI `gate` job 无 JWT 需求（单测 mock）；CI `coverage` job 通过 `setup-env.ts` 注入，改此文件即可。

### Step 1：写失败测试

`env.schema.spec.ts` 新增：

```ts
it('JWT_ACCESS_SECRET 短于 32 字符拒绝', () => {
  const raw = validEnv();
  raw.JWT_ACCESS_SECRET = 'a'.repeat(31);
  expect(envSchema.safeParse(raw).success).toBe(false);
});

it('JWT_ACCESS_SECRET 恰好 32 字符通过', () => {
  const raw = validEnv();
  raw.JWT_ACCESS_SECRET = 'a'.repeat(32);
  expect(envSchema.safeParse(raw).success).toBe(true);
});

it('JWT_REFRESH_SECRET 短于 32 字符拒绝', () => {
  const raw = validEnv();
  raw.JWT_REFRESH_SECRET = 'b'.repeat(31);
  expect(envSchema.safeParse(raw).success).toBe(false);
});
```

> `validEnv()` 为 spec 中已有的 helper；若不存在，先提取一个。

### Step 2：实现

`env.schema.ts`：

```ts
JWT_ACCESS_SECRET: z.string().min(32),
JWT_REFRESH_SECRET: z.string().min(32),
```

`test/setup-env.ts`：

```ts
setIfAbsent('JWT_ACCESS_SECRET', 'e2e-access-secret-minimum-32-char!');
setIfAbsent('JWT_REFRESH_SECRET', 'e2e-refresh-secret-minimum-32-char!');
```

`.env.example`：

```env
# JWT（P3）：ACCESS/REFRESH 必须使用不同密钥且 ≥32 字符；TTL 文法 数字+s|m|h|d
JWT_ACCESS_SECRET = your_32_char_minimum_access_secret_here
JWT_REFRESH_SECRET = your_32_char_minimum_refresh_secret_here
```

### Step 3：验证

```bash
pnpm --filter @multi-admin/nestjs-server run test
```

确认本地 `.env` 也更新为 32+ 字符（不入 git）。

### Step 4：提交

```
feat(server)!: JWT secret 强度校验 min(32)

BREAKING CHANGE: JWT_ACCESS_SECRET 和 JWT_REFRESH_SECRET 最小长度从
1 提升至 32 字符。现有 .env 中短于此值的配置需升级，否则启动失败。
```

---

## Task 3：请求体大小 env 可配置

**目标**：显式声明全局 + 路由级 body size 限制。

**改动文件**（3 个源码 + 1 个测试）：

| 文件 | 动作 |
|---|---|
| `src/config/env.schema.ts` | 新增 `BODY_LIMIT` / `UPLOAD_BODY_LIMIT` |
| `src/config/app-config.service.ts` | 新增 2 个 getter |
| `src/common/bootstrap/apply-app-defaults.ts` | 注册 `json()` middleware |
| `.env.example` | 新增 2 行 |

### Step 1：写失败测试

`env.schema.spec.ts` 新增：

```ts
it('BODY_LIMIT 默认 1mb', () => {
  const raw = validEnv();
  delete raw.BODY_LIMIT;
  expect(envSchema.parse(raw).BODY_LIMIT).toBe('1mb');
});

it('UPLOAD_BODY_LIMIT 默认 10mb', () => {
  const raw = validEnv();
  delete raw.UPLOAD_BODY_LIMIT;
  expect(envSchema.parse(raw).UPLOAD_BODY_LIMIT).toBe('10mb');
});
```

`apply-app-defaults.spec.ts` 新增：

```ts
it('body size：路由级先于全局注册', () => {
  const app = buildFakeApp({
    corsOrigin: '',
    port: 3000,
    isProduction: true,
    bodyLimit: '1mb',
    uploadBodyLimit: '10mb'
  });
  applyAppDefaults(app as unknown as INestApplication);
  const useCalls = app.use.mock.calls;
  // 找到带路径的调用（路由级）
  const routeCall = useCalls.find(([path]) => typeof path === 'string' && path.includes('upload'));
  const globalCall = useCalls.find(([mw]) => typeof mw === 'function');
  expect(routeCall).toBeDefined();
  // 路由级在全局之前
  expect(useCalls.indexOf(routeCall!)).toBeLessThan(useCalls.indexOf(globalCall!));
});
```

### Step 2：实现

`env.schema.ts` 新增（`JWT_REFRESH_TTL` 后）：

```ts
BODY_LIMIT: z.string().default('1mb'),
UPLOAD_BODY_LIMIT: z.string().default('10mb'),
```

`app-config.service.ts` 新增：

```ts
get bodyLimit(): string {
  return this.config.get('BODY_LIMIT', { infer: true });
}
get uploadBodyLimit(): string {
  return this.config.get('UPLOAD_BODY_LIMIT', { infer: true });
}
```

`apply-app-defaults.ts`（在 helmet 后、setGlobalPrefix 前）：

```ts
import { json } from 'express';
// ...
// 路由级必须在前面注册
app.use('/api/v1/upload', json({ limit: config.uploadBodyLimit }));
app.use(json({ limit: config.bodyLimit }));
```

`.env.example` 新增：

```env
# 请求体大小限制（express json 格式：1mb / 500kb 等）
BODY_LIMIT = 1mb
UPLOAD_BODY_LIMIT = 10mb
```

### Step 3：验证

```bash
pnpm --filter @multi-admin/nestjs-server run test
```

### Step 4：提交

```
feat(server): 请求体大小 env 可配置

新增 BODY_LIMIT（默认 1mb）和 UPLOAD_BODY_LIMIT（默认 10mb），
在 applyAppDefaults 中注册路由级 + 全局 json() middleware。
```

---

## Task 4：Prisma 慢查询日志与连接池显式配置

**目标**：Prisma 连接池 `max` 显式可配、慢查询超阈值输出 warn 日志。

**改动文件**（3 个源码 + 1 个测试）：

| 文件 | 动作 |
|---|---|
| `src/config/env.schema.ts` | 新增 `PRISMA_SLOW_QUERY_MS` / `DATABASE_POOL_MAX` / `PRISMA_QUERY_LOG` |
| `src/config/app-config.service.ts` | 新增 3 个 getter |
| `src/database/prisma.service.ts` | 存 config、加 log/max、$on('query') |
| `.env.example` | 新增 3 行 |

### Step 1：写失败测试

`env.schema.spec.ts` 新增：

```ts
it('PRISMA_SLOW_QUERY_MS 默认 500', () => {
  const raw = validEnv();
  delete raw.PRISMA_SLOW_QUERY_MS;
  expect(envSchema.parse(raw).PRISMA_SLOW_QUERY_MS).toBe(500);
});

it('DATABASE_POOL_MAX 默认 20', () => {
  const raw = validEnv();
  delete raw.DATABASE_POOL_MAX;
  expect(envSchema.parse(raw).DATABASE_POOL_MAX).toBe(20);
});

it('PRISMA_QUERY_LOG 默认 false', () => {
  const raw = validEnv();
  delete raw.PRISMA_QUERY_LOG;
  expect(envSchema.parse(raw).PRISMA_QUERY_LOG).toBe('false');
});
```

`prisma.service.spec.ts` 新增（或修改现有）：

```ts
it('构造参数含 log event 和 pool max', () => {
  // mock PrismaClient super() 调用，验证传入参数
});
```

### Step 2：实现

`env.schema.ts` 新增：

```ts
PRISMA_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
PRISMA_QUERY_LOG: z.enum(['true', 'false']).default('false'),
```

`app-config.service.ts` 新增：

```ts
get prismaSlowQueryMs(): number {
  return this.config.get('PRISMA_SLOW_QUERY_MS', { infer: true });
}
get databasePoolMax(): number {
  return this.config.get('DATABASE_POOL_MAX', { infer: true });
}
get prismaQueryLog(): boolean {
  return this.config.get('PRISMA_QUERY_LOG', { infer: true }) === 'true';
}
```

`prisma.service.ts` 重写（Logger 方案选 A：注入 `Logger`）：

```ts
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly config: AppConfigService;
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.databasePoolMax
      }),
      log: [{ level: 'query', emit: 'event' }]
    });
    this.config = config;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.$connect();
    this.$on('query', (e: { query: string; duration: number }) => {
      const threshold = this.config.prismaSlowQueryMs;
      if (e.duration >= threshold || this.config.prismaQueryLog) {
        this.logger.warn(
          `Slow query detected (${e.duration}ms >= ${threshold}ms): ${e.query}`
        );
      }
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
```

`.env.example` 新增：

```env
# Prisma 慢查询阈值（ms）；连接池最大连接数；全量查询日志开关（排障临时用）
PRISMA_SLOW_QUERY_MS = 500
DATABASE_POOL_MAX = 20
PRISMA_QUERY_LOG = false
```

### Step 3：验证

```bash
pnpm --filter @multi-admin/nestjs-server run test
```

### Step 4：提交

```
feat(server): Prisma 慢查询日志与连接池显式配置

PrismaService 新增 query event 监听，超阈值（默认 500ms）或
PRISMA_QUERY_LOG=true 时输出 warn 日志；连接池 max 通过
DATABASE_POOL_MAX 显式配置（默认 20）。
```

---

## 收尾

每个 Task 完成后运行：

```bash
pnpm check
```

全部 4 Task 完成后，运行全量覆盖率确认 ≥80%：

```bash
docker compose up -d postgres redis
pnpm --filter @multi-admin/nestjs-server run test:coverage
```

---

## 自审记录

| 日期 | 审查项 | 结论 |
|---|---|---|
| 2026-08-27 | 占位符扫描 | 无 TBD/TODO |
| 2026-08-27 | 设计覆盖 | 4/4 项设计变更均有对应 Task |
| 2026-08-27 | 影响面完整性 | 补充 `test/setup-env.ts` JWT 值（15 字符 < 32）；确认 `docker-compose.yml` 使用 `${:?}` 无默认值无需改 |
| 2026-08-27 | 测试基建 | 34 个现有 spec 文件覆盖全部改动文件；`all-exceptions.filter.spec.ts` 需新建 |
