# NestJS 后端基架补全 · P3 认证与 RBAC 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 P3 分设计（`2026-08-17-nestjs-backend-foundation-phase3-design.md`）：认证与 RBAC 主线（passport 双策略、JWT 双令牌 + sid 会话、守卫链、5 认证端点、Lua 限流存储、helmet/Swagger、认证链路 e2e）+ P2 遗留 6 项技术债清偿。

**Architecture:** AuthModule 承载令牌/认证域（TokenService 管签发与 Redis 会话注册表、AuthService 管业务编排、passport 双策略、5 端点）；三个全局守卫经 AppModule 的 `APP_GUARD` 按序注册（RedisThrottlerGuard → JwtAuthGuard → PermissionsGuard）；helmet/Swagger 收口进 `applyAppDefaults`；错误一律派生 `BizException` 走既有信封。

**Tech Stack:** @nestjs/jwt、@nestjs/passport + passport-local/passport-jwt、@nestjs/throttler（自研 Redis 存储）、@nestjs/swagger、helmet（均为新增）；既有 Prisma 7 / ioredis / zod / argon2 复用。

---

## 通用约定（执行前必读）

- **工作目录**：除特别说明，命令在 `apps/nestjs-server` 下执行；仓库根为 `d:\WorkSpace\AI\wewant-multi-admin`。
- **Windows cmd 坑（P2 实证）**：
  - 中文提交信息必须写临时文件后 `git commit -F .git/COMMIT_MSG_TMP`，不要内联引号；
  - Node fallback 下 `git add` 路径**不加引号**（引号会被字面化报 pathspec 错误）；
  - e2e 需注入本机 DATABASE_URL（本机 postgres 密码 `wewant!123`，测试库 `multi_admin_test`）：沿用 `.temp/run-e2e.bat` 模式（内容见 Task 4 验证步骤）；
  - `pnpm run` 下 `pretest`/`pretypecheck` 钩子（prisma generate）正常触发，勿绕过。
- **依赖版本**：新增依赖一律先 `pnpm view <pkg> version` 实查最新稳定版再写 catalog，计划中给出的版本仅为兼容性基准，不得直接照抄过期版本。
- **提交规范**：conventional commits + scope（本计划涉及 `server` / `repo` / `deps` / `docs`）；lint 带 `--max-warnings 0`。
- **TDD**：代码类任务先写失败测试再实现；配置/债务类任务以验证命令代替。
- **禁止**：`docker compose down -v`（删卷）；改动 seed 超管 create-only 语义；绕过 env 必填校验加默认值。

---

### Task 1: catalog 与依赖引入

**Files:**

- Modify: `pnpm-workspace.yaml`（catalog 段）
- Modify: `apps/nestjs-server/package.json`（dependencies / devDependencies）

- [ ] **Step 1: 实查版本**

逐个执行并记录最新稳定版（兼容性基准：`@nestjs/jwt ^11`、`@nestjs/passport ^11`、`@nestjs/swagger ^11`、`@nestjs/throttler ^6`、`helmet ^8`、`passport ^0.7`、`passport-jwt ^4`、`passport-local ^1`、`@types/passport-jwt` / `@types/passport-local` 最新）：

```bash
pnpm view @nestjs/jwt version
pnpm view @nestjs/passport version
pnpm view @nestjs/swagger version
pnpm view @nestjs/throttler version
pnpm view helmet version
pnpm view passport version
pnpm view passport-jwt version
pnpm view passport-local version
pnpm view @types/passport-jwt version
pnpm view @types/passport-local version
```

核对点：`@nestjs/throttler` 主版本与 Nest 11 兼容；记录其 `ThrottlerStorage` 接口定义文件路径（`node_modules/@nestjs/throttler/dist/throttler-storage.interface.d.ts`），Task 14 实现前复读一遍（ttl 单位、返回结构）。

- [ ] **Step 2: 写入 catalog**

`pnpm-workspace.yaml` 的 `catalog:` 段按 ASCII 序插入（版本用 Step 1 实查值，`^` 范围）：

```yaml
'@nestjs/jwt': '^11.x.x'
'@nestjs/passport': '^11.x.x'
'@nestjs/swagger': '^11.x.x'
'@nestjs/throttler': '^6.x.x'
'@types/passport-jwt': '^4.x.x'
'@types/passport-local': '^1.x.x'
'helmet': '^8.x.x'
'passport': '^0.7.x'
'passport-jwt': '^4.x.x'
'passport-local': '^1.x.x'
```

- [ ] **Step 3: 写入应用依赖**

`apps/nestjs-server/package.json`：`dependencies` 按 ASCII 序插入 `@nestjs/jwt`、`@nestjs/passport`、`@nestjs/swagger`、`@nestjs/throttler`、`helmet`、`passport`、`passport-jwt`、`passport-local`（值均为 `catalog:`）；`devDependencies` 插入 `@types/passport-jwt`、`@types/passport-local`（`catalog:`）。

- [ ] **Step 4: 安装并冒烟解析**

```bash
pnpm install
node -e "require('passport');require('passport-local');require('passport-jwt');console.log('cjs ok')"
```

预期：安装无 peer 冲突报错；第二条输出 `cjs ok`（passport 系为 CJS，分设计 §9 ESM 风险预案冒烟）。

- [ ] **Step 5: 提交**

提交信息：`deps(server): 引入认证与限流/Swagger 依赖`（正文列新增包与版本）。

---

### Task 2: 时长解析器（JWT TTL 文法）

**Files:**

- Create: `apps/nestjs-server/src/config/parse-duration.ts`
- Test: `apps/nestjs-server/src/config/parse-duration.spec.ts`

- [ ] **Step 1: 写失败测试**

`src/config/parse-duration.spec.ts`：

```ts
import { parseDurationToSeconds } from './parse-duration.js';

describe('parseDurationToSeconds', () => {
  it.each([
    ['90s', 90],
    ['15m', 900],
    ['12h', 43200],
    ['7d', 604800],
    [' 15m ', 900]
  ])('解析 %s → %i', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', 'abc', '15x', 'm15', '-5m', '1.5h'])(
    '非法输入 %j 抛错',
    input => {
      expect(() => parseDurationToSeconds(input)).toThrow(/非法时长格式/);
    }
  );
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config/parse-duration.spec.ts
```

预期：FAIL（Cannot find module './parse-duration'）。

- [ ] **Step 3: 最小实现**

`src/config/parse-duration.ts`：

```ts
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400
};

/**
 * 短时长文法解析：数字 + s|m|h|d 后缀 → 秒（分设计 §3.4）。
 * 不引入 ms 依赖；非法输入直接抛错（env 校验期快速失败）。
 */
export function parseDurationToSeconds(input: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!match) {
    throw new Error(
      `非法时长格式: "${input}"（期望形如 90s / 15m / 12h / 7d）`
    );
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]];
}
```

- [ ] **Step 4: 运行确认通过**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config/parse-duration.spec.ts
```

预期：PASS（10 用例）。

- [ ] **Step 5: 提交**

提交信息：`feat(server): 新增短时长解析器供 JWT TTL 配置使用`。

---

### Task 3: env 契约追加 JWT 四项

**Files:**

- Modify: `apps/nestjs-server/src/config/env.schema.ts`（+ `env.schema.spec.ts`）
- Modify: `apps/nestjs-server/src/config/app-config.service.ts`（+ spec）
- Modify: `apps/nestjs-server/test/setup-env.ts`
- Modify: `apps/nestjs-server/.env.example`、根 `.env.example`
- Modify: `docker-compose.yml`（server 服务 environment）

- [ ] **Step 1: 扩充 env.schema 测试**

`env.schema.spec.ts` 追加（保持既有用例不动）：

```ts
it('缺失 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 时校验失败', () => {
  const raw = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379'
    // 故意缺 JWT_*SECRET
  };
  expect(() => validateEnv(raw)).toThrow(/JWT_ACCESS_SECRET/);
  expect(() => validateEnv(raw)).toThrow(/JWT_REFRESH_SECRET/);
});

it('JWT TTL 缺省为 15m / 7d', () => {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a',
    JWT_REFRESH_SECRET: 'b'
  });
  expect(env.JWT_ACCESS_TTL).toBe('15m');
  expect(env.JWT_REFRESH_TTL).toBe('7d');
});
```

- [ ] **Step 2: 运行确认失败 → 实现 schema**

运行该 spec 确认 FAIL，然后 `env.schema.ts` 的 `envSchema` 追加四个字段，并删除 `validateEnv` 注释中「JWT_*（P3）等必填项后续追加」一行（已兑现）：

```ts
JWT_ACCESS_SECRET: z.string().min(1),
JWT_REFRESH_SECRET: z.string().min(1),
JWT_ACCESS_TTL: z.string().default('15m'),
JWT_REFRESH_TTL: z.string().default('7d')
```

- [ ] **Step 3: AppConfigService 追加 getter**

`app-config.service.ts` 追加（import `parseDurationToSeconds`）：

```ts
get jwtAccessSecret(): Env['JWT_ACCESS_SECRET'] {
  return this.config.get('JWT_ACCESS_SECRET', { infer: true });
}

get jwtRefreshSecret(): Env['JWT_REFRESH_SECRET'] {
  return this.config.get('JWT_REFRESH_SECRET', { infer: true });
}

get jwtAccessTtlSeconds(): number {
  return parseDurationToSeconds(
    this.config.get('JWT_ACCESS_TTL', { infer: true })
  );
}

get jwtRefreshTtlSeconds(): number {
  return parseDurationToSeconds(
    this.config.get('JWT_REFRESH_TTL', { infer: true })
  );
}
```

`app-config.service.spec.ts` 追加一个用例（沿用既有 beforeAll 构建的 `service` 与 setup-env.ts 注入的测试默认值）：

```ts
it('JWT getter：secret 透传 env、TTL 解析为秒', () => {
  expect(service.jwtAccessSecret).toBe(process.env['JWT_ACCESS_SECRET']);
  expect(service.jwtRefreshSecret).toBe(process.env['JWT_REFRESH_SECRET']);
  expect(service.jwtAccessTtlSeconds).toBe(900); // 默认 15m
  expect(service.jwtRefreshTtlSeconds).toBe(604800); // 默认 7d
});
```

（前提：本步骤同时落 `setup-env.ts` 的 JWT 测试默认值，见 Step 4；否则单测链 env 缺 secret 即崩。）

- [ ] **Step 4: 测试默认值与 env 模板**

`test/setup-env.ts` 追加两行（e2e/单测共用默认，真机可覆盖）：

```ts
setIfAbsent('JWT_ACCESS_SECRET', 'e2e-access-secret');
setIfAbsent('JWT_REFRESH_SECRET', 'e2e-refresh-secret');
```

`apps/nestjs-server/.env.example` 追加（本地开发用）：

```
# JWT（P3）：ACCESS/REFRESH 必须使用不同密钥；TTL 文法 数字+s|m|h|d
JWT_ACCESS_SECRET = change_me_jwt_access
JWT_REFRESH_SECRET = change_me_jwt_refresh
JWT_ACCESS_TTL = 15m
JWT_REFRESH_TTL = 7d
```

根 `.env.example` 追加（compose 注入用，两项 secret 必填）：

```
# JWT 密钥（compose server 注入，:? 强校验必填；两项必须不同）
JWT_ACCESS_SECRET = change_me_jwt_access
JWT_REFRESH_SECRET = change_me_jwt_refresh
```

- [ ] **Step 5: compose server 注入**

`docker-compose.yml` 的 server.environment 在 `ADMIN_INIT_PASSWORD` 行后追加：

```yaml
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:?请在 .env 中设置 JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET:?请在 .env 中设置 JWT_REFRESH_SECRET}
```

（TTL 走代码默认值，compose 不注入；需要覆盖时再按需加。）

- [ ] **Step 6: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/config
```

预期：config 目录全部 spec PASS。另提示（不落盘）：本机 `apps/nestjs-server/.env` 与根 `.env` 均为 gitignored，执行者需手动各补 JWT 四项/两项，否则 dev/compose 启动即崩（快速失败是预期行为）。

提交信息：`feat(server): env 契约追加 JWT 密钥与 TTL 四项`。

---

### Task 4: 技术债 #1 —— jest 双链抽公共配置

**Files:**

- Create: `apps/nestjs-server/test/jest.base.cjs`
- Create: `apps/nestjs-server/jest.config.cjs`、`apps/nestjs-server/test/jest-e2e.cjs`
- Modify: `apps/nestjs-server/package.json`（删 jest 段、改 test:e2e 脚本）
- Delete: `apps/nestjs-server/test/jest-e2e.json`

- [ ] **Step 1: 抽公共基座**

`test/jest.base.cjs`（transform 路径用 `__dirname` 解析为绝对路径，规避两份配置 rootDir 不同的漂移——这正是原债务的根因）：

```cjs
// test/jest.base.cjs
// 单测/e2e 共享的 jest 基座：transform 链 / mapper / ESM 包穿透，单一事实源（债 #1）。
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@prisma/client/runtime/(.+)\\.mjs$': '@prisma/client/runtime/$1.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@prisma/client|@prisma/adapter-pg|@prisma/driver-adapter-utils)/)'
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      `${__dirname}/strip-import-meta.cjs`,
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node10',
          resolvePackageJsonExports: false,
          allowJs: true
        }
      }
    ]
  }
};
```

- [ ] **Step 2: 两份消费方配置**

`jest.config.cjs`（应用根，jest 自动发现，内容 = 原 package.json jest 段去掉与 base 重复项）：

```cjs
// 单测配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const base = require('./test/jest.base.cjs');

module.exports = {
  ...base,
  rootDir: 'src',
  setupFiles: ['<rootDir>/../test/setup-env.ts'],
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage'
};
```

`test/jest-e2e.cjs`（内容 = 原 jest-e2e.json 去掉重复项）：

```cjs
// e2e 配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  rootDir: '.',
  setupFiles: ['<rootDir>/setup-env.ts'],
  testRegex: '.e2e-spec.ts$',
  globalSetup: '<rootDir>/global-setup.ts',
  globalTeardown: '<rootDir>/global-teardown.ts'
};
```

- [ ] **Step 3: 清理旧配置**

- `package.json`：删除整个 `"jest": {...}` 段；`test:e2e` 脚本改为 `"jest --config ./test/jest-e2e.cjs"`。
- 删除 `test/jest-e2e.json`。

- [ ] **Step 4: 双链验证**

```bash
pnpm --filter @multi-admin/nestjs-server run test
```

预期：既有单测全绿。e2e 经注入脚本验证（P2 固化模式）——若 `.temp/run-e2e.bat` 已存在则直接调用，不存在则创建：

```bat
@echo off
set DATABASE_URL=postgresql://postgres:wewant!123@localhost:5432/multi_admin_test?schema=public
pnpm --filter @multi-admin/nestjs-server run test:e2e
```

```bash
.temp\run-e2e.bat
```

预期：e2e 3/3 全绿（health 冒烟不受配置迁移影响）。

- [ ] **Step 5: 提交**

提交信息：`refactor(server): jest 单测与 e2e 配置抽公共基座`（正文注明删除重复的 transform/mapper 定义）。

---

### Task 5: 技术债 #2 —— redis 重连日志去重 + quit() 加固

**Files:**

- Modify: `apps/nestjs-server/src/common/redis/redis.module.ts`
- Modify: `apps/nestjs-server/src/common/redis/redis.module.spec.ts`

- [ ] **Step 1: 扩展现有 mock 与失败测试**

现有 spec 顶部 `jest.mock('ioredis')` 的 instance 补 `disconnect: jest.fn()`，`RedisMockInstance` 接口同步补 `disconnect: jest.Mock`。套件内追加两个用例（沿用既有 `buildModule` + `moduleRef.get<RedisMockInstance>(REDIS_CLIENT)` 模式；`client.on` 的注册回调经 `mock.calls` 查找后手动 emit 驱动）：

```ts
const emit = (client: RedisMockInstance, event: string, ...args: unknown[]) => {
  const entry = client.on.mock.calls.find(c => c[0] === event);
  expect(entry).toBeDefined();
  (entry![1] as (...a: unknown[]) => void)(...args);
};

it('error 日志按状态迁移去重，ready 后复位', async () => {
  const moduleRef = await buildModule();
  const logger = moduleRef.get(Logger);
  const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
  emit(client, 'error', new Error('conn refused'));
  emit(client, 'error', new Error('conn refused'));
  expect(logger.error).toHaveBeenCalledTimes(1);
  emit(client, 'ready');
  emit(client, 'error', new Error('conn refused'));
  expect(logger.error).toHaveBeenCalledTimes(2);
  await moduleRef.close().catch(() => undefined);
});

it('quit 悬挂 3s 后强制 disconnect，shutdown 不卡死', async () => {
  const moduleRef = await buildModule();
  await moduleRef.init();
  const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
  client.quit.mockReturnValueOnce(new Promise(() => undefined)); // 永不 resolve
  client.status = 'connecting';
  await moduleRef.close(); // jest 默认 5s 超时内必须返回
  expect(client.disconnect).toHaveBeenCalled();
});
```

注：`Logger` 经 `moduleRef.get(Logger)` 取 MockRedisDepsModule 中的 mock 实例；`module.close()` 触发 `onApplicationShutdown`。

- [ ] **Step 2: 运行确认失败 → 实现**

运行该 spec 确认 FAIL，然后改 `redis.module.ts`：

```ts
useFactory: (config: AppConfigService, logger: Logger) => {
  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null
  });
  // 债 #2：按连接状态迁移去重，重连风暴下不再刷屏；ready 后复位允许再报
  let errorLogged = false;
  client.on('error', (err: unknown) => {
    if (!errorLogged) {
      errorLogged = true;
      logger.error({ err }, 'redis 连接错误（自动重连中）');
    }
  });
  client.on('ready', () => {
    errorLogged = false;
  });
  return client;
}
```

```ts
/** 债 #2：quit 3s 竞速超时，超时强制 disconnect，防 shutdown 悬挂 */
async onApplicationShutdown(): Promise<void> {
  await Promise.race([
    this.redis.quit().catch(() => undefined),
    new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3_000);
      timer.unref();
    })
  ]);
  if (this.redis.status !== 'end') {
    this.redis.disconnect();
  }
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/redis
```

预期：全绿。提交信息：`fix(server): redis 重连日志按状态迁移去重并加固关闭`。

---

### Task 6: 技术债 #3 —— Menu.parentId 索引

**Files:**

- Modify: `apps/nestjs-server/prisma/schema.prisma`
- Create: 新 migration 目录（prisma 自动生成）

- [ ] **Step 1: schema 补索引**

`schema.prisma` 的 `model Menu` 在 `roles RoleMenu[]` 行后追加：

```prisma
  @@index([parentId])
```

- [ ] **Step 2: 生成 migration**

```bash
pnpm --filter @multi-admin/nestjs-server exec prisma migrate dev --name menu_parent_id_index
```

预期：生成新 migration，其 SQL 含 `CREATE INDEX ... ON "Menu"("parentId")`；对已 migrate 的本地库幂等应用成功。检查生成的 SQL 文件内容确认仅含该索引语句。

- [ ] **Step 3: deploy 幂等验证**

```bash
pnpm --filter @multi-admin/nestjs-server exec prisma migrate deploy
```

预期：无 pending migration 报错（刚已应用）。

- [ ] **Step 4: 提交**

提交信息：`feat(server): Menu.parentId 补索引`（正文注明权限/路由树查询均走 parentId）。

---

### Task 7: 技术债 #4 —— terminus deprecated 替换

**Files:**

- Modify: `apps/nestjs-server/src/modules/health/health.controller.ts`
- Modify: `apps/nestjs-server/src/modules/health/database-health.indicator.ts`、`redis-health.indicator.ts`（+ 各自 spec）
- Modify: `apps/nestjs-server/src/modules/health/health.module.ts`
- Modify: `apps/nestjs-server/package.json`、`pnpm-workspace.yaml`（移除 terminus）

- [ ] **Step 1: 核实 terminus 现行形态**

```bash
pnpm view @nestjs/terminus version
```

并读 `node_modules/@nestjs/terminus` 的类型声明与 changelog，确认 `HealthIndicator` 基类是否仍标记 deprecated、是否有官方非弃用迁移形态（如函数式探针）。**决策门**：若存在一行级官方迁移则采用；本计划基线路径为自研轻量编排（P2 探针本就是自写，terminus 仅剩编排价值），以下按基线路径给出完整代码。

- [ ] **Step 2: 改探针为纯 Injectable**

`database-health.indicator.ts`（redis 同构，探针体换成 `redis.ping()`）：

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/** 探针超时（ms）：依赖假死时避免 /health 永久悬挂。导出以便测试注入小值。 */
export const PROBE_TIMEOUT_MS = 3_000;

export interface ProbeResult {
  status: 'up' | 'down';
  error?: string;
}

/**
 * 自写 DB 探针（债 #4：脱离 terminus HealthIndicator 弃用基类，
 * 改纯 Injectable + ProbeResult；/health 信封契约保持不变）。
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('probe timeout')),
          timeoutMs
        );
        timer.unref();
      });
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
```

- [ ] **Step 3: 控制器自编排**

`health.controller.ts`：

```ts
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/**
 * 双探针健康检查（债 #4：自研轻量编排替换 terminus）：
 * 任一探针 down → 503，经全局过滤器派生 code 50300（status × 100，总 spec §5）。
 * 信封 {code:0, data:{status, details}} 契约保持不变（e2e 既有断言为验收基准）。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator
  ) {}

  @Public()
  @Get()
  async check() {
    const database = await this.db.isHealthy();
    const redis = await this.redis.isHealthy();
    const details = { database, redis };
    if (database.status !== 'up' || redis.status !== 'up') {
      throw new HttpException(
        { status: 'error', details },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    return { status: 'ok', details };
  }
}
```

注意：`@Public()` 装饰器在 Task 10 才创建——**Task 7 执行时先不加 `@Public()` 行及其 import**，Task 15 装配全局守卫链时统一补上（本步骤代码保留该注释位）。`health.module.ts` 移除 terminus 相关 import（`TerminusModule`、`HealthCheckService`），providers 只留两个 indicator。

- [ ] **Step 4: 更新单测**

两个 indicator spec：断言改为 `{status:'up'}` / `{status:'down', error}`；删除 terminus 相关断言。controller 若无独立 spec 则不新增（e2e 覆盖）。

- [ ] **Step 5: 移除依赖 + 全量验证**

`package.json` 删 `"@nestjs/terminus": "catalog:"`；`pnpm-workspace.yaml` catalog 删 `'@nestjs/terminus'` 行；`pnpm install`。

```bash
pnpm --filter @multi-admin/nestjs-server run typecheck
pnpm --filter @multi-admin/nestjs-server run test
.temp\run-e2e.bat
```

预期：typecheck 零 deprecated 告警；单测/e2e 全绿（e2e 对 `/health` 的既有断言原样通过 = 契约冻结验收）。

- [ ] **Step 6: 提交**

提交信息：`refactor(server): 自研轻量编排替换 terminus 健康检查`。

---

### Task 8: 技术债 #5 —— entrypoint 阶段标记

**Files:**

- Modify: `apps/nestjs-server/Dockerfile`（production-stage 的 printf 行）

- [ ] **Step 1: printf 补三行 echo**

将 Dockerfile 中生成 entrypoint 的 RUN 行替换为：

```dockerfile
RUN printf '#!/bin/sh\nset -e\necho "[entrypoint] migrate deploy"\npnpm exec prisma migrate deploy\necho "[entrypoint] db seed"\npnpm exec prisma db seed\necho "[entrypoint] start server"\nexec node dist/main.js\n' > /entrypoint.sh && chmod +x /entrypoint.sh
```

- [ ] **Step 2: 静态验证**

本地无法只构建 entrypoint 不构建全镜像，故本任务只做文本核验：确认生成的 printf 展开后为 7 行脚本、三个 `[entrypoint]` 标记分别位于 migrate/seed/server 前。容器日志验收随 Task 17 镜像回归一并执行。

- [ ] **Step 3: 提交**

提交信息：`build(server): entrypoint 补三阶段日志标记`。

---

### Task 9: 技术债 #6 —— compose REDIS_URL 插值

**Files:**

- Modify: `docker-compose.yml`

- [ ] **Step 1: 改为可覆盖插值**

server.environment 中 `REDIS_URL: redis://redis:6379` 改为（与 DATABASE_URL 既有插值模式对齐，根 `.env.example` 已提供 compose 内部 host 形态的默认值）：

```yaml
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
```

- [ ] **Step 2: 验证插值**

```bash
docker compose config
```

预期：server.REDIS_URL 解析为 `redis://redis:6379`（来自根 .env）；临时在根 .env 注释 REDIS_URL 再跑一次应回落默认值（验证后恢复 .env）。同时全仓 grep 文档中「REDIS_URL 未插值」类表述（P2 备案处），如有则同提交更新。

- [ ] **Step 3: 提交**

提交信息：`fix(repo): compose REDIS_URL 支持根 env 覆盖`。

---

### Task 10: 三个配套装饰器

**Files:**

- Create: `apps/nestjs-server/src/common/decorators/public.decorator.ts`
- Create: `apps/nestjs-server/src/common/decorators/require-permissions.decorator.ts`
- Create: `apps/nestjs-server/src/common/decorators/current-user.decorator.ts`
- Test: 同目录各配 `.spec.ts`（反射元数据断言）

- [ ] **Step 1: 实现三个装饰器**

`public.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记路由免 JWT 认证（login/refresh-token/health，分设计 §4.1） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`require-permissions.decorator.ts`：

```ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'requirePermissions';

/** 声明路由所需权限点（AND 语义）；P3 预留，P4 system CRUD 消费 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
```

`current-user.decorator.ts`：

```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** 取 JwtAuthGuard 挂载的 req.user */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ user?: unknown }>().user
);
```

- [ ] **Step 2: 单测**

各 spec 用 NestJS 反射工具断言元数据，例如：

```ts
import { Reflector } from '@nestjs/core';
import { Public, IS_PUBLIC_KEY } from './public.decorator.js';
import { RequirePermissions, REQUIRE_PERMISSIONS_KEY } from './require-permissions.decorator.js';

class FixtureController {
  @Public()
  login() {}

  @RequirePermissions('system:user:query', 'system:user:add')
  list() {}
}

describe('认证装饰器', () => {
  const reflector = new Reflector();

  it('@Public 写入 isPublic 元数据', () => {
    expect(
      reflector.get(IS_PUBLIC_KEY, FixtureController.prototype.login)
    ).toBe(true);
  });

  it('@RequirePermissions 写入权限点数组', () => {
    expect(
      reflector.get(REQUIRE_PERMISSIONS_KEY, FixtureController.prototype.list)
    ).toEqual(['system:user:query', 'system:user:add']);
  });
});
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/decorators
```

预期：全绿。提交信息：`feat(server): 新增 Public/RequirePermissions/CurrentUser 装饰器`。

---

### Task 11: TokenService（双令牌签发 + sid 会话注册表 + 黑名单）

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/token.service.ts`
- Test: `apps/nestjs-server/src/modules/auth/token.service.spec.ts`

- [ ] **Step 1: 写失败测试（mock JwtService + mock redis）**

`token.service.spec.ts`（`jest.fn()` stub，不连真 redis；并发真实性留 Task 17 e2e 第 7 类用例）：

```ts
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import {
  TokenService,
  REFRESH_KEY_PREFIX,
  BLACKLIST_KEY_PREFIX
} from './token.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';

describe('TokenService', () => {
  let service: TokenService;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    exists: jest.Mock;
    eval: jest.Mock;
  };
  const config = {
    jwtAccessSecret: 'access-secret',
    jwtRefreshSecret: 'refresh-secret',
    jwtAccessTtlSeconds: 900,
    jwtRefreshTtlSeconds: 604800
  } as unknown as AppConfigService;
  const user = { id: 'u1', username: 'admin' };

  beforeEach(() => {
    jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      exists: jest.fn(),
      eval: jest.fn()
    };
    service = new TokenService(
      jwt as unknown as JwtService,
      config,
      redis as unknown as Redis
    );
  });

  it('issuePair：双令牌独立 secret/TTL、注册会话、expires 毫秒时间戳', async () => {
    jwt.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    const before = Date.now();
    const pair = await service.issuePair(user);

    expect(pair.accessToken).toBe('access-token');
    expect(pair.refreshToken).toBe('refresh-token');
    expect(pair.sid).toEqual(expect.any(String));
    expect(pair.expires).toBeGreaterThanOrEqual(before + 900_000);
    expect(jwt.signAsync.mock.calls[0][1]).toMatchObject({
      secret: 'access-secret',
      expiresIn: 900
    });
    expect(jwt.signAsync.mock.calls[1][1]).toMatchObject({
      secret: 'refresh-secret',
      expiresIn: 604800
    });
    const refreshJti = (jwt.signAsync.mock.calls[1][0] as { jti: string }).jti;
    expect(redis.set).toHaveBeenCalledWith(
      REFRESH_KEY_PREFIX + pair.sid,
      JSON.stringify({ userId: 'u1', jti: refreshJti }),
      'EX',
      604800
    );
  });

  it('verifyRefreshToken：有效返 claims；type 错/验签失败 → 40103', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sid: 's1', jti: 'j1', type: 'refresh' });
    await expect(service.verifyRefreshToken('t')).resolves.toEqual({
      sub: 'u1',
      sid: 's1',
      jti: 'j1'
    });

    jwt.verifyAsync.mockResolvedValue({ sub: 'u1', sid: 's1', jti: 'j1', type: 'access' });
    await expect(service.verifyRefreshToken('t')).rejects.toMatchObject({ code: 40103 });

    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    await expect(service.verifyRefreshToken('t')).rejects.toMatchObject({ code: 40103 });
  });

  it('rotate：键缺失/jti 不符/CAS 竞争 → 40103；成功则 sid 不变、注册值换新 jti', async () => {
    const claims = { sub: 'u1', sid: 's1', jti: 'j-old' };

    redis.get.mockResolvedValue(null);
    await expect(service.rotate(claims, user)).rejects.toMatchObject({ code: 40103 });

    redis.get.mockResolvedValue(JSON.stringify({ userId: 'u1', jti: 'j-other' }));
    await expect(service.rotate(claims, user)).rejects.toMatchObject({ code: 40103 });

    redis.get.mockResolvedValue(JSON.stringify({ userId: 'u1', jti: 'j-old' }));
    redis.eval.mockResolvedValue(0);
    await expect(service.rotate(claims, user)).rejects.toMatchObject({ code: 40103 });

    redis.eval.mockResolvedValue(1);
    jwt.signAsync
      .mockResolvedValueOnce('new-access')
      .mockResolvedValueOnce('new-refresh');
    const pair = await service.rotate(claims, user);
    expect(pair.sid).toBe('s1');
    expect(pair.accessToken).toBe('new-access');
    // eval 参数：[script, 1, key, 旧值, 新值, ttl]；新值 JSON 的 jti 已换新
    const casArgs = redis.eval.mock.calls.at(-1) as unknown[];
    const newValue = JSON.parse(casArgs[4] as string) as { userId: string; jti: string };
    expect(newValue.userId).toBe('u1');
    expect(newValue.jti).not.toBe('j-old');
  });

  it('blacklist：EX=ceil(ttl)；ttl ≤ 0 不写', async () => {
    await service.blacklist('j1', 12.3);
    expect(redis.set).toHaveBeenCalledWith(BLACKLIST_KEY_PREFIX + 'j1', '1', 'EX', 13);
    redis.set.mockClear();
    await service.blacklist('j2', 0);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('isBlacklisted / deleteSession 映射 exists / del', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(service.isBlacklisted('j1')).resolves.toBe(true);
    await service.deleteSession('s1');
    expect(redis.del).toHaveBeenCalledWith(REFRESH_KEY_PREFIX + 's1');
  });
});
```

- [ ] **Step 2: 运行确认失败 → 实现**

`token.service.ts`：

```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import { BizCode } from '../../common/errors/biz-code.js';
import { BizException } from '../../common/errors/biz.exception.js';
import { AppConfigService } from '../../config/app-config.service.js';

export const REFRESH_KEY_PREFIX = 'auth:refresh:';
export const BLACKLIST_KEY_PREFIX = 'auth:blacklist:';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** access 过期的毫秒时间戳（契约：前端一行切换，P5 联调） */
  expires: number;
  sid: string;
}

export interface RefreshClaims {
  sub: string;
  sid: string;
  jti: string;
}

/** Lua CAS：仅当存储值 === 期望旧值时写入新值并重置 TTL（防并发双刷） */
const ROTATE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /** 登录签发：新 sid + 双令牌 + 注册会话（分设计 §3.3） */
  async issuePair(user: { id: string; username: string }): Promise<TokenPair> {
    const sid = randomUUID();
    const refreshJti = randomUUID();
    const accessToken = await this.signAccess(user.id, user.username, sid);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid, jti: refreshJti, type: 'refresh' },
      {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshTtlSeconds
      }
    );
    await this.redis.set(
      REFRESH_KEY_PREFIX + sid,
      JSON.stringify({ userId: user.id, jti: refreshJti }),
      'EX',
      this.config.jwtRefreshTtlSeconds
    );
    return {
      accessToken,
      refreshToken,
      expires: Date.now() + this.config.jwtAccessTtlSeconds * 1000,
      sid
    };
  }

  /** refresh 验签 + type 强校验；任何异常一律 40103（不泄露细分原因） */
  async verifyRefreshToken(token: string): Promise<RefreshClaims> {
    let payload: RefreshClaims & { type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.jwtRefreshSecret
      });
    } catch {
      throw new BizException(
        BizCode.REFRESH_TOKEN_INVALID,
        'refreshToken 无效或已过期'
      );
    }
    if (payload.type !== 'refresh') {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '令牌类型错误');
    }
    return { sub: payload.sub, sid: payload.sid, jti: payload.jti };
  }

  /**
   * 轮换：Lua CAS「比对 jti → 写新值 + 重置 TTL」原子执行；
   * sid 不变、jti 换新，旧 refresh 立即失效（分设计 §3.3）。
   */
  async rotate(
    claims: RefreshClaims,
    user: { id: string; username: string }
  ): Promise<TokenPair> {
    const key = REFRESH_KEY_PREFIX + claims.sid;
    const stored = await this.redis.get(key);
    if (!stored) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '会话不存在或已登出');
    }
    const record = JSON.parse(stored) as { userId: string; jti: string };
    if (record.jti !== claims.jti) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, 'refreshToken 已被轮换');
    }
    const newRefreshJti = randomUUID();
    const newValue = JSON.stringify({ userId: user.id, jti: newRefreshJti });
    const ok = await this.redis.eval(
      ROTATE_LUA,
      1,
      key,
      stored,
      newValue,
      String(this.config.jwtRefreshTtlSeconds)
    );
    if (ok !== 1) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '刷新冲突，请重试');
    }
    const accessToken = await this.signAccess(user.id, user.username, claims.sid);
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: claims.sid, jti: newRefreshJti, type: 'refresh' },
      {
        secret: this.config.jwtRefreshSecret,
        expiresIn: this.config.jwtRefreshTtlSeconds
      }
    );
    return {
      accessToken,
      refreshToken,
      expires: Date.now() + this.config.jwtAccessTtlSeconds * 1000,
      sid: claims.sid
    };
  }

  /** 登出黑名单：TTL = access 剩余寿命；已自然过期则不写 */
  async blacklist(accessJti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.redis.set(
      BLACKLIST_KEY_PREFIX + accessJti,
      '1',
      'EX',
      Math.ceil(ttlSeconds)
    );
  }

  async isBlacklisted(accessJti: string): Promise<boolean> {
    return (await this.redis.exists(BLACKLIST_KEY_PREFIX + accessJti)) === 1;
  }

  /** 登出整会话吊销：DEL sid 注册键（幂等） */
  async deleteSession(sid: string): Promise<void> {
    await this.redis.del(REFRESH_KEY_PREFIX + sid);
  }

  private signAccess(userId: string, username: string, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, username, sid, jti: randomUUID(), type: 'access' },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessTtlSeconds
      }
    );
  }
}
```

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/token.service
```

预期：全绿。提交信息：`feat(server): TokenService 双令牌签发与 sid 会话注册表`。

---

### Task 12: AuthService（登录/刷新/登出/用户信息/动态路由）

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/auth-user.ts`
- Create: `apps/nestjs-server/src/modules/auth/permissions.ts`（+ spec）
- Create: `apps/nestjs-server/src/modules/auth/route-tree.ts`（+ spec）
- Create: `apps/nestjs-server/src/modules/auth/auth.service.ts`（+ spec）
- Modify: `apps/nestjs-server/src/common/types/express-request.d.ts`

- [ ] **Step 1: AuthUser 类型与 Request 扩展**

`auth-user.ts`：

```ts
/** JwtAuthGuard 挂载到 req.user 的会话用户（权限集实时查库，分设计 §4.3） */
export interface AuthUser {
  userId: string;
  username: string;
  nickname: string;
  sid: string;
  jti: string;
  /** access 的 exp（unix 秒），登出黑名单计算剩余寿命用 */
  exp: number;
  roles: string[];
  permissions: string[];
}
```

`express-request.d.ts`（现状为 `declare global` + 尾部 `export {}` 形态）：顶部加 `import type { AuthUser } from '../../modules/auth/auth-user.js';`（`common/types/` → `modules/auth/` 需上溯两级），`Request` 接口追加：

```ts
user?: AuthUser;
```

- [ ] **Step 2: 权限集推导纯函数**

`permissions.ts`：

```ts
export interface MenuPermissionRow {
  type: 'MENU' | 'BUTTON';
  permission: string | null;
}

/**
 * 权限点集合 = 各角色关联 Menu.permission 非空集合（BUTTON 型）；
 * admin 角色返回通配集（与 pure-web mock 一致，前端零适配，分设计 §4.3）。
 */
export function derivePermissions(
  menus: MenuPermissionRow[],
  roleCodes: string[]
): string[] {
  if (roleCodes.includes('admin')) return ['*:*:*'];
  return [...new Set(menus.map(m => m.permission).filter((p): p is string => p !== null))];
}
```

`permissions.spec.ts`：

```ts
import { derivePermissions, type MenuPermissionRow } from './permissions.js';

const rows: MenuPermissionRow[] = [
  { type: 'MENU', permission: null },
  { type: 'BUTTON', permission: 'system:user:query' },
  { type: 'BUTTON', permission: 'system:user:add' },
  { type: 'BUTTON', permission: 'system:user:query' } // 重复项
];

describe('derivePermissions', () => {
  it('admin 角色返回通配集', () => {
    expect(derivePermissions(rows, ['admin', 'common'])).toEqual(['*:*:*']);
  });

  it('普通角色：BUTTON 权限去重、忽略 MENU 空值', () => {
    expect(derivePermissions(rows, ['common'])).toEqual([
      'system:user:query',
      'system:user:add'
    ]);
  });

  it('无关联菜单（空角色查询结果）返回空集', () => {
    expect(derivePermissions([], ['common'])).toEqual([]);
  });
});
```

- [ ] **Step 3: 路由树组装纯函数**

`route-tree.ts`（vue-pure-admin 元数据格式，对齐 `apps/pure-web/mock/asyncRoutes.ts` 形状）：

```ts
export interface MenuRouteRow {
  id: string;
  parentId: string | null;
  type: 'MENU' | 'BUTTON';
  name: string;
  title: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  sort: number;
}

export interface RouteNode {
  path: string;
  name?: string;
  component?: string;
  meta: {
    icon?: string;
    title: string;
    rank?: number;
    roles?: string[];
  };
  children?: RouteNode[];
}

/**
 * MENU 型节点按 parentId 组装树（分设计 §4.3）：
 * 顶层组带 rank（sort），叶子带 name/component 与可见角色集；按 sort 升序。
 */
export function buildRouteTree(
  menus: MenuRouteRow[],
  roleCodes: string[]
): RouteNode[] {
  const nodes = menus
    .filter(m => m.type === 'MENU')
    .sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, MenuRouteRow[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const toNode = (menu: MenuRouteRow, isTop: boolean): RouteNode => {
    const children = (byParent.get(menu.id) ?? []).map(c => toNode(c, false));
    const node: RouteNode = {
      path: menu.path ?? '',
      meta: isTop
        ? { rank: menu.sort, title: menu.title }
        : { title: menu.title, roles: roleCodes }
    };
    if (menu.icon) node.meta.icon = menu.icon;
    if (!isTop) {
      node.name = menu.name;
      if (menu.component) node.component = menu.component;
    }
    if (children.length > 0) node.children = children;
    return node;
  };

  return (byParent.get(null) ?? []).map(m => toNode(m, true));
}
```

spec 用 seed-data 同构的两层样例断言（`route-tree.spec.ts`）：

```ts
import { buildRouteTree, type MenuRouteRow } from './route-tree.js';

const row = (partial: Partial<MenuRouteRow> & Pick<MenuRouteRow, 'id' | 'name'>): MenuRouteRow => ({
  parentId: null,
  type: 'MENU',
  title: partial.name,
  icon: null,
  path: null,
  component: null,
  sort: 0,
  ...partial
});

const rows: MenuRouteRow[] = [
  row({ id: 'm-sys', name: 'System', path: '/system', icon: 'ri:settings-3-line', sort: 1 }),
  row({ id: 'm-mon', name: 'Monitor', path: '/monitor', sort: 0 }),
  row({ id: 'm-user', name: 'SystemUser', parentId: 'm-sys', path: '/system/user/index', icon: 'ri:admin-line' }),
  row({ id: 'm-log', name: 'LoginLog', parentId: 'm-sys', path: '/monitor/login-logs', component: 'monitor/logs/login/index', sort: 1 }),
  row({ id: 'b-q', name: 'SystemUser:query', parentId: 'm-user', type: 'BUTTON' })
];

describe('buildRouteTree', () => {
  it('顶层按 sort 升序、BUTTON 过滤、叶子带 name/component/roles', () => {
    const tree = buildRouteTree(rows, ['common']);
    expect(tree.map(n => n.path)).toEqual(['/monitor', '/system']); // sort 0 在前

    const sys = tree[1];
    expect(sys.meta).toEqual({
      rank: 1,
      title: 'System',
      icon: 'ri:settings-3-line'
    });
    expect(sys.name).toBeUndefined(); // 顶层无 name（对齐 mock 形状）
    expect(sys.children).toHaveLength(2); // BUTTON 已过滤
    expect(sys.children![0]).toMatchObject({
      path: '/system/user/index',
      name: 'SystemUser',
      meta: { title: 'SystemUser', roles: ['common'], icon: 'ri:admin-line' }
    });
    expect(sys.children![1]).toMatchObject({
      name: 'LoginLog',
      component: 'monitor/logs/login/index'
    });
    expect(sys.children![1].meta.icon).toBeUndefined(); // icon 为 null 时不写键
  });
});
```

- [ ] **Step 4: AuthService**

`auth.service.ts`（spec 用 mock PrismaService/TokenService 覆盖：密码错误与用户不存在同码 40101、DISABLED 拒绝、login 返回形态、refresh 链路、logout 黑名单+DEL、resolveSessionUser 黑名单命中 40101）：

```ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service.js';
import { BizCode } from '../../common/errors/biz-code.js';
import { BizException } from '../../common/errors/biz.exception.js';
import { TokenService, type TokenPair } from './token.service.js';
import { derivePermissions } from './permissions.js';
import { buildRouteTree } from './route-tree.js';
import type { AuthUser } from './auth-user.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService
  ) {}

  /** LocalStrategy 入口：密码错误/用户不存在同码不泄露（分设计 §8 用例 1） */
  async validateUser(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } }
    });
    if (!user || !(await argon2.verify(user.password, password))) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      throw new BizException(BizCode.UNAUTHORIZED, '账号已禁用');
    }
    return user;
  }

  async login(user: Awaited<ReturnType<AuthService['validateUser']>>) {
    const pair = await this.tokens.issuePair({ id: user.id, username: user.username });
    const roleCodes = user.roles.map(ur => ur.role.code);
    return {
      ...(await this.profileOf(user.id, roleCodes)),
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      expires: pair.expires
    };
  }

  /** 轮换：旧 refresh 立即失效；用户已删/禁用 → 40103 */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const claims = await this.tokens.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '会话用户不可用');
    }
    return this.tokens.rotate(claims, { id: user.id, username: user.username });
  }

  /** 严格校验登出：黑名单 access jti + DEL sid 注册键（分设计 §3.3） */
  async logout(user: AuthUser): Promise<void> {
    await this.tokens.blacklist(user.jti, user.exp - Math.floor(Date.now() / 1000));
    await this.tokens.deleteSession(user.sid);
  }

  /** JwtStrategy 回调：黑名单 → 实时查库组装 req.user（分设计 §4.3） */
  async resolveSessionUser(payload: {
    sub: string;
    username: string;
    sid: string;
    jti: string;
    exp: number;
  }): Promise<AuthUser> {
    if (await this.tokens.isBlacklisted(payload.jti)) {
      throw new BizException(BizCode.UNAUTHORIZED, '令牌已失效');
    }
    const user = await this.findUserWithRoles(payload.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new BizException(BizCode.UNAUTHORIZED, '用户不存在或已禁用');
    }
    const roleCodes = user.roles.map(ur => ur.role.code);
    return {
      userId: user.id,
      username: user.username,
      nickname: user.nickname,
      sid: payload.sid,
      jti: payload.jti,
      exp: payload.exp,
      roles: roleCodes,
      permissions: await this.permissionsOf(user.roles.map(ur => ur.roleId))
    };
  }

  /** get-user-info：从库实时查（非令牌快照） */
  async getUserInfo(user: AuthUser) {
    return this.profileOf(user.userId, user.roles);
  }

  /** get-async-routes：角色可见 MENU 树 */
  async getAsyncRoutes(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: user.roles } },
      select: { id: true, code: true }
    });
    const menus = await this.prisma.menu.findMany({
      where: { roles: { some: { roleId: { in: roles.map(r => r.id) } } } }
    });
    return buildRouteTree(menus, user.roles);
  }

  private async profileOf(userId: string, roleCodes: string[]) {
    const user = await this.findUserWithRoles(userId);
    const roleIds = user?.roles.map(ur => ur.roleId) ?? [];
    return {
      avatar: null,
      username: user?.username ?? '',
      nickname: user?.nickname ?? '',
      roles: roleCodes,
      permissions: await this.permissionsOf(roleIds)
    };
  }

  private async permissionsOf(roleIds: string[]): Promise<string[]> {
    const roleCodes = (
      await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { code: true } })
    ).map(r => r.code);
    const menus = await this.prisma.menu.findMany({
      where: { roles: { some: { roleId: { in: roleIds } } } },
      select: { type: true, permission: true }
    });
    return derivePermissions(menus, roleCodes);
  }

  private findUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } }
    });
  }
}
```

注：`avatar` 固定 `null`（User 表无 avatar 列，分设计 §4.2）；`login` 的 roles 用角色 code 数组（与 mock `['admin']` 一致）。

`auth.service.spec.ts`（mock PrismaService + TokenService + argon2）：

```ts
import { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({ verify: jest.fn() }));

const ADMIN_ROW = {
  id: 'u1',
  username: 'admin',
  nickname: '超级管理员',
  password: 'hash',
  status: 'ACTIVE',
  roles: [{ roleId: 'r1', role: { code: 'admin' } }]
};

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    role: { findMany: jest.Mock };
    menu: { findMany: jest.Mock };
  };
  let tokens: {
    issuePair: jest.Mock;
    verifyRefreshToken: jest.Mock;
    rotate: jest.Mock;
    blacklist: jest.Mock;
    deleteSession: jest.Mock;
    isBlacklisted: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([{ code: 'admin' }]) },
      menu: { findMany: jest.fn().mockResolvedValue([]) }
    };
    tokens = {
      issuePair: jest.fn(),
      verifyRefreshToken: jest.fn(),
      rotate: jest.fn(),
      blacklist: jest.fn().mockResolvedValue(undefined),
      deleteSession: jest.fn().mockResolvedValue(undefined),
      isBlacklisted: jest.fn().mockResolvedValue(false)
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      tokens as unknown as TokenService
    );
  });

  describe('validateUser', () => {
    it('用户不存在与密码错误同为 40101', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.validateUser('ghost', 'x')).rejects.toMatchObject({ code: 40101 });

      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.validateUser('admin', 'wrong')).rejects.toMatchObject({ code: 40101 });
    });

    it('DISABLED 拒绝 40101；成功返回用户', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ADMIN_ROW, status: 'DISABLED' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(service.validateUser('admin', 'ok')).rejects.toMatchObject({ code: 40101 });

      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      await expect(service.validateUser('admin', 'ok')).resolves.toBe(ADMIN_ROW);
    });
  });

  it('login：profile + 令牌对的契约形态', async () => {
    prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
    tokens.issuePair.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      expires: 123,
      sid: 's1'
    });
    const result = await service.login(ADMIN_ROW as never);
    expect(result).toEqual({
      avatar: null,
      username: 'admin',
      nickname: '超级管理员',
      roles: ['admin'],
      permissions: ['*:*:*'],
      accessToken: 'a',
      refreshToken: 'r',
      expires: 123
    });
    expect(tokens.issuePair).toHaveBeenCalledWith({ id: 'u1', username: 'admin' });
  });

  describe('refresh', () => {
    it('验 claims → 查用户 → rotate（sid 不变）', async () => {
      const claims = { sub: 'u1', sid: 's1', jti: 'j1' };
      tokens.verifyRefreshToken.mockResolvedValue(claims);
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      tokens.rotate.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2', expires: 2, sid: 's1' });

      await expect(service.refresh('rt')).resolves.toMatchObject({ sid: 's1' });
      expect(tokens.rotate).toHaveBeenCalledWith(claims, { id: 'u1', username: 'admin' });
    });

    it('用户不存在/禁用 → 40103', async () => {
      tokens.verifyRefreshToken.mockResolvedValue({ sub: 'u1', sid: 's1', jti: 'j1' });
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.refresh('rt')).rejects.toMatchObject({ code: 40103 });

      prisma.user.findUnique.mockResolvedValue({ ...ADMIN_ROW, status: 'DISABLED' });
      await expect(service.refresh('rt')).rejects.toMatchObject({ code: 40103 });
    });
  });

  it('logout：黑名单 access jti（TTL=剩余寿命）+ DEL sid 键', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const user = { jti: 'j1', sid: 's1', exp: nowSec + 300 } as AuthUser;
    await service.logout(user);
    const ttl = tokens.blacklist.mock.calls[0][1] as number;
    expect(tokens.blacklist).toHaveBeenCalledWith('j1', expect.any(Number));
    expect(ttl).toBeGreaterThanOrEqual(298); // 容忍测试耗时
    expect(ttl).toBeLessThanOrEqual(300);
    expect(tokens.deleteSession).toHaveBeenCalledWith('s1');
  });

  describe('resolveSessionUser', () => {
    const payload = { sub: 'u1', username: 'admin', sid: 's1', jti: 'j1', exp: 999 };

    it('黑名单命中 → 40101', async () => {
      tokens.isBlacklisted.mockResolvedValue(true);
      await expect(service.resolveSessionUser(payload)).rejects.toMatchObject({ code: 40101 });
    });

    it('正常路径：实时查库组装 AuthUser', async () => {
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      const user = await service.resolveSessionUser(payload);
      expect(user).toEqual({
        userId: 'u1',
        username: 'admin',
        nickname: '超级管理员',
        sid: 's1',
        jti: 'j1',
        exp: 999,
        roles: ['admin'],
        permissions: ['*:*:*']
      });
    });
  });
});
```

- [ ] **Step 5: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth
```

预期：全绿。提交信息：`feat(server): AuthService 登录/轮换/登出/用户信息/动态路由`。

---

### Task 13: passport 双策略 + 双守卫

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/strategies/local.strategy.ts`
- Create: `apps/nestjs-server/src/modules/auth/strategies/jwt.strategy.ts`
- Create: `apps/nestjs-server/src/common/guards/local-auth.guard.ts`
- Create: `apps/nestjs-server/src/common/guards/jwt-auth.guard.ts`
- Create: `apps/nestjs-server/src/common/guards/permissions.guard.ts`
- Test: `jwt-auth.guard.spec.ts`、`permissions.guard.spec.ts`

- [ ] **Step 1: 两个策略**

`local.strategy.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service.js';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly auth: AuthService) {
    super({ usernameField: 'username' });
  }

  validate(username: string, password: string) {
    return this.auth.validateUser(username, password);
  }
}
```

`jwt.strategy.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../../config/app-config.service.js';
import { AuthService } from '../auth.service.js';

interface AccessPayload {
  sub: string;
  username: string;
  sid: string;
  jti: string;
  exp: number;
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: AppConfigService, private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.jwtAccessSecret
    });
  }

  /** type 强校验防 access/refresh 互串；黑名单与查库委派 AuthService */
  validate(payload: AccessPayload) {
    if (payload.type !== 'access') {
      // 在 validate 内抛出的异常经 handleRequest 统一映射为 40101
      throw new Error('invalid token type');
    }
    return this.auth.resolveSessionUser(payload);
  }
}
```

- [ ] **Step 2: 两个守卫 + 单测**

`local-auth.guard.ts`：

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  handleRequest(err: unknown, user: unknown) {
    if (err instanceof BizException) throw err;
    if (err || !user) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户名或密码错误');
    }
    return user;
  }
}
```

`jwt-auth.guard.ts`（`@Public` 放行 + 错误映射 40102/40101，分设计 §3.3）：

```ts
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest(err: unknown, user: unknown) {
    if (err instanceof BizException) throw err;
    // 不直接 import jsonwebtoken（幻影依赖）：按错误名识别过期
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw new BizException(BizCode.ACCESS_TOKEN_EXPIRED, 'accessToken 已过期');
    }
    if (err || !user) {
      throw new BizException(BizCode.UNAUTHORIZED, '未认证或凭证无效');
    }
    return user;
  }
}
```

`permissions.guard.ts`：

```ts
import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';
import type { AuthUser } from '../../modules/auth/auth-user.js';

/** 权限执行：AND 语义；admin 通配 `*:*:*` 直通（分设计 §4.3） */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) {
      throw new BizException(BizCode.UNAUTHORIZED, '未认证或凭证无效');
    }
    if (user.permissions.includes('*:*:*')) return true;
    if (required.every(p => user.permissions.includes(p))) return true;
    throw new BizException(BizCode.FORBIDDEN, '无权限访问');
  }
}
```

守卫单测要点（mock ExecutionContext + Reflector）：
- JwtAuthGuard：`@Public` 路由返回 true 不调 passport；`TokenExpiredError` → 40102；普通 err/无 user → 40101；BizException 原样透传。
- PermissionsGuard：无元数据直通；通配直通；满足 AND 通过；缺权限 40301；无 user 40101。

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/guards src/modules/auth/strategies
```

预期：全绿（策略类无逻辑分支，由 e2e 覆盖，不写单测）。提交信息：`feat(server): passport 双策略与 JWT/权限守卫`。

---

### Task 14: 自研 Redis ThrottlerStorage + 限流守卫

**Files:**

- Create: `apps/nestjs-server/src/common/throttler/redis-throttler.storage.ts`（+ spec）
- Create: `apps/nestjs-server/src/common/throttler/redis-throttler.guard.ts`

- [ ] **Step 1: 复读接口定义**

读 `node_modules/@nestjs/throttler/dist/throttler-storage.interface.d.ts`（Task 1 已定位），确认 `increment` 签名与 `ThrottlerStorageRecord` 字段（ttl 单位是毫秒还是秒、是否需返回 `timeToBlockExpire`）。下方代码按 v6 形态（ttl = 毫秒）给出，实读不一致则按实际接口调整（分设计 §9 风险预案）。

- [ ] **Step 2: 写失败测试（mock redis）**

`redis-throttler.storage.spec.ts`：

```ts
import type { Redis } from 'ioredis';
import { RedisThrottlerStorage, INCR_LUA } from './redis-throttler.storage.js';

describe('RedisThrottlerStorage', () => {
  const redis = { eval: jest.fn() };
  const storage = new RedisThrottlerStorage(redis as unknown as Redis);

  beforeEach(() => redis.eval.mockReset());

  it('increment：Lua 原子 eval、键形 throttle:{key}:{context}、透传 ttl', async () => {
    redis.eval.mockResolvedValue(3);
    const record = await storage.increment('login', '127.0.0.1', 60_000, 5);
    expect(redis.eval).toHaveBeenCalledWith(
      INCR_LUA,
      1,
      'throttle:127.0.0.1:login',
      60_000
    );
    expect(record).toEqual({
      totalHits: 3,
      timeToExpire: 60_000,
      isBlocked: false,
      timeToBlockExpire: 60_000
    });
  });

  it('hits > limit → isBlocked=true', async () => {
    redis.eval.mockResolvedValue(6);
    const record = await storage.increment('login', '127.0.0.1', 60_000, 5);
    expect(record).toMatchObject({ totalHits: 6, isBlocked: true });
  });

  it('脚本文本：INCR + 首写 PEXPIRE 单脚本（防回归成 INCR/EXPIRE 分离写法）', () => {
    expect(INCR_LUA).toContain('INCR');
    expect(INCR_LUA).toContain('PEXPIRE');
    expect(INCR_LUA).toMatch(/if hits == 1 then/);
  });
});
```

- [ ] **Step 3: 实现**

`redis-throttler.storage.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import { ThrottlerStorage, type ThrottlerStorageRecord } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';

/**
 * Lua 单脚本原子 INCR + 首写 PEXPIRE（总 spec §7 备案 1）：
 * 避免 INCR/EXPIRE 分离的竞态与无 TTL 僵尸键。导出供 spec 脚本文本断言。
 */
export const INCR_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return hits`;

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    context: string,
    key: string,
    ttl: number,
    limit: number
  ): Promise<ThrottlerStorageRecord> {
    const hits = (await this.redis.eval(
      INCR_LUA,
      1,
      `throttle:${key}:${context}`,
      ttl
    )) as number;
    return {
      totalHits: hits,
      timeToExpire: ttl,
      isBlocked: hits > limit,
      timeToBlockExpire: ttl
    };
  }
}
```

`redis-throttler.guard.ts`（429 派生 42901：默认 ThrottlerException 经 resolver 只得 42900）：

```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class RedisThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): never {
    throw new BizException(BizCode.RATE_LIMITED, '请求过于频繁，请稍后再试');
  }
}
```

- [ ] **Step 4: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/throttler
```

预期：全绿。并发真实性验收留 Task 17 e2e 第 7 类用例（真 redis）。提交信息：`feat(server): 自研 Redis 限流存储与 42901 守卫`。

---

### Task 15: DTO/Controller/AuthModule + 全局守卫链装配

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/dto/login.dto.ts`、`refresh-token.dto.ts`
- Create: `apps/nestjs-server/src/modules/auth/auth.controller.ts`
- Create: `apps/nestjs-server/src/modules/auth/auth.module.ts`
- Modify: `apps/nestjs-server/src/app.module.ts`
- Modify: `apps/nestjs-server/src/modules/health/health.controller.ts`（补 Task 7 预留的 `@Public()`）

- [ ] **Step 1: DTO**

`login.dto.ts`（Swagger 文档用；passport-local 直读 req.body，守卫先于 ValidationPipe 执行）：

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: '用户名' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'change_me', description: '密码' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
```

`refresh-token.dto.ts`：

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ description: '登录返回的 refreshToken' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
```

- [ ] **Step 2: Controller**

`auth.controller.ts`：

```ts
import { Controller, Get, HttpCode, HttpStatus, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard.js';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: '登录（同 IP 5 次/分）' })
  @ApiBody({ type: LoginDto })
  login(@Request() req: { user: Awaited<ReturnType<AuthService['validateUser']>> }) {
    return this.auth.login(req.user);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh-token')
  @ApiOperation({ summary: '刷新令牌（轮换，旧 refresh 立即失效）' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  @ApiOperation({ summary: '登出（严格校验：需有效 access；整会话吊销）' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user);
    return null;
  }

  @Get('get-user-info')
  @ApiOperation({ summary: '当前用户信息（实时查库）' })
  getUserInfo(@CurrentUser() user: AuthUser) {
    return this.auth.getUserInfo(user);
  }

  @Get('get-async-routes')
  @ApiOperation({ summary: '角色可见动态路由树' })
  getAsyncRoutes(@CurrentUser() user: AuthUser) {
    return this.auth.getAsyncRoutes(user);
  }
}
```

- [ ] **Step 3: AuthModule**

`auth.module.ts`：

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { LocalStrategy } from './strategies/local.strategy.js';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds }
      })
    })
  ],
  controllers: [AuthController],
  // LocalAuthGuard 经 @UseGuards 类引用需 DI 可见，入 providers
  providers: [AuthService, TokenService, LocalStrategy, JwtStrategy, LocalAuthGuard]
})
export class AuthModule {}
```

- [ ] **Step 4: AppModule 装配守卫链与限流**

`app.module.ts`（守卫链顺序 = providers 数组顺序，总 spec §6.5 锁定）：

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
// ... 既有 imports ...
import { AuthModule } from './modules/auth/auth.module.js';
import { RedisThrottlerGuard } from './common/throttler/redis-throttler.guard.js';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';

@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ limit: 60, ttl: 60_000 }], // 全局 60 次/分/IP
        storage
      })
    }),
    HealthModule,
    AuthModule
  ],
  providers: [
    RedisThrottlerStorage,
    { provide: APP_GUARD, useClass: RedisThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor }
  ]
})
export class AppModule {}
```

- [ ] **Step 5: health 控制器补 @Public**

`health.controller.ts`：导入 `Public` 并在 `@Get()` 上方补 `@Public()`（Task 7 预留位）。

- [ ] **Step 6: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run typecheck
.temp\run-e2e.bat
```

预期：typecheck 绿；既有 e2e 3/3 仍绿（health 已 @Public 放行，守卫链对既有路由零破坏）。提交信息：`feat(server): 认证端点与全局守卫链装配`。

---

### Task 16: helmet + Swagger 收口进 applyAppDefaults

**Files:**

- Modify: `apps/nestjs-server/src/common/bootstrap/apply-app-defaults.ts`（+ spec）
- Modify: `apps/nestjs-server/src/modules/health/health.controller.ts`（补 `@ApiTags('Health')`）

- [ ] **Step 1: 写失败测试**

`apply-app-defaults.spec.ts` 整体重写为（fake app 无法承载 `SwaggerModule.createDocument`，非生产分支用 spy mock；真实 `/api/docs` 200 留 Task 17 e2e）：

```ts
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { applyAppDefaults } from './apply-app-defaults.js';

describe('applyAppDefaults', () => {
  const buildFakeApp = (config: Record<string, unknown>) => ({
    get: jest.fn(() => config),
    useLogger: jest.fn(),
    use: jest.fn(),
    setGlobalPrefix: jest.fn(),
    useGlobalPipes: jest.fn(),
    enableCors: jest.fn(),
    enableShutdownHooks: jest.fn()
  });

  it('装配全局前缀/中间件/pipes/CORS/shutdown/helmet', () => {
    const app = buildFakeApp({
      corsOrigin: 'http://a.com, http://b.com,',
      port: 3000,
      isProduction: true // 生产分支跳过 Swagger，fake app 方可承载
    });

    applyAppDefaults(app as unknown as INestApplication);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: ['health']
    });
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://a.com', 'http://b.com']
    });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(app.useLogger).toHaveBeenCalled();
    expect(app.useGlobalPipes).toHaveBeenCalled();
    // helmet：app.use 参数中存在函数型中间件（CSP 开关差异在 fake app 上不可断言，留 e2e）
    expect(
      app.use.mock.calls.some(([mw]: unknown[]) => typeof mw === 'function')
    ).toBe(true);
  });

  it('Swagger 仅非生产启用（路径 api/docs + Bearer scheme）', () => {
    const createSpy = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({} as never);
    const setupSpy = jest
      .spyOn(SwaggerModule, 'setup')
      .mockImplementation(() => undefined);
    const app = buildFakeApp({ corsOrigin: '', port: 3000, isProduction: false });

    applyAppDefaults(app as unknown as INestApplication);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy).toHaveBeenCalledWith('api/docs', app, {});
    createSpy.mockRestore();
    setupSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 实现**

`apply-app-defaults.ts` 追加 import 与装配（helmet 紧跟 requestId 中间件；swagger 在 enableShutdownHooks 前）：

```ts
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// ... 函数体内，requestId 之后：
// helmet：非生产关 CSP（Swagger UI 依赖内联脚本，默认 CSP 致文档页白屏）；生产保持默认（无 Swagger）
app.use(helmet(config.isProduction ? {} : { contentSecurityPolicy: false }));

// ... enableCors 之后：
if (!config.isProduction) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('多端管理后台 API')
    .setDescription('P3 认证与 RBAC 端点域；信封 {code,message,data}')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
```

`health.controller.ts` 补 `@ApiTags('Health')`（import 自 `@nestjs/swagger`）。

- [ ] **Step 3: 验证 + 提交**

```bash
pnpm --filter @multi-admin/nestjs-server run test -- src/common/bootstrap
pnpm --filter @multi-admin/nestjs-server run typecheck
```

预期：全绿（`GET /api/docs` 的 200 验收在 Task 17 e2e）。提交信息：`feat(server): helmet 与 Swagger 装配进 applyAppDefaults`。

---

### Task 17: 认证链路 e2e 七类用例

**Files:**

- Create: `apps/nestjs-server/test/fixtures/test-protected.controller.ts`
- Create: `apps/nestjs-server/test/helpers/auth.ts`
- Create: `apps/nestjs-server/test/auth.e2e-spec.ts`

- [ ] **Step 1: 测试专用受保护路由（不注册进 AppModule）**

`test/fixtures/test-protected.controller.ts`：

```ts
import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../src/common/decorators/require-permissions.decorator.js';

/** e2e 专用受保护路由：验证 PermissionsGuard 40301 分支（分设计 §8 用例 5） */
@Controller('__test/protected')
export class TestProtectedController {
  @Get()
  @RequirePermissions('system:user:query')
  get() {
    return { ok: true };
  }
}
```

- [ ] **Step 2: common 用户准备助手**

`test/helpers/auth.ts`（seed 只建 admin；common 用户/角色菜单子集由 e2e 幂等准备；不做 truncateAll，避免洗掉 seed 的 admin）：

```ts
import * as argon2 from 'argon2';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

export const COMMON_PASSWORD = 'e2e-common-password';

/** 幂等准备 common 用户：common 角色 + System 组/SystemUser 页/system:user:query 权限点 */
export async function ensureCommonUser(prisma: PrismaClient): Promise<void> {
  const commonRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'common' }
  });
  const password = await argon2.hash(COMMON_PASSWORD);
  const user = await prisma.user.upsert({
    where: { username: 'common' },
    update: {},
    create: { username: 'common', password, nickname: '普通用户' }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: commonRole.id } },
    update: {},
    create: { userId: user.id, roleId: commonRole.id }
  });
  const menus = await prisma.menu.findMany({
    where: { name: { in: ['System', 'SystemUser', 'SystemUser:query'] } }
  });
  await prisma.roleMenu.createMany({
    data: menus.map(m => ({ roleId: commonRole.id, menuId: m.id })),
    skipDuplicates: true
  });
}
```

- [ ] **Step 3: 套件骨架**

`test/auth.e2e-spec.ts`：

```ts
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Redis } from 'ioredis';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { RedisThrottlerStorage } from './../src/common/throttler/redis-throttler.storage.js';
import { TestProtectedController } from './fixtures/test-protected.controller.js';
import { COMMON_PASSWORD, ensureCommonUser } from './helpers/auth.js';

const ADMIN_PASSWORD = 'e2e-admin-password'; // = setup-env.ts 的 ADMIN_INIT_PASSWORD 默认值

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface LoginData {
  avatar: string | null;
  username: string;
  nickname: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
  expires: number;
}

describe('认证链路 (e2e)', () => {
  let app: INestApplication<Server>;
  let prisma: PrismaService;
  let redis: Redis;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestProtectedController]
    }).compile();
    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(REDIS_CLIENT);
    await ensureCommonUser(prisma);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  // 每用例前重置限流桶/黑名单/会话注册表（分设计 §9：兼治套件间污染与登录桶内耗）
  beforeEach(async () => {
    await redis.flushdb();
  });

  const server = () => request(app.getHttpServer());
  const login = (username: string, password: string) =>
    server().post('/api/v1/auth/login').send({ username, password });
  const loginAdmin = async () => {
    const res = await login('admin', ADMIN_PASSWORD).expect(200);
    return (res.body as Envelope<LoginData>).data;
  };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ... 以下七类用例（Step 4~10 逐个实现）
});
```

- [ ] **Step 4: 用例 1 —— 登录成功/失败**

```ts
it('admin 登录：契约形态 + 通配权限集 + expires 毫秒时间戳', async () => {
  const res = await login('admin', ADMIN_PASSWORD).expect(200);
  const body = res.body as Envelope<LoginData>;
  expect(body.code).toBe(0);
  expect(body.data.roles).toEqual(['admin']);
  expect(body.data.permissions).toEqual(['*:*:*']);
  expect(body.data.avatar).toBeNull();
  expect(body.data.nickname).toBe('超级管理员');
  expect(typeof body.data.accessToken).toBe('string');
  expect(typeof body.data.refreshToken).toBe('string');
  expect(body.data.expires).toBeGreaterThan(Date.now());
});

it('common 登录：真实权限集（非通配）', async () => {
  const res = await login('common', COMMON_PASSWORD).expect(200);
  const { data } = res.body as Envelope<LoginData>;
  expect(data.roles).toEqual(['common']);
  expect(data.permissions).toContain('system:user:query');
  expect(data.permissions).not.toContain('*:*:*');
});

it('密码错误与用户不存在同为 40101（不泄露用户存在性）', async () => {
  for (const [username, password] of [
    ['admin', 'wrong-password'],
    ['ghost-user', 'whatever']
  ] as const) {
    const res = await login(username, password);
    expect(res.status).toBe(401);
    expect((res.body as Envelope<null>).code).toBe(40101);
  }
});
```

- [ ] **Step 5: 用例 2 —— 登录限流**

```ts
it('窗口内第 6 次登录 → 42901', async () => {
  for (let i = 0; i < 5; i++) {
    await login('admin', 'wrong-password').expect(401);
  }
  const res = await login('admin', 'wrong-password');
  expect(res.status).toBe(429);
  expect((res.body as Envelope<null>).code).toBe(42901);
});
```

- [ ] **Step 6: 用例 3 —— refresh 轮换**

```ts
it('轮换：新令牌对可用，旧 refresh 重用 → 40103，缺参 → 40001', async () => {
  const session = await loginAdmin();
  const res = await server()
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken: session.refreshToken })
    .expect(200);
  const pair = (res.body as Envelope<{ accessToken: string; refreshToken: string; expires: number }>).data;
  expect(pair.refreshToken).not.toBe(session.refreshToken);

  await server()
    .get('/api/v1/auth/get-user-info')
    .set(bearer(pair.accessToken))
    .expect(200);

  const reuse = await server()
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken: session.refreshToken });
  expect((reuse.body as Envelope<null>).code).toBe(40103);

  const missing = await server().post('/api/v1/auth/refresh-token').send({});
  expect((missing.body as Envelope<null>).code).toBe(40001);
});
```

- [ ] **Step 7: 用例 4 —— 登出与多端共存**

```ts
it('登出：旧 access 40101、同会话 refresh 40103，他端会话不受影响', async () => {
  const s1 = await loginAdmin();
  const s2 = await loginAdmin(); // 另次登录 = 不同 sid

  await server().post('/api/v1/auth/logout').set(bearer(s1.accessToken)).expect(200);

  const accessDenied = await server()
    .get('/api/v1/auth/get-user-info')
    .set(bearer(s1.accessToken));
  expect((accessDenied.body as Envelope<null>).code).toBe(40101);

  const refreshDenied = await server()
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken: s1.refreshToken });
  expect((refreshDenied.body as Envelope<null>).code).toBe(40103);

  await server()
    .get('/api/v1/auth/get-user-info')
    .set(bearer(s2.accessToken))
    .expect(200);
});
```

- [ ] **Step 8: 用例 5 —— 越权 40301**

```ts
it('越权：common 拒 40301、admin 通配过、无令牌 40101', async () => {
  const common = (await login('common', COMMON_PASSWORD).expect(200)).body as Envelope<LoginData>;
  const admin = await loginAdmin();

  const noToken = await server().get('/api/v1/__test/protected');
  expect((noToken.body as Envelope<null>).code).toBe(40101);

  const denied = await server()
    .get('/api/v1/__test/protected')
    .set(bearer(common.data.accessToken));
  expect(denied.status).toBe(403);
  expect((denied.body as Envelope<null>).code).toBe(40301);

  const ok = await server()
    .get('/api/v1/__test/protected')
    .set(bearer(admin.accessToken))
    .expect(200);
  expect((ok.body as Envelope<{ ok: boolean }>).data.ok).toBe(true);
});
```

- [ ] **Step 9: 用例 6/7 —— Swagger 可见 + 存储并发冒烟；另补用户信息/路由树断言**

```ts
it('Swagger 非生产可见', async () => {
  const res = await server().get('/api/docs').redirects(1).expect(200);
  expect(res.text).toMatch(/swagger/i);
});

it('ThrottlerStorage 并发计数精确 = N 且 TTL 只设一次', async () => {
  const storage = app.get(RedisThrottlerStorage);
  await Promise.all(
    Array.from({ length: 20 }, () =>
      storage.increment('e2e-smoke', '127.0.0.1', 60_000, 100)
    )
  );
  expect(await redis.get('throttle:127.0.0.1:e2e-smoke')).toBe('20');
  const pttl = await redis.pttl('throttle:127.0.0.1:e2e-smoke');
  // 上界放宽至 65s：首写 PEXPIRE 与断言间的耗时不精确可控，精确性由 totalHits 保证
  expect(pttl).toBeGreaterThan(0);
  expect(pttl).toBeLessThanOrEqual(65_000);
});

it('get-user-info 实时查库；get-async-routes admin 全量两组树', async () => {
  const admin = await loginAdmin();
  const info = await server()
    .get('/api/v1/auth/get-user-info')
    .set(bearer(admin.accessToken))
    .expect(200);
  expect(((info.body as Envelope<{ nickname: string }>).data).nickname).toBe('超级管理员');

  const routes = await server()
    .get('/api/v1/auth/get-async-routes')
    .set(bearer(admin.accessToken))
    .expect(200);
  const data = (routes.body as Envelope<Array<{ path: string; children?: unknown[] }>>).data;
  expect(data.map(n => n.path)).toEqual(['/system', '/monitor']);
  expect(data[0].children).toHaveLength(4);
  expect(data[1].children).toHaveLength(4);
});
```

- [ ] **Step 10: 运行全套 e2e + 提交**

```bash
.temp\run-e2e.bat
```

预期：基架冒烟 3/3 + 认证链路 9 用例全绿（七类口径全覆盖）。提交信息：`test(server): 认证链路 e2e 七类示范用例`。

---

### Task 18: 全量回归、镜像验证与文档同步

**Files:**

- Modify: `AGENTS.md`、`docs/engineering/build-and-verify.md`、总 spec `2026-08-16-nestjs-backend-foundation-design.md`
- Modify: 本计划与分设计的 checkbox
- Modify: `docs/tasks/README.md`

- [ ] **Step 1: 全量质量门禁**

```bash
pnpm check
```

预期：prettier → typecheck → lint → test 全绿（任一失败即终止，修复后重跑）。

- [ ] **Step 2: e2e 回归**

```bash
.temp\run-e2e.bat
```

预期：两套套件全绿。

- [ ] **Step 3: 镜像与 compose 回归**

前置：根 `.env` 已补 JWT 两项（Task 3 手动项）。执行：

```bash
docker compose build server
docker compose up -d server
docker compose logs server
```

验收：日志含 `[entrypoint] migrate deploy` / `[entrypoint] db seed` / `[entrypoint] start server` 三标记；`curl http://localhost:3000/health` 信封 `{code:0,...details.redis.status:"up"}`；`docker compose config` 中 server 含 JWT 两项 `:?` 注入与 REDIS_URL 插值；生产镜像无 Swagger（`curl http://localhost:3000/api/docs` → 404，helmet 默认 CSP 生效）。回归后保持 compose 运行态（勿 down -v）。

- [ ] **Step 4: 文档同步**

- `AGENTS.md`：`apps/nestjs-server` 描述更新为「认证与 RBAC 完成（JWT 双令牌 + sid 会话、守卫链、限流、Swagger），system CRUD 待 P4」；若存在「REDIS_URL 未插值」类表述一并修正（Task 9 Step 2 排查结果）。
- `docs/engineering/build-and-verify.md`：`test:e2e` 配置文件名 `jest-e2e.json` → `jest-e2e.cjs` 的引用同步；补认证 e2e 说明（需 JWT 测试默认值，setup-env 已内置）。
- 总 spec `§11` 阶段表：P3 行标记完成（口径：认证链路 e2e 全绿 + Swagger 可见 + 6 项债务清偿）。
- 全仓 grep `jest-e2e.json` 确认无残留引用。

- [ ] **Step 5: 勾选验收清单**

分设计 `§10` 六项 checkbox 全部勾选；本计划每任务 checkbox 均已勾选（执行中逐任务勾）。

- [ ] **Step 6: 更新任务索引 + 提交**

`docs/tasks/README.md`：「进行中」行更新为「P1/P2/P3 已完成，P4（system CRUD + 覆盖率门槛）待启动」。

提交信息：`docs(server): 同步 P3 落地结果与验收清单`。

- [ ] **Step 7: 交付裁决**

全部完成后调起 superpowers:finishing-a-development-branch（验证测试 → 呈现选项）；**执行方式与收尾裁决由用户拍板**（用户在澄清阶段声明：先完成任务梳理，执行方式后续再定）。

---

## 验收对照（分设计 §10 ↔ 计划任务）

| 分设计 §10 完成判定 | 覆盖任务 |
| --- | --- |
| 认证链路 e2e 七类用例全绿 | Task 17（+ Task 14 存储、15 装配） |
| `pnpm check` 全绿 | Task 18 Step 1（各任务增量验证） |
| Swagger 非生产可见（/api/docs） | Task 16 装配、Task 17 用例 6、Task 18 生产 404 反验 |
| 技术债 6 项逐项验收 | Task 4/5/6/7/8/9 逐项 + Task 18 镜像回归 |
| compose/Dockerfile 启动链无破坏（JWT 注入后三服务健康） | Task 3（注入）、Task 18 Step 3 |
| 文档同步（AGENTS/总 spec/env 模板） | Task 3（env 模板）、Task 18 Step 4 |

## 风险预案索引（分设计 §9）

| 风险 | 计划内落点 |
| --- | --- |
| Lua 并发计数不准 | Task 17 Step 9 用例 7（真 redis 冒烟） |
| @nestjs/throttler 接口变动 | Task 1 Step 1 + Task 14 Step 1 双重复读 |
| terminus 替换牵连 /health 契约 | Task 7 Step 1 决策门 + e2e 既有断言冻结验收 |
| e2e 限流桶内耗/污染 | Task 17 Step 3 `beforeEach` FLUSHDB |
| passport CJS 与 ESM 管线 | Task 1 Step 4 解析冒烟 + Task 15 Step 6 e2e 回归 |
