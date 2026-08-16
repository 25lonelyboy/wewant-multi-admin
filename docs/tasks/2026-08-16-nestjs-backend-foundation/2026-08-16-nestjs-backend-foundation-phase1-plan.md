# NestJS 后端基架补全 · P1 骨架与横切 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 nestjs-server 的模块化目录骨架与全部横切基建：配置校验（zod）、统一响应信封与错误码、全局异常过滤、requestId 追踪、nestjs-pino 结构化日志、`/health` 端点。

**Architecture:** 按总 spec（`2026-08-16-nestjs-backend-foundation-design.md`）§3 目录结构落地；横切件经 `APP_FILTER`/`APP_INTERCEPTOR` 全局装配，requestId 走 Express 原生中间件（避开 Nest 11 + Express 5 通配路由语法坑）；配置启动即校验、失败即崩。本阶段不接 DB/Redis，`/health` 为无探针骨架（P2 换 terminus）。

**Tech Stack:** NestJS 11（ESM，`"type": "module"`）、@nestjs/config + zod、nestjs-pino + pino、class-validator/class-transformer、jest + supertest。

**仓库既有约定（执行者必读）：**

- ESM 相对导入**必须带 `.js` 后缀**（`moduleResolution: nodenext`），如 `import { BizCode } from '../errors/biz-code.js'`。
- 提交规范：commitlint 强制 scope，本计划用 `server`（应用内）/ `deps`（catalog 与安装）/ `docs`（任务文档）。
- 格式化：Prettier 独占（单引号、无尾逗号、箭头单参省括号）；提交前跑 `pnpm format` 或依赖 husky 钩子。
- 依赖判据：框架级依赖入 `pnpm-workspace.yaml` catalog；**版本号不硬编码进本计划**，执行时用 `pnpm view <pkg> version` 取当前最新稳定版，以 `^` 写入 catalog。
- Windows shell 提交中文消息：先写临时文件再 `git commit -F <文件>`，不要用 `-m "中文"` 内联。
- `.gitignore` 忽略 `.env`；`.env.example` 入库。

**验收口径（总 spec §11 P1）：** `pnpm dev:server` 启动；`GET /health` 返回信封且带 `x-request-id` 头；未知路由返回 404 信封；日志为结构化输出；`pnpm check` 全绿。

---

## File Structure

```
apps/nestjs-server/
├── .env.example                                # Create：env 模板（入库）
├── src/
│   ├── main.ts                                 # Modify：bootstrap 装配
│   ├── app.module.ts                           # Modify：根模块装配
│   ├── app.controller.ts                       # Delete：脚手架样例
│   ├── app.service.ts                          # Delete：脚手架样例
│   ├── app.controller.spec.ts                  # Delete：样例测试
│   ├── config/
│   │   ├── env.schema.ts                       # Create：zod schema + validateEnv
│   │   ├── env.schema.spec.ts                  # Create：测试
│   │   ├── app-config.service.ts               # Create：类型安全配置访问
│   │   ├── app-config.service.spec.ts          # Create：测试
│   │   └── app-config.module.ts                # Create：全局配置模块
│   ├── common/
│   │   ├── types/express-request.d.ts          # Create：Request.requestId 声明合并
│   │   ├── errors/
│   │   │   ├── biz-code.ts                     # Create：错误码常量
│   │   │   ├── biz-code.spec.ts                # Create：测试
│   │   │   ├── biz.exception.ts                # Create：业务异常
│   │   │   ├── biz.exception.spec.ts           # Create：测试
│   │   │   ├── exception-resolver.ts           # Create：纯函数异常→信封解析
│   │   │   └── exception-resolver.spec.ts      # Create：测试
│   │   ├── middleware/request-id.middleware.ts # Create：Express 原生中间件
│   │   ├── middleware/request-id.middleware.spec.ts
│   │   ├── interceptors/response-envelope.interceptor.ts
│   │   ├── interceptors/response-envelope.interceptor.spec.ts
│   │   └── filters/all-exceptions.filter.ts    # Create：全局异常过滤器
│   └── modules/health/
│       ├── health.controller.ts                # Create
│       └── health.module.ts                    # Create
└── test/app.e2e-spec.ts                        # Modify：信封/404/requestId 冒烟
```

---

### Task 1: catalog 依赖与安装

**Files:**
- Modify: `pnpm-workspace.yaml`（catalog 段）
- Modify: `apps/nestjs-server/package.json`

- [ ] **Step 1: 查询待入 catalog 包的最新稳定版**

逐个执行并记录版本号（以 `^<版本>` 形式使用）：

```bash
pnpm view @nestjs/config version
pnpm view zod version
pnpm view nestjs-pino version
pnpm view pino version
pnpm view pino-pretty version
pnpm view class-validator version
pnpm view class-transformer version
```

判据说明：以上均为后端框架级依赖（catalog 判据②），全部入默认 catalog；`pino-pretty` 仅开发期使用，但随 nestjs-pino 属同一日志框架链，一并入 catalog。

- [ ] **Step 2: 写入 pnpm-workspace.yaml catalog**

在 `pnpm-workspace.yaml` 的 `catalog:` 段按字母序插入（版本号用 Step 1 结果）：

```yaml
  '@nestjs/config': '^<最新版本>'
  'class-transformer': '^<最新版本>'
  'class-validator': '^<最新版本>'
  'nestjs-pino': '^<最新版本>'
  'pino': '^<最新版本>'
  'pino-pretty': '^<最新版本>'
  'zod': '^<最新版本>'
```

- [ ] **Step 3: 更新 apps/nestjs-server/package.json**

`dependencies` 按字母序追加（保持现有条目不动）：

```json
    "@nestjs/config": "catalog:",
    "class-transformer": "catalog:",
    "class-validator": "catalog:",
    "nestjs-pino": "catalog:",
    "pino": "catalog:",
    "zod": "catalog:"
```

`devDependencies` 追加：

```json
    "pino-pretty": "catalog:"
```

- [ ] **Step 4: 安装并验证**

```bash
pnpm install
pnpm --filter @multi-admin/nestjs-server run typecheck
```

Expected：安装成功；typecheck 通过（无代码变更，仅确认依赖解析正常）。

- [ ] **Step 5: Commit**

提交消息写入临时文件后 `git commit -F`：

```
deps(server): P1 基架依赖入 catalog（config/zod/pino/class-validator）
```

<!-- 注意：commitlint type-enum 白名单无 deps，实际提交采用 chore(deps): P1 基架依赖入 catalog（config/zod/pino/class-validator） -->

---

### Task 2: 配置模块（zod 校验 + 类型安全访问）

**Files:**
- Create: `apps/nestjs-server/.env.example`
- Create: `apps/nestjs-server/src/config/env.schema.ts` + `env.schema.spec.ts`
- Create: `apps/nestjs-server/src/config/app-config.service.ts` + `app-config.service.spec.ts`
- Create: `apps/nestjs-server/src/config/app-config.module.ts`

- [ ] **Step 1: 创建 env 模板**

创建 `apps/nestjs-server/.env.example`（入库）：

```ini
# 服务端口
PORT = 3000
# 环境：development / test / production
NODE_ENV = development
# 日志级别：fatal / error / warn / info / debug / trace
LOG_LEVEL = info
# CORS 允许来源（逗号分隔），默认 pure-web 本地 dev 端口
CORS_ORIGIN = http://localhost:8848
```

本地另复制一份为 `.env`（已 gitignore）供开发使用。

- [ ] **Step 2: 写失败测试 env.schema.spec.ts**

```ts
import { validateEnv } from './env.schema.js';

describe('envSchema', () => {
  it('空输入应用全部默认值', () => {
    const env = validateEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:8848');
  });

  it('字符串数字的 PORT 被强转', () => {
    expect(validateEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('非法 LOG_LEVEL 抛出含字段名的错误', () => {
    expect(() => validateEnv({ LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });

  it('非法 NODE_ENV 抛出错误', () => {
    expect(() => validateEnv({ NODE_ENV: 'prod' })).toThrow('NODE_ENV');
  });
});
```

- [ ] **Step 3: 运行确认失败**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts
```

Expected：FAIL（`Cannot find module './env.schema.js'`）。

- [ ] **Step 4: 实现 env.schema.ts**

```ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:8848')
});

export type Env = z.infer<typeof envSchema>;

/**
 * 供 @nestjs/config 的 validate 选项使用：校验失败直接抛出，启动即崩、快速暴露部署问题。
 * 后续阶段在此追加 DATABASE_URL（P2）、JWT_*（P3）等必填项。
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`环境变量校验失败:\n${details}`);
  }
  return parsed.data;
}
```

- [ ] **Step 5: 运行确认通过**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config/env.schema.spec.ts
```

Expected：4 个用例 PASS。

- [ ] **Step 6: 实现 app-config.service.ts**

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';

/**
 * 类型安全的配置访问入口：业务代码注入本服务，不裸写字符串 key。
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get corsOrigin(): string {
    return this.config.get('CORS_ORIGIN', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}
```

- [ ] **Step 7: 写 app-config.service.spec.ts 并跑绿**

```ts
import { Test } from '@nestjs/testing';
import { AppConfigModule } from './app-config.module.js';
import { AppConfigService } from './app-config.service.js';

describe('AppConfigService', () => {
  let service: AppConfigService;

  beforeAll(async () => {
    process.env['LOG_LEVEL'] = 'warn';
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule]
    }).compile();
    service = moduleRef.get(AppConfigService);
  });

  afterAll(() => {
    delete process.env['LOG_LEVEL'];
  });

  it('process.env 优先于 .env 文件且经 zod 校验', () => {
    expect(service.logLevel).toBe('warn');
  });

  it('提供类型安全 getter 与派生属性', () => {
    expect(typeof service.port).toBe('number');
    expect(typeof service.isProduction).toBe('boolean');
  });
});
```

此时 `app-config.module.ts` 尚不存在，先运行确认 FAIL，再创建模块文件（Step 8）后跑绿。

> 实现注记（与最终实现一致）：@nestjs/config 4.x 的 `forRoot.validate` 在**模块加载时**同步执行并缓存校验结果快照，因此 service spec 必须在 `process.env` 就绪后**动态 import** 模块（见 `app-config.service.spec.ts` 的 `await import(...)`），快照才会包含注入的环境变量；若顶层静态 import，校验快照会早于 `process.env` 赋值而丢失 `warn`。

- [ ] **Step 8: 实现 app-config.module.ts 并跑绿**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service.js';
import { validateEnv } from './env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    })
  ],
  providers: [AppConfigService],
  exports: [AppConfigService]
})
export class AppConfigModule {}
```

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config
```

Expected：config 目录全部用例 PASS。

- [ ] **Step 9: Commit**

```
feat(server): 配置模块（zod 启动校验 + 类型安全 AppConfigService）
```

---

### Task 3: 错误码与业务异常

**Files:**
- Create: `apps/nestjs-server/src/common/errors/biz-code.ts` + `biz-code.spec.ts`
- Create: `apps/nestjs-server/src/common/errors/biz.exception.ts` + `biz.exception.spec.ts`

- [ ] **Step 1: 写失败测试**

`biz-code.spec.ts`：

```ts
import { BizCode } from './biz-code.js';

describe('BizCode', () => {
  it('成功码为 0 且关键错误码符合契约', () => {
    expect(BizCode.SUCCESS).toBe(0);
    expect(BizCode.VALIDATION_FAILED).toBe(40001);
    expect(BizCode.UNAUTHORIZED).toBe(40101);
    expect(BizCode.ACCESS_TOKEN_EXPIRED).toBe(40102);
    expect(BizCode.REFRESH_TOKEN_INVALID).toBe(40103);
    expect(BizCode.FORBIDDEN).toBe(40301);
    expect(BizCode.RATE_LIMITED).toBe(42901);
    expect(BizCode.INTERNAL_ERROR).toBe(50000);
  });
});
```

`biz.exception.spec.ts`：

```ts
import { BizCode } from './biz-code.js';
import { BizException } from './biz.exception.js';

describe('BizException', () => {
  it('由错误码推导 HTTP 状态（code 整除 100）', () => {
    expect(new BizException(BizCode.FORBIDDEN, '无权限').httpStatus).toBe(403);
    expect(new BizException(BizCode.RATE_LIMITED, '触发限流').httpStatus).toBe(429);
    expect(new BizException(BizCode.INTERNAL_ERROR, '内部错误').httpStatus).toBe(500);
  });

  it('保留 code 与 message', () => {
    const ex = new BizException(BizCode.UNAUTHORIZED, '未认证');
    expect(ex.code).toBe(40101);
    expect(ex.message).toBe('未认证');
    expect(ex).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors
```

Expected：FAIL（模块不存在）。

- [ ] **Step 3: 实现 biz-code.ts**

```ts
/**
 * 统一业务错误码（总 spec §5）。码段规则：前 3 位对齐 HTTP 语义，
 * httpStatus = Math.floor(code / 100)。本常量将同步导出至 packages/contracts（P5）。
 */
export const BizCode = {
  SUCCESS: 0,
  VALIDATION_FAILED: 40001,
  UNAUTHORIZED: 40101,
  ACCESS_TOKEN_EXPIRED: 40102,
  REFRESH_TOKEN_INVALID: 40103,
  FORBIDDEN: 40301,
  RATE_LIMITED: 42901,
  INTERNAL_ERROR: 50000
} as const;

export type BizCodeValue = (typeof BizCode)[keyof typeof BizCode];
```

- [ ] **Step 4: 实现 biz.exception.ts**

```ts
/**
 * 业务异常：携带数字错误码，由全局过滤器映射为统一信封。
 */
export class BizException extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'BizException';
    this.code = code;
    this.httpStatus = Math.floor(code / 100);
  }
}
```

- [ ] **Step 5: 运行确认通过**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors
```

Expected：全部 PASS。

- [ ] **Step 6: Commit**

```
feat(server): 统一业务错误码 BizCode 与 BizException
```

---

### Task 4: 横切三件套（requestId 中间件 + 信封拦截器 + 全局异常过滤器）

**Files:**
- Create: `apps/nestjs-server/src/common/types/express-request.d.ts`
- Create: `apps/nestjs-server/src/common/middleware/request-id.middleware.ts` + 测试
- Create: `apps/nestjs-server/src/common/interceptors/response-envelope.interceptor.ts` + 测试
- Create: `apps/nestjs-server/src/common/errors/exception-resolver.ts` + 测试
- Create: `apps/nestjs-server/src/common/filters/all-exceptions.filter.ts`

- [ ] **Step 1: Express Request 声明合并**

创建 `src/common/types/express-request.d.ts`（tsconfig include 自动覆盖，jest ts-jest 同样生效）：

```ts
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export {};
```

- [ ] **Step 2: 写 requestId 中间件失败测试**

`src/common/middleware/request-id.middleware.spec.ts`：

```ts
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, requestIdMiddleware } from './request-id.middleware.js';

function mockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as Request;
  const res = { setHeader: jest.fn() } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('requestIdMiddleware', () => {
  it('无上游头时生成 UUID 并写入 req 与响应头', () => {
    const { req, res, next } = mockReqRes();
    requestIdMiddleware(req, res, next);
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('透传上游传入的 requestId', () => {
    const { req, res, next } = mockReqRes({ [REQUEST_ID_HEADER]: 'upstream-123' });
    requestIdMiddleware(req, res, next);
    expect(req.requestId).toBe('upstream-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'upstream-123');
  });
});
```

- [ ] **Step 3: 运行确认失败后实现**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/middleware
```

Expected FAIL 后实现 `src/common/middleware/request-id.middleware.ts`：

```ts
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Express 原生中间件（在 main.ts 经 app.use 注册，先于 Nest 路由）：
 * 生成/透传 requestId，写入 req.requestId 与响应头，供日志与排障贯穿链路。
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId = typeof incoming === 'string' && incoming ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
```

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/middleware
```

Expected：PASS。

- [ ] **Step 4: 写信封拦截器失败测试**

`src/common/interceptors/response-envelope.interceptor.spec.ts`：

```ts
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { BizCode } from '../errors/biz-code.js';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

describe('ResponseEnvelopeInterceptor', () => {
  it('把处理器返回值包装为统一信封', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const handler = { handle: () => of({ id: 1 }) } as CallHandler;
    const result = await lastValueFrom(
      interceptor.intercept({} as ExecutionContext, handler)
    );
    expect(result).toEqual({ code: BizCode.SUCCESS, message: 'ok', data: { id: 1 } });
  });
});
```

- [ ] **Step 5: 运行确认失败后实现**

`src/common/interceptors/response-envelope.interceptor.ts`：

```ts
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BizCode } from '../errors/biz-code.js';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * 统一响应信封：{ code: 0, message: 'ok', data }（总 spec §5）。
 * 类型将同步导出至 packages/contracts（P5）。
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map(data => ({ code: BizCode.SUCCESS, message: 'ok', data })));
  }
}
```

跑测试确认 PASS。

- [ ] **Step 6: 写异常解析器失败测试**

`src/common/errors/exception-resolver.spec.ts`：

```ts
import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { BizCode } from './biz-code.js';
import { BizException } from './biz.exception.js';
import { resolveException } from './exception-resolver.js';

describe('resolveException', () => {
  it('BizException 原样透传 code/status/message', () => {
    expect(resolveException(new BizException(BizCode.FORBIDDEN, '无权限'))).toEqual({
      status: 403,
      code: 40301,
      message: '无权限'
    });
  });

  it('BadRequestException（ValidationPipe 产物）映射为 40001', () => {
    const resolved = resolveException(new BadRequestException(['username 不能为空']));
    expect(resolved.status).toBe(400);
    expect(resolved.code).toBe(BizCode.VALIDATION_FAILED);
  });

  it('其余 HttpException 按 status * 100 生成 code', () => {
    expect(resolveException(new NotFoundException('未找到')).code).toBe(40400);
    expect(resolveException(new ForbiddenException()).code).toBe(40300);
    expect(resolveException(new HttpException('自定义', 418)).code).toBe(41800);
  });

  it('未知异常归为 50000', () => {
    expect(resolveException(new Error('boom'))).toEqual({
      status: 500,
      code: BizCode.INTERNAL_ERROR,
      message: '服务器内部错误'
    });
    expect(resolveException('string error').code).toBe(BizCode.INTERNAL_ERROR);
  });
});
```

- [ ] **Step 7: 运行确认失败后实现**

`src/common/errors/exception-resolver.ts`：

```ts
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { BizCode } from './biz-code.js';
import { BizException } from './biz.exception.js';

export interface ResolvedError {
  status: number;
  code: number;
  message: string;
}

/**
 * 纯函数：任意异常 → { status, code, message }。供全局过滤器与测试共用。
 */
export function resolveException(exception: unknown): ResolvedError {
  if (exception instanceof BizException) {
    return { status: exception.httpStatus, code: exception.code, message: exception.message };
  }
  if (exception instanceof BadRequestException) {
    return { status: HttpStatus.BAD_REQUEST, code: BizCode.VALIDATION_FAILED, message: '参数校验失败' };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const raw = typeof response === 'string' ? response : response.message;
    const message = Array.isArray(raw) ? raw.join('; ') : raw || exception.message;
    return { status, code: status * 100, message };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: BizCode.INTERNAL_ERROR, message: '服务器内部错误' };
}
```

跑测试确认 PASS。

- [ ] **Step 8: 实现全局异常过滤器**

`src/common/filters/all-exceptions.filter.ts`（解析逻辑已在 resolver 单测覆盖，过滤器本体走 Task 6 e2e 验证）：

```ts
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveException } from '../errors/exception-resolver.js';

/**
 * 全局兜底过滤器：任意异常 → 统一信封 { code, message, data: null }。
 * 5xx 记 error 日志并带 requestId，4xx 记 warn。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const { status, code, message } = resolveException(exception);

    if (status >= 500) {
      this.logger.error(`${req.method} ${req.url} -> ${status}`, exception as Error, req.requestId);
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status} ${message}`, req.requestId);
    }
    res.status(status).json({ code, message, data: null });
  }
}
```

- [ ] **Step 9: typecheck + Commit**

```bash
pnpm --filter @multi-admin/nestjs-server run typecheck
```

Expected：通过。Commit：

```
feat(server): requestId 中间件、响应信封拦截器与全局异常过滤器
```

---

### Task 5: 结构化日志（nestjs-pino）

**Files:**
- Create: `apps/nestjs-server/src/common/logging/app-logger.module.ts`

- [ ] **Step 1: 实现 AppLoggerModule**

```ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';

/**
 * 结构化日志：dev 环境 pino-pretty 可读输出；test/production 纯 JSON 行
 * （test 不开 transport，避免 jest 中 worker 线程干扰）。
 * genReqId 复用 requestId 中间件写入的 req.requestId。
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: req => req.requestId ?? randomUUID(),
          redact: { paths: ['req.headers.authorization', '*.password'], censor: '***' },
          autoLogging: { ignore: req => req.url === '/health' },
          transport:
            config.nodeEnv === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' }
                }
              : undefined
        }
      })
    })
  ]
})
export class AppLoggerModule {}
```

- [ ] **Step 2: typecheck**

```bash
pnpm --filter @multi-admin/nestjs-server run typecheck
```

Expected：通过（模块在 Task 6 装配进 AppModule 后才有运行时效果）。

- [ ] **Step 3: Commit**

```
feat(server): nestjs-pino 结构化日志模块（dev pretty / prod JSON / 敏感字段脱敏）
```

---

### Task 6: health 模块 + main.ts 装配 + 移除脚手架样例

**Files:**
- Create: `apps/nestjs-server/src/modules/health/health.controller.ts` + `health.module.ts`
- Modify: `apps/nestjs-server/src/main.ts`
- Modify: `apps/nestjs-server/src/app.module.ts`
- Delete: `apps/nestjs-server/src/app.controller.ts`、`app.service.ts`、`app.controller.spec.ts`

- [x] **Step 1: 创建 health 模块**

`health.controller.ts`（骨架端点，P2 换 terminus 双探针）：

```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
```

`health.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({
  controllers: [HealthController]
})
export class HealthModule {}
```

- [x] **Step 2: 重写 app.module.ts**

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { AppLoggerModule } from './common/logging/app-logger.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [AppConfigModule, AppLoggerModule, HealthModule],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor }
  ]
})
export class AppModule {}
```

注意：requestId 中间件**不在本文件用 MiddlewareConsumer 挂载**——Nest 11 + Express 5 下 `forRoutes('*')` 已废弃（官方迁移指南明确不应再使用，新语法为 `forRoutes('{*splat}')`），统一在 main.ts 以 `app.use` 注册为唯一注册点（见 Step 3）。

- [x] **Step 3: 重写 main.ts**

```ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: config.corsOrigin.split(',') });
  app.enableShutdownHooks();

  await app.listen(config.port);
}

void (async () => {
  await bootstrap();
})();
```

说明：requestId 在 main.ts 以 Express 原生方式注册，这是唯一注册点（不用 MiddlewareConsumer，避开 Express 5 通配语法变更）。`bufferLogs: true` 保证启动期日志也走 pino。

- [x] **Step 4: 删除脚手架样例**

删除 `src/app.controller.ts`、`src/app.service.ts`、`src/app.controller.spec.ts`。

- [x] **Step 5: 手动冒烟**

```bash
pnpm dev:server
```

另开终端：

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/api/v1/nothing
```

Expected：
- `/health` → 200，响应头含 `x-request-id`，响应体 `{"code":0,"message":"ok","data":{"status":"ok","uptime":...}}`
- `/api/v1/nothing` → 404，响应体 `{"code":40400,...,"data":null}`
- 控制台 dev 日志为 pino-pretty 单行格式；请求 `/health` 不产生访问日志（autoLogging ignore）

冒烟后终止 dev 进程。

- [x] **Step 6: Commit**

```
feat(server): health 骨架端点与 main 装配，移除脚手架样例
```

---

### Task 7: e2e 更新 + 质量门禁 + 任务文档登记

**Files:**
- Modify: `apps/nestjs-server/test/app.e2e-spec.ts`
- Modify: `AGENTS.md`（nestjs-server 状态行）

- [x] **Step 1: 重写 e2e 冒烟**

`test/app.e2e-spec.ts`（jest-e2e 默认 `NODE_ENV=test`，pino 不开 transport）：

```ts
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { requestIdMiddleware } from './../src/common/middleware/request-id.middleware.js';

describe('基架冒烟 (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(requestIdMiddleware);
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 信封 + requestId 响应头', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('透传上游 requestId', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'e2e-fixed-id')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('e2e-fixed-id');
  });

  it('未知路由 → 404 信封', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/unknown').expect(404);
    expect(res.body.code).toBe(40400);
    expect(res.body.data).toBeNull();
  });
});
```

requestId 唯一注册点为 main.ts 的 `app.use`（见 Task 6 Step 3）；e2e 中 createNestApplication 不会执行 main.ts，故此处需手动补注册，与生产行为对齐。

- [x] **Step 2: 运行 e2e**

```bash
pnpm --filter @multi-admin/nestjs-server run test:e2e
```

Expected：3 个用例 PASS。

- [x] **Step 3: 全量质量门禁**

```bash
pnpm check
```

Expected：prettier → typecheck → lint → test 全绿。若 prettier 报新文件格式问题，先跑 `pnpm format` 再复验。

- [x] **Step 4: 更新 AGENTS.md 状态行**

将 AGENTS.md 项目概览表中 nestjs-server 行更新为（描述与代码一致）：

```
| `apps/nestjs-server`    | NestJS 后端，阶段二基架补全中：已完成骨架与横切基建（配置校验/信封/日志/健康检查），Prisma + Redis 接入中 |
```

- [x] **Step 5: Commit**

```
test(server): e2e 冒烟覆盖信封/404/requestId，更新 AGENTS.md 状态
```

---

## P1 完成判定

- [ ] `pnpm dev:server` 正常启动且优雅关闭（Ctrl+C 无挂起）
- [ ] `GET /health` 返回 `{code:0,...}` 且带 `x-request-id`
- [ ] 未知路由返回 `{code:40400,...,"data":null}`
- [ ] dev 日志为 pino-pretty 格式且含 requestId
- [ ] `pnpm --filter @multi-admin/nestjs-server run test:e2e` 全绿
- [ ] `pnpm check` 全绿

P1 收尾后，进入 P2（Prisma + Redis + compose）前另起 brainstorm→plan，产出本目录下的 `phase2` 计划文档。
