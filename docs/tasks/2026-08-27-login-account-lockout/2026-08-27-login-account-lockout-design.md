---
status: approved
covers:
  - apps/nestjs-server/
  - packages/contracts/
last_verified: 2026-08-27
---

# 登录限流账号维度与失败锁定 设计

## 范围

为 `POST /api/v1/auth/login` 增加账号维度的失败计数与临时锁定，补齐现有限流仅 IP 维度的缺口（分布式爆破与共享出口 IP 误伤两类风险）。

来源：[backlog](../../governance/backlog.md)「登录限流账号维度与失败锁定」登记项。

## 已锁定决策

| #   | 决策点             | 结论                                     | 理由                                                                 |
| --- | ------------------ | ---------------------------------------- | -------------------------------------------------------------------- |
| D1  | 锁定策略形态       | 固定阈值 + 固定时长（5 次 / 锁 15 分钟） | 实现最简、可预测，适合管理后台低用户量场景                           |
| D2  | 锁定中错误语义     | 混合：前 5 次普通失败，锁定后专用错误码  | 锁定前不暴露账号状态（防枚举），锁定后给真实用户明确指引与剩余时长   |
| D3  | 解锁方式           | 仅等待自动解锁（TTL 过期）               | YAGNI；管理员手动解锁端点登记 backlog                                |
| D4  | Redis 异常时行为   | 不做特殊降级，错误自然传播               | 登录链路对 Redis 本就强依赖（IP 限流 / 会话注册 / 轮换），锁检查单独降级无收益；守卫在最前，故障时反而更早失败更省算力 |
| D5  | 实现位置           | 独立守卫前置检查 + Service 计数（方案一） | 锁定检查先于 argon2（省算力）；守卫链是仓库既有模式                  |
| D6  | 参数配置方式       | 固定常量，不进 env                       | YAGNI；需要调整时再提升为 env                                        |
| D7  | throttler 扩展路线 | 排除                                     | throttler 计请求次数不区分成败，无「锁定至某时刻」语义，机制不匹配   |

## 变更矩阵

| #   | 改动                                        | 文件                                                          | 新增/修改 | 测试                                     |
| --- | ------------------------------------------- | ------------------------------------------------------------- | --------- | ---------------------------------------- |
| 1   | 新错误码 `LOGIN_ACCOUNT_LOCKED: 42301`      | `packages/contracts/src/common/biz-code.ts`                   | 修改      | 扩展 `src/common/errors/biz-code.spec.ts` 码表断言 |
| 2   | `LoginLockService`（Redis 状态机封装）+ 参数常量 | `apps/nestjs-server/src/modules/auth/login-lock.service.ts` + `login-lock.constants.ts` | 新增      | `login-lock.service.spec.ts`（新增）      |
| 3   | `LoginLockGuard`（锁定前置检查）            | `apps/nestjs-server/src/modules/auth/login-lock.guard.ts`     | 新增      | `login-lock.guard.spec.ts`（新增）        |
| 4   | `validateUser` 插桩 + 守卫挂载              | `src/modules/auth/auth.service.ts` + `auth.controller.ts` + `auth.module.ts` | 修改      | 扩展 `auth.service.spec.ts` + e2e        |
| 5   | 文档同步                                    | `docs/architecture/contracts.md` + `docs/architecture/backend.md` + backlog | 修改      | —                                        |

## 1. 契约：新错误码

码段规则沿用「前 3 位对齐 HTTP 语义」（`httpStatus = Math.floor(code / 100)`），423（Locked）段空闲：

```ts
LOGIN_ACCOUNT_LOCKED: 42301
```

锁定中响应的信封：`{ code: 42301, message: '账号已锁定，请在 N 分钟后重试', data: null }`。按契约先行流程，先改 `packages/contracts`，server 端再消费。

## 2. Redis 键设计与 LoginLockService

键命名对齐现有 `auth:refresh:` / `auth:blacklist:` 前缀约定，常量导出风格对齐 `REFRESH_KEY_PREFIX`：

```
auth:login-fail:{username}   失败计数，TTL 10 分钟（失败窗口）
auth:login-lock:{username}   锁定标记，TTL 15 分钟，自然过期即自动解锁
```

`LoginLockService`（注入 `REDIS_CLIENT`）方法面：

| 方法                            | 语义                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `isLocked(username)`            | EXISTS 锁定键                                                                             |
| `lockRemainingSeconds(username)`| TTL 锁定键（用于错误消息中的剩余分钟数，向上取整）                                         |
| `recordFailure(username)`       | Lua 原子执行：INCR 计数键 + PEXPIRE 窗口 → 计数 ≥ 5 则 SET 锁定键（EX 15 分钟）并 DEL 计数键 |
| `clear(username)`               | DEL 两键（幂等）                                                                           |

Lua 脚本风格对齐 `token.service.ts` 的 `ROTATE_LUA`（原子性防并发竞态：两个并发失败请求不会因读改写交错漏掉锁定）。

参数常量独立文件 `login-lock.constants.ts`：`MAX_ATTEMPTS = 5`、`LOCK_TTL_SECONDS = 900`、`FAIL_WINDOW_SECONDS = 600`。

## 3. LoginLockGuard 与守卫链

控制器守卫顺序（`auth.controller.ts` login 端点）：

```
@UseGuards(LoginLockGuard, LocalAuthGuard)
```

全局链不变：`RedisThrottlerGuard(IP) → JwtAuthGuard(@Public 放行) → PermissionsGuard` 之后，路由级先 `LoginLockGuard` 后 `LocalAuthGuard`。

- 从 `req.body.username` 读取（LoginDto 已经全局 ValidationPipe 校验，守卫运行时 body 合法）
- 锁定命中 → `throw new BizException(BizCode.LOGIN_ACCOUNT_LOCKED, '账号已锁定，请在 N 分钟后重试')`，**不进入 argon2 计算**
- 读不到 `username` → 跳过检查（防御性兜底，正常链路不会发生）

## 4. validateUser 插桩

在现有逻辑基础上三点插桩（防时序设计不动）：

1. **密码错误**（`!user || !valid`）：先 `recordFailure(username)` 再抛原有 `BizException(UNAUTHORIZED, '用户名或密码错误')`——前 5 次文案不变。`recordFailure` 位于「用户不存在/密码错」两分支**合并后**调用，两失败路径的耗时结构不变，不引入新时序旁路
2. **账号已禁用**：不计数（属管理员操作结果，非爆破信号），维持现有抛出逻辑
3. **成功**：`clear(username)` 后返回（清零计数与锁定残留）

## 5. 错误处理与边界

| 场景                          | 行为                                                          | 理由                                                   |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 前 5 次失败                   | 40101「用户名或密码错误」（不变）                              | 混合语义，锁定前不暴露账号状态                          |
| 第 6 次起（锁定中）           | 42301 + 剩余分钟数                                             | 锁定可被探测是已接受的取舍（管理后台账号名半公开）      |
| Redis 异常                    | 错误自然传播（最终 500）                                       | 见决策 D4                                              |
| username 大小写               | 原样进键，不归一化                                             | 与 DB 查询语义一致，不引入新行为                        |
| 与 IP 限流关系                | 正交共存；ThrottlerGuard 全局先执行。**单 IP 爆破先撞 IP 限流（429），账号锁定实际主要防分布式爆破**（多 IP 同账号，各 IP 失败累积到同一计数键） | IP 挡分布式广度、账号挡单点深度；单 IP 场景通常看不到 42301 |
| 锁定中的尝试                  | 守卫前置拒绝，不进计数——**不续期锁定 TTL**（固定时长，非滑动） | 与 D1 固定时长决策呼应                    |
| refresh / logout / 其他端点   | 不计数不受锁影响                                               | 锁定仅作用于登录入口                                    |

## 6. 测试策略

- **单测 `login-lock.service.spec.ts`**（mock ioredis）：计数递增、窗口 TTL、达阈写锁定键 + 删计数键（Lua 原子）、`clear` 幂等、`lockRemainingSeconds` 取整
- **单测 `login-lock.guard.spec.ts`**：锁定命中抛 42301、未锁定放行、无 username 放行
- **单测扩展 `auth.service.spec.ts`**：密码错计数、禁用不计数、成功清零
- **e2e 扩展 `auth.e2e-spec.ts`**（注意：登录端点自身有 IP 限流 5 次/分，60 秒内同 IP 第 6 个请求先被 42901 拦截，无法直接断言「第 6 次得 42301」，用例按以下方式拆分）：
  - **累积触发**：连续 5 次错密得 40101（恰在限流额度内），随后**直接断言 Redis 锁定键 `auth:login-lock:{username}` 已生成、计数键已删除**（不发起第 6 个请求）
  - **锁定响应**：`beforeEach` flushdb 后预写 `auth:login-lock:{username}` 模拟锁定，独立单请求验证 42301 + 消息含剩余分钟（不撞限流）
  - **成功清零**：成功登录后断言两键不存在，重新拥有 5 次额度（用 Redis 断言兜底，避免再发满 6 个请求）
  - 遵守现有 **beforeEach** flushdb 约定（每用例间隔离，存量用例每用例错密 ≤2 次，不受新机制影响）
- 合并覆盖率 ≥80% 门禁不变

## 7. 文档与治理同步（实施时同提交）

1. `docs/architecture/contracts.md` 错误码表补 `42301` 行
2. `docs/architecture/backend.md`「限流」段落补账号维度描述（现：登录同 IP 5 次/分）
3. `auth.controller.ts` login 端点 `@ApiOperation` summary 同步（现：登录（同 IP 5 次/分））
4. backlog：本条行尾追加关闭标注；新登记「管理员手动解锁端点」（触发：运维需求或锁定误伤反馈）

## 影响面与风险

- **性能**：未锁定登录增加 1 次 `EXISTS`（守卫）+ 成功时 1 次 `DEL`；失败路径增加 1 次 `EVAL`。Redis 单命令亚毫秒级，可忽略。
- **行为兼容**：前 5 次失败的响应与现状完全一致，前端无感知；仅新增锁定态的新错误码（前端可后续接倒计时展示，不接也不破坏）。
- **误伤**：共享账号 5 次错密即锁 15 分钟——管理后台场景可接受（已锁定决策），自动解锁兜底。
- **枚举风险**：锁定态可探测账号存在；已在 D2 权衡中接受。
