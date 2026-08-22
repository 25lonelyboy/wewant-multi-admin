# NestJS 后端基架补全 · P3 认证与 RBAC 设计

> 本文档为总 spec（`2026-08-16-nestjs-backend-foundation-design.md`）P3 阶段的「分」设计。总 spec 已锁定的决策（信封契约、错误码、RBAC 模型、守卫链顺序、测试策略等）此处不重复，仅记录 P3 范围内的澄清结论、设计细化与对总 spec 的修订备案。
>
> 编排方式（澄清拍板）：**单「分」设计 + 单实施计划**，认证主线与技术债清偿两段并存（方案 A）。

## 1. P3 范围与验收口径

**主线**（总 spec §11 P3）：passport 双策略（Local + Jwt）、JWT 双令牌 + Redis 吊销/轮换、全局守卫链、5 个认证端点、限流（自研 Redis ThrottlerStorage）、helmet/CORS、Swagger、认证链路 e2e 示范用例。**system 四页 CRUD 仍留 P4**（总 spec 口径）。

**技术债清偿**（P2 遗留 6 项全部纳入，见 §7）：jest 双链抽公共配置、redis 日志去重 + quit() 加固、Menu.parentId 索引、terminus deprecated 替换、entrypoint 阶段标记、compose REDIS_URL 插值。

**验收口径**：认证链路 e2e 全绿（登录/刷新轮换/登出失效/越权 40301/限流/Swagger）；`pnpm check` 全绿；Swagger 非生产可见；6 项债务逐项验收。

## 2. 澄清阶段结论

| 决策点 | 结论 | 备注 |
| --- | --- | --- |
| 技术债范围 | 6 项全部纳入 P3 | 用户拍板；均为小改动，独立成节逐项验收 |
| 端点范围 | 仅认证链路（5 端点） | system CRUD 留 P4，与总 spec §11 一致 |
| 会话模型 | 多端共存 + 单会话登出 | 登出只失效当前会话（黑名单 access jti + 删当前 refresh 注册），不踢其他设备 |
| refresh 轮换 | 每次刷新旧 refresh 立即失效 | 防盗用；旧令牌重用 → 40103 |
| 编排方式 | 方案 A：单文档主线 + 还债两段 | 否决双计划（流程开销）与折入主线（不可追踪） |
| 执行方式 | 待定 | 用户声明：先完成任务梳理，执行方式后续再定 |

## 3. 令牌与会话架构

### 3.1 双令牌签发

- **access**：JWT HS256（`@nestjs/jwt`，secret = `JWT_ACCESS_SECRET`），payload `{sub: userId, username, sid, jti, type: 'access'}`，TTL 默认 15 分钟。
- **refresh**：JWT HS256（**独立 secret** = `JWT_REFRESH_SECRET`），payload `{sub: userId, sid, jti, type: 'refresh'}`，TTL 默认 7 天。
- `jti`、`sid` 均用 `crypto.randomUUID()`。**sid（会话 id）由双令牌共载**：每次登录生成新 sid、刷新轮换保持不变，使登出能精确吊销整个会话（多端共存 = 多 sid 互不影响）；`type` 字段防止 access/refresh 互串（验签时强制校验）。

### 3.2 Redis 键空间（无 keyPrefix，前缀隔离，与 P2 设计 §5.2 一致）

| 键 | 值 | TTL | 用途 |
| --- | --- | --- | --- |
| `auth:refresh:{sid}` | JSON `{userId, jti}`（jti = 当前有效 refresh） | refresh 剩余寿命 | 会话注册表：轮换比对 + 登出整会话吊销 |
| `auth:blacklist:{jti}` | `'1'` | access 剩余寿命 | 登出黑名单：JwtAuthGuard 每请求查 |
| `throttle:{tracker}:{context}` | 计数 | 限流窗口 | 限流存储（见 §5.1） |

### 3.3 核心流程

```
登录（LocalStrategy 校验 argon2）
  → 生成 sid → 签 access + refresh（双令牌共载 sid、各自 jti）
  → 注册 auth:refresh:{sid} = {userId, jti} → 返回契约数据

刷新（校验 refresh 签名/type → 查 auth:refresh:{sid}）
  → Lua 原子「比对存储 jti === payload.jti → 写入新 jti + 重置 TTL」
  → 签新双令牌（sid 不变、jti 换新）→ 旧 refresh 立即失效
  → sid 键不存在或 jti 不符（已轮换/已登出/过期）→ 40103

登出（严格校验：需有效 access，过期 → 40102、无效 → 40101）
  → access jti 入黑名单（TTL=剩余寿命）→ DEL auth:refresh:{sid}（整会话吊销）
  → Redis 删除操作本身幂等；登出成功后同一 access 已入黑名单，重用即 40101

JwtAuthGuard（受保护请求）
  → 验签 access → 校验 type='access' → 查黑名单 → 挂载 req.user 放行
  → 错误映射：令牌过期 → 40102；缺令牌/签名无效/type 不符/已黑名单 → 40101
```

### 3.4 env 追加（总 spec §10.4 兑现）

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`：必填无默认（env.schema 追加），两份 `.env.example` 补 `change_me` 风格占位，compose server 以 `:?` 强校验注入。
- `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`：带默认值 `15m` / `7d`；短时长文法（数字 + `s|m|h|d` 后缀）由内置 ~10 行纯函数解析器处理（单测覆盖），**不引入 `ms` 依赖**。

## 4. 守卫链与端点契约

### 4.1 全局守卫链（APP_GUARD，总 spec §6.5 锁定顺序）

```
ThrottlerGuard → JwtAuthGuard（@Public 放行）→ PermissionsGuard（@RequirePermissions）
```

配套装饰器：`@Public()`（login/refresh-token/health 放行）、`@RequirePermissions(...permissions)`（P3 无业务端点消费，为 P4 system CRUD 预留 + e2e 用测试路由验证）、`@CurrentUser()` 参数装饰器取 `req.user`。

### 4.2 认证端点（契约继承 pure-web mock，叠加 `/api/v1` 前缀与信封）

| 端点 | 响应 data 形态 | 说明 |
| --- | --- | --- |
| `POST /auth/login` | `{avatar, username, nickname, roles, permissions, accessToken, refreshToken, expires}` | LocalStrategy；失败 40101；`@Throttle` 收紧 5 次/分 |
| `POST /auth/refresh-token` | `{accessToken, refreshToken, expires}` | 轮换语义；缺参走 DTO 校验 → 40001；签名无效/过期/已轮换 → 40103 |
| `POST /auth/logout` | `null` | 严格校验：需有效 access（过期 40102/无效 40101）；DEL 操作幂等 |
| `GET /auth/get-user-info` | `{avatar, username, nickname, roles, permissions}` | 从库实时查（非令牌快照） |
| `GET /auth/get-async-routes` | MENU 节点组装的路由树（vue-pure-admin 元数据格式） | 按角色 Menu 可见集 + parentId 组装 |

- `expires` 返回**毫秒时间戳**（pure-web `src/utils/auth.ts` 的 `setToken` 注释已声明前端一行切换即可，实际切换留 P5 联调）。
- `avatar` 字段：User 表无 avatar 列（P2 模型未含），P3 返回 `null`，前端已有兜底；加列留待业务需要时。

**路径分组修订备案**：mock/前端现行路径为平铺（`/login`、`/refresh-token`、`/get-async-routes`），P3 有意收拢到 `/auth/*` 分组（认证端域隔离、为 uni-mobile 微信 OAuth 等全端共享接口预留端域、避免根路径污染）。此为对总 spec §8「继承 pure-web mock 请求结构」的**契约偏离**，在此显式登记；前端适配代价一次性记入下表，P5 联调清偿。

**P5 前端适配清单**（联调时逐项清偿）：

| 项 | pure-web 改动 |
| --- | --- |
| baseUrl 与路径 | axios 现无 baseUrl（mock 直拦平铺路径）；联调时 baseUrl 对齐 `/api/v1`（dev 代理/nginx），`src/api/user.ts`、`routes.ts` 请求路径改 `/auth/login`、`/auth/refresh-token`、`/auth/get-async-routes` |
| expires 格式 | `src/utils/auth.ts` `setToken` 按注释改为直接消费毫秒时间戳（`DataInfo<number>`） |
| 登出调用 | user store `logOut()` 现为「前端登出（不调用接口）」，改为先调 `POST /auth/logout` 再清本地 |
| get-user-info | 前端现无消费方（用户信息随登录响应下发），端点为 uni-mobile 与页面刷新重取预留 |

### 4.3 权限模型口径

- 权限点集合 = 用户各角色关联的 `Menu.permission` 非空集合（BUTTON 型）。
- **admin 角色返回 `['*:*:*']` 通配**（与 mock 一致，前端权限判断零适配）；其他角色返回真实集合。
- 动态路由 = 同角色关联的 MENU 型节点按 parentId 组装树（admin 全量树）。
- **权限集数据来源**：JwtAuthGuard 验签后**实时查库**取用户 status/角色/权限点并挂 `req.user`（与 get-user-info 同口径，非令牌快照）；PermissionsGuard 只读 `req.user`；查得用户 status=DISABLED 直接 40101。
- 错误码复用现有 BizCode（40101/40102/40103/40301/42901），**无新增码段**。

## 5. 限流、安全与 Swagger

### 5.1 自研 ThrottlerStorage（总 spec §7 备案 1）

- 实现 `@nestjs/throttler` 的 `ThrottlerStorage` 接口（increment），注入 `REDIS_CLIENT`（P2 交付契约，零适配）。
- **Lua 单脚本原子 `INCR + 首写 EXPIRE`**（EVALSHA），避免 INCR/EXPIRE 分离的竞态与无 TTL 僵尸键。
- 键形态 `throttle:{tracker}:{context}`，TTL = 限流窗口；tracker 为 IP 维度。
- 策略：全局默认 60 次/分钟/IP（`ThrottlerModule.forRoot`）；`POST /auth/login` 用 `@Throttle` 收紧 5 次/分钟防爆破。
- 触发后经 exception-resolver 派生 **42901**（HTTP 429）。
- 实施时以 `pnpm view` 实查 @nestjs/throttler 最新版并核对 ThrottlerStorage 接口形态（ttl 单位等）。

### 5.2 安全防护

- **helmet**：默认策略，装配收口进 `applyAppDefaults`（P1 既有单点，不新增装配位置）；**非生产关闭 `contentSecurityPolicy`**（Swagger UI 依赖内联脚本，默认 CSP 会致文档页白屏），生产保持默认（生产无 Swagger）。
- **CORS**：沿用 P1 已落地的 `CORS_ORIGIN` 声明式配置，P3 仅验证 pure-web 8848 联调可用，不改机制。
- 登录 DTO 序列化剔除 password（总 spec §6.1 既有约束）；pino redact 已覆盖 authorization/password。

### 5.3 Swagger

- `@nestjs/swagger` 仅非生产启用（`NODE_ENV !== 'production'`，收口进 applyAppDefaults）；路径 `/api/docs`；Bearer 认证 scheme。
- tag 分组：`Auth`（本阶段 5 端点）、`Health`（既有）；System 域 tag 留 P4。
- 响应用泛型 `ApiResponse<T>` 声明信封（复用 P1 类型）。

### 5.4 生产镜像影响

新增依赖均为纯 JS（passport 系、@nestjs/jwt、@nestjs/throttler、@nestjs/swagger），无原生模块；Dockerfile 启动链与 `--ignore-scripts` 不受影响。compose server 需追加两个 JWT secret 的 `:?` 注入。

## 6. 模块落位与依赖

```
src/modules/auth/           auth.module/controller/service + dto/ + strategies/(local,jwt)
src/common/guards/          jwt-auth.guard、permissions.guard
src/common/decorators/      public、require-permissions、current-user
src/common/throttler/       redis-throttler.storage（+ spec）
src/common/security/        helmet/CORS/swagger 装配（并入 applyAppDefaults 链路）
```

**catalog 新增**（实施时逐个过判据 + `pnpm view` 实查版本）：`@nestjs/jwt`、`@nestjs/passport`、`passport`、`passport-local`、`passport-jwt`、`@nestjs/throttler`、`@nestjs/swagger`、`helmet`，及对应 `@types/passport-*`（如需）。全部入 nestjs-server `dependencies`（生产运行期需要）。

## 7. 技术债清偿（P2 遗留 6 项）

| # | 债务 | 清偿方案 | 验收 |
| --- | --- | --- | --- |
| 1 | jest 单测/e2e 转换链重复 + `.mjs` mapper 漂移 | 抽 `test/jest.base.cjs`（transform 链/transformIgnorePatterns/moduleNameMapper/allowJs）；package.json jest 段迁为 `jest.config.cjs`、`jest-e2e.json` 迁为 `jest-e2e.cjs`，二者自 base 合并单一来源；`test:e2e` 脚本路径同步 | 单测/e2e 全绿，重复配置清零 |
| 2 | redis 重连日志刷屏 + `quit()` 悬挂 | error 事件按连接状态迁移去重（仅 connected→disconnected 记一条）；`onApplicationShutdown` 的 quit 加 3s 竞速超时，超时强制 `disconnect()` | 单测覆盖去重与超时路径 |
| 3 | Menu.parentId 无索引 | schema 补 `@@index([parentId])` → 新增 migration（权限/路由树查询均走 parentId） | migration 含 CREATE INDEX，deploy 幂等通过 |
| 4 | terminus `HealthIndicator` deprecated | 先核 terminus 现行非弃用形态；若无官方迁移路径则自研轻量 health 编排替换 terminus——`/health` 信封契约（`data.status/details`）与 50300 派生保持不变 | e2e 既有断言全绿 + typecheck 零 deprecated 告警 |
| 5 | entrypoint 无阶段标记 | Dockerfile printf 补三行 `echo "[entrypoint] ..."`（migrate/seed/server） | 容器日志三标记可见 |
| 6 | compose REDIS_URL 未插值 | `REDIS_URL: ${REDIS_URL:-redis://redis:6379}`，支持根 `.env` 覆盖外部 Redis；AGENTS.md「未插值」表述同步更新 | `docker compose config` 验证 + 文档一致 |

## 8. 测试策略

**单测**：令牌签发/轮换 service、黑名单读写、TTL 解析器、权限集合推导（admin→`*:*:*`、common→真实集）、路由树组装、ThrottlerStorage 逻辑校验（mock redis）、redis 薄壳去重/超时路径。

**e2e 示范用例**（总 spec §9 口径；套件间 truncate + FLUSHDB 已覆盖限流计数/黑名单/注册表的状态隔离）：

1. 登录成功（admin 通配集 / common 真实集）与失败（40101，密码错误/用户不存在同码不泄露）
2. 登录限流：窗口内第 6 次 → 42901
3. refresh 轮换：新令牌对可用（sid 不变）；**旧 refresh 重用 → 40103**
4. 登出后旧 access → 40101（黑名单生效）、同会话 refresh → 40103（注册表已删）；他端会话（另次登录的不同 sid）不受影响
5. 越权 40301：测试专用受保护路由挂 `@RequirePermissions('system:user:query')`，common 拒、admin 通配过
6. Swagger 可见：dev 态 `GET /api/docs` 200
7. ThrottlerStorage 并发冒烟：N 并发同键计数精确 = N 且 TTL 只设一次（真 redis，复用 e2e 基建）

## 9. 风险与预案

| 风险 | 预案 |
| --- | --- |
| Lua 脚本并发计数不准 | 实施时并发冒烟（N 并发同键计数精确 = N 且 TTL 只设一次，总 spec §12 既有预案） |
| @nestjs/throttler 新版本接口变动 | 实施时 pnpm view 实查 + 核对 ThrottlerStorage 接口签名后再写实现 |
| terminus 替换牵连 /health 契约 | 契约先行冻结（e2e 既有断言不动），替换实现后断言必须原样通过 |
| e2e 限流用例污染后续套件；套件内多次登录耗尽其 5 次/分登录桶误触 429 | auth 套件 `beforeEach` FLUSHDB（兼治套件间污染与套件内桶消耗）；限流用例置独立 describe 并在用例内显式 FLUSHDB 前置 |
| passport 生态包与 ESM（`"type": "module"`）兼容 | passport 系为 CJS，经 Nest/jest 管线消费无 ESM 解析问题；实施时冒烟验证（同 P2 Prisma 对策预案模式） |

## 10. P3 完成判定

- [ ] 认证链路 e2e 七类用例全绿（§8）
- [ ] `pnpm check` 全绿
- [ ] Swagger 非生产可见（`/api/docs`）
- [ ] 技术债 6 项逐项验收通过（§7）
- [ ] compose/Dockerfile 启动链回归无破坏（server 注入 JWT secret 后三服务健康）
- [ ] 文档同步：AGENTS.md、总 spec、两份 `.env.example`（JWT 四项）
