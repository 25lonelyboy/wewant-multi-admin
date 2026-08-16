# NestJS 后端基架补全 · P2 Prisma + Redis + compose 设计

> 本文档为总 spec（`2026-08-16-nestjs-backend-foundation-design.md`）P2 阶段的「分」设计。总 spec 已锁定的决策（信封契约、错误码、RBAC 模型、测试策略等）此处不重复，仅记录 P2 范围内的澄清结论、探索发现与对总 spec 的修订备案。

## 1. P2 范围与验收口径

**范围**（总 spec §11 P2）：schema 五表 + migration + seed、PrismaService、RedisModule、compose/env 变更、Dockerfile 启动链、terminus 双探针替换 `/health` 骨架；外加 P1 残留 A+B 项收尾（见 §8）。

**验收口径**：`docker compose up` 全绿（postgres/redis/server 三服务健康）；启动链 migrate + 幂等 seed 可重复执行；`/health` 双探针（DB + Redis）通过且保持信封契约；`pnpm check` 全绿。

## 2. 澄清阶段结论

| 决策点 | 结论 | 备注 |
| --- | --- | --- |
| P1 残留收尾策略 | A+B 全收 | A=总 spec 已承诺项（根 .env.example 补齐等）；B=日志字段统一 + e2e 装配抽公共函数；C（40001 字段级明细）留 P3/P5 |
| seed 交付边界 | 全量一次到位 | 超管 + 默认角色 + 菜单 + **16 个按钮权限点**（用户拍板预置，P3 端点需对齐该粒度） |
| 生产 seed 时机 | 启动链幂等 seed | `migrate deploy → seed → node dist/main.js`；seed upsert/create-only 语义，绝不覆盖已改密码；失败即容器退出 |
| Prisma 版本路线 | **Prisma 7（v7.8.x）** | 零存量 schema 无迁移包袱；ESM-only 与仓库 `"type": "module"` 契合；v6 已进维护期 |
| seed 执行载体 | **tsx 直跑** | `prisma.config.ts` 配 `seed: "tsx prisma/seed.ts"`；买断语法自由（P3 后 seed 变复杂不受 erasable syntax 约束）；dev/prod 同一载体 |
| 按钮权限点 | P2 预置 16 个 | system 4 页 × query/add/update/delete，vue-pure-admin 惯例命名 |
| 健康检查契约 | 保持信封 | terminus 结果包装为 `{code,message,data}`；503 时派生码 `50300` |
| argon2 时机 | 提前到 P2 | seed 哈希超管口令刚需；alpine musl 构建风险（总 spec §12）提前在 Dockerfile 验证 |

## 3. 生态事实核实（2026-08，探索发现）

### 3.1 Prisma 7 破坏性变化（直接约束实现）

| 变化 | P2 应对 |
| --- | --- |
| ESM-only | 与仓库 ESM 路线天然契合 |
| **强制 driver adapter** | PostgreSQL 必须 `@prisma/adapter-pg` + `pg.Pool` 构造 PrismaClient，不再直读 `url = env(...)` 运行时连接 |
| **`prisma.config.ts` 强制** | seed 配置迁移到 `migrations.seed`；CLI 命令的连接串走 `datasource.url` |
| **`prisma-client` 生成器生产就绪** | `provider = "prisma-client"`、`output = "../src/generated/prisma"`、`moduleFormat = "esm"`；产物纯 TS、进 `.gitignore` |
| Node 要求 20.19+/22.12+/24+ | 本项目 Node >=24，满足 |

### 3.2 Redis 生态结论（P2→P5 全生命周期视角）

- **客户端 = ioredis（唯一选择）**：Node 生态事实标准；Cluster/Sentinel 成熟；决定性因素是 BullMQ（Node 生态唯一工业级队列）深度绑定 ioredis——选 node-redis 会导致未来引入队列时被迫维护两套客户端。
- **封装 = 自研薄壳 `RedisModule`（~80 行）**：否决 `@nestjs-modules/ioredis`（更新放缓、抽象泄漏）与 `@nestjs-redis/client`（太新、绑 node-redis 系生态）。与 P1 自建 `AppConfigModule`/`AppLoggerModule` 模式一致。
- **P3 限流存储前瞻裁决**：`@nestjs/throttler` 无官方 Redis store；社区包 `nestjs-throttler-storage-redis` 更新滞后。企业级主流 = **P3 自实现 `ThrottlerStorage` 接口**（Lua 原子 INCR + EXPIRE，~30 行）。P2 的交付契约：稳定具名 token + ioredis 实例导出，P3 零适配。

## 4. 数据库层设计

### 4.1 schema.prisma（五表 + 16 权限点承载）

按总 spec §6.2 三级 RBAC 模型，**Menu 表字段扩展**（总 spec 写的是省略号，P3 动态路由端点需组装 vue-pure-admin 路由元数据，mock 节点携带 icon/title/rank/component）：

```prisma
model User {
  id       String   @id @default(cuid())
  username String   @unique
  password String // argon2 hash，永不落日志
  nickname String
  status   UserStatus @default(ACTIVE)
  roles    UserRole[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Role {
  id     String @id @default(cuid())
  code   String @unique // admin / common
  name   String
  status RoleStatus @default(ACTIVE)
  users  UserRole[]
  menus  RoleMenu[]
}

model Menu {
  id         String   @id @default(cuid())
  parentId   String?
  parent     Menu?    @relation("MenuTree", fields: [parentId], references: [id])
  children   Menu[]   @relation("MenuTree")
  type       MenuType // MENU | BUTTON
  name       String   @unique // 路由名 / 权限点宿主标识
  title      String   // i18n key，对齐 pure-web locales
  icon       String?
  path       String?
  component  String?
  permission String?  @unique // BUTTON 型权限点，如 system:user:add
  sort       Int      @default(0)
  visible    Boolean  @default(true)
  roles      RoleMenu[]
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])
}

model RoleMenu {
  roleId String
  menuId String
  role   Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  menu   Menu @relation(fields: [menuId], references: [id], onDelete: Cascade)
  @@id([roleId, menuId])
}

enum UserStatus { ACTIVE DISABLED }
enum RoleStatus { ACTIVE DISABLED }
enum MenuType   { MENU BUTTON }
```

生成器与产物约定：

- `generator client { provider = "prisma-client"; output = "../src/generated/prisma"; moduleFormat = "esm" }`
- `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`（总 spec §12 头号名坑，P2 验收必查）
- `src/generated/prisma/` 进 `.gitignore` 与 `.prettierignore`；`package.json` 挂 `postinstall: prisma generate`
- 系统基架表不加 `tenantId`（总 spec §6.3 约定）

### 4.2 prisma.config.ts（v7 强制）

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts'
  },
  datasource: { url: env('DATABASE_URL') }
});
```

### 4.3 PrismaService（全局模块）

- `PrismaService extends PrismaClient`：构造时以 `AppConfigService.databaseUrl` 建 `pg.Pool` + `PrismaPg` adapter，`super({ adapter })`（v7 强制 driver adapter）
- `OnModuleInit` → `$connect()`；`OnModuleDestroy` → `$disconnect()` + `pool.end()`（与 P1 `enableShutdownHooks()` 联动）
- `@Global()` 模块，exports PrismaService；数据权限/租户中间件挂载点预留（P3/P4 消费，本轮不实现）

### 4.4 migration 与 seed

- 本地 `prisma migrate dev`；生产 `prisma migrate deploy` 写入 Dockerfile 启动链
- **seed 幂等语义**：全部 upsert / createMany + skipDuplicates；超管 create-only（已存在即跳过，绝不覆盖已改密码）；`ADMIN_INIT_PASSWORD` 缺失即 seed 失败退出（不回落默认密码）
- **seed 内容**：
  - 超管 `admin`（argon2 hash `ADMIN_INIT_PASSWORD`）
  - 角色：`admin`（超管标记角色，PermissionsGuard 绕过）、`common`（初始无菜单，对齐 mock 全路由 `roles: ['admin']`）
  - 菜单：10 个 MENU 节点对齐 `apps/pure-web/mock/asyncRoutes.ts`（system 组 + user/role/menu/dept 4 页；monitor 组 + online-user/login-logs/operation-logs/system-logs 4 页），`title` 存 i18n key（如 `menus.pureUser`）
  - 按钮权限点：system 4 页 × `{query,add,update,delete}` = 16 个 BUTTON 节点（`permission` 形如 `system:user:add`）
  - 关联：admin 角色 ← 全部 26 个菜单/权限点；admin 用户 ← admin 角色
- seed 独立建 `PrismaClient`（不走 Nest DI），tsx 直跑；依赖 argon2（生产依赖）

## 5. Redis 层设计

### 5.1 RedisModule（自研薄壳）

```
src/common/redis/
├── redis.module.ts      # @Global() 模块
├── redis.constants.ts   # REDIS_CLIENT 具名 token
└── redis.module.spec.ts
```

- `@Global()` + 工厂注入 `AppConfigService`，`REDIS_URL` 走 env 校验（env.schema P2 追加必填）
- **`lazyConnect: true`** + `OnApplicationBootstrap` 时 `ping()` 快速失败（Redis 不可达即崩，compose 重启策略兜底，不拖到运行时才暴露）
- **`maxRetriesPerRequest: null`**：官方 going-to-production 推荐；避免未来 BullMQ blocking 连接踩坑
- **error 事件转 nestjs-pino 日志**：无 listener 时连接错误会 crash 进程；接上后自动重连期间降级而非猝死
- **`OnApplicationShutdown` → `quit()`**：优雅排空在途命令
- 导出契约：`REDIS_CLIENT` 具名 token + ioredis `Redis` 类型——P3 throttler storage / refresh 注册表 / 权限缓存直接注入同一实例

### 5.2 键命名治理（P2 立规，P3 消费）

- 业务键空间前缀：`auth:refresh:{jti}`、`auth:blacklist:{jti}`、`rbac:perm:{userId}`；限流键由 throttler 自管
- **不启用 ioredis `keyPrefix`**（全局前缀会与未来 BullMQ 键空间冲突）
- 逻辑 DB 固定 0；测试清理走独立测试实例/DB + FLUSHDB

## 6. 健康检查（terminus 双探针，保持信封契约）

- `HealthModule` 引入 `@nestjs/terminus`：DB 探针（PrismaHealthIndicator ping）+ Redis 探针（注入 `REDIS_CLIENT` 实例 `ping()`）
- **信封包装**：HealthController 调 terminus 后返回 `{code:0,message:'ok',data:{status,checks:[{name:'database',status:'up'},{name:'redis',status:'up'}]}}`；任一探针 down → HTTP 503 + 派生码 `50300`（派生规则 `status × 100`）
- P1 现有 e2e 3 用例适配：`data.status` 断言保留，新增双探针字段断言
- compose server healthcheck 用 node 内置 `fetch` 打 `/health`（避免 alpine curl/wget 依赖）

## 7. compose / env / Dockerfile

### 7.1 docker-compose.yml

- 新增 redis 服务：`redis:7-alpine` + `healthcheck: redis-cli ping`
- server `depends_on`：postgres + redis 双 `condition: service_healthy`
- postgres 挂 init 脚本（`/docker-entrypoint-initdb.d/`）创建 `multi_admin_test` 测试库（e2e 专用，同实例独立 DB，总 spec §9）
- server 补 healthcheck 指向 `/health`

### 7.2 环境变量

- env.schema（zod）追加必填：`DATABASE_URL`、`REDIS_URL`；`AppConfigService` 暴露对应 getter
- 根 `.env.example` 补：`DATABASE_URL`、`REDIS_URL`、`ADMIN_INIT_PASSWORD`（**JWT 四项留 P3 消费时补**，避免死变量——总 spec §10.4 清单按阶段兑现）
- `apps/nestjs-server/.env.example` 同步补齐

### 7.3 Dockerfile 启动链

```
prisma migrate deploy → prisma db seed → node dist/main.js
```

- 任一环节失败即容器退出（compose restart 策略兜底）
- **prisma CLI 与 tsx 进生产依赖**（启动链刚需；`prisma` 常规是 devDep，此处转正，入 catalog 时记录理由）
- argon2 alpine musl 构建：按总 spec §12 预案在构建层验证（必要时 `apk add python3 make g++` 构建后丢弃，或验证已有预编译二进制）
- 生成产物（`src/generated/prisma`）随 build 阶段 tsc 编译进 dist，运行时不需 `prisma generate`

## 8. P1 残留收尾（A+B 全收）

| # | 项 | 类型 | P2 落法 |
| --- | --- | --- | --- |
| 1 | 根 `.env.example` 补齐 | A | 见 §7.2 |
| 2 | 日志字段名统一（filter `context` vs pino `req.id` 漂移） | B | nestjs-pino 加 `customProps`：请求作用域日志统一携带 `requestId` 字段；AllExceptionsFilter 保持 `context`（类名语义）不动 |
| 3 | e2e 与 main.ts 装配漂移 | B | 抽 `applyAppDefaults(app)`（全局前缀/pipes/requestId 中间件/CORS），main.ts 与 e2e 共用；P3 新增 e2e 直接复用 |
| 4 | e2e 适配 DB/Redis | A | 现有 3 用例迁入 `multi_admin_test`；落 `test/helpers` 清理骨架（truncate + FLUSHDB）；完整隔离策略 P4 固化 |

C 项（40001 字段级校验明细）不动错误信封契约，留 P3/P5。

## 9. 测试策略（P2 范围）

- **e2e 前置条件**：compose postgres + redis 健康（文档写明；测试启动前探测，不可达即明确报错而非超时）
- **测试库**：`multi_admin_test`（compose init 脚本创建）；e2e 启动时 `migrate deploy` + seed 函数复用（seed 逻辑抽为可 import 的纯函数，供 `prisma db seed` 与 e2e 共用）
- **套件间清理**：Postgres truncate（全表，外键级联）+ Redis FLUSHDB 双清理，落 `test/helpers/setup-e2e.ts`
- **单测**：RedisModule（mock ioredis：快速失败/quit/日志接线）、PrismaService（mock adapter 生命周期）、seed 幂等逻辑（纯函数部分）
- **手动验收**：`docker compose up` 三服务健康；二次 `up` 验证 seed 幂等（无重复数据、不改密码）；`/health` 断 redis 后 503 + `50300`

## 10. 依赖入 catalog 清单（执行时 `pnpm view` 取版）

| 依赖 | 归属 | 判据 |
| --- | --- | --- |
| `prisma` | dependencies（转正，启动链刚需） | 框架级 |
| `@prisma/client`、`@prisma/adapter-pg`、`pg` | dependencies | 框架级 |
| `ioredis` | dependencies | 框架级；P3 BullMQ 前瞻兼容 |
| `tsx` | dependencies（seed 载体） | 启动链刚需 |
| `argon2` | dependencies | seed 哈希 + P3 认证复用 |
| `@nestjs/terminus` | dependencies | 框架级 |
| `@types/pg` | devDependencies | 类型 |

jest/ supertest 等已在 catalog。zod 已随 P1 入册。

## 11. 对总 spec 的修订备案

1. §7「`@nestjs/throttler` + 官方 redis store」→ **无官方 store，P3 自实现 `ThrottlerStorage`（Lua 原子 INCR）**；P2 交付稳定注入契约。
2. §12 风险表「`@prisma/client` ESM 兼容验证（Prisma 6）」→ **Prisma 7 ESM-only + driver adapter**，冒烟口径改为「ESM import 生成 client + adapter 构造成功」。
3. §10.5 catalog 清单中 argon2 由 P3 提前到 P2（seed 哈希刚需）。
4. §10.4 根 `.env.example` 的 JWT 四项顺延至 P3 消费时补。
5. §6.2 Menu 模型字段明确化（+`title`/`icon`/`component`，见 §4.1）。
6. seed 范围明确为全量（含 16 个按钮权限点），生产 seed 时机 = 启动链幂等执行。

## 12. P2 完成判定

- [ ] `docker compose up` postgres/redis/server 三服务健康，启动链 migrate + seed 全绿
- [ ] 二次 `docker compose up`（或重启 server）seed 幂等：无重复记录、超管密码不被覆盖
- [ ] `/health` 双探针返回信封；断 redis 后 503 + `50300`
- [ ] e2e（含 P1 3 用例适配 + DB/Redis 探针断言）全绿；套件间 truncate + FLUSHDB 生效
- [ ] `pnpm check` 全绿（prettier → typecheck → lint → test）
- [ ] Dockerfile 产物在 alpine 内 `migrate deploy` + seed + 启动成功（binaryTargets/argon2 musl 验证）
- [ ] 根 `.env.example`、AGENTS.md、总 spec P2 完成判定同步更新
