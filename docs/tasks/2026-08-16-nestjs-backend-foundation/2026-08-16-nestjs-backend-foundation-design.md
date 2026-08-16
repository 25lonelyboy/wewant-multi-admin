# NestJS 后端基架补全：总体设计（spec）

> 任务目录：`docs/tasks/2026-08-16-nestjs-backend-foundation/`。本文档为「总」：整体设计与阶段拆分；各阶段启动时追加「分」文档（`YYYY-MM-DD-phaseN-*.md`，只追加不改写）。收口时结论提升至 `docs/architecture/`，稳定决策落 ADR-004。

## 1. 背景与目标

`apps/nestjs-server` 当前为纯 NestJS 脚手架状态（12 行 bootstrap、扁平模板结构、默认 README）。本任务将其补全为可承接业务的企业级后端基架，对应五阶段路线的「阶段二：各端基架完善」。

**目标**：一次性补齐配置管理、模块化工程结构、统一响应与异常、入参校验与 Swagger、Prisma + PostgreSQL、认证（JWT 双令牌 + provider 扩展位）、RBAC 三级模型、安全防护（helmet/CORS/限流）、结构化日志、健康检查共 10 项基架能力，并建立测试门禁与前后端契约对齐。

## 2. 已锁定决策（澄清阶段产出）

| 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- |
| 实施范围 | 全量基架（10 项全补） | 核心链路优先（分两轮反而多一次集成成本） |
| 技术路线 | 方案 A 官方主流生态：Prisma + nestjs-pino + passport + zod + swagger + throttler + terminus | 方案 B 轻量自研（单人项目自研基建风险高）；方案 C TypeORM（与阶段二既定决策冲突）。注：Prisma vs Drizzle（无 engine 二进制/无 codegen，alpine 镜像更轻）的实质对比、认证库 Lucia（2025-03 弃维）/Better Auth、zod vs Joi 的对照结论一并落 ADR-004 |
| 认证范围 | JWT access + refresh 双令牌；passport 多策略即 provider 扩展位，本轮只实现账密 | 多端登录一步到位（范围膨胀）；不留扩展位（返工风险） |
| RBAC 深度 | 用户-角色-菜单/按钮三级模型；数据权限作正交预留（见 §6.3） | 仅角色级（vue-pure-admin 按钮级 v-auth 无法对接）；含数据权限（当前性价比低） |
| 接口契约 | 继承 pure-web mock 结构 + 升级：`/api/v1` 前缀、端域分组、`{code,message,data}` 数字错误码信封、契约类型入 `packages/contracts` | 原样沿用（欠版本化/错误码/多端三笔债）；推迟决策（错过零业务窗口） |
| 测试深度 | 基架 + 认证链路示范用例 + 覆盖率门槛 80% 入 `pnpm check` | 只搭基建（无示范用例后续风格漂移） |
| 中间件边界 | 引入 Redis：限流存储、refresh token 注册表、access 黑名单、权限缓存 | 纯内存 throttler（既然决定引入 Redis 一次到位） |
| 共享包策略 | 新建 `packages/contracts`（纯类型+常量契约包）；`packages/common` 维持现状留给未来通用工具 | 全塞 common（契约与工具演进节奏不同） |
| 任务文档组织 | 总-分结构：本文档为总，各阶段各自 design→impl 文档 | 单文档单任务（任务过大） |

## 3. 工程结构

```
apps/nestjs-server/
├── prisma/
│   ├── schema.prisma          # 数据模型
│   └── seed.ts                # 初始管理员/角色/菜单种子数据
├── src/
│   ├── main.ts                # bootstrap：全局前缀/Pipe/Filter/Swagger/优雅关闭
│   ├── app.module.ts          # 根模块装配
│   ├── config/                # 配置模块：zod 校验 env、类型安全访问
│   ├── common/                # 横切基建（不含业务）
│   │   ├── decorators/        # @Public @CurrentUser @RequirePermissions
│   │   ├── filters/           # 全局异常过滤器 → 统一信封
│   │   ├── guards/            # JwtAuth / Permissions / Throttler
│   │   ├── interceptors/      # 响应信封包装
│   │   ├── middleware/        # requestId 中间件
│   │   ├── errors/            # BizException + 错误码枚举
│   │   ├── prisma/            # PrismaService（全局模块）
│   │   └── redis/             # RedisModule（ioredis 封装）
│   └── modules/               # 业务域模块
│       ├── auth/              # 登录/刷新/登出 + passport strategies
│       ├── system/            # 用户/角色/菜单 RBAC 管理端点
│       └── health/            # terminus 健康检查
└── test/                      # e2e
```

原则：`common/` 只放横切基建不放业务；`modules/` 按业务域划分，每模块自带 controller/service/dto；未来业务模块平级新增。

## 4. 配置管理

- `@nestjs/config` + zod schema 启动即校验：关键项缺失直接启动失败，快速暴露部署问题。**必填项随阶段递增**：P1 仅校验基础运行参数（PORT/NODE_ENV/LOG_LEVEL/CORS_ORIGIN，均带默认值），P2 追加 `DATABASE_URL`/`REDIS_URL`，P3 追加 `JWT_*`。
- 环境分档：`.env`（本地默认）+ `.env.production`（compose 注入）；根 `.env.example` 同步补全。
- 类型安全：导出 `AppConfig` 类型，业务经封装 getter 访问，不裸写字符串 key。

## 5. 响应信封、错误码与异常处理

统一信封（`code === 0` 为成功，数字业务码贯穿三端）：

```ts
{ code: 0, message: 'ok', data: T }
```

错误码分段：

| 码 | 语义 |
| --- | --- |
| `40001` | 参数校验失败 |
| `40101` | 未认证 |
| `40102` | access token 过期 |
| `40103` | refresh token 无效 |
| `40301` | 无权限 |
| `42901` | 触发限流 |
| `50000` | 内部错误 |

- 业务异常抛 `BizException(code, message)`；全局 ExceptionFilter 兜底未知异常为 `50000` 并记日志。
- **派生规则**：未列入上表的异常按 `code = HTTP status × 100` 派生（如 404 → `40400`、403 → `40300`），保证任意错误都有可机读 code；前端仅需对上表枚举码做分支，派生码按 HTTP 语义兜底处理。
- requestId（UUID）由中间件生成，写入响应头 `x-request-id` 并贯穿 pino 日志上下文。
- 错误码常量导出至 `packages/contracts`，前端可直接 import 做分支逻辑。

## 6. 数据库层与认证授权

### 6.1 Prisma + PostgreSQL

- `PrismaService extends PrismaClient`，全局模块，与 Nest 优雅关闭联动。
- migration：本地 `prisma migrate dev`；生产 `prisma migrate deploy` 写入 Dockerfile 启动链（失败即容器退出，compose 重启策略兜底）。
- seed：超管账号（口令经环境变量注入，不写死明文）、默认角色、与 vue-pure-admin 菜单结构对齐的初始菜单/权限点。
- 敏感字段：密码 hash 永不落日志；DTO 序列化剔除。

### 6.2 数据模型（三级 RBAC）

```
User(id, username 唯一, password, nickname, status, ...)
Role(id, code 唯一, name, status)
Menu(id, parentId, type[MENU|BUTTON], name, path?, permission?, sort, visible)
UserRole(userId, roleId)
RoleMenu(roleId, menuId)
```

- 权限点 = 用户角色关联的 `Menu.permission` 非空集合（BUTTON 型）；动态路由 = MENU 型节点按 vue-pure-admin 路由元数据格式组装。

### 6.3 数据范围预留约定（文档化，本轮不落实现）

1. 功能权限走守卫层收口（`@RequirePermissions` + Guard），不侵入业务查询。
2. 数据权限（Role.dataScope）与租户隔离（tenantId）统一由 Prisma 查询层中间件注入；本轮预留中间件挂载点、不实现逻辑。
3. JWT payload 与 `request.user` 预留 `tenantId` 槽位，单租户期恒为 `'default'`。
4. 业务表建表时必须先做租户归属判定：租户内表建表即带 `tenantId` + 复合唯一约束 + 索引，禁止事后补字段（唯一约束重构是天价迁移）。系统基架表（User/Role/Menu）本轮不加租户字段，避免死字段误导。

### 6.4 认证（passport 多策略 + JWT 双令牌）

- 本轮实现 `LocalStrategy`（账密）+ `JwtStrategy`（access 校验）；未来微信登录 = 新增 strategy 汇入同一发令牌逻辑，登录响应契约不变。
- 令牌：access 15min / refresh 7d（时长走配置）；payload 含 `sub`、`type`、`jti`、`tenantId`。
- 密码哈希：argon2（alpine 下预编译缺失时 Dockerfile 补 musl 构建依赖，实施时验证）。
- Redis 承担刷新与吊销：
  - refresh `jti` 签发时写入 `auth:refresh:{jti}` → userId（TTL=refresh 时长）；刷新校验存在性并轮换（旧删新发），refresh token 一次性使用防重放。
  - 登出：access `jti` 入黑名单（TTL=剩余寿命），JwtAuthGuard 校验时查黑名单。

### 6.5 RBAC 执行链

全局守卫顺序（`APP_GUARD`）：`ThrottlerGuard → JwtAuthGuard（@Public 放行）→ PermissionsGuard`。

- JwtAuthGuard 通过后将 `{ userId, permissions, tenantId }` 挂 `request.user`；permissions 从 Redis 缓存读，权限变更时失效。
- PermissionsGuard 比对 `@RequirePermissions` 元数据；超级管理员角色绕过。
- `@CurrentUser()` 参数装饰器取当前用户。

## 7. 安全、日志、健康检查、Swagger

- **安全**：helmet、CORS 策略（config 声明允许来源）、`@nestjs/throttler` + 官方 redis store：全局默认限流（60 次/分钟/IP），登录端点收紧（5 次/分钟）防爆破。
- **日志**：nestjs-pino 全局接管 Nest Logger；dev `pino-pretty`、prod JSON 行；`redact` 屏蔽 `authorization`/`password`；`LOG_LEVEL` 走 env。
- **健康检查**：`GET /health`（不带 `/api/v1` 前缀、`@Public`），DB + Redis 双探针；compose server healthcheck 指向它。不做 live/ready 拆分（YAGNI）。
- **Swagger**：`@nestjs/swagger` 仅非生产环境启用；tag 按端域分组（Auth/System/Health）；响应用泛型 `ApiResponse<T>` 声明。

## 8. 接口契约

- 继承 pure-web mock 的请求/响应结构（login/refresh-token/get-user-info/get-async-routes），叠加升级：
  - 全局前缀 `/api/v1`；`/health` 除外。
  - 端域分组：管理后台专属接口（动态路由、RBAC 管理）归 `System` 域；认证与通用接口全端共享。
  - 信封升级为 `{code,message,data}` 数字错误码。
- 契约类型入 `packages/contracts`（`@multi-admin/contracts`）：`ApiResponse<T>`、`BizCode` 常量、Auth DTO（LoginRequest/TokenPair）、动态路由元数据类型、`tenantId` 约定常量。零运行时依赖、纯类型 + 常量；nestjs-server 与 pure-web 以 `workspace:*` 引用，未来 uni-mobile 同消费。

## 9. 测试体系

| 层级 | 策略 |
| --- | --- |
| 单元 | service 纯逻辑（令牌签发/轮换、权限集合推导、信封/错误码）；Prisma 用 mock 注入 |
| e2e 示范用例 | 认证全链路：登录成功/失败、限流、刷新轮换、登出后 access 失效、无权限 40301 |
| 数据库策略 | e2e 连独立测试库 `multi-admin-test`（同实例独立 DB），套件前 migrate + seed，套件间 truncate；不引入 testcontainers |
| 状态隔离 | 套件间清理必须同时覆盖 **Postgres truncate 与 Redis FLUSH**（限流计数、refresh 注册表、黑名单均为 Redis 状态，不清会导致用例间污染） |
| 覆盖率门槛 | statements/branches/functions/lines 均 80%，jest `coverageThreshold` |
| 门禁接入 | 根 `scripts/check.mjs` test 阶段已全 workspace 跑 `pnpm test`，门槛自动生效（实施时验证无需改 check 脚本） |

## 10. 跨 workspace 影响面

1. **`packages/contracts`（新建）**：见 §8。tsdown 产物需同时被 vite（ESM）与 Nest 消费，必要时配 dual build。
2. **`apps/pure-web`（小改）**：axios 响应拦截器改判 `code === 0`、40102 静默刷新；5 个 mock 升级为新信封 + `/api/v1` 路径（mock 保持可用直到真实后端就绪，联调当天零改动切换）；请求层 baseURL 对齐。
3. **根 `docker-compose.yml`**：新增 redis 服务（redis:7-alpine + healthcheck），server 依赖 postgres + redis 双健康，server 补 healthcheck。
4. **根 `.env.example`**：补 `REDIS_URL`、`JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`JWT_ACCESS_TTL`、`JWT_REFRESH_TTL`、`ADMIN_INIT_PASSWORD`。
5. **catalog**：新增依赖（`@nestjs/jwt`、passport 系列、`prisma`/`@prisma/client`、`nestjs-pino`、`@nestjs/swagger`、`@nestjs/throttler`、`@nestjs/terminus`、`ioredis`、`zod`、`argon2` 等）均为后端框架级，全部入 catalog（实施时逐个过判据）。
6. **文档（AGENTS.md 硬规则：同一提交内更新）**：阶段落地时同步更新 `docs/architecture/`（模块结构/契约规范/错误码表）、`docs/decisions/`（ADR-004）、`AGENTS.md` 概览表。

## 11. 阶段拆分（每个阶段一份「分」文档，独立验收）

| 阶段 | 内容 | 验收口径 |
| --- | --- | --- |
| P1 骨架与横切 | 目录结构、config 模块（zod 校验）、信封/错误码/异常过滤、requestId、nestjs-pino、`/health` 骨架 | `pnpm dev:server` 启动，`/health` 200，错误响应符合信封，日志带 requestId |
| P2 Prisma + Redis + compose | schema 五表 + migration + seed、PrismaService、RedisModule、compose/env 变更、Dockerfile 启动链 | compose up 全绿，seed 可跑，健康检查双探针通过 |
| P3 认证与 RBAC | passport 策略、JWT 双令牌 + Redis 吊销/轮换、全局守卫链、权限端点、限流、helmet/CORS、Swagger、**认证链路 e2e 示范用例随本阶段落地** | 认证链路 e2e 全绿（登录/刷新轮换/登出失效/越权 40301），Swagger 可见 |
| P4 测试门禁 | 补齐全余示范用例（system 端点等）、测试库与 Redis 隔离策略固化、覆盖率门槛 80% | `pnpm --filter @multi-admin/nestjs-server test` 达标，`pnpm check` 全绿 |
| P5 contracts 与前端对齐 | `packages/contracts` 建包、nestjs/pure-web 消费、mock 升级、文档收尾（architecture/ADR-004/AGENTS.md）。**迁移清单**：BizCode/ApiResponse（P1 产物）与 Auth DTO（P3 产物）从 server 内部迁入 contracts，修正全部 import 路径，双端 typecheck + e2e 复验 | pure-web mock 态运行正常，类型双端编译通过，文档齐 |

## 12. 风险与预案

| 风险 | 预案 |
| --- | --- |
| argon2 在 node:24-alpine 无预编译二进制 | Dockerfile 补 `apk add python3 make g++` 构建层（构建后丢弃），或降级 Node 内置 `crypto.scrypt`（零依赖备胎，优于 bcryptjs 纯 JS 方案） |
| Prisma engine 二进制与 alpine/musl 不兼容 | schema 声明 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`，Dockerfile 验证产物可启动；此为 Prisma + Docker 头号名坑，P2 验收必查 |
| `@prisma/client` 与纯 ESM（`"type": "module"`）解析兼容性 | Prisma 6 已改善但需验证：P2 验收口径含「ESM import PrismaClient 冒烟」 |
| `@nestjs/throttler` redis store 与 ioredis 版本适配 | 实施时用 pnpm view 核实 peer 要求，版本入 catalog 时记录理由 |
| packages/contracts 被 Nest（ESM，`"type": "module"`）与 vite 双消费 | tsdown 配 dual（cjs+esm）输出 + package.json exports 双入口，P5 优先验证消费链路 |
| e2e 依赖本机 postgres 可用性 | 测试前置检查 compose postgres 健康；文档写明 e2e 前置条件 |
| 覆盖率门槛被基架样板代码稀释 | 门槛只约束 src，排除 main.ts/bootstrap 类胶水文件（collectCoverageFrom 精调） |
