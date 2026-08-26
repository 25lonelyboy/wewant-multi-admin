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
| 1 | 校验错误字段级明细 | `src/common/errors/exception-resolver.ts` | 修改 | 扩展 `exception-resolver.spec.ts` |
| 2 | JWT secret 强度校验 | `src/config/env.schema.ts` + `.env.example` | 修改 | 扩展 `env.schema.spec.ts` |
| 3 | 请求体大小显式声明 | `src/config/env.schema.ts` + `src/common/bootstrap/apply-app-defaults.ts` + `.env.example` | 修改 | 扩展 `env.schema.spec.ts` + `apply-app-defaults.spec.ts` |
| 4 | Prisma 慢查询日志 + 连接池 max | `src/database/prisma.service.ts` + `.env.example` | 修改 | 扩展 `prisma.service.spec.ts` |

## 1. 校验错误字段级明细

### 现状

[exception-resolver.ts](../../../apps/nestjs-server/src/common/errors/exception-resolver.ts) 对 `BadRequestException` 返回：

```json
{ "code": 40000, "message": "参数校验失败", "data": null }
```

### 设计

修改 `exception-resolver.ts`：检测 `BadRequestException` 时，从 `exception.getResponse()` 提取 ValidationPipe 的错误明细，返回：

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

### 实现细节

```ts
if (exception instanceof BadRequestException) {
  const response = exception.getResponse();
  const errors = Array.isArray(response?.message)
    ? response.message.map(e => ({
        field: e.property || 'unknown',
        message: Object.values(e.constraints || {}).join(', ') || e.message
      }))
    : [];
  return {
    code: 40000,
    message: '参数校验失败',
    data: errors.length > 0 ? { errors } : null
  };
}
```

### 数据流

```
请求 → ValidationPipe（whitelist+transform）→ 校验失败抛 BadRequestException
→ AllExceptionsFilter → exception-resolver 检测 BadRequestException
→ 提取 response.message 错误数组 → 映射为 { field, message } 数组
→ 返回 { code: 40000, message: '参数校验失败', data: { errors: [...] } }
```

### 测试

- Mock `BadRequestException` 带 ValidationPipe 错误结构
- 断言返回 `data.errors` 数组形状正确

## 2. JWT secret 强度校验

### 现状

[env.schema.ts](../../../apps/nestjs-server/src/config/env.schema.ts) 中 `JWT_ACCESS_SECRET: z.string().min(1)`，无强度下限。

### 设计

- 改为 `min(32)`，对 `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET` 同时生效
- `.env.example` 补强示例：`JWT_ACCESS_SECRET=your_32_char_minimum_secret_here_or_longer`
- 根 `.env` 和 CI dummy 需同步更新（当前 CI 用 `dummy` 值，需改为 32+ 字符）

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

`apply-app-defaults.ts` 修改：

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

- `env.schema.spec.ts`：断言默认值正确
- `apply-app-defaults.spec.ts`：断言 middleware 注册顺序正确（可选，mock app.use 检查调用）

## 4. Prisma 慢查询日志 + 连接池 max

### 现状

[prisma.service.ts](../../../apps/nestjs-server/src/database/prisma.service.ts) 构造参数仅 `adapter`，无 `log` 配置、无 `max`。

### 设计

`env.schema.ts` 新增：

```ts
PRISMA_SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
PRISMA_QUERY_LOG: z.enum(['true', 'false']).default('false')
```

`prisma.service.ts` 修改：

```ts
constructor(config: AppConfigService) {
  super({
    adapter: new PrismaPg({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax
    }),
    log: [{ level: 'query', emit: 'event' }]
  });
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
```

`.env.example` 新增三行示例。

### 注意

`this.$on('query')` 的 `logger` 需注入 `nestjs-pino` 的 `Logger`（NestJS 标准 `Logger` 或 `nestjs-pino` 的 `Logger` 服务）。若 `PrismaService` 不便于注入，可改用 `console.warn` 或提取独立 `PrismaLoggerService`。

### 测试

- `prisma.service.spec.ts`：断言构造参数含 `log` 和 `max`；mock `$on('query')` 验证阈值过滤逻辑

## 错误处理

- **Env 校验失败**：启动时 `validateEnv` 抛错，容器退出（已有机制，无新增）
- **Body size 超限**：Express 返回 413 Payload Too Large，由 `AllExceptionsFilter` 捕获（已有机制，无新增）
- **JWT secret 太短**：启动失败，错误信息明确（zod 校验失败详情）

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
