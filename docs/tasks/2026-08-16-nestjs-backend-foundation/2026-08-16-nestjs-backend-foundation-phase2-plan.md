# NestJS 后端基架补全 · P2 Prisma + Redis + compose 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 nestjs-server 接入 Prisma 7（五表 schema + migration + 幂等 seed）、Redis 自研薄壳、terminus 双探针健康检查、compose 三服务编排与 Dockerfile 启动链，并收尾 P1 残留 A+B 项。

**Architecture:** 按 P2 设计文档（`2026-08-16-nestjs-backend-foundation-phase2-design.md`，下称「设计」）落地：Prisma 7 强制 driver adapter（`PrismaPg({ connectionString })`）+ `prisma.config.ts`；生成物进 `src/generated/prisma/`（不入库）；seed 逻辑抽纯函数，`prisma db seed`（tsx）与 e2e globalSetup 共用；生产启动链 `migrate deploy → db seed → node dist/main.js`。

**Tech Stack:** Prisma 7 + @prisma/adapter-pg + PostgreSQL 15、ioredis + redis:7-alpine、@nestjs/terminus、argon2、tsx、jest + supertest。

**仓库既有约定（执行者必读）：**

- ESM 相对导入**必须带 `.js` 后缀**（`moduleResolution: nodenext`）。
- 提交规范：commitlint 强制 scope，本计划用 `server` / `deps` / `docs`；**subject 禁止大写字母开头**（`P2 ...` 会被拒，用「阶段 P2 ...」语序）。
- 依赖判据：框架级依赖入 `pnpm-workspace.yaml` catalog；**版本号不硬编码**，执行时 `pnpm view <pkg> version` 取最新稳定版，以 `^major` 写入 catalog（Prisma 锁 `^7`）。
- catalog 条目按 ASCII 排序插入（`@nestjs/*` 聚簇、`@prisma/*` 紧随其后、小写包名排在所有 `@` 之后）。
- Windows shell 提交中文消息：写临时文件（如 `.git/COMMIT_MSG_TMP`）再 `git commit -F`。
- Prettier 独占格式化；yaml/json 改动后跑 `pnpm format`。
- pnpm 11 `allowBuilds` 白名单机制：若安装期提示某包 build script 被阻断，把该包加入 `pnpm-workspace.yaml` 的 `allowBuilds`（本阶段可能涉及 `argon2`）。

**前置条件：**

- Docker Desktop 可用（compose postgres/redis 供开发与 e2e）。
- 本机已有根 `.env`（没有则复制根 `.env.example` 为 `.env` 并填写 `POSTGRES_PASSWORD`、`ADMIN_INIT_PASSWORD`）。

**验收口径（设计 §12，逐条对应末尾检查清单）：** compose 三服务健康、启动链全绿；seed 幂等；`/health` 双探针信封 + 503/50300；e2e 全绿；jest × Prisma 7 ESM 对策生效；`pnpm check` 全绿；alpine 容器内 migrate + seed + 启动成功；文档同步。

---

## File Structure

```
apps/nestjs-server/
├── prisma/
│   ├── schema.prisma                        # Create：五表 + 3 enum + prisma-client 生成器
│   ├── migrations/<ts>_init/migration.sql   # Generate：首个 migration
│   ├── seed-data.ts                         # Create：菜单/按钮种子静态数据（对齐 pure-web mock）
│   ├── seed.ts                              # Create：幂等 seed 纯函数 + CLI 入口
│   └── seed.spec.ts                         # Create：纯函数单测
├── prisma.config.ts                         # Create：v7 强制配置（schema/migrations/datasource）
├── scripts/docker-entrypoint.sh             # Create：生产启动链（Dockerfile RUN printf 生成亦可，见 Task 15）
├── src/
│   ├── main.ts                              # Modify：改用 applyAppDefaults
│   ├── app.module.ts                        # Modify：imports 追加 PrismaModule/RedisModule
│   ├── generated/prisma/                    # Generate：生成物（gitignore，不入库）
│   ├── config/
│   │   ├── env.schema.ts                    # Modify：+DATABASE_URL/REDIS_URL 必填
│   │   ├── env.schema.spec.ts               # Modify：补必填断言
│   │   ├── app-config.service.ts            # Modify：+databaseUrl/redisUrl getter
│   │   └── app-config.service.spec.ts       # Modify：补 getter 断言
│   ├── common/
│   │   ├── bootstrap/apply-app-defaults.ts  # Create：main/e2e 共用装配
│   │   ├── bootstrap/apply-app-defaults.spec.ts
│   │   ├── redis/redis.constants.ts         # Create：REDIS_CLIENT token
│   │   ├── redis/redis.module.ts            # Create：自研薄壳
│   │   ├── redis/redis.module.spec.ts
│   │   └── logging/app-logger.module.ts     # Modify：customProps 携带 requestId
│   ├── database/
│   │   ├── prisma.service.ts                # Create：extends PrismaClient + adapter
│   │   ├── prisma.service.spec.ts
│   │   ├── prisma.module.ts                 # Create：@Global()
│   │   └── prisma.module.spec.ts
│   └── modules/health/
│       ├── database-health.indicator.ts     # Create：$queryRaw SELECT 1
│       ├── redis-health.indicator.ts        # Create：REDIS_CLIENT ping
│       ├── health.controller.ts             # Modify：terminus 编排 + 信封形态
│       ├── health.module.ts                 # Modify：装配 indicators
│       ├── database-health.indicator.spec.ts # Create
│       └── redis-health.indicator.spec.ts    # Create
├── test/
│   ├── setup-env.ts                         # Create：测试态 env 默认值
│   ├── global-setup.ts                      # Create：拉起 e2e-env（幂等建库+migrate+seed）
│   ├── global-teardown.ts                   # Create：收尾 truncate + FLUSHDB（库保留）
│   ├── e2e-env.ts                           # Create：tsx 直跑的前置脚本
│   ├── helpers/db.ts                        # Create：truncateAll
│   ├── helpers/redis.ts                     # Create：flushTestRedis
│   ├── helpers/cleanup.ts                   # Create：tsx 直跑的收尾清理
│   ├── jest-e2e.json                        # Modify：setupFiles/globalSetup
│   └── app.e2e-spec.ts                      # Modify：applyAppDefaults + 双探针断言
├── Dockerfile                               # Modify：产物搬运 + 启动链
├── package.json                             # Modify：deps + scripts + jest setupFiles
├── eslint.config.mjs                        # Modify：ignores 补生成物
└── .env.example                             # Modify：+DATABASE_URL/REDIS_URL/ADMIN_INIT_PASSWORD

根目录：
├── pnpm-workspace.yaml                      # Modify：catalog +7 依赖（可能 + allowBuilds argon2）
├── docker-compose.yml                       # Modify：redis 服务/env 补项/DB 名统一/healthcheck
├── .env.example                             # Modify：占位符统一 + 补项
├── .gitignore                               # Modify：+ prisma 生成物
├── .prettierignore                          # Modify：+ prisma 生成物
└── AGENTS.md / docs/...                     # Modify：文档同步（Task 16）
```

---

### Task 1: catalog 新增依赖并安装

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/nestjs-server/package.json`

- [ ] **Step 1: 查询当前稳定版本**

仓库根执行（记录输出，用于 Step 2）：

```bat
pnpm view prisma version & pnpm view @prisma/client version & pnpm view @prisma/adapter-pg version & pnpm view ioredis version & pnpm view tsx version & pnpm view argon2 version & pnpm view @nestjs/terminus version
```

预期：`prisma`/`@prisma/client`/`@prisma/adapter-pg` 为 7.x；其余为最新稳定版。若 prisma 主版本不是 7，停止并上报（设计锁定 Prisma 7）。

- [ ] **Step 2: catalog 追加条目**

编辑 `pnpm-workspace.yaml` 的 `catalog:` 段（按序插入，`^major` 用 Step 1 实查的主版本；prisma 系写 Step 1 查到的精确版本号）：

```yaml
  '@nestjs/terminus': '^<查到的 major>.0.0'   # 插在 '@nestjs/testing' 行之前（ASCII 序 terminus < testing）
  '@prisma/adapter-pg': '<查到的精确版本>'     # 插在 '@nestjs/terminus' 之后
  '@prisma/client': '<查到的精确版本>'
  'argon2': '^<major>.0.0'                     # 插在 '@vue/tsconfig' 之后、'axios' 之前
  'ioredis': '^<major>.0.0'                    # 插在 'husky' 之后、'jest' 之前
  'prisma': '<查到的精确版本>'                  # 插在 'prettier' 之后、'reflect-metadata' 之前
  'tsx': '^<major>.0.0'                        # 插在 'tsdown' 之后、'vite' 之前
```

说明：`prisma`/`@prisma/client`/`@prisma/adapter-pg` 三者同版本族，写精确版本避免漂移；其余按仓库惯例 `^`（设计 §10）。**0.x 主版本包（如 argon2）写 `^0.<minor>.0`**，`^0.0.0` 是无效 semver 范围（实施实证）。

- [ ] **Step 3: 应用包声明依赖**

编辑 `apps/nestjs-server/package.json` 的 `dependencies`（保持字母序）：

```json
    "@nestjs/terminus": "catalog:",
    "@prisma/adapter-pg": "catalog:",
    "@prisma/client": "catalog:",
    "argon2": "catalog:",
    "ioredis": "catalog:",
    "prisma": "catalog:",
    "tsx": "catalog:",
```

插入位置：`@nestjs/terminus` 在 `@nestjs/platform-express` 后；`@prisma/*` 在 `@nestjs/terminus` 后；`argon2`/`ioredis`/`prisma`/`tsx` 在小写段按序（`tsx` 在 `rxjs` 与 `zod` 之间）。
注意 `prisma` 与 `tsx` 放 **dependencies**（生产启动链刚需，设计 §7.3/§10），不是 devDependencies。

- [ ] **Step 4: 安装**

```bat
pnpm install
```

预期：lockfile 更新；若报 argon2 build script 被 pnpm 阻断，则在 `pnpm-workspace.yaml` 的 `allowBuilds:` 段加 `argon2: true` 后重跑。

- [ ] **Step 5: 提交**

提交消息（写 `.git/COMMIT_MSG_TMP` 后 `git commit -F`）：

```
deps(server): catalog 新增阶段二依赖 prisma/ioredis/argon2/tsx/terminus

- prisma 系三件套锁 7.x 精确版本（同版本族防漂移）
- prisma CLI 与 tsx 入 dependencies：生产容器启动链
  migrate deploy + db seed 刚需（设计 §7.3）
- argon2 提前到阶段二：seed 超管口令哈希刚需
```

---

### Task 2: 测试态 env 注入基建（设计 §9.1②）

**Files:**
- Create: `apps/nestjs-server/test/setup-env.ts`
- Modify: `apps/nestjs-server/package.json`（jest 段）
- Modify: `apps/nestjs-server/test/jest-e2e.json`

背景：Task 6 会把 `DATABASE_URL`/`REDIS_URL` 变为 zod 必填，而 @nestjs/config 4.x 在模块加载时同步校验（P1 教训）。env 必须先于 AppModule import 就位，故本任务前置。

- [ ] **Step 1: 创建 setup-env.ts**

```ts
// test/setup-env.ts
// jest setupFiles（先于任何测试模块 import 执行）：仅在进程 env 缺失时填测试默认值，
// 支持真机 env 覆盖（如 CI 用独立账号库）。DATABASE_URL 指向测试库 multi_admin_test，
// 与 e2e globalSetup 建库逻辑（test/global-setup.ts）保持一致。

function setIfAbsent(key: string, value: string): void {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}

setIfAbsent('NODE_ENV', 'test');
setIfAbsent(
  'DATABASE_URL',
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public'
);
setIfAbsent('REDIS_URL', 'redis://localhost:6379');
setIfAbsent('ADMIN_INIT_PASSWORD', 'e2e-admin-password');
```

- [ ] **Step 2: 挂载到两份 jest 配置**

`package.json` 的 `jest` 段追加（与 `rootDir` 同级）：

```json
    "setupFiles": ["<rootDir>/../test/setup-env.ts"],
```

`test/jest-e2e.json` 顶层追加：

```json
  "setupFiles": ["<rootDir>/setup-env.ts"],
```

- [ ] **Step 3: 回归现有测试**

```bat
pnpm --filter @multi-admin/nestjs-server run test
pnpm --filter @multi-admin/nestjs-server run test:e2e
```

预期：全绿（现有套件不读新 env，行为不变）。

- [ ] **Step 4: 提交**

```
server: 补测试态 env 注入基建（jest setupFiles）

阶段二 env 必填项（DATABASE_URL/REDIS_URL）的前置对策：
setup-env.ts 仅在缺失时填测试默认值，支持真机 env 覆盖，
先于 AppModule import 就位以避开 @nestjs/config 同步校验。
```

---

### Task 3: Prisma schema + prisma.config.ts + 生成器链路（设计 §4.1/§4.2）

**Files:**
- Create: `apps/nestjs-server/prisma/schema.prisma`
- Create: `apps/nestjs-server/prisma.config.ts`
- Modify: `apps/nestjs-server/package.json`（scripts）
- Modify: `.gitignore`、`.prettierignore`、`apps/nestjs-server/eslint.config.mjs`

- [ ] **Step 1: 创建 schema.prisma**

```prisma
// 五表 + 三级 RBAC（总 spec §6.2）；v7：datasource url 移入 prisma.config.ts
datasource db {
  provider = "postgresql"
}

generator client {
  provider           = "prisma-client"
  output             = "../src/generated/prisma"
  moduleFormat       = "esm"
  importFileExtension = "js"
}

model User {
  id        String     @id @default(cuid())
  username  String     @unique
  password  String // argon2 hash，永不落日志
  nickname  String
  status    UserStatus @default(ACTIVE)
  roles     UserRole[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Role {
  id     String     @id @default(cuid())
  code   String     @unique // admin / common
  name   String
  status RoleStatus @default(ACTIVE)
  users  UserRole[]
  menus  RoleMenu[]
}

model Menu {
  id         String     @id @default(cuid())
  parentId   String?
  parent     Menu?      @relation("MenuTree", fields: [parentId], references: [id])
  children   Menu[]     @relation("MenuTree")
  type       MenuType // MENU | BUTTON
  name       String     @unique // 路由名 / 权限点宿主标识
  title      String // i18n key，对齐 pure-web locales
  icon       String?
  path       String?
  component  String?
  permission String?    @unique // BUTTON 型权限点，如 system:user:add
  sort       Int        @default(0)
  visible    Boolean    @default(true)
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

enum UserStatus {
  ACTIVE
  DISABLED
}

enum RoleStatus {
  ACTIVE
  DISABLED
}

enum MenuType {
  MENU
  BUTTON
}
```

要点：**不写 `binaryTargets`**（v7 Rust-free 无引擎二进制，设计 §3.1）；schema 内**不写 url**。

- [ ] **Step 2: 创建 prisma.config.ts**（应用包根，与 package.json 同级）

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

说明：`dotenv/config` 供本地 CLI 读应用包 `.env`；compose/Docker 注入的 env 天然可见。`dotenv` 是 `@nestjs/config` 的传递依赖且 prisma 官方模板同款；若 pnpm 严格模式报解析失败，把 `dotenv` 加入 catalog 并声明为 devDependency（CLI 期专用）。

- [ ] **Step 3: package.json scripts 改造**

```json
    "build": "prisma generate && nest build",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "prisma db seed",
```

`build` 链式化（设计 §4.1：不挂 postinstall，与 Dockerfile 分层兼容）。

- [ ] **Step 4: 忽略规则三件套**

根 `.gitignore` 末尾追加：

```
# Prisma 生成物（prisma generate 产物，build 链重新生成）
apps/nestjs-server/src/generated/
```

根 `.prettierignore` 末尾追加：

```
apps/nestjs-server/src/generated
```

`apps/nestjs-server/eslint.config.mjs` 的 ignores 数组改为：

```js
    ignores: ['dist/**', 'coverage/**', 'src/generated/**', 'eslint.config.mjs']
```

- [ ] **Step 5: 生成并验证**

```bat
cd apps\nestjs-server && pnpm exec prisma generate
```

预期：`src/generated/prisma/` 出现 `client.ts` 等 TS 产物；git status 不显示生成物（被 ignore）。
若报 `prisma.config.ts` 加载错误（如 ESM/TS 解析），确认 prisma 版本为 7.x 且 tsx 已装（v7 CLI 内置对 prisma.config.ts 的加载支持）。

- [ ] **Step 6: 提交**

```
server: 接入 prisma schema 与 v7 配置链路

五表 + 三级 RBAC schema；prisma.config.ts 承载 seed/datasource；
build 脚本链式 prisma generate && nest build（不挂 postinstall，
兼容 Dockerfile 先装依赖后拷源码的分层）；生成物三处 ignore。
```

---

### Task 4: jest × Prisma 7 ESM spike（设计 §9.1①）

**Files:**
- Create: `apps/nestjs-server/src/database/prisma-esm.spec.ts`
- Modify: `apps/nestjs-server/package.json`（jest 段，视结果）

目标：在写任何业务代码前，固化 jest CJS 管线消费 Prisma 7 ESM-only 包的可行路径。

- [ ] **Step 1: 写冒烟测试**

```ts
// src/database/prisma-esm.spec.ts
// Prisma 7 ESM 兼容冒烟（总 spec §12 修订口径）：
// ESM import 生成 client + adapter 构造成功即通过。
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

describe('prisma 7 ESM 兼容冒烟', () => {
  it('生成 client 与 driver adapter 可构造', () => {
    const adapter = new PrismaPg({
      connectionString: 'postgresql://user:pass@localhost:5432/db'
    });
    const client = new PrismaClient({ adapter });
    expect(client).toBeDefined();
    expect(adapter).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行，观察是否撞 ERR_REQUIRE_ESM**

```bat
pnpm --filter @multi-admin/nestjs-server run test
```

分支 A（全绿）：现有管线已能消费，跳 Step 3。
分支 B（`ERR_REQUIRE_ESM`，指出具体 node_modules 包名）：进 Step 3。

- [ ] **Step 3: 首选对策——transformIgnorePatterns 放行 + allowJs**

`package.json` 的 `jest` 段改两处：

```json
    "transformIgnorePatterns": [
      "node_modules/(?!(@prisma/client|@prisma/adapter-pg|@prisma/driver-adapter-utils)/)"
    ],
```

并把 transform 里 ts-jest 的 tsconfig 内联对象补 `"allowJs": true`：

```json
          "tsconfig": {
            "module": "commonjs",
            "moduleResolution": "node10",
            "resolvePackageJsonExports": false,
            "allowJs": true
          }
```

重跑测试。若仍报错且包名不同，把新包名追加进负向先行断言（`|` 分隔）。
分支 C（首选仍不可行，如 ESM 语法残留）：切兜底——jest ESM 模式（`NODE_OPTIONS=--experimental-vm-modules` + ts-jest ESM preset），逐一修复现有 7 个单测套件受影响处，并把最终配置形态记录进本计划 Task 4 末尾的「spike 结论」备注后提交。

- [ ] **Step 4: 全量回归 + 提交**

```bat
pnpm --filter @multi-admin/nestjs-server run test
```

预期：新旧套件全绿。提交：

```
server: 固化 jest 消费 prisma 7 ESM 包的对策

spike 冒烟（生成 client + adapter 构造）先行；
transformIgnorePatterns 放行 prisma 系 ESM 包 + ts-jest allowJs。
```

---

### Task 5: PrismaService + PrismaModule（设计 §4.3）

**Files:**
- Create: `apps/nestjs-server/src/database/prisma.service.ts` + `.spec.ts`
- Create: `apps/nestjs-server/src/database/prisma.module.ts` + `.spec.ts`
- Modify: `apps/nestjs-server/src/app.module.ts`

- [ ] **Step 1: 写 PrismaService 失败测试**

```ts
// src/database/prisma.service.spec.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from './prisma.service.js';

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockReturnValue({ __mockAdapter: true })
}));

describe('PrismaService', () => {
  const config = { databaseUrl: 'postgresql://u:p@h:5432/db' } as AppConfigService;

  it('以官方形态构造 adapter（connectionString 传入，池归 adapter 自管）', () => {
    void new PrismaService(config);
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: config.databaseUrl
    });
  });

  it('生命周期：bootstrap 连接、shutdown 断开', async () => {
    const service = new PrismaService(config);
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();
    expect(connect).toHaveBeenCalled();

    await service.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bat
pnpm --filter @multi-admin/nestjs-server run test -- prisma.service
```

预期：FAIL（模块不存在）。

- [ ] **Step 3: 实现 PrismaService**

```ts
// src/database/prisma.service.ts
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Prisma 7 官方形态：driver adapter 自管连接池，应用层不持有 pg.Pool。
 * 生命周期挂 OnApplicationBootstrap/Shutdown（与 P1 enableShutdownHooks 联动）。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl })
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 4: 运行确认通过**

```bat
pnpm --filter @multi-admin/nestjs-server run test -- prisma.service
```

预期：PASS。

- [ ] **Step 5: PrismaModule + 单测**

```ts
// src/database/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 全局数据访问模块；数据权限/租户中间件挂载点预留（P3/P4 消费）。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
```

```ts
// src/database/prisma.module.spec.ts
import { Test } from '@nestjs/testing';
import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';
import { AppConfigService } from '../config/app-config.service.js';

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockReturnValue({})
}));

describe('PrismaModule', () => {
  it('导出 PrismaService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        {
          provide: AppConfigService,
          useValue: { databaseUrl: 'postgresql://u:p@h:5432/db' }
        }
      ]
    }).compile();
    expect(moduleRef.get(PrismaService)).toBeInstanceOf(PrismaService);
    await moduleRef.close();
  });
});
```

运行测试确认 PASS。

- [ ] **Step 6: 挂入 AppModule**

`src/app.module.ts` 的 imports 数组改为：

```ts
  imports: [AppConfigModule, AppLoggerModule, PrismaModule, HealthModule],
```

（补 import 语句 `import { PrismaModule } from './database/prisma.module.js';`）
注意：此时 AppModule 启动会真连 DB——`DATABASE_URL` 由 env 提供，本地 dev 需 compose postgres 在跑；单测不受影响（不实例化 AppModule）。

- [ ] **Step 7: 提交**

```
server: 新增 PrismaService 全局模块（driver adapter 官方形态）
```

---

### Task 6: env.schema 追加 DATABASE_URL/REDIS_URL（设计 §7.2）

**Files:**
- Modify: `apps/nestjs-server/src/config/env.schema.ts` + `.spec.ts`
- Modify: `apps/nestjs-server/src/config/app-config.service.ts` + `.spec.ts`

- [ ] **Step 1: 先补失败测试**

`env.schema.spec.ts` 追加用例（沿用现有套件风格）：

```ts
  it('DATABASE_URL/REDIS_URL 缺失时校验失败', () => {
    const raw = { DATABASE_URL: undefined, REDIS_URL: undefined };
    expect(() => validateEnv(raw as Record<string, unknown>)).toThrow(
      /DATABASE_URL/
    );
  });

  it('DATABASE_URL/REDIS_URL 就位时通过', () => {
    const env = validateEnv({
      DATABASE_URL: 'postgresql://u:p@h:5432/db',
      REDIS_URL: 'redis://localhost:6379'
    });
    expect(env.databaseUrl).toBe('postgresql://u:p@h:5432/db');
    expect(env.redisUrl).toBe('redis://localhost:6379');
  });
```

`app-config.service.spec.ts` 补两个 getter 的断言（沿用现有 mock ConfigService 手法）。

运行 `pnpm --filter @multi-admin/nestjs-server run test -- env` 确认 FAIL。

- [ ] **Step 2: 实现**

`env.schema.ts` 的 envSchema 追加两字段（注意 zod 4 语法，沿用现有字段风格）：

```ts
  DATABASE_URL: z.url(),
  REDIS_URL: z.string().min(1)
```

同时更新文件头部注释：删去「后续阶段在此追加 DATABASE_URL（P2）」一句，改为「JWT_*（P3）等必填项后续追加」。

`app-config.service.ts` 追加：

```ts
  get databaseUrl(): Env['DATABASE_URL'] {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): Env['REDIS_URL'] {
    return this.config.get('REDIS_URL', { infer: true });
  }
```

- [ ] **Step 3: 运行全量单测与 e2e**

```bat
pnpm --filter @multi-admin/nestjs-server run test
pnpm --filter @multi-admin/nestjs-server run test:e2e
```

预期：全绿——Task 2 的 setup-env.ts 已为测试态兜底；若 zod 4 中 `z.url()` 不存在则用 `z.string().url()` 或 `z.string().regex(/^postgresql:\/\//)` 替代并在提交消息注明。

- [ ] **Step 4: 提交**

```
server: env 校验追加 DATABASE_URL/REDIS_URL 必填

启动即崩快速暴露部署问题；测试态由 setup-env.ts 兜底默认值。
```

---

### Task 7: 首个 migration（设计 §4.4）

**Files:**
- Generate: `apps/nestjs-server/prisma/migrations/<ts>_init/migration.sql`

前置：compose postgres 在跑（库名此刻尚未统一，用任意可达库即可；migrate dev 会按 DATABASE_URL 建表）。本机 `.env`（应用包内）配 `DATABASE_URL = postgresql://postgres:<密码>@localhost:5432/multi_admin?schema=public`。

- [ ] **Step 1: 起 postgres**

```bat
docker compose up -d postgres
```

预期：healthcheck 通过（`docker compose ps` 显示 healthy）。若库名冲突报错（旧卷是 `multi-admin`），先 `docker compose down -v`（注意：清卷）再继续。

- [ ] **Step 2: 生成 migration**

```bat
cd apps\nestjs-server && pnpm exec prisma migrate dev --name init
```

预期：生成 `prisma/migrations/<ts>_init/migration.sql`（五表 + 3 enum + 唯一约束）；**v7 不会自动 seed**，此步只建表。

- [ ] **Step 3: 人工核对 SQL**

检查点：`User.username`/`Role.code`/`Menu.name`/`Menu.permission` 唯一索引；两张关联表复合主键；外键 `ON DELETE CASCADE`；无 `tenantId` 列。

- [ ] **Step 4: 提交**

```
server: 生成首个 migration（五表 + 三级 RBAC）
```

---

### Task 8: seed 数据与幂等逻辑（设计 §4.4）

**Files:**
- Create: `apps/nestjs-server/prisma/seed-data.ts`
- Create: `apps/nestjs-server/prisma/seed.ts`
- Create: `apps/nestjs-server/prisma/seed.spec.ts`

设计约束：全部 upsert / createMany+skipDuplicates；超管 create-only（绝不覆盖已改密码）；`ADMIN_INIT_PASSWORD` 缺失即失败退出；seed 逻辑为可 import 纯函数（e2e 复用）。

- [ ] **Step 1: 写 seed-data.ts（静态数据，对齐 pure-web mock/asyncRoutes.ts）**

```ts
// prisma/seed-data.ts
// 菜单/权限点种子静态数据：与 apps/pure-web/mock/asyncRoutes.ts 一一对齐；
// 纯数据无副作用，供 seed.ts 与单测共用。

export interface MenuSeedItem {
  name: string;
  title: string; // i18n key
  icon?: string;
  path?: string;
  component?: string;
  sort: number;
  children?: MenuSeedItem[];
}

export const MENU_TREE: MenuSeedItem[] = [
  {
    name: 'System',
    title: 'menus.pureSysManagement',
    icon: 'ri:settings-3-line',
    path: '/system',
    sort: 0,
    children: [
      { name: 'SystemUser', title: 'menus.pureUser', icon: 'ri:admin-line', path: '/system/user/index', sort: 0 },
      { name: 'SystemRole', title: 'menus.pureRole', icon: 'ri:admin-fill', path: '/system/role/index', sort: 1 },
      { name: 'SystemMenu', title: 'menus.pureSystemMenu', icon: 'ep:menu', path: '/system/menu/index', sort: 2 },
      { name: 'SystemDept', title: 'menus.pureDept', icon: 'ri:git-branch-line', path: '/system/dept/index', sort: 3 }
    ]
  },
  {
    name: 'Monitor',
    title: 'menus.pureSysMonitor',
    icon: 'ep:monitor',
    path: '/monitor',
    sort: 1,
    children: [
      { name: 'OnlineUser', title: 'menus.pureOnlineUser', icon: 'ri:user-voice-line', path: '/monitor/online-user', component: 'monitor/online/index', sort: 0 },
      { name: 'LoginLog', title: 'menus.pureLoginLog', icon: 'ri:window-line', path: '/monitor/login-logs', component: 'monitor/logs/login/index', sort: 1 },
      { name: 'OperationLog', title: 'menus.pureOperationLog', icon: 'ri:history-fill', path: '/monitor/operation-logs', component: 'monitor/logs/operation/index', sort: 2 },
      { name: 'SystemLog', title: 'menus.pureSystemLog', icon: 'ri:file-search-line', path: '/monitor/system-logs', component: 'monitor/logs/system/index', sort: 3 }
    ]
  }
];

/** system 组 4 页 × 4 动作 = 16 个按钮权限点（P3 端点按此粒度对齐） */
export const BUTTON_ACTIONS = ['query', 'add', 'update', 'delete'] as const;

/** 页面路由名 → 权限点前缀（system:user:add 形态） */
export const PAGE_PERMISSION_PREFIX: Record<string, string> = {
  SystemUser: 'system:user',
  SystemRole: 'system:role',
  SystemMenu: 'system:menu',
  SystemDept: 'system:dept'
};

export const ROLES = [
  { code: 'admin', name: '管理员' },
  { code: 'common', name: '普通用户' }
] as const;
```

- [ ] **Step 2: 写纯函数单测 seed.spec.ts**

```ts
// prisma/seed.spec.ts
import { MENU_TREE, BUTTON_ACTIONS, PAGE_PERMISSION_PREFIX } from './seed-data.js';
import { flattenMenus, buildButtonSeeds } from './seed.js';

describe('seed 纯函数', () => {
  it('菜单树展平为 10 个 MENU 节点且父子关系正确', () => {
    const flat = flattenMenus(MENU_TREE);
    expect(flat).toHaveLength(10);
    const user = flat.find(m => m.name === 'SystemUser');
    expect(user?.parentName).toBe('System');
  });

  it('按钮权限点 = 4 页 × 4 动作 = 16 个，命名 system:<page>:<action>', () => {
    const buttons = buildButtonSeeds(MENU_TREE);
    expect(buttons).toHaveLength(16);
    const names = buttons.map(b => b.permission);
    expect(names).toContain('system:user:add');
    expect(names).toContain('system:dept:delete');
    expect(new Set(names).size).toBe(16);
  });
});
```

注意：`prisma/` 目录在 package.json jest 的 `rootDir: src` 之外——把本套件放进 jest 需要调整 `rootDir` 吗？**不改**：本文件改放 `src/database/seed.spec.ts` 并 import `../../prisma/seed.js` 与 `../../prisma/seed-data.js`（jest transform 覆盖项目内任意路径，testRegex 按文件名匹配，rootDir 之外的测试文件需在 testRegex 命中且 haste 可达——若 jest 报「找不到测试」，则在 package.json jest 段加 `"roots": ["<rootDir>", "<rootDir>/../prisma"]` 并把 spec 留在 prisma/ 下）。**首选方案：spec 放 `src/database/seed.spec.ts`。**

运行确认 FAIL。

- [ ] **Step 3: 实现 seed.ts**

```ts
// prisma/seed.ts
// 幂等 seed：upsert / createMany+skipDuplicates；超管 create-only 绝不覆盖已改密码。
// 载体：tsx 直跑（prisma.config.ts migrations.seed）；e2e globalSetup 复用 runSeed。
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  MENU_TREE,
  BUTTON_ACTIONS,
  PAGE_PERMISSION_PREFIX,
  ROLES,
  type MenuSeedItem
} from './seed-data.js';

export interface FlatMenu {
  name: string;
  title: string;
  icon?: string;
  path?: string;
  component?: string;
  sort: number;
  parentName?: string;
}

/** 展平菜单树（纯函数） */
export function flattenMenus(tree: MenuSeedItem[]): FlatMenu[] {
  const out: FlatMenu[] = [];
  const walk = (items: MenuSeedItem[], parentName?: string) => {
    for (const item of items) {
      const { children, ...rest } = item;
      out.push({ ...rest, parentName });
      if (children) walk(children, item.name);
    }
  };
  walk(tree);
  return out;
}

export interface ButtonSeed {
  name: string;
  title: string;
  permission: string;
  parentName: string;
  sort: number;
}

/** 由菜单树推导 16 个按钮权限点（纯函数） */
export function buildButtonSeeds(tree: MenuSeedItem[]): ButtonSeed[] {
  const buttons: ButtonSeed[] = [];
  for (const group of tree) {
    for (const page of group.children ?? []) {
      const prefix = PAGE_PERMISSION_PREFIX[page.name];
      if (!prefix) continue;
      BUTTON_ACTIONS.forEach((action, index) => {
        buttons.push({
          name: `${page.name}:${action}`,
          title: `${page.title}.${action}`,
          permission: `${prefix}:${action}`,
          parentName: page.name,
          sort: index
        });
      });
    }
  }
  return buttons;
}

/**
 * 幂等执行 seed。传入已连接的 client，调用方负责 connect/disconnect，
 * 便于 prisma db seed 与 e2e globalSetup 两条链路复用。
 */
export async function runSeed(prisma: PrismaClient): Promise<void> {
  const adminPassword = process.env.ADMIN_INIT_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_INIT_PASSWORD 未设置，seed 拒绝执行（不回落默认密码）');
  }

  // 1. 角色 upsert
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role
    });
  }

  // 2. 菜单 upsert（两轮：先无父节点全建，再回填 parentId）
  const flat = flattenMenus(MENU_TREE);
  for (const menu of flat) {
    await prisma.menu.upsert({
      where: { name: menu.name },
      update: {
        title: menu.title,
        icon: menu.icon ?? null,
        path: menu.path ?? null,
        component: menu.component ?? null,
        sort: menu.sort
      },
      create: {
        name: menu.name,
        title: menu.title,
        icon: menu.icon,
        path: menu.path,
        component: menu.component,
        sort: menu.sort,
        type: 'MENU'
      }
    });
  }
  for (const menu of flat.filter(m => m.parentName)) {
    const parent = await prisma.menu.findUniqueOrThrow({
      where: { name: menu.parentName }
    });
    await prisma.menu.update({
      where: { name: menu.name },
      data: { parentId: parent.id }
    });
  }

  // 3. 按钮权限点 upsert
  for (const btn of buildButtonSeeds(MENU_TREE)) {
    const parent = await prisma.menu.findUniqueOrThrow({
      where: { name: btn.parentName }
    });
    await prisma.menu.upsert({
      where: { name: btn.name },
      update: { permission: btn.permission, parentId: parent.id },
      create: {
        name: btn.name,
        title: btn.title,
        permission: btn.permission,
        parentId: parent.id,
        sort: btn.sort,
        type: 'BUTTON'
      }
    });
  }

  // 4. admin 角色 ← 全部菜单/权限点（createMany skipDuplicates，重跑无副作用）
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'admin' }
  });
  const allMenus = await prisma.menu.findMany({ select: { id: true } });
  await prisma.roleMenu.createMany({
    data: allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id })),
    skipDuplicates: true
  });

  // 5. 超管 create-only：已存在即跳过，绝不覆盖已改密码
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });
  if (!existingAdmin) {
    const hash = await argon2.hash(adminPassword);
    const adminUser = await prisma.user.create({
      data: { username: 'admin', password: hash, nickname: '超级管理员' }
    });
    await prisma.userRole.create({
      data: { userId: adminUser.id, roleId: adminRole.id }
    });
  }
}

// CLI 入口：仅当直跑本文件时执行（被 import 时不触发）
if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const prisma = new PrismaClient({
    adapter: (await import('@prisma/adapter-pg')).PrismaPg({
      connectionString: process.env.DATABASE_URL
    } as never) // ← 实现时按官方形态 new PrismaPg({ connectionString })，此处示意
  });
  runSeed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async err => {
      console.error('seed 失败:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

实现者注意：CLI 入口块按如下**准确形态**写（上方为示意）：

```ts
import { PrismaPg } from '@prisma/adapter-pg';
// ...（文件顶部）

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  });
  runSeed(prisma)
    .then(() => prisma.$disconnect())
    .catch(async err => {
      console.error('seed 失败:', err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

注意：seed.ts 与 seed-data.ts 位于 prisma/ 目录，不参与 `nest build`（不进 dist）；生产镜像经 tsx 直跑源码（Task 15 搬运）。

- [ ] **Step 4: 跑单测确认 PASS**

```bat
pnpm --filter @multi-admin/nestjs-server run test -- seed
```

- [ ] **Step 5: 真实库执行一次验证幂等**

前置：Task 7 的 migration 已应用（本地库），应用包 `.env` 补 `ADMIN_INIT_PASSWORD = dev-admin-pass`。

```bat
cd apps\nestjs-server && pnpm exec prisma db seed
```

连跑两次，第二次预期无变更、无报错；用任意 SQL 客户端核对：1 user、2 roles、26 menus（10 MENU + 16 BUTTON）、26 role_menu、1 user_role。

- [ ] **Step 6: 提交**

```
server: 新增幂等 seed（超管/角色/10 菜单/16 权限点）

超管 create-only 绝不覆盖已改密码；菜单对齐 pure-web mock；
纯函数抽离供 e2e 复用；载体 tsx（prisma.config.ts 已配置）。
```

---

### Task 9: RedisModule 自研薄壳（设计 §5）

**Files:**
- Create: `apps/nestjs-server/src/common/redis/redis.constants.ts`
- Create: `apps/nestjs-server/src/common/redis/redis.module.ts`
- Create: `apps/nestjs-server/src/common/redis/redis.module.spec.ts`
- Modify: `apps/nestjs-server/src/app.module.ts`

- [ ] **Step 1: 写失败测试**

```ts
// src/common/redis/redis.module.spec.ts
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { Logger } from 'nestjs-pino';
import { RedisModule } from './redis.module.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { AppConfigService } from '../../config/app-config.service.js';

jest.mock('ioredis', () => {
  const instance = {
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn().mockReturnThis(),
    status: 'ready'
  };
  const ctor = jest.fn(() => instance);
  return { __esModule: true, default: ctor, __instance: instance };
});

const config = { redisUrl: 'redis://localhost:6379' } as AppConfigService;

function buildModule() {
  return Test.createTestingModule({
    imports: [RedisModule],
    providers: [
      { provide: AppConfigService, useValue: config },
      { provide: Logger, useValue: { error: jest.fn(), info: jest.fn() } }
    ]
  }).compile();
}

describe('RedisModule', () => {
  it('以 lazyConnect + maxRetriesPerRequest:null 构造实例并导出具名 token', async () => {
    const moduleRef = await buildModule();
    const client = moduleRef.get<Redis>(REDIS_CLIENT);
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: null
    });
    expect(client).toBeDefined();
    await moduleRef.close();
  });

  it('bootstrap 时 ping 失败则应用启动失败（快速失败）', async () => {
    const moduleRef = await buildModule();
    const client = moduleRef.get<Redis & { ping: jest.Mock }>(REDIS_CLIENT);
    client.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(moduleRef.init()).rejects.toThrow('ECONNREFUSED');
    await moduleRef.close();
  });

  it('shutdown 时优雅 quit', async () => {
    const moduleRef = await buildModule();
    await moduleRef.init();
    const client = moduleRef.get<Redis & { quit: jest.Mock }>(REDIS_CLIENT);
    await moduleRef.close();
    expect(client.quit).toHaveBeenCalled();
  });
});
```

运行确认 FAIL（模块不存在）。

- [ ] **Step 2: 实现**

```ts
// src/common/redis/redis.constants.ts
/** Redis 实例具名 token：P3 throttler storage / refresh 注册表 / 权限缓存共用同一实例 */
export const REDIS_CLIENT = 'REDIS_CLIENT';
```

```ts
// src/common/redis/redis.module.ts
import {
  Global,
  Inject,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service.js';
import { REDIS_CLIENT } from './redis.constants.js';

/**
 * 自研薄壳（设计 §5.1）：lazyConnect + 启动 ping 快速失败；
 * maxRetriesPerRequest:null 为官方 going-to-production 推荐（BullMQ 前瞻）；
 * error 事件转 nestjs-pino，避免无 listener 时连接错误 crash 进程；
 * 不启用 keyPrefix（会与未来 BullMQ 键空间冲突，设计 §5.2）。
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService, Logger],
      useFactory: (config: AppConfigService, logger: Logger) => {
        const client = new Redis(config.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null
        });
        client.on('error', err =>
          logger.error({ err }, 'redis 连接错误（自动重连中）')
        );
        return client;
      }
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    // 快速失败：Redis 不可达即崩，compose 重启策略兜底，不拖到运行时
    await this.redis.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
```

注意：`@Module` 类实现生命周期钩子在 Nest 中受支持（模块实例参与 DI）；模块类构造函数注入自身 exports 的 provider 合法。

- [ ] **Step 3: 运行测试确认 PASS**

```bat
pnpm --filter @multi-admin/nestjs-server run test -- redis
```

- [ ] **Step 4: 挂入 AppModule**

`src/app.module.ts` imports 追加 `RedisModule`（补 import 语句），顺序：`[AppConfigModule, AppLoggerModule, PrismaModule, RedisModule, HealthModule]`。

此时 `pnpm dev:server` 需要本机 redis（compose redis 服务在 Task 13 才加——本步可先用 `docker run --rm -p 6379:6379 redis:7-alpine` 临时顶替验证启动，或把 Task 13 的 compose redis 服务提前起）。

- [ ] **Step 5: 提交**

```
server: 新增 RedisModule 自研薄壳（ioredis）

lazyConnect + 启动 ping 快速失败；maxRetriesPerRequest:null；
error 事件转 nestjs-pino；REDIS_CLIENT 具名 token 供 P3 消费。
```

---

### Task 10: terminus 双探针健康检查（设计 §6）

**Files:**
- Create: `apps/nestjs-server/src/modules/health/database-health.indicator.ts` + `.spec.ts`
- Create: `apps/nestjs-server/src/modules/health/redis-health.indicator.ts` + `.spec.ts`
- Modify: `apps/nestjs-server/src/modules/health/health.controller.ts`
- Modify: `apps/nestjs-server/src/modules/health/health.module.ts`

关键事实：现有 `exception-resolver.ts` 对 HttpException 派生 `code = status × 100`——terminus 失败抛 `ServiceUnavailableException`（503）会自然得到 `50300`，**无需改过滤器**。

- [ ] **Step 1: 写两个 indicator 的失败测试**

```ts
// src/modules/health/database-health.indicator.spec.ts
import { DatabaseHealthIndicator } from './database-health.indicator.js';

describe('DatabaseHealthIndicator', () => {
  it('$queryRaw 成功 → database up', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const indicator = new DatabaseHealthIndicator(prisma as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'up' }
    });
  });

  it('查询抛错 → database down（不向上抛）', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('conn')) };
    const indicator = new DatabaseHealthIndicator(prisma as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'down' }
    });
  });
});
```

```ts
// src/modules/health/redis-health.indicator.spec.ts
import { RedisHealthIndicator } from './redis-health.indicator.js';

describe('RedisHealthIndicator', () => {
  it('ping PONG → redis up', async () => {
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      redis: { status: 'up' }
    });
  });

  it('ping 抛错 → redis down（不向上抛）', async () => {
    const redis = { ping: jest.fn().mockRejectedValue(new Error('down')) };
    const indicator = new RedisHealthIndicator(redis as never);
    await expect(indicator.isHealthy()).resolves.toEqual({
      redis: { status: 'down' }
    });
  });
});
```

运行确认 FAIL。

- [ ] **Step 2: 实现 indicators**

```ts
// src/modules/health/database-health.indicator.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * 自写 DB 探针（设计 §6）：不用 terminus 内置 PrismaHealthIndicator，
 * 其回落逻辑依赖错误文案字符串匹配，v7 query compiler 下未验证。
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus('database', true);
    } catch {
      return this.getStatus('database', false);
    }
  }
}
```

```ts
// src/modules/health/redis-health.indicator.ts
import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping();
      return this.getStatus('redis', pong === 'PONG');
    } catch {
      return this.getStatus('redis', false);
    }
  }
}
```

- [ ] **Step 3: 改造 controller + module**

```ts
// src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/**
 * 双探针健康检查：terminus 只做编排，失败时其抛 ServiceUnavailableException（503），
 * 经全局过滤器派生 code 50300（status × 100，总 spec §5）。信封由响应拦截器包装。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy(),
      () => this.redis.isHealthy()
    ]);
  }
}
```

```ts
// src/modules/health/health.module.ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator]
})
export class HealthModule {}
```

- [ ] **Step 4: 运行单测与 e2e**

```bat
pnpm --filter @multi-admin/nestjs-server run test
```

预期：indicator 单测 PASS；**现有 e2e 的 `data.status === 'ok'` 断言会失败**（terminus 返回结构为 `{status:'ok',info:{...},details:{...}}` 而非 `{status:'ok'}`）——e2e 断言在 Task 12 统一适配，此处仅确认单测全绿且失败点符合预期。

- [ ] **Step 5: 提交**

```
server: 健康检查换 terminus 双探针（自写 DB/Redis indicator）

失败派生码 50300 复用现有 status×100 规则；
弃用内置 PrismaHealthIndicator（字符串匹配回落未验证）。
```

---

### Task 11: applyAppDefaults 装配收敛 + 日志 requestId 字段（设计 §8 B 项）

**Files:**
- Create: `apps/nestjs-server/src/common/bootstrap/apply-app-defaults.ts` + `.spec.ts`
- Modify: `apps/nestjs-server/src/main.ts`
- Modify: `apps/nestjs-server/src/common/logging/app-logger.module.ts`

- [ ] **Step 1: 实现 apply-app-defaults.ts**

```ts
// src/common/bootstrap/apply-app-defaults.ts
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service.js';
import { requestIdMiddleware } from '../middleware/request-id.middleware.js';

/**
 * main.ts 与 e2e 共用的应用装配（P1 残留 B 项收尾）：
 * 全局前缀 / requestId 中间件 / ValidationPipe / CORS / shutdown 钩子。
 * 新增 e2e 直接复用，消除装配漂移。
 */
export function applyAppDefaults(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 逗号分隔允许多来源；trim + 过滤空串，容忍手写配置
  app.enableCors({
    origin: config.corsOrigin
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  });
  app.enableShutdownHooks();
}
```

- [ ] **Step 2: 轻量单测（mock app 验证装配调用）**

```ts
// src/common/bootstrap/apply-app-defaults.spec.ts
import { applyAppDefaults } from './apply-app-defaults.js';

describe('applyAppDefaults', () => {
  it('装配全局前缀/中间件/pipes/CORS/shutdown', () => {
    const app = {
      get: (token: unknown) =>
        ({
          corsOrigin: 'http://a.com, http://b.com,',
          port: 3000
        })[String(token.name ?? token)] ?? {},
      useLogger: jest.fn(),
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
      enableShutdownHooks: jest.fn()
    };

    applyAppDefaults(app as never);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: ['health']
    });
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://a.com', 'http://b.com']
    });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
  });
});
```

说明：`app.get` 的 mock 对 Logger/AppConfigService 都返回含所需字段的对象即可（useLogger 不校验内容）。若实现时类型收窄困难，把断言改为验证调用存在即可，不强求全等。

运行确认 PASS。

- [ ] **Step 3: main.ts 收敛**

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { applyAppDefaults } from './common/bootstrap/apply-app-defaults.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  applyAppDefaults(app);
  await app.listen(app.get(AppConfigService).port);
}

void (async () => {
  await bootstrap();
})();
```

- [ ] **Step 4: logger customProps 统一 requestId（P1 残留 B 项）**

`src/common/logging/app-logger.module.ts` 的 pinoHttp 配置内，`genReqId` 之后追加：

```ts
          // 请求作用域日志统一携带 requestId 字段（P1 残留：filter context 与 pino req.id 漂移）
          customProps: req => ({
            requestId: (req as RequestWithId).requestId
          }),
```

- [ ] **Step 5: 回归 + 提交**

```bat
pnpm --filter @multi-admin/nestjs-server run test
```

提交：

```
server: 抽 applyAppDefaults 收敛装配并统一日志 requestId 字段

main.ts/e2e 共用同一装配函数；nestjs-pino customProps 使请求
作用域日志统一携带 requestId，消除 filter/pino 字段漂移。
```

---

### Task 12: e2e 基建与用例适配（设计 §9/§8-4）

**Files:**
- Create: `apps/nestjs-server/test/e2e-env.ts`
- Create: `apps/nestjs-server/test/global-setup.ts`
- Create: `apps/nestjs-server/test/global-teardown.ts`
- Create: `apps/nestjs-server/test/helpers/db.ts`、`test/helpers/redis.ts`
- Modify: `apps/nestjs-server/test/jest-e2e.json`
- Modify: `apps/nestjs-server/test/app.e2e-spec.ts`

前置：compose postgres + redis 在跑（`docker compose up -d postgres redis`）。设计 §9：测试前探测不可达即明确报错而非超时——e2e-env.ts 连接失败时抛带指引的错误（见下方实现）。

- [ ] **Step 1: e2e-env.ts（tsx 直跑：幂等建库 + migrate + seed）**

```ts
// test/e2e-env.ts
// 由 test/global-setup.ts 经 tsx 拉起（子进程，避开 jest transform 对 ESM 包的差异）：
// 幂等 CREATE DATABASE → prisma migrate deploy → runSeed（与生产 seed 同一函数）。
import { execSync } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { runSeed } from '../prisma/seed.js';

const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';
process.env.DATABASE_URL = TEST_DB_URL;
process.env.ADMIN_INIT_PASSWORD ??= 'e2e-admin-password';

const dbName = new URL(TEST_DB_URL).pathname.slice(1);
// 维护连接打到 postgres 默认库（不依赖目标库已存在）
const adminUrl = TEST_DB_URL.replace(`/${dbName}`, '/postgres');

function connect(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

async function main(): Promise<void> {
  const admin = connect(adminUrl);
  try {
    await admin.$connect();
  } catch (err) {
    throw new Error(
      `无法连接 postgres（${adminUrl}）：请先 docker compose up -d postgres redis。原因: ${String(err)}`
    );
  }
  const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
    'SELECT datname FROM pg_database WHERE datname = $1',
    dbName
  );
  if (rows.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${dbName}`);
  }
  await admin.$disconnect();

  // migrate deploy：CLI 读 prisma.config.ts，连接串经 env 注入
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'inherit'
  });

  const test = connect(TEST_DB_URL);
  await test.$connect();
  await runSeed(test);
  await test.$disconnect();
}

main().catch(err => {
  console.error('[e2e-env] 前置失败:', err);
  process.exit(1);
});
```

- [ ] **Step 2: global-setup / global-teardown**

```ts
// test/global-setup.ts
import { execSync } from 'node:child_process';
import path from 'node:path';

export default function globalSetup(): void {
  const appRoot = path.resolve(__dirname, '..');
  execSync('pnpm exec tsx test/e2e-env.ts', {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env
  });
}
```

```ts
// test/global-teardown.ts
// 收尾清理：truncate 全表 + FLUSHDB，给下次运行留净态（库本身保留，重跑幂等更快）
import { execSync } from 'node:child_process';
import path from 'node:path';

export default function globalTeardown(): void {
  const appRoot = path.resolve(__dirname, '..');
  execSync('pnpm exec tsx test/helpers/cleanup.ts', {
    cwd: appRoot,
    stdio: 'inherit',
    env: process.env
  });
}
```

相应补一个 `test/helpers/cleanup.ts`（tsx 直跑版：连接测试库 truncate 全表 + redis FLUSHDB，逻辑复用下方 helpers，连接失败仅告警不阻断收尾）。

- [ ] **Step 3: helpers**

```ts
// test/helpers/db.ts
import type { PrismaClient } from '../../src/generated/prisma/client.js';

/** 套件间清理：全表 truncate（外键级联），P4 再固化完整隔离策略 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "UserRole", "RoleMenu", "User", "Role", "Menu" RESTART IDENTITY CASCADE'
  );
}
```

```ts
// test/helpers/redis.ts
import type { Redis } from 'ioredis';

/** 套件间清理：测试实例 FLUSHDB（逻辑 DB 固定 0，设计 §5.2） */
export async function flushTestRedis(redis: Redis): Promise<void> {
  await redis.flushdb();
}
```

- [ ] **Step 4: jest-e2e.json 接线**

顶层追加：

```json
  "globalSetup": "<rootDir>/global-setup.ts",
  "globalTeardown": "<rootDir>/global-teardown.ts",
```

- [ ] **Step 5: 适配 app.e2e-spec.ts**

```ts
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';

describe('基架冒烟 (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 信封 + 双探针 up + requestId 响应头', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = res.body as {
      code: number;
      data: { status: string; details: Record<string, { status: string }> };
    };
    expect(body.code).toBe(0);
    expect(body.data.status).toBe('ok');
    expect(body.data.details.database.status).toBe('up');
    expect(body.data.details.redis.status).toBe('up');
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
    const res = await request(app.getHttpServer())
      .get('/api/v1/unknown')
      .expect(404);
    const body = res.body as { code: number; data: null };
    expect(body.code).toBe(40400);
    expect(body.data).toBeNull();
  });
});
```

说明：terminus 成功响应形态为 `{status,info,error,details}`，信封拦截器原样包进 data；若 `details` 字段名与 terminus 实际版本有出入（个别版本为 `info/error` 聚合），以实际运行输出为准调整断言，保持「双探针字段可断言」的口径不变。

- [ ] **Step 6: 运行 e2e**

```bat
docker compose up -d postgres redis
pnpm --filter @multi-admin/nestjs-server run test:e2e
```

预期：globalSetup 建库/migrate/seed 成功；3 用例全绿。连跑两次验证幂等（第二次不重复建库、seed 无副作用）。

- [ ] **Step 7: 提交**

```
server: e2e 适配 DB/Redis（幂等建库 + 双探针断言 + 清理骨架）

globalSetup 经 tsx 拉起 e2e-env：CREATE DATABASE 幂等（不依赖
initdb 脚本，存量卷适用）+ migrate deploy + runSeed 复用；
套件间 truncate + FLUSHDB 骨架；P1 3 用例迁入 applyAppDefaults。
```

---

### Task 13: compose 变更（设计 §7.1）

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 应用如下目标形态（基于现有文件全量核对后替换）**

```yaml
# 本机部署编排：web（nginx）+ server（NestJS）+ postgres + redis
# 启动前复制根目录 .env.example 为 .env 并填写密码与 ADMIN_INIT_PASSWORD
services:
  postgres:
    image: postgres:15-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?请在 .env 中设置 POSTGRES_PASSWORD}
      POSTGRES_DB: multi_admin
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d multi_admin']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

  server:
    build:
      context: .
      dockerfile: apps/nestjs-server/Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: ${DATABASE_URL:-postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/multi_admin?schema=public}
      REDIS_URL: redis://redis:6379
      ADMIN_INIT_PASSWORD: ${ADMIN_INIT_PASSWORD:?请在 .env 中设置 ADMIN_INIT_PASSWORD}
    ports:
      - '3000:3000'
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test:
        [
          'CMD-SHELL',
          "node -e \"fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s

  web:
    build:
      context: .
      dockerfile: apps/pure-web/Dockerfile
    restart: unless-stopped
    ports:
      - '8080:80'

volumes:
  postgres-data:
  redis-data:
```

变更点对照设计 §7.1：新增 redis 服务；DB 名统一 `multi_admin`（POSTGRES_DB/healthcheck/DATABASE_URL 默认值三处）；server environment 补 REDIS_URL/ADMIN_INIT_PASSWORD；depends_on 双健康；server healthcheck 用 node 内置 fetch（免 alpine curl 依赖）；start_period 容纳启动链 migrate+seed 耗时。

**存量卷提示**：旧卷库名为 `multi-admin`，统一后需 `docker compose down -v` 重建（提交消息与本任务说明中注明；正式文档提示在 Task 16 落 docs）。

- [ ] **Step 2: 验证 postgres/redis 层（server 镜像待 Task 15）**

```bat
docker compose up -d postgres redis
docker compose ps
```

预期：两服务 healthy；`docker compose exec postgres psql -U postgres -d multi_admin -c "select 1"` 成功。

- [ ] **Step 3: 提交**

```
server: compose 新增 redis 服务并统一库名为 multi_admin

server 环境补 REDIS_URL/ADMIN_INIT_PASSWORD；depends_on 双健康；
healthcheck 用 node fetch 免 alpine curl。注意：旧卷库名
multi-admin 需 down -v 重建。
```

---

### Task 14: .env.example 模板（设计 §7.2）

**Files:**
- Modify: `.env.example`（根）
- Modify: `apps/nestjs-server/.env.example`

- [ ] **Step 1: 根 .env.example 目标形态**

```
# docker compose 服务变量（复制为 .env 后填写）
POSTGRES_PASSWORD = change_me
# 首次启动 seed 的超管口令（已存在超管时不生效、不覆盖）
ADMIN_INIT_PASSWORD = change_me_admin

# Nestjs 数据库连接（compose 内部使用服务名 postgres 作为 host）
DATABASE_URL = postgresql://postgres:change_me@postgres:5432/multi_admin?schema=public
# Redis 连接（compose 内部使用服务名 redis 作为 host）
REDIS_URL = redis://redis:6379
```

变更点：密码占位符统一 `change_me` 前缀（原 DATABASE_URL 内为 `change-me`，与 POSTGRES_PASSWORD 不一致，一并修正）；补 ADMIN_INIT_PASSWORD/REDIS_URL。JWT 四项**不补**（留 P3 消费时补，设计 §7.2）。

- [ ] **Step 2: 应用包 .env.example 追加**

在现有 PORT/NODE_ENV/LOG_LEVEL/CORS_ORIGIN 之后追加：

```
# PostgreSQL 连接（本机开发：compose 的 postgres 映射 5432）
DATABASE_URL = postgresql://postgres:change_me@localhost:5432/multi_admin?schema=public
# Redis 连接
REDIS_URL = redis://localhost:6379
# seed 超管初始口令（仅首次生效，不覆盖已有）
ADMIN_INIT_PASSWORD = change_me_admin
```

- [ ] **Step 3: 提交**

```
repo: env 模板补 DATABASE_URL/REDIS_URL/ADMIN_INIT_PASSWORD

根模板统一 change_me 占位符风格；JWT 四项留 P3 消费时补，
避免死变量（总 spec §10.4 按阶段兑现）。
```

---

### Task 15: Dockerfile 改造与启动链（设计 §7.3）

**Files:**
- Modify: `apps/nestjs-server/Dockerfile`

- [ ] **Step 1: build-stage 补构建期 DATABASE_URL 占位（Task 3 质量审查发现）**

现有 `COPY apps/nestjs-server ./apps/nestjs-server` + `pnpm --filter ... run build` 链路本身成立，但 **`prisma.config.ts` 的 `env('DATABASE_URL')` 在配置加载期即硬抛**（@prisma/config 7.x 实码核实），而 `prisma generate` 也需加载 config；build-stage 无 `.env`（dockerignore 排除）且未注入 env → 构建必挂。在 build-stage 装依赖之前（ENV 镜像变量区段）补占位：

```dockerfile
# prisma generate 不连库，占位值仅为满足 prisma.config.ts 加载（真实连接串由运行期 compose 注入）
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
```

注意：该 ENV 仅 build-stage；production-stage 不设（运行期由 compose environment 注入真实值，避免占位值泄漏进运行期）。

- [ ] **Step 2: production-stage 改造**

在现有 `COPY --from=build-stage ... dist` 之后追加：

```dockerfile
# 启动链刚需：migrations/seed 源码、v7 配置、生成物（seed 经 tsx 从源码产物导入，dev/prod 同路径）
COPY --from=build-stage /repo/apps/nestjs-server/prisma ./apps/nestjs-server/prisma
COPY --from=build-stage /repo/apps/nestjs-server/prisma.config.ts ./apps/nestjs-server/prisma.config.ts
COPY --from=build-stage /repo/apps/nestjs-server/src/generated ./apps/nestjs-server/src/generated
```

把 CMD 替换为启动链（用 RUN printf 生成 entrypoint，避免 Windows CRLF 污染 shell 脚本）：

```dockerfile
# 启动链：migrate deploy → db seed → 主进程；任一环节失败即容器退出（compose restart 兜底）
RUN printf '#!/bin/sh\nset -e\npnpm exec prisma migrate deploy\npnpm exec prisma db seed\nexec node dist/main.js\n' > /entrypoint.sh && chmod +x /entrypoint.sh

WORKDIR /repo/apps/nestjs-server
EXPOSE 3000
CMD ["/entrypoint.sh"]
```

`--prod --ignore-scripts` 安装行**保持不变**（防根包 prepare/husky；argon2 依赖预编译产物，Step 4 冒烟验证）。

- [ ] **Step 3: 构建与三服务全绿验收**

```bat
docker compose build server
docker compose up -d
docker compose ps
```

预期：postgres/redis/server 均 healthy；`docker compose logs server` 可见 migrate deploy 与 seed 输出、无报错。
`curl http://localhost:3000/health` → 信封 `{code:0,...,details:{database:{status:"up"},redis:{status:"up"}}}`。

- [ ] **Step 4: 专项验收（设计 §12）**

1. **argon2 预编译冒烟**：`docker compose exec server node --input-type=module -e "import('argon2').then(async m => console.log(await m.hash('smoke','secret')))` → 输出 `$argon2id$...`。失败则按设计 §7.3 兜底：pnpm `onlyBuiltDependencies`/`allowBuilds` 放行 argon2 后重建。
2. **seed 幂等**：`docker compose restart server` 后日志确认 seed 无重复写入；`docker compose exec postgres psql -U postgres -d multi_admin -c "select count(*) from \"Menu\""` 仍为 26；`select count(*) from \"User\"` 仍为 1。
3. **断 redis → 503/50300**：`docker compose stop redis` 后 `curl -i http://localhost:3000/health` → HTTP 503 且信封 `code:50300`；`docker compose start redis` 后恢复 200。
4. **prisma CLI 运行时**：Step 3 的 migrate deploy 成功即覆盖。

- [ ] **Step 5: 提交**

```
server: Dockerfile 补启动链产物搬运与 entrypoint

production-stage 追加 COPY prisma//prisma.config.ts/生成物；
entrypoint 串联 migrate deploy → db seed → 主进程（RUN printf
生成避免 CRLF）；--ignore-scripts 保留，argon2 走预编译冒烟验收。
```

---

### Task 16: 文档同步（设计 §11/§12 末项）

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/tasks/2026-08-16-nestjs-backend-foundation/2026-08-16-nestjs-backend-foundation-design.md`（总 spec）
- Modify: `docs/engineering/build-and-verify.md`（若含旧库名/compose 描述）

- [ ] **Step 1: 总 spec 按设计文档 §11 修订备案逐条落实**

1. §7 throttler 表述 → 无官方 redis store，P3 自实现 ThrottlerStorage（备案 1）
2. §12 风险表：Prisma 6 ESM 行改为 Prisma 7 冒烟口径（备案 2）；**binaryTargets 行注销备案**（备案 7）
3. §10.5 argon2 阶段标注 P3→P2（备案 3）；§10.4 JWT 四项顺延说明（备案 4）
4. §6.2 Menu 字段同步（备案 5）；seed 范围备案 6
5. §9 测试库名 `multi_admin_test`（备案 8）；§6.1 补 `prisma db seed` 显式步骤（备案 9）
6. §11 P2 完成判定勾选为已完成（逐项对照设计 §12 实际达成情况）

- [ ] **Step 2: AGENTS.md**

- 项目概览表 nestjs-server 行：更新为已完成状态（Prisma + Redis 已接入、terminus 双探针、启动链）
- 常用命令：补 `pnpm --filter @multi-admin/nestjs-server run prisma:migrate` / `prisma:seed`；补本地开发前置（compose postgres+redis）
- Docker 段：提一句库名统一 `multi_admin` 与旧卷 `down -v` 重建

- [ ] **Step 3: 检查并更新 docs/engineering/build-and-verify.md**

`grep` 旧库名 `multi-admin`、compose 服务清单，若存在则同步 redis 服务与启动链描述；无相关内容则不改。

- [ ] **Step 4: 提交**

```
docs(server): 同步阶段 P2 落地结果至总 spec 与 AGENTS
```

---

### Task 17: 质量门禁与最终验收（设计 §12）

- [x] **Step 1: 全量门禁**

```bat
pnpm check
```

预期：prettier → typecheck → lint → test 全绿。lint 注意：`src/generated/**` 已在 ignores（Task 3）；若 typecheck 报生成物类型错误，核对 `importFileExtension = "js"` 与 tsconfig nodenext 匹配。

- [x] **Step 2: 对照设计 §12 逐项打勾（在本计划文件内勾选 checkbox）**

- [x] compose 三服务健康，启动链 migrate + seed 全绿（Task 15 Step 3）
- [x] 二次 up/restart seed 幂等（Task 15 Step 4-2）
- [x] `/health` 双探针信封；断 redis 503 + 50300（Task 15 Step 4-3）
- [x] e2e 全绿 + truncate/FLUSHDB 生效（Task 12）
- [x] jest × Prisma 7 ESM 对策生效（Task 4）
- [x] `pnpm check` 全绿（Step 1）
- [x] alpine 容器内 migrate + seed + 启动成功（Task 15 Step 4）
- [x] 文档同步（Task 16）

- [x] **Step 3: 无遗留改动后收尾提交（若 Step 2 勾选产生文件变更）**

```
docs(server): 勾选阶段 P2 计划验收清单
```

---

## Self-Review 结论（计划作者自审）

1. **Spec 覆盖**：设计 §1-§12 逐项有对应任务——范围/验收（Task 17）、澄清结论（已固化进各任务实现）、生态事实（Task 3/4/5 落地约束）、数据库层（Task 3/7/8/5）、Redis（Task 9）、健康检查（Task 10）、compose/env/Dockerfile（Task 13/14/15）、P1 残留（Task 11/12/14）、测试策略含两个盲区（Task 2/4/12）、依赖清单（Task 1）、修订备案与完成判定（Task 16/17）。无遗漏段。
2. **占位符扫描**：仅版本号要求执行时 `pnpm view` 实查（仓库既有约定，非占位）；无 TBD/TODO。
3. **类型一致性**：`REDIS_CLIENT`/`applyAppDefaults`/`runSeed`/`flattenMenus`/`buildButtonSeeds`/`databaseUrl`/`redisUrl` 跨任务命名已核对一致；Task 8 seed.ts 示意块与准确形态块已标注以准确形态为准。
4. **已知执行期分叉点**（均已在任务内给出分支处理）：Task 4 ESM 对策分支 A/B/C；Task 6 zod 4 的 `z.url()` 可用性；Task 10/12 terminus 响应字段名以实际输出为准；Task 15 argon2 预编译兜底路径。

---

## 执行交接

计划已保存。两种执行方式：

1. **子代理驱动（推荐）**：逐任务派发全新实现子代理，任务间双段审查（spec 符合性 → 代码质量），同会话连续执行。
2. **本会话内联执行**：按批次执行 + 检查点复核。
