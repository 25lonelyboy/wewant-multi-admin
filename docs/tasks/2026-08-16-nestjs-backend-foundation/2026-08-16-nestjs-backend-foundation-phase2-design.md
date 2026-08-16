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
| ESM-only | 与仓库 ESM 路线天然契合；**与 jest CJS 管线的冲突需专项对策（见 §9.1）** |
| **强制 driver adapter** | PostgreSQL 必须 `@prisma/adapter-pg`（`new PrismaPg({ connectionString })`，adapter 自管连接池；`pg` 是 adapter 直接依赖无需另声明），不再直读 `url = env(...)` 运行时连接 |
| **`prisma.config.ts` 强制** | seed 配置迁移到 `migrations.seed`；CLI 命令的连接串走 `datasource.url`；文件放应用包根（与 package.json 同级） |
| **`prisma-client` 生成器生产就绪** | `provider = "prisma-client"`、`output = "../src/generated/prisma"`、`moduleFormat = "esm"`；产物纯 TS、进 `.gitignore` |
| **Rust-free client（无引擎二进制）** | `binaryTargets` 失效（仅属 prisma-client-js 生成器）；总 spec §12 musl 引擎风险注销备案，alpine 兼容风险收敛到 argon2 原生模块（见 §7.3） |
| **`migrate dev` 不再自动 seed** | 本地流程 = `migrate dev` + 显式 `prisma db seed` 两步（官方升级指南原文移除） |
| Node 最低 20.19、推荐 22.x | 本项目 Node >=24，满足 |

### 3.2 Redis 生态结论（P2→P5 全生命周期视角）

- **客户端 = ioredis（唯一选择）**：Node 生态事实标准；Cluster/Sentinel 成熟；决定性因素是 BullMQ（Node 生态唯一工业级队列）深度绑定 ioredis——选 node-redis 会导致未来引入队列时被迫维护两套客户端。
- **封装 = 自研薄壳 `RedisModule`（~80 行）**：否决 `@nestjs-modules/ioredis`（更新放缓、抽象泄漏）与 `@nestjs-redis/client`（太新、绑 node-redis 系生态）。与 P1 自建 `AppConfigModule`/`AppLoggerModule` 模式一致。
- **P3 限流存储前瞻裁决**：`@nestjs/throttler` 无官方 Redis store；社区包 `nestjs-throttler-storage-redis` 更新滞后。企业级主流 = **P3 自实现 `ThrottlerStorage` 接口**（Lua 原子 INCR + EXPIRE，~30 行）。P2 的交付契约：稳定具名 token + ioredis 实例导出，P3 零适配。

## 4. 数据库层设计

### 4.1 schema.prisma（五表 + 16 权限点承载）

按总 spec §6.2 三级 RBAC 模型，**Menu 表字段扩展**（总 spec 写的是省略号，P3 动态路由端点需组装 vue-pure-admin 路由元数据，mock 节点携带 icon/title/rank/component）：

```prisma
datasource db {
  provider = "postgresql" // v7：url 移入 prisma.config.ts，schema 内不写
}

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

- `generator client { provider = "prisma-client"; output = "../src/generated/prisma"; moduleFormat = "esm" }`（v7 `output` 必填；`binaryTargets` 已失效见 §3.1；实施时显式声明 `importFileExtension = "js"` 把产物导入后缀固化为 nodenext 约定）
- `src/generated/prisma/` 进根 `.gitignore`、`.prettierignore` 与 `eslint.config.mjs` ignores（类型感知规则扫生成物必报错）
- **不挂 `postinstall: prisma generate`**（与 Dockerfile「先装依赖后拷源码」分层冲突，install 时 schema 尚不存在）：应用包 `build` 脚本改为 `"prisma generate && nest build"` 链式，本地与 Docker build-stage 同一链路（见 §7.3）
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

- `PrismaService extends PrismaClient`：构造时 `new PrismaPg({ connectionString: config.databaseUrl })` + `super({ adapter })`（v7 官方形态，adapter 自管连接池，无需声明 `pg`）
- `OnModuleInit` → `$connect()`；`OnModuleDestroy` → `$disconnect()`（连接池生命周期归 adapter，与 P1 `enableShutdownHooks()` 联动）
- `@Global()` 模块，exports PrismaService；数据权限/租户中间件挂载点预留（P3/P4 消费，本轮不实现）

### 4.4 migration 与 seed

- 本地 `prisma migrate dev` + **显式 `prisma db seed`**（v7 移除 migrate dev 自动 seed，官方升级指南）；package.json 补 `prisma:migrate`/`prisma:seed` 脚本；生产 `prisma migrate deploy` 写入 Dockerfile 启动链
- **seed 幂等语义**：全部 upsert / createMany + skipDuplicates；超管 create-only（已存在即跳过，绝不覆盖已改密码）；`ADMIN_INIT_PASSWORD` 缺失即 seed 失败退出（不回落默认密码）
- **seed 内容**：
  - 超管 `admin`（argon2 hash `ADMIN_INIT_PASSWORD`）
  - 角色：`admin`（超管标记角色，PermissionsGuard 绕过）、`common`（初始无菜单，对齐 mock 全路由 `roles: ['admin']`）
  - 菜单：10 个 MENU 节点对齐 `apps/pure-web/mock/asyncRoutes.ts`（system 组 + user/role/menu/dept 4 页；monitor 组 + online-user/login-logs/operation-logs/system-logs 4 页），`title` 存 i18n key（如 `menus.pureUser`）
  - 按钮权限点：system 4 页 × `{query,add,update,delete}` = 16 个 BUTTON 节点（`permission` 形如 `system:user:add`）
  - 关联：admin 角色 ← 全部 26 个菜单/权限点；admin 用户 ← admin 角色
- seed 独立建 `PrismaClient`（不走 Nest DI），tsx 直跑；依赖 argon2（生产依赖）；client 导入路径 `../src/generated/prisma/client.js`——该生成物必须在运行时镜像存在（搬运方案见 §7.3）

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

- `HealthModule` 引入 `@nestjs/terminus` 但**不用内置 PrismaHealthIndicator**（其回落逻辑依赖错误文案字符串匹配，v7 query compiler 下未验证）：自写两个 `HealthIndicator`——DB 探针 `PrismaService.$queryRaw` `SELECT 1`、Redis 探针注入 `REDIS_CLIENT` 实例 `ping()`；terminus 只做 `HealthCheckService` 编排
- **信封包装**：HealthController 调 terminus 后返回 `{code:0,message:'ok',data:{status,checks:[{name:'database',status:'up'},{name:'redis',status:'up'}]}}`；任一探针 down → HTTP 503 + 派生码 `50300`（派生规则 `status × 100`）
- P1 现有 e2e 3 用例适配：`data.status` 断言保留，新增双探针字段断言
- compose server healthcheck 用 node 内置 `fetch` 打 `/health`（避免 alpine curl/wget 依赖）

## 7. compose / env / Dockerfile

### 7.1 docker-compose.yml

- 新增 redis 服务：`redis:7-alpine` + `healthcheck: redis-cli ping`
- server `depends_on`：postgres + redis 双 `condition: service_healthy`
- **server `environment` 补项**：`REDIS_URL`（redis://redis:6379）、`ADMIN_INIT_PASSWORD`（`${ADMIN_INIT_PASSWORD:?...}` 必填提示）——缺任一项启动链必挂（§4.4/§5.1 约束）
- **DB 名统一为 `multi_admin`（下划线）**：现有 compose `POSTGRES_DB: multi-admin`/healthcheck `-d multi-admin`/DATABASE_URL 默认值与根 `.env.example` 的 `multi_admin` 矛盾，一并统一；存量卷用户需 `down -v` 重建或手动改名（文档注明）
- **测试库创建不采用 postgres init 脚本**（initdb 脚本仅在卷为空时执行，存量卷无兜底）：改由 e2e globalSetup 幂等 `CREATE DATABASE multi_admin_test`（见 §9）
- server 补 healthcheck 指向 `/health`

### 7.2 环境变量

- env.schema（zod）追加必填：`DATABASE_URL`、`REDIS_URL`；`AppConfigService` 暴露对应 getter；**jest 测试态 env 注入方案见 §9.1**
- 根 `.env.example`：既有 `DATABASE_URL` 修正库名与密码占位符 `change_me`/`change-me` 不一致（见 §7.1）；补 `REDIS_URL`、`ADMIN_INIT_PASSWORD`（**JWT 四项留 P3 消费时补**，避免死变量——总 spec §10.4 清单按阶段兑现）
- `apps/nestjs-server/.env.example` 同步补齐

### 7.3 Dockerfile 改造与启动链（专节）

现状问题：production-stage 只 COPY `dist` + manifests、且 `--prod --ignore-scripts` 安装——启动链缺 `prisma/`（migrations/seed.ts）、`prisma.config.ts` 与生成物，直接跑必失败。改造要点：

**启动链**：`prisma migrate deploy → prisma db seed → node dist/main.js`（entrypoint 脚本串联，任一环节失败即容器退出，compose restart 策略兜底）

**build-stage**：COPY 源码后跑 `pnpm --filter @multi-admin/nestjs-server run build`（build 脚本已链 `prisma generate && nest build`，见 §4.1）；不依赖 postinstall

**production-stage 追加 COPY**（现有 dist 之外）：

- `apps/nestjs-server/prisma/`（schema + migrations + seed.ts）与 `prisma.config.ts`：migrate deploy / db seed 必需
- `apps/nestjs-server/src/generated/prisma/`：v7 产物纯 TS 无引擎二进制（体积可接受）；seed 经 tsx 从源码产物导入 client，**与本地开发同一导入路径**（不走 dist，避免相对路径分叉）

**`--ignore-scripts` 冲突处理**（保留该 flag，防根包 prepare/husky 触发）：

- argon2 的 install 脚本仅编译兜底，require 时优先加载 musl 预编译产物；**验收项**：容器内 argon2 hash 冒烟。预编译缺失时兜底 = pnpm `onlyBuiltDependencies` 白名单收窄放行 argon2，或构建层 `apk add python3 make g++` 编译
- prisma CLI v7 已去引擎下载脚本（Rust-free），验收项含容器内 CLI 直跑 `migrate deploy` 成功

**prisma CLI 与 tsx 进生产依赖**（启动链刚需；`prisma` 常规是 devDep，此处转正，入 catalog 时记录理由）

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
- **测试库**：`multi_admin_test`；e2e globalSetup 以 admin 连接幂等 `CREATE DATABASE`（不依赖 compose init 脚本，存量卷同样适用，见 §7.1），随后 `migrate deploy` + seed 函数复用（seed 逻辑抽为可 import 的纯函数，供 `prisma db seed` 与 e2e 共用）
- **套件间清理**：Postgres truncate（全表，外键级联）+ Redis FLUSHDB 双清理，落 `test/helpers/setup-e2e.ts`
- **单测**：RedisModule（mock ioredis：快速失败/quit/日志接线）、PrismaService（mock adapter 生命周期）、seed 幂等逻辑（纯函数部分）
- **手动验收**：`docker compose up` 三服务健康；二次 `up` 验证 seed 幂等（无重复数据、不改密码）；`/health` 断 redis 后 503 + `50300`

### 9.1 P2 必须补齐的两个基建盲区

**① jest × Prisma 7 ESM-only 冲突（e2e 前置条件）**：仓库现有 jest 配置为 ts-jest CJS 管线（`module: commonjs`），而 Prisma 7 运行时 ESM-only——e2e 导入 AppModule → 生成 client → `@prisma/client` 会撞 `ERR_REQUIRE_ESM`。对策分级（P2 实施首个任务做 spike 验证，结论固化进计划）：

1. 首选：`transformIgnorePatterns` 放行 + ts-jest 转译 `@prisma/client` ESM 包（不动现有管线，成本最低）
2. 兜底：jest ESM 模式（`NODE_OPTIONS=--experimental-vm-modules` + ts-jest ESM preset），评估对现有 7 个单测套件的影响面
3. 验收口径：含 PrismaService 的 e2e 与单测全绿

**② 测试态 env 注入**：env.schema 追加 `DATABASE_URL`/`REDIS_URL` 必填后，jest-e2e.json 现状无 env 注入，且 @nestjs/config 4.x 在模块加载时同步校验（P1 教训）——env 必须先于 AppModule import 就位。落法：新增 `test/setup-env.ts` 挂单测/e2e 双配置 `setupFiles`，仅在进程 env 缺失时填测试默认值（e2e 指向 `multi_admin_test` 与本机 redis，支持真机 env 覆盖）。

## 10. 依赖入 catalog 清单（执行时 `pnpm view` 取版）

| 依赖 | 归属 | 判据 |
| --- | --- | --- |
| `prisma`（锁 `^7` 大版本） | dependencies（转正，启动链刚需） | 框架级 |
| `@prisma/client`、`@prisma/adapter-pg` | dependencies | 框架级；`pg`/`@types/pg` 是 adapter 直接依赖，不另行声明 |
| `ioredis` | dependencies | 框架级；P3 BullMQ 前瞻兼容 |
| `tsx` | dependencies（seed 载体） | 启动链刚需 |
| `argon2` | dependencies | seed 哈希 + P3 认证复用；须过容器预编译冒烟（§7.3） |
| `@nestjs/terminus` | dependencies | 框架级 |

jest/ supertest 等已在 catalog。zod 已随 P1 入册。

## 11. 对总 spec 的修订备案

1. §7「`@nestjs/throttler` + 官方 redis store」→ **无官方 store，P3 自实现 `ThrottlerStorage`（Lua 原子 INCR）**；P2 交付稳定注入契约。
2. §12 风险表「`@prisma/client` ESM 兼容验证（Prisma 6）」→ **Prisma 7 ESM-only + driver adapter**，冒烟口径改为「ESM import 生成 client + adapter 构造成功」。
3. §10.5 catalog 清单中 argon2 由 P3 提前到 P2（seed 哈希刚需）。
4. §10.4 根 `.env.example` 的 JWT 四项顺延至 P3 消费时补。
5. §6.2 Menu 模型字段明确化（+`title`/`icon`/`component`，见 §4.1）。
6. seed 范围明确为全量（含 16 个按钮权限点），生产 seed 时机 = 启动链幂等执行。
7. §12 风险表「Prisma engine 二进制与 alpine/musl 不兼容（binaryTargets）」→ **注销备案**：v7 Rust-free 无引擎二进制；alpine 兼容风险收敛为 argon2 原生模块与 ESM 运行时冒烟（§7.3/§9.1）。
8. §9 测试库名 `multi-admin-test` → 统一为 `multi_admin_test`（随 DB 名统一，见 §7.1）。
9. §6.1 本地流程补充：v7 `migrate dev` 不再自动 seed，需显式 `prisma db seed`。
10. §7.3 补充：build-stage 需 `ENV DATABASE_URL` 占位——`prisma.config.ts` 的 `env()` 在配置加载期硬抛（@prisma/config 7.x 实码核实），`prisma generate` 亦需加载 config，构建层无 `.env` 时必挂；占位仅 build-stage，运行期由 compose 注入真实值（P2 实施 Task 3 质量审查发现）。

## 12. P2 完成判定

- [ ] `docker compose up` postgres/redis/server 三服务健康，启动链 migrate + seed 全绿
- [ ] 二次 `docker compose up`（或重启 server）seed 幂等：无重复记录、超管密码不被覆盖
- [ ] `/health` 双探针返回信封；断 redis 后 503 + `50300`
- [ ] e2e（含 P1 3 用例适配 + DB/Redis 探针断言）全绿；套件间 truncate + FLUSHDB 生效
- [ ] jest × Prisma 7 ESM 对策生效：含 PrismaService 的 e2e 与单测全绿（§9.1）
- [ ] `pnpm check` 全绿（prettier → typecheck → lint → test）
- [ ] Dockerfile 产物在 alpine 内 `migrate deploy` + seed + 启动成功（argon2 预编译冒烟 + prisma CLI 运行时 + ESM 启动验证）
- [ ] 根 `.env.example`、AGENTS.md、总 spec P2 完成判定同步更新
