# 登录限流账号维度与失败锁定 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `POST /api/v1/auth/login` 增加账号维度失败计数与临时锁定（5 次/锁 15 分钟，自动解锁），混合错误语义（前 5 次 40101、锁定后 42301）。

**Architecture:** 契约先行新增错误码 `LOGIN_ACCOUNT_LOCKED: 42301`；`LoginLockService` 封装 Redis 状态机（`auth:login-fail:` 计数键 + `auth:login-lock:` 锁定键，Lua 原子达阈锁定）；`LoginLockGuard` 挂在 `LocalAuthGuard` 之前，锁定中拒绝且不执行 argon2；`validateUser` 插桩失败计数/成功清零。

**Tech Stack:** NestJS 11 / ioredis / passport-local / jest + supertest / `@multi-admin/contracts`

**设计依据:** [2026-08-27-login-account-lockout-design.md](./2026-08-27-login-account-lockout-design.md)（含已锁定决策 D1-D7）

---

## 关键背景（实施者必读）

- **守卫执行序**：全局 `APP_GUARD`（RedisThrottlerGuard → JwtAuthGuard → PermissionsGuard）先于路由级 `@UseGuards`；本任务新增守卫为**路由级**，置于 `LocalAuthGuard` 之前。
- **Redis 键约定**：对齐现有 `auth:refresh:` / `auth:blacklist:` 前缀（见 [token.service.ts](../../../apps/nestjs-server/src/modules/auth/token.service.ts) 的 `REFRESH_KEY_PREFIX` 导出风格）。
- **Lua 风格**：对齐 `token.service.ts` 的 `ROTATE_LUA`（模块内常量模板字符串）。
- **e2e 约束**：登录端点自身有 IP 限流 `5 次/分`（`auth.controller.ts` 的 `@Throttle`），60 秒内同 IP 第 6 个请求先被 42901 拦截——因此累积类用例**最多发 5 个请求**，锁定后的行为用「预写锁定键 + 单请求」验证，状态断言直接查 Redis。
- **存量用例兼容**：现有用例 2「窗口内第 6 次登录 → 42901」连发 5 次错密后第 6 个请求仍先撞限流器（全局守卫在前），断言不变，无需修改；5 次错密产生的锁定键由 `beforeEach` flushdb 清理。
- **提交规范**：conventional commits + scope 白名单；契约包历史 scope 为 `common`（见 `git log -- packages/contracts`），server 为 `server`，纯文档为 `docs`。
- **工作目录**：除注明外，命令均在仓库根 `d:\WorkSpace\AI\wewant-multi-admin` 执行；shell 为 pwsh。

---

### Task 0: 前置确认与设计工件提交

**Files:**

- Commit: `docs/tasks/2026-08-27-login-account-lockout/2026-08-27-login-account-lockout-design.md`
- Commit: `docs/tasks/README.md`（热索引）
- Commit: `docs/tasks/2026-08-27-login-account-lockout/2026-08-27-login-account-lockout-plan.md`

> 设计/计划工件已于 2026-08-27 提交（设计状态已置 `approved`）；若执行时已在 master，Step 4/5 直接跳过。

- [ ] **Step 1: 确认工作区状态**

Run: `git status --short`
Expected: 无与本任务无关的未提交改动（有则先处置）。

- [ ] **Step 2: 基线单测全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全部 PASS（记录用例数作为回归基线）。

- [ ] **Step 3: 基线 e2e 全绿（需 `docker compose up -d postgres redis` 已运行）**

Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e`
Expected: 全部 PASS。若 compose 未起，先 `docker compose up -d postgres redis` 再重试。

- [ ] **Step 4: 确认设计工件已提交**

Run: `git log --oneline -3 -- docs/tasks/2026-08-27-login-account-lockout`
Expected: 存在含设计/计划文档的提交，且设计文档 frontmatter `status: approved`。若已满足，本步与 Step 5 跳过。

- [ ] **Step 5: 提交设计工件（仅当 Step 4 未满足时）**

先确认设计文档 frontmatter `status: approved`（原值 `draft` 则修改），然后：

```bash
git add docs/tasks/2026-08-27-login-account-lockout docs/tasks/README.md
git commit -m "docs(repo): 登录账号锁定设计文档落盘与热索引登记"
```

---

### Task 1: 契约——新增错误码 42301

**Files:**

- Modify: `packages/contracts/src/common/biz-code.ts`
- Test: `apps/nestjs-server/src/common/errors/biz-code.spec.ts`

- [ ] **Step 1: 先写失败测试（扩展码表断言）**

在 `biz-code.spec.ts` 的 `CONFLICT` 断言后插入一行：

```ts
    expect(BizCode.CONFLICT).toBe(40900);
    expect(BizCode.LOGIN_ACCOUNT_LOCKED).toBe(42301);
    expect(BizCode.RATE_LIMITED).toBe(42901);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors/biz-code.spec.ts`
Expected: FAIL（旧 dist 中 `LOGIN_ACCOUNT_LOCKED` 为 undefined，运行时断言失败）。注意：jest 运行期不做类型检查，失败形态只有断言失败一种；类型错误要到 Task 6 `pnpm check` 的 typecheck 阶段才体现。

- [ ] **Step 3: 契约实现**

`packages/contracts/src/common/biz-code.ts` 在 `CONFLICT` 与 `RATE_LIMITED` 之间插入（保持码值升序）：

```ts
  CONFLICT: 40900,
  LOGIN_ACCOUNT_LOCKED: 42301,
  RATE_LIMITED: 42901,
```

- [ ] **Step 4: 构建 contracts（server 端 jest 经 dist 消费）**

Run: `pnpm --filter @multi-admin/contracts run build && pnpm --filter @multi-admin/contracts run typecheck`
Expected: 构建与类型检查成功。

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors/biz-code.spec.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/common/biz-code.ts apps/nestjs-server/src/common/errors/biz-code.spec.ts
git commit -m "feat(common): contracts 新增 LOGIN_ACCOUNT_LOCKED 42301 错误码"
```

---

### Task 2: LoginLockService（Redis 状态机）

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/login-lock.constants.ts`
- Create: `apps/nestjs-server/src/modules/auth/login-lock.service.ts`
- Test: `apps/nestjs-server/src/modules/auth/login-lock.service.spec.ts`
- Modify: `apps/nestjs-server/src/modules/auth/auth.module.ts`（providers 注册）

- [ ] **Step 1: 常量文件**

创建 `login-lock.constants.ts`：

```ts
/** 登录失败锁定固定参数（设计决策 D6：不进 env，需要调整时再提升） */
export const MAX_ATTEMPTS = 5;
/** 锁定时长（秒）：15 分钟，自然过期即自动解锁 */
export const LOCK_TTL_SECONDS = 900;
/** 失败计数窗口（秒）：10 分钟，窗口从首次失败起算（TTL 只设一次） */
export const FAIL_WINDOW_SECONDS = 600;
```

- [ ] **Step 2: 写失败测试**

创建 `login-lock.service.spec.ts`：

```ts
import type { Redis } from 'ioredis';
import {
  LoginLockService,
  LOGIN_FAIL_KEY_PREFIX,
  LOGIN_LOCK_KEY_PREFIX
} from './login-lock.service.js';

describe('LoginLockService', () => {
  let redis: {
    exists: jest.Mock;
    ttl: jest.Mock;
    eval: jest.Mock;
    del: jest.Mock;
  };
  let service: LoginLockService;

  beforeEach(() => {
    redis = {
      exists: jest.fn(),
      ttl: jest.fn(),
      eval: jest.fn(),
      del: jest.fn().mockResolvedValue(1)
    };
    service = new LoginLockService(redis as unknown as Redis);
  });

  it('isLocked：EXISTS 锁定键', async () => {
    redis.exists.mockResolvedValue(1);
    await expect(service.isLocked('admin')).resolves.toBe(true);
    expect(redis.exists).toHaveBeenCalledWith(LOGIN_LOCK_KEY_PREFIX + 'admin');
    redis.exists.mockResolvedValue(0);
    await expect(service.isLocked('admin')).resolves.toBe(false);
  });

  it('lockRemainingSeconds：TTL>0 返回剩余秒；键不存在（-2/-1）返回 0', async () => {
    redis.ttl.mockResolvedValue(121);
    await expect(service.lockRemainingSeconds('admin')).resolves.toBe(121);
    redis.ttl.mockResolvedValue(-2);
    await expect(service.lockRemainingSeconds('admin')).resolves.toBe(0);
  });

  it('recordFailure：Lua 入参为两键 + 窗口/阈值/锁定时长；达阈返回 true', async () => {
    redis.eval.mockResolvedValue(1);
    await expect(service.recordFailure('admin')).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('incr'),
      2,
      LOGIN_FAIL_KEY_PREFIX + 'admin',
      LOGIN_LOCK_KEY_PREFIX + 'admin',
      '600',
      '5',
      '900'
    );
    redis.eval.mockResolvedValue(0);
    await expect(service.recordFailure('admin')).resolves.toBe(false);
  });

  it('clear：DEL 计数与锁定两键（幂等）', async () => {
    await service.clear('admin');
    expect(redis.del).toHaveBeenCalledWith(
      LOGIN_FAIL_KEY_PREFIX + 'admin',
      LOGIN_LOCK_KEY_PREFIX + 'admin'
    );
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/login-lock.service.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现**

创建 `login-lock.service.ts`：

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import {
  MAX_ATTEMPTS,
  LOCK_TTL_SECONDS,
  FAIL_WINDOW_SECONDS
} from './login-lock.constants.js';

export const LOGIN_FAIL_KEY_PREFIX = 'auth:login-fail:';
export const LOGIN_LOCK_KEY_PREFIX = 'auth:login-lock:';

/**
 * Lua 原子执行：INCR 计数 + 首失败设窗口 TTL → 达阈写锁定键并删计数键。
 * 原子性防并发竞态：并发失败请求不会因读改写交错漏掉锁定。
 */
const RECORD_FAILURE_LUA = `
local count = redis.call('incr', KEYS[1])
if count == 1 then
  redis.call('expire', KEYS[1], ARGV[1])
end
if count >= tonumber(ARGV[2]) then
  redis.call('set', KEYS[2], '1', 'EX', ARGV[3])
  redis.call('del', KEYS[1])
  return 1
end
return 0`;

@Injectable()
export class LoginLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isLocked(username: string): Promise<boolean> {
    return (await this.redis.exists(LOGIN_LOCK_KEY_PREFIX + username)) === 1;
  }

  /** 剩余锁定秒数；未锁定返回 0 */
  async lockRemainingSeconds(username: string): Promise<number> {
    const ttl = await this.redis.ttl(LOGIN_LOCK_KEY_PREFIX + username);
    return ttl > 0 ? ttl : 0;
  }

  /** 记录一次登录失败；返回本次是否达阈触发锁定 */
  async recordFailure(username: string): Promise<boolean> {
    const locked = await this.redis.eval(
      RECORD_FAILURE_LUA,
      2,
      LOGIN_FAIL_KEY_PREFIX + username,
      LOGIN_LOCK_KEY_PREFIX + username,
      String(FAIL_WINDOW_SECONDS),
      String(MAX_ATTEMPTS),
      String(LOCK_TTL_SECONDS)
    );
    return Number(locked) === 1;
  }

  /** 清除计数与锁定（幂等）：成功登录后调用 */
  async clear(username: string): Promise<void> {
    await this.redis.del(
      LOGIN_FAIL_KEY_PREFIX + username,
      LOGIN_LOCK_KEY_PREFIX + username
    );
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/login-lock.service.spec.ts`
Expected: PASS（4 用例）。

- [ ] **Step 6: 注册进 AuthModule**

`auth.module.ts`：imports 区新增：

```ts
import { LoginLockService } from './login-lock.service.js';
```

providers 数组追加 `LoginLockService`（置于 `TokenService` 后）：

```ts
  providers: [
    AuthService,
    TokenService,
    LoginLockService,
    LocalStrategy,
    JwtStrategy,
    LocalAuthGuard
  ]
```

- [ ] **Step 7: 全量单测回归 + Commit**

Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全部 PASS。

```bash
git add apps/nestjs-server/src/modules/auth/login-lock.constants.ts apps/nestjs-server/src/modules/auth/login-lock.service.ts apps/nestjs-server/src/modules/auth/login-lock.service.spec.ts apps/nestjs-server/src/modules/auth/auth.module.ts
git commit -m "feat(server): 登录失败计数与锁定状态机 LoginLockService"
```

---

### Task 3: LoginLockGuard（锁定前置检查）

**Files:**

- Create: `apps/nestjs-server/src/modules/auth/login-lock.guard.ts`
- Test: `apps/nestjs-server/src/modules/auth/login-lock.guard.spec.ts`
- Modify: `apps/nestjs-server/src/modules/auth/auth.module.ts`（providers 注册）

- [ ] **Step 1: 写失败测试**

创建 `login-lock.guard.spec.ts`：

```ts
import type { ExecutionContext } from '@nestjs/common';
import { LoginLockGuard } from './login-lock.guard.js';
import type { LoginLockService } from './login-lock.service.js';

const contextOf = (body: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ body }) })
  }) as unknown as ExecutionContext;

describe('LoginLockGuard', () => {
  let lock: { isLocked: jest.Mock; lockRemainingSeconds: jest.Mock };
  let guard: LoginLockGuard;

  beforeEach(() => {
    lock = {
      isLocked: jest.fn().mockResolvedValue(false),
      lockRemainingSeconds: jest.fn().mockResolvedValue(0)
    };
    guard = new LoginLockGuard(lock as unknown as LoginLockService);
  });

  it('未锁定 → 放行', async () => {
    await expect(
      guard.canActivate(contextOf({ username: 'admin' }))
    ).resolves.toBe(true);
    expect(lock.isLocked).toHaveBeenCalledWith('admin');
  });

  it('锁定中 → 42301，剩余分钟向上取整', async () => {
    lock.isLocked.mockResolvedValue(true);
    lock.lockRemainingSeconds.mockResolvedValue(121);
    await expect(
      guard.canActivate(contextOf({ username: 'admin' }))
    ).rejects.toMatchObject({
      code: 42301,
      message: '账号已锁定，请在 3 分钟后重试'
    });
  });

  it('缺 username → 跳过检查放行（防御性兜底）', async () => {
    await expect(guard.canActivate(contextOf({}))).resolves.toBe(true);
    expect(lock.isLocked).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/login-lock.guard.spec.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

创建 `login-lock.guard.ts`：

```ts
import {
  Injectable,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from '../../common/errors/biz.exception.js';
import { LoginLockService } from './login-lock.service.js';

/**
 * 登录锁定前置检查：位于 LocalAuthGuard 之前，锁定账号直接拒绝，
 * 不进入 argon2 计算。读不到 username 则跳过检查（ValidationPipe
 * 已在上游拒绝非法请求体，此为防御性兜底）。
 */
@Injectable()
export class LoginLockGuard implements CanActivate {
  constructor(private readonly lock: LoginLockService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const body = context
      .switchToHttp()
      .getRequest<{ body?: { username?: string } }>().body;
    const username = body?.username;
    if (!username) return true;
    if (!(await this.lock.isLocked(username))) return true;
    const remaining = await this.lock.lockRemainingSeconds(username);
    const minutes = Math.max(1, Math.ceil(remaining / 60));
    throw new BizException(
      BizCode.LOGIN_ACCOUNT_LOCKED,
      `账号已锁定，请在 ${minutes} 分钟后重试`
    );
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/login-lock.guard.spec.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 注册进 AuthModule**

`auth.module.ts`：imports 区新增：

```ts
import { LoginLockGuard } from './login-lock.guard.js';
```

providers 数组追加 `LoginLockGuard`（置于 `LocalAuthGuard` 后）。

- [ ] **Step 6: 全量单测回归 + Commit**

Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全部 PASS。

```bash
git add apps/nestjs-server/src/modules/auth/login-lock.guard.ts apps/nestjs-server/src/modules/auth/login-lock.guard.spec.ts apps/nestjs-server/src/modules/auth/auth.module.ts
git commit -m "feat(server): LoginLockGuard 登录锁定前置检查"
```

---

### Task 4: validateUser 插桩（失败计数 / 成功清零）

**Files:**

- Modify: `apps/nestjs-server/src/modules/auth/auth.service.ts`
- Test: `apps/nestjs-server/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: 先改测试（构造参数 + 三个新断言用例）**

`auth.service.spec.ts`：

a) imports 区新增类型导入：

```ts
import type { LoginLockService } from './login-lock.service.js';
```

b) describe 内 mock 声明区（`let tokens: {...}` 后）新增：

```ts
  let loginLock: { recordFailure: jest.Mock; clear: jest.Mock };
```

c) beforeEach 内（`tokens = {...}` 后）新增，并**更新构造调用为三参**：

```ts
    loginLock = {
      recordFailure: jest.fn().mockResolvedValue(false),
      clear: jest.fn().mockResolvedValue(undefined)
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      tokens as unknown as TokenService,
      loginLock as unknown as LoginLockService
    );
```

d) `describe('validateUser', ...)` 末尾新增用例：

```ts
    it('密码错误 → recordFailure 计数；禁用不计数；成功 clear 清零', async () => {
      // 密码错误：计数
      prisma.user.findFirst.mockResolvedValue(ADMIN_ROW);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.validateUser('admin', 'wrong')
      ).rejects.toMatchObject({ code: 40101 });
      expect(loginLock.recordFailure).toHaveBeenCalledWith('admin');

      // 禁用：不计数（属管理员操作结果，非爆破信号）
      loginLock.recordFailure.mockClear();
      prisma.user.findFirst.mockResolvedValue({
        ...ADMIN_ROW,
        status: 'DISABLED'
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(service.validateUser('admin', 'ok')).rejects.toMatchObject({
        code: 40101
      });
      expect(loginLock.recordFailure).not.toHaveBeenCalled();

      // 成功：清零
      prisma.user.findFirst.mockResolvedValue(ADMIN_ROW);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await service.validateUser('admin', 'ok');
      expect(loginLock.clear).toHaveBeenCalledWith('admin');
    });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/auth.service.spec.ts`
Expected: FAIL——红灯仅来自新用例断言（`recordFailure`/`clear` 未被调用）；存量用例仍会通过（jest 不做类型检查，JS 构造函数忽略多余实参，三参构造传给二参实现不报错）。

- [ ] **Step 3: 实现插桩**

`auth.service.ts`：

a) imports 区新增：

```ts
import { LoginLockService } from './login-lock.service.js';
```

b) 构造函数改为三参：

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly loginLock: LoginLockService
  ) {}
```

c) `validateUser` 失败分支与成功路径插桩（替换原 `if (!user || !valid) {...}` 至 `return user;` 段）：

```ts
    if (!user || !valid) {
      // 两失败分支合并后计数，耗时结构不变，不引入新时序旁路
      await this.loginLock.recordFailure(username);
      throw new BizException(BizCode.UNAUTHORIZED, '用户名或密码错误');
    }
    if (user.status !== 'ACTIVE') {
      // 禁用不计数：属管理员操作结果，非爆破信号
      throw new BizException(BizCode.UNAUTHORIZED, '账号已禁用');
    }
    // 成功清零：删除计数与锁定残留（幂等）
    await this.loginLock.clear(username);
    return user;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/auth.service.spec.ts`
Expected: PASS（存量 + 新用例全绿）。

- [ ] **Step 5: 全量单测回归 + Commit**

Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全部 PASS。

```bash
git add apps/nestjs-server/src/modules/auth/auth.service.ts apps/nestjs-server/src/modules/auth/auth.service.spec.ts
git commit -m "feat(server): validateUser 接入登录失败计数与成功清零"
```

---

### Task 5: 守卫链装配 + e2e + 架构文档同步

**Files:**

- Modify: `apps/nestjs-server/src/modules/auth/auth.controller.ts`
- Test: `apps/nestjs-server/test/auth.e2e-spec.ts`
- Modify: `docs/architecture/contracts.md`、`docs/architecture/backend.md`（硬规则：文档与代码同提交）

- [ ] **Step 1: 控制器装配**

`auth.controller.ts`：

a) imports 区新增：

```ts
import { LoginLockGuard } from './login-lock.guard.js';
```

b) login 端点守卫与 Swagger 文案（替换原 `@UseGuards(LocalAuthGuard)` 与 `@ApiOperation` 行）：

```ts
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(LoginLockGuard, LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({
    summary: '登录（同 IP 5 次/分；连续失败 5 次锁定 15 分钟）'
  })
```

- [ ] **Step 2: e2e 新增三个用例**

在 `test/auth.e2e-spec.ts` 用例 2（`窗口内第 6 次登录 → 42901`）之后插入：

```ts
  // 用例 2.5：账号维度失败锁定
  it('连续 5 次错密触发锁定：生成锁定键并删除计数键', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await login('admin', 'wrong-password');
      expect(res.status).toBe(401);
      expect((res.body as Envelope<null>).code).toBe(40101);
    }
    // 不发第 6 个请求（会先撞 IP 限流 429），直接断言 Redis 状态
    expect(await redis.exists('auth:login-lock:admin')).toBe(1);
    expect(await redis.exists('auth:login-fail:admin')).toBe(0);
  });

  it('锁定账号登录 → 42301，消息含剩余分钟', async () => {
    await redis.set('auth:login-lock:admin', '1', 'EX', 900);
    const res = await login('admin', ADMIN_PASSWORD);
    expect(res.status).toBe(423);
    const body = res.body as Envelope<null>;
    expect(body.code).toBe(42301);
    expect(body.message).toMatch(/账号已锁定，请在 \d+ 分钟后重试/);
  });

  it('成功登录清零计数与锁定键', async () => {
    await redis.set('auth:login-fail:admin', '4');
    await loginAdmin();
    expect(await redis.exists('auth:login-fail:admin')).toBe(0);
    expect(await redis.exists('auth:login-lock:admin')).toBe(0);
  });
```

- [ ] **Step 3: 运行 e2e 确认全绿**

前置：`docker compose up -d postgres redis` 已运行。
Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e`
Expected: 全部 PASS——含存量用例 2（第 6 请求先撞限流器仍得 42901）与三个新用例。

- [ ] **Step 4: 架构文档同步（与代码同提交）**

a) `docs/architecture/contracts.md` 错误码表，`CONFLICT` 行后插入：

```markdown
| LOGIN_ACCOUNT_LOCKED | 42301 | 登录账号已锁定（等待自动解锁） |
```

b) `docs/architecture/backend.md`「API 约定」限流行（原 `- 限流：登录同 IP 5 次/分；refresh-token 10 次/分；全局 60 次/分`）改为：

```markdown
- 限流：登录同 IP 5 次/分；账号维度连续失败 5 次锁定 15 分钟（自动解锁，锁定中返回 42301）；refresh-token 10 次/分；全局 60 次/分
```

- [ ] **Step 5: Commit**

```bash
git add apps/nestjs-server/src/modules/auth/auth.controller.ts apps/nestjs-server/test/auth.e2e-spec.ts docs/architecture/contracts.md docs/architecture/backend.md
git commit -m "feat(server): 登录端点挂载账号锁定守卫链并同步契约与架构文档"
```

---

### Task 6: 收尾——覆盖率门禁 + 治理登记 + 全量回归

**Files:**

- Modify: `docs/governance/backlog.md`
- Modify: `docs/tasks/README.md`（热索引补计划链接）

- [ ] **Step 1: 合并覆盖率门禁（需 compose postgres/redis）**

Run: `pnpm --filter @multi-admin/nestjs-server run test:coverage`
Expected: PASS 且合并覆盖率 ≥80%。

- [ ] **Step 2: backlog 关闭与新增登记**

前置：同步更新 `docs/governance/backlog.md` frontmatter `last_verified: 2026-08-26` → `2026-08-27`（living 文档约定）。

a) `docs/governance/backlog.md` 中「登录限流账号维度与失败锁定」行尾追加关闭标注（行首列名不动）：

```
（已关闭，2026-08-27，实现形态为账号维度失败计数 + 15 分钟临时锁定，LoginLockGuard 前置 + 混合错误语义 42301）
```

b) 同一表格新增一行（登记管理员手动解锁端点，触发条件按设计决策 D3）：

```markdown
| 管理员手动解锁端点 | 账号锁定目前仅 TTL 自动解锁（15 分钟），无误伤应急手段；触发：运维需求或锁定误伤反馈 |
```

- [ ] **Step 3: 热索引补计划链接**

`docs/tasks/README.md`「进行中」本任务行，说明列末尾追加：`，计划 → [plan.md](2026-08-27-login-account-lockout/2026-08-27-login-account-lockout-plan.md)`。

- [ ] **Step 4: 全量质量门禁**

Run: `pnpm check`
Expected: prettier → typecheck → lint → test 全绿，任一失败即修复后重跑。

- [ ] **Step 5: Commit**

```bash
git add docs/governance/backlog.md docs/tasks/README.md
git commit -m "docs(repo): backlog 关闭登录锁定条目并登记管理员解锁端点"
```

---

## 验收对照表

| 设计条目 | 覆盖任务 |
|---|---|
| §1 契约新错误码 42301 | Task 1 |
| §2 Redis 键 + LoginLockService（Lua 原子达阈） | Task 2 |
| §3 LoginLockGuard + 守卫链顺序 | Task 3、Task 5 |
| §4 validateUser 三点插桩 | Task 4 |
| §5 错误处理与边界（混合语义 / 不续期 / 禁用不计数） | Task 2-5 的实现与测试 |
| §6 测试策略（单测 3 文件 + e2e 三拆分用例） | Task 2-5 |
| §7 文档与治理同步 | Task 5、Task 6 |
| D4 Redis 强依赖不做降级 | 实现未加 try/catch 兜底（Task 2-4） |

## 风险预案

| 风险 | 应对 |
|---|---|
| contracts 未重新构建导致 server 测试引用旧 dist | Task 1 Step 4 显式构建；若仍报 `LOGIN_ACCOUNT_LOCKED` 缺失，重跑该步 |
| 设计/计划工件未提交即切 worktree | Task 0 Step 4 检查；缺失时停止并回主工作区提交 |
| e2e 存量用例 2 意外失败 | 核对是否误改守卫全局注册；锁定键不应影响限流器判定（全局守卫先执行） |
| 新用例撞 IP 限流（429） | 用例内请求数不得超 5；锁定态一律用预写键 + 单请求验证 |
| 覆盖率跌破 80% | 新文件均有对应单测；若跌破，检查 Task 4 存量用例是否因构造改动被跳过 |
