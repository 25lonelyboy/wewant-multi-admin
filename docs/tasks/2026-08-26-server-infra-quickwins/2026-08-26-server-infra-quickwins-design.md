---
status: draft
covers:
  - apps/nestjs-server/
last_verified: 2026-08-26
---

# Server 基建速赢设计（Tier 1）

## 范围

4 项独立基础设施改进，无交叉依赖，各自独立提交。所有变更均限于 `apps/nestjs-server/` 内现有文件，不引入新模块。

来源：[backlog](../../governance/backlog.md) 登记项 + 本轮前瞻性审查。

## 已锁定决策

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 校验错误信封格式 | `data.errors` 数组（方案 A） | 保持信封三字段契约不变，前端联调体验最好 |
| D2 | JWT secret 最小长度 | min(32)（方案 A） | 满足 HS256 256 位安全要求；开发环境无需大改 |
| D3 | 请求体大小策略 | 全局 + 路由级双 env 可配置（方案 C） | 全局 1mb 默认，路由级 10mb 预留 |
| D4 | 慢查询阈值 | env 可配置默认 500ms（推荐） | 业界主流（Datadog/New Relic 默认），平衡观测与日志量 |
| D5 | 连接池 max | env 可配置默认 20（推荐） | 覆盖中等并发，单连接 ~5-10MB，20 连接 ~100-200MB |
| D6 | 提交序列 | 4 次独立提交（方案 2） | 历史清晰，每项独立可审查、可 cherry-pick |

## 变更矩阵

| # | 项 | 改动文件 | 新增/修改 | 测试 |
|---|---|---|---|---|
| 1 | 校验错误字段级明细 | `src/common/errors/exception-resolver.ts` + `src/common/errors/all-exceptions.filter.ts` + `src/common/bootstrap/apply-app-defaults.ts` | 修改 | 扩展 `exception-resolver.spec.ts` + `all-exceptions.filter.spec.ts` |
| 2 | JWT secret 强度校验 | `src/config/env.schema.ts` + `.env.example` + `docker-compose.yml` | 修改 | 扩展 `env.schema.spec.ts` |
| 3 | 请求体大小显式声明 | `src/config/env.schema.ts` + `src/config/app-config.service.ts` + `src/common/bootstrap/apply-app-defaults.ts` + `.env.example` | 修改 | 扩展 `env.schema.spec.ts` + `apply-app-defaults.spec.ts` |
| 4 | Prisma 慢查询日志 + 连接池 max | `src/config/env.schema.ts` + `src/config/app-config.service.ts` + `src/database/prisma.service.ts` + `.env.example` | 修改 | 扩展 `prisma.service.spec.ts` |

## 1. 校验错误字段级明细

### 现状

[exception-resolver.ts](../../../apps/nestjs-server/src/common/errors/exception-resolver.ts) 对 `BadRequestException` 返回 `{ status, code, message }`（`ResolvedError` 接口），最终信封为：

```json
{ "code": 40000, "message": "参数校验失败", "data": null }
```

当前 ValidationPipe 未开启 `detailedOutputMessages`，`getResponse().message` 为纯字符串数组，无法提取字段名。

### 设计

#### 1a. ValidationPipe 开启详细输出 + 自定义异常工厂（`apply-app-defaults.ts`）

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

#### 1b. 扩展 `ResolvedError` 接口（`exception-resolver.ts`）

```ts
export interface ResolvedError {
  status: number;
  code: number;
  message: string;
  data?: unknown; // 新增：附加结构化数据（如校验明细）
}
```

`BadRequestException` 分支改为：

```ts
if (exception instanceof BadRequestException) {
  const response = exception.getResponse() as {
    message?: string;
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

#### 1c. 过滤器透传 `data`（`all-exceptions.filter.ts`）

过滤器构造响应时增加：
```ts
const { status, code, message, data } = resolveException(exception);
// ...
data: data ?? null
```

### 最终响应形状（契约不变，`data` 字段从 null 变为可选对象）

```json
{
  "code": 40000,
  "message": "参数校验失败",
  "data": {
    "errors": [
      { "field": "username", "message": "用户名不能为空" },
      { "field": "email", "message": "邮箱格式不正确" }
    ]
  }
}
```

### 数据流

```
请求 → ValidationPipe（detailedOutputMessages + exceptionFactory）
→ 校验失败 → 将 ValidationError[] 映射为 { field, message } 数组 → 抛 BadRequestException
→ AllExceptionsFilter → resolveException 提取 exception.getResponse().errors
→ 返回 { code: 40000, message: '参数校验失败', data: { errors: [...] } }
```

### 测试

- 扩展 `exception-resolver.spec.ts`：mock 带 `errors` 数组的 `BadRequestException`，断言 `data.errors` 正确透传；不带时 `data` 为 `undefined`
- 扩展 `all-exceptions.filter.spec.ts`：断言 `data` 字段透传到响应体

## 2. JWT secret 强度校验

### 现状

[env.schema.ts](../../../apps/nestjs-server/src/config/env.schema.ts) 中 `JWT_ACCESS_SECRET: z.string().min(1)`，无强度下限。

### 设计

- 改为 `min(32)`，对 `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET` 同时生效
- `.env.example` 补强示例：`JWT_ACCESS_SECRET=your_32_char_minimum_secret_here_or_longer`
- **影响面**（需同步更新，否则启动失败）：
  - 根 `.env`：开发者本地值需达 32+ 字符（一次性迁移）
  - `docker-compose.yml`：`JWT_ACCESS_SECRET` 默认值 `change_me_access_secret`（22 字符）需改为 32+
  - CI `coverage` job：env 块中 `JWT_ACCESS_SECRET: dummy` 需改为 32+ 字符占位值（如 `ci_dummy_jwt_access_secret_for_testing_only`）
  - e2e 测试环境变量（若独立设置）

### 测试

- 扩展 `env.schema.spec.ts`：断言 31 字符 secret 校验失败，32 字符通过

## 3. 请求体大小显式声明

### 现状

[apply-app-defaults.ts](../../../apps/nestjs-server/src/common/bootstrap/apply-app-defaults.ts) 未调用 `json()`，依赖 Express 默认 100kb。

### 设计

`env.schema.ts` 新增：

```ts
BODY_LIMIT: z.string().default('1mb'),
UPLOAD_BODY_LIMIT: z.string().default('10mb')
```

`app-config.service.ts` 新增 getter：

```ts
get bodyLimit(): string {
  return this.env.BODY_LIMIT;
}
get uploadBodyLimit(): string {
  return this.env.UPLOAD_BODY_LIMIT;
}
```

`apply-app-defaults.ts` 修改（需新增 `import { json } from 'express'`）：

```ts
const uploadLimit = config.uploadBodyLimit; // '10mb'
const globalLimit = config.bodyLimit; // '1mb'
// 路由级必须在前面注册
app.use('/api/v1/upload', json({ limit: uploadLimit }));
app.use(json({ limit: globalLimit }));
```

`.env.example` 新增两行示例。

### 注意

`/api/v1/upload` 路由当前不存在，属于预留。实际头像上传/批量导入端点立项时，路由路径按需调整。

### 测试

- `env.schema.spec.ts`：断言默认值正确（`1mb` / `10mb`）
- `apply-app-defaults.spec.ts`：断言 `app.use` 被调用时先传路由级再传全局（mock 验证调用顺序与参数）

## 4. Prisma 慢查询日志 + 连接池 max

### 现状

[prisma.service.ts](../../../apps/nestjs-server/src/database/prisma.service.ts) 构造参数仅 `adapter`，无 `log` 配置、无 `max`。`config` 仅在构造函数中使用，未存为实例属性。

### 设计

`env.schema.ts` 新增：

```ts
PRISMA_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
PRISMA_QUERY_LOG: z.enum(['true', 'false']).default('false')
```

`app-config.service.ts` 新增 getter：

```ts
get prismaSlowQueryMs(): number {
  return this.env.PRISMA_SLOW_QUERY_MS;
}
get databasePoolMax(): number {
  return this.env.DATABASE_POOL_MAX;
}
get prismaQueryLog(): boolean {
  return this.env.PRISMA_QUERY_LOG === 'true';
}
```

`prisma.service.ts` 修改（需将 `config` 存为实例属性以供生命周期钩子使用）：

```ts
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly config: AppConfigService;

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
    // 慢查询事件监听
    this.$on('query', (e: { query: string; duration: number }) => {
      const threshold = this.config.prismaSlowQueryMs;
      if (e.duration >= threshold || this.config.prismaQueryLog) {
        this.logger.warn({
          duration: e.duration,
          threshold,
          query: e.query
        }, 'Slow query detected');
      }
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
```

`.env.example` 新增三行示例。

### Logger 来源决策（实施时确认）

`this.logger` 需使用 NestJS `Logger` 或 `nestjs-pino` 的日志。若 `PrismaService` 继承 `PrismaClient` 导致 DI 注入受限，实施时可选：
- A) 在构造函数中额外注入 `Logger`（需 `AppModule` 中 `PrismaService` 依赖声明配合）
- B) 使用 `console.warn`（简单直接，但绕过 pino 管道，不含 requestId 上下文）
- C) 提取独立 `PrismaQueryLogService` 作为事件订阅者（最干净，但增加一个类）

实施计划中再定，不阻塞设计。

### 测试

- `prisma.service.spec.ts`：断言构造参数含 `log` 和 `max`；mock `$on('query')` 验证阈值过滤逻辑；断言 `config` 正确存于实例

## 错误处理与迁移影响

- **Env 校验失败**：启动时 `validateEnv` 抛错，容器退出（已有机制，无新增）
- **Body size 超限**：Express 返回 413 Payload Too Large，由 `AllExceptionsFilter` 捕获（已有机制，无新增）
- **JWT secret 太短**：启动失败，错误信息明确（zod 校验失败详情）
- **迁移影响**：JWT min(32) 为 breaking change，现有 `.env` / compose / CI 中短于 32 字符的值需一次性升级。在提交消息中标注 `BREAKING CHANGE` footer。

## 测试策略

每项改动扩展对应 spec 文件，保持 TDD：

1. 先写失败测试（断言新行为）
2. 实现代码使测试通过
3. 运行 `pnpm check` 确保全量门禁绿

覆盖率目标：合并 ≥80%（现有门禁，无新增）。

## 提交序列

4 次独立提交，顺序：

1. `feat(server): 校验错误返回字段级明细` — 最用户可见
2. `feat(server): JWT secret 强度校验 min(32)` — 最小改动
3. `feat(server): 请求体大小 env 可配置` — env 配置一致性
4. `feat(server): Prisma 慢查询日志与连接池显式配置` — 最大改动

每次提交后 `pnpm check` 验证门禁绿。
