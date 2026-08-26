# NestJS 后端基架补全 · P4 system RBAC CRUD 与测试门禁实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付用户/角色/菜单三域 RESTful CRUD（全局软删除）+ Prisma 错误契约扩展 + 单测/e2e 合并覆盖率 ≥80% 双报表流水线。

**Architecture:** 所有代码落 `apps/nestjs-server`。一次 Prisma migration 完成三表 `deletedAt`、部分唯一索引与模型补列；软删过滤统一走 system 域 `alive()` 工厂并波及 P3 认证链；三域 service 层集中实现护栏与预查重；覆盖率用 istanbul 官方库合并单测与 e2e 两份 `coverage-final.json`。

**Tech Stack:** NestJS 11 / Prisma 7（prisma-client 生成器 + PrismaPg 适配器）/ class-validator / jest 30 / supertest / istanbul-lib-coverage·lib-report·reports。

**设计依据（事实源，冲突时以设计为准）：** `docs/tasks/2026-08-16-nestjs-backend-foundation/2026-08-18-nestjs-backend-foundation-phase4-design.md`（修订版，commit 62a1c6d）。

---

## 背景速览（零上下文工程师必读）

- 仓库是 pnpm monorepo，后端 workspace 为 `apps/nestjs-server`（包名 `@multi-admin/nestjs-server`，ESM `"type": "module"`，TS 源码内相对 import 一律带 `.js` 后缀）。
- 既有交付：P1 骨架横切（信封 `{code,message,data}` / 全局过滤器 / ValidationPipe `whitelist+transform` / 全局前缀 `api/v1`）、P2 Prisma+Redis、P3 认证链（JWT 双令牌轮换 + `JwtAuthGuard` 实时查库 + `PermissionsGuard` AND 语义 + `admin` 通配 `*:*:*`）与 auth/health e2e。
- 五表模型：User / Role / Menu / UserRole / RoleMenu（`prisma/schema.prisma`）；seed 内置 `admin`/`common` 两角色、16 个 `system:{user|role|menu|dept}:{query|add|update|delete}` 权限点、超管用户 `admin`（`prisma/seed.ts`）。
- e2e 基建：`test/global-setup.ts` → `test/e2e-env.ts` 幂等建 `multi_admin_test` 库 + `migrate deploy` + seed；teardown truncate + FLUSHDB；登录 helper 在 `test/helpers/auth.ts`。
- 常用命令（均在**仓库根**执行）：
  - 单测：`pnpm --filter @multi-admin/nestjs-server run test`
  - e2e（前置 `docker compose up -d postgres redis`）：`pnpm --filter @multi-admin/nestjs-server run test:e2e`
  - 类型检查：`pnpm --filter @multi-admin/nestjs-server run typecheck`（pretypecheck 自动 prisma generate）
  - 质量门禁：`pnpm check`（prettier → typecheck → lint → test）
- 提交规范：conventional commits + 强制 scope，本计划提交 scope 一律 `server`（文档提交用 `docs`）。**主题行禁止大写开头**（commitlint subject-case），中文开头最稳，例如 `feat(server): xxx`。
- Prisma 客户端从 `src/generated/prisma/client.js` import（`PrismaClient` / `Prisma` / 枚举），服务封装在 `src/database/prisma.service.ts`（`PrismaModule` 是 `@Global()`，业务模块无需再 import）。
- 本计划所有文件路径相对 `apps/nestjs-server/`（除 `docs/`、仓库根文件外）。

## 任务总览与依赖

| Task | 内容 | 依赖 |
| --- | --- | --- |
| 1 | 数据模型 migration（软删除列 + 补列 + 部分唯一索引）+ seed/测试 helper 编译级适配 | — |
| 2 | P3 认证链软删除波及适配（TDD） | 1 |
| 3 | BizCode 扩展 + exception-resolver Prisma 分支（TDD） | 1 |
| 4 | system 域 shared 基建（常量 / alive / 分页） | 1 |
| 5 | 用户域 CRUD + 护栏 + 单测 + 模块接线 | 2,3,4 |
| 6 | 角色域 CRUD + 护栏 + 单测 | 4,5 |
| 7 | 菜单域 CRUD + meta 嵌套校验 + 防环 + 单测 | 4,5 |
| 8 | route-tree 增强（枚举分支 / meta 透传 / showLink） | 1 |
| 9 | system e2e 四类示范用例 + beforeAll FLUSHDB | 5,6,7,8 |
| 10 | 合并覆盖率流水线（istanbul 官方库 + 双报表 + 门禁） | 9 |
| 11 | 文档同步 + 全链路验收 | 10 |

前置条件（全程）：本机 `docker compose up -d postgres redis` 已健康（e2e 与 migrate dev 依赖）。

---

### Task 1: 数据模型 migration（软删除 + 补列 + 部分唯一索引）

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`
- Modify: `test/helpers/auth.ts`
- Modify: `src/modules/auth/auth.service.ts`（仅 validateUser 一处编译级适配）
- Create: `prisma/migrations/<timestamp>_p4_soft_delete_and_system_fields/migration.sql`（prisma 生成 + 手改）

设计依据：分设计 §3、§3.5。本任务不含业务行为变更，目标是「migration 落地 + 编译通过 + 既有测试全绿」。

- [ ] **Step 1: 确认前置环境**

Run: `docker compose ps`（仓库根）
Expected: postgres 与 redis 均 healthy。若未起：`docker compose up -d postgres redis`。

- [ ] **Step 2: 修改 schema.prisma**

将 `prisma/schema.prisma` 的三个模型与 MenuType 枚举改为（User/Role/Menu 移除 `@unique`，新增列一律 nullable 或带默认值；中间表 UserRole/RoleMenu 不动）：

```prisma
model User {
  id        String     @id @default(cuid())
  username  String
  password  String // argon2 hash，永不落日志
  nickname  String
  status    UserStatus @default(ACTIVE)
  avatar    String?
  phone     String?
  email     String?
  sex       Int? // 0|1；DTO 层 @IsIn([0, 1])
  remark    String?
  roles     UserRole[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  deletedAt DateTime?
}

model Role {
  id        String     @id @default(cuid())
  code      String
  name      String
  status    RoleStatus @default(ACTIVE)
  remark    String?
  users     UserRole[]
  menus     RoleMenu[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  deletedAt DateTime?
}

model Menu {
  id         String     @id @default(cuid())
  parentId   String?
  parent     Menu?      @relation("MenuTree", fields: [parentId], references: [id])
  children   Menu[]     @relation("MenuTree")
  type       MenuType // MENU | IFRAME | EXTERNAL | BUTTON
  name       String // 路由名 / 权限点宿主标识
  title      String // i18n key，对齐 pure-web locales
  icon       String?
  path       String?
  component  String?
  permission String? // BUTTON 型权限点，如 system:user:add
  sort       Int        @default(0)
  visible    Boolean    @default(true)
  meta       Json? // 前端路由元数据（12 个纯展示字段，分设计 §3.3）
  roles      RoleMenu[]
  deletedAt  DateTime?

  @@index([parentId])
}

enum MenuType {
  MENU
  IFRAME
  EXTERNAL
  BUTTON
}
```

- [ ] **Step 3: 生成 migration（create-only，不立即应用）**

Run: `pnpm --filter @multi-admin/nestjs-server exec prisma migrate dev --create-only --name p4_soft_delete_and_system_fields`
Expected: 输出新建目录 `prisma/migrations/<timestamp>_p4_soft_delete_and_system_fields/`，未应用到数据库。

- [ ] **Step 4: 检查并手改生成的 migration.sql**

打开 `prisma/migrations/<timestamp>_p4_soft_delete_and_system_fields/migration.sql`，核验包含：

1. `ALTER TABLE "User" ADD COLUMN` 六项（avatar/phone/email/sex/remark/deletedAt，均可空）
2. `ALTER TABLE "Role" ADD COLUMN` 四项（remark 可空、createdAt/updatedAt 带 `DEFAULT CURRENT_TIMESTAMP`、deletedAt 可空）
3. `ALTER TABLE "Menu" ADD COLUMN "meta" JSONB` 与 `"deletedAt" TIMESTAMP(3)`
4. `ALTER TYPE "MenuType" ADD VALUE 'IFRAME'` 与 `ADD VALUE 'EXTERNAL'`
5. 四条 `DROP INDEX`（`User_username_key` / `Role_code_key` / `Menu_name_key` / `Menu_permission_key`）

然后在文件**末尾追加**部分唯一索引（Prisma 无法表达，必须手写）：

```sql
-- Partial unique indexes：唯一约束只保护活跃记录（deletedAt IS NULL），已删名字可复用
CREATE UNIQUE INDEX "User_username_alive" ON "User"("username") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Role_code_alive" ON "Role"("code") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_name_alive" ON "Menu"("name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_permission_alive" ON "Menu"("permission") WHERE "deletedAt" IS NULL;
```

- [ ] **Step 5: 应用 migration 并重新生成 client**

Run: `pnpm --filter @multi-admin/nestjs-server exec prisma migrate dev`
Expected: 应用该 migration 成功（开发库 `multi_admin`），无 drift 提示；随后 `pnpm --filter @multi-admin/nestjs-server exec prisma generate` 确认 `src/generated/prisma` 重新生成（User/Role/Menu 出现 `deletedAt`，Menu 出现 `meta`，`UserWhereUniqueInput` 不再含 username）。

- [ ] **Step 6: 修复 prisma/seed.ts 编译破坏（upsert/findUnique 按唯一字段失格）**

`prisma/seed.ts` 中把「1. 角色 upsert」块替换为：

```ts
  // 1. 角色：活跃记录 create-only（唯一性由部分唯一索引兜底）
  for (const role of ROLES) {
    const existing = await prisma.role.findFirst({
      where: { code: role.code, deletedAt: null }
    });
    if (!existing) {
      await prisma.role.create({ data: { code: role.code, name: role.name } });
    }
  }
```

把「2. 菜单 upsert」两个循环整体替换为：

```ts
  // 2. 菜单（两轮：先无父节点全建，再回填 parentId）
  const flat = flattenMenus(MENU_TREE);
  for (const menu of flat) {
    const existing = await prisma.menu.findFirst({
      where: { name: menu.name, deletedAt: null }
    });
    const data = {
      title: menu.title,
      icon: menu.icon ?? null,
      path: menu.path ?? null,
      component: menu.component ?? null,
      sort: menu.sort
    };
    if (existing) {
      await prisma.menu.update({ where: { id: existing.id }, data });
    } else {
      await prisma.menu.create({
        // exactOptionalPropertyTypes：可选字段收窄为 null（Prisma create 不接受 undefined）
        data: { name: menu.name, ...data, type: 'MENU' }
      });
    }
  }
  for (const menu of flat.filter(
    (m): m is FlatMenu & { parentName: string } => m.parentName !== undefined
  )) {
    const parent = await prisma.menu.findFirstOrThrow({
      where: { name: menu.parentName, deletedAt: null }
    });
    const self = await prisma.menu.findFirstOrThrow({
      where: { name: menu.name, deletedAt: null }
    });
    await prisma.menu.update({
      where: { id: self.id },
      data: { parentId: parent.id }
    });
  }
```

把「3. 按钮权限点 upsert」循环替换为：

```ts
  // 3. 按钮权限点
  for (const btn of buildButtonSeeds(MENU_TREE)) {
    const parent = await prisma.menu.findFirstOrThrow({
      where: { name: btn.parentName, deletedAt: null }
    });
    const existing = await prisma.menu.findFirst({
      where: { name: btn.name, deletedAt: null }
    });
    const data = { permission: btn.permission, parentId: parent.id };
    if (existing) {
      await prisma.menu.update({ where: { id: existing.id }, data });
    } else {
      await prisma.menu.create({
        data: {
          name: btn.name,
          title: btn.title,
          ...data,
          sort: btn.sort,
          type: 'BUTTON'
        }
      });
    }
  }
```

把「4」与「5」中的两处唯一字段查询替换为：

```ts
  const adminRole = await prisma.role.findFirstOrThrow({
    where: { code: 'admin', deletedAt: null }
  });
```

```ts
  const existingAdmin = await prisma.user.findFirst({
    where: { username: 'admin', deletedAt: null }
  });
```

- [ ] **Step 7: 修复 test/helpers/auth.ts 编译破坏**

把 `ensureCommonUser` 函数体前两处查询替换为：

```ts
export async function ensureCommonUser(prisma: PrismaClient): Promise<void> {
  const commonRole = await prisma.role.findFirstOrThrow({
    where: { code: 'common', deletedAt: null }
  });
  const password = await argon2.hash(COMMON_PASSWORD);
  const existing = await prisma.user.findFirst({
    where: { username: 'common', deletedAt: null }
  });
  const user =
    existing ??
    (await prisma.user.create({
      data: { username: 'common', password, nickname: '普通用户' }
    }));
  // 后续 userRole.upsert / roleMenu.createMany 段保持原样（复合主键与 id 查询不受影响）
```

- [ ] **Step 8: 修复 src/modules/auth/auth.service.ts 编译破坏（validateUser 一处）**

`validateUser` 中：

```ts
    const user = await this.prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: { roles: { include: { role: true } } }
    });
```

（其余 `findUnique({ where: { id } })` 按主键查询仍然合法，**本任务不动**；软删除语义适配属 Task 2。同步把 `auth.service.spec.ts` 里 validateUser 相关 mock 键 `findUnique` 改为 `findFirst`：mock 对象增加 `user: { findUnique: jest.fn(), findFirst: jest.fn() }`，validateUser 两个用例内的 `prisma.user.findUnique.mockResolvedValue` 改为 `prisma.user.findFirst.mockResolvedValue`。）

- [ ] **Step 9: 类型检查 + 全量单测**

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck`
Expected: 无错误。若仍有 `findUnique`/`upsert` 唯一字段 where 报错，按同模式（findFirst + `deletedAt: null`）修复后重跑。
Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全部通过（既有单测回归）。

- [ ] **Step 10: e2e 回归（验证 migration 在测试库幂等应用 + seed 链不破坏）**

Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e`
Expected: auth e2e 全部原样通过（globalSetup 对 `multi_admin_test` 自动 `migrate deploy` 新 migration）。

- [ ] **Step 11: Commit**

```bash
git add apps/nestjs-server/prisma apps/nestjs-server/src apps/nestjs-server/test/helpers/auth.ts
git commit -m "feat(server): 落地数据模型迁移（软删除列/补列/部分唯一索引）与 seed 适配"
```

---

### Task 2: P3 认证链软删除波及适配（TDD）

**Files:**
- Modify: `src/modules/auth/auth.service.ts`
- Test: `src/modules/auth/auth.service.spec.ts`

设计依据：分设计 §4.4。目标：已删用户登录/持权即时失效，permissionsOf 与 getAsyncRoutes 过滤已删角色与菜单。

- [ ] **Step 1: 写失败测试（auth.service.spec.ts 增改）**

在 `auth.service.spec.ts` 中：

1. `ADMIN_ROW` 增加字段 `deletedAt: null`；
2. mock 初始化确认 `user: { findUnique: jest.fn(), findFirst: jest.fn() }`（Task 1 已加）；
3. 在 `describe('validateUser')` 内追加：

```ts
    it('查询带软删过滤：已删用户按不存在处理', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(service.validateUser('ghost', 'x')).rejects.toMatchObject({
        code: 40101
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ username: 'ghost', deletedAt: null })
        })
      );
    });
```

4. 在 `describe('refresh')` 内追加：

```ts
    it('用户已软删 → 40103', async () => {
      tokens.verifyRefreshToken.mockResolvedValue({
        sub: 'u1',
        sid: 's1',
        jti: 'j1'
      });
      prisma.user.findUnique.mockResolvedValue({
        ...ADMIN_ROW,
        deletedAt: new Date()
      });
      await expect(service.refresh('rt')).rejects.toMatchObject({
        code: 40103
      });
    });
```

5. 在 `describe('resolveSessionUser')` 内追加：

```ts
    it('用户已软删 → 40101（旧令牌即时失效）', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...ADMIN_ROW,
        deletedAt: new Date()
      });
      await expect(
        service.resolveSessionUser(payload)
      ).rejects.toMatchObject({ code: 40101 });
    });

    it('用户-角色关联查询过滤已删角色', async () => {
      prisma.user.findUnique.mockResolvedValue(ADMIN_ROW);
      await service.resolveSessionUser(payload);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            roles: {
              where: { role: { deletedAt: null } },
              include: { role: true }
            }
          }
        })
      );
    });
```

6. 文件末尾新增 describe：

```ts
  describe('getAsyncRoutes 软删过滤', () => {
    it('角色与菜单查询均带 deletedAt: null', async () => {
      prisma.role.findMany.mockResolvedValue([{ id: 'r1', code: 'admin' }]);
      prisma.menu.findMany.mockResolvedValue([]);
      const user = { userId: 'u1', roles: ['admin'] } as AuthUser;
      await service.getAsyncRoutes(user);
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
      expect(prisma.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
    });
  });
```

（permissionsOf 的过滤通过 resolveSessionUser 链路间接断言：`prisma.role.findMany` 在正常路径用例中被调用时 where 应含 `deletedAt: null`，把该断言并入「正常路径」用例末尾：`expect(prisma.role.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['r1'] }, deletedAt: null } }))`，并对 `prisma.menu.findMany` 同样断言。）

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/auth.service.spec.ts`
Expected: 新增用例 FAIL（refresh/resolveSessionUser 未判 deletedAt；查询 where 未含 deletedAt）。

- [ ] **Step 3: 实现 auth.service.ts 适配**

`refresh` 的用户可用性判断改为：

```ts
    if (
      !user ||
      user.deletedAt !== null ||
      user.status !== 'ACTIVE'
    ) {
      throw new BizException(BizCode.REFRESH_TOKEN_INVALID, '会话用户不可用');
    }
```

`resolveSessionUser` 的判断改为：

```ts
    const user = await this.findUserWithRoles(payload.sub);
    if (
      !user ||
      user.deletedAt !== null ||
      user.status !== 'ACTIVE'
    ) {
      throw new BizException(BizCode.UNAUTHORIZED, '用户不存在或已禁用');
    }
```

`getAsyncRoutes` 两处查询加过滤：

```ts
    const roles = await this.prisma.role.findMany({
      where: { code: { in: user.roles }, deletedAt: null },
      select: { id: true, code: true }
    });
    const menus = await this.prisma.menu.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: { in: roles.map(r => r.id) } } }
      }
    });
```

`permissionsOf` 两处查询加过滤：

```ts
    const roleCodes = (
      await this.prisma.role.findMany({
        where: { id: { in: roleIds }, deletedAt: null },
        select: { code: true }
      })
    ).map(r => r.code);
    const menus = await this.prisma.menu.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: { in: roleIds } } }
      },
      select: { type: true, permission: true }
    });
```

`findUserWithRoles` 的 include 过滤已删角色：

```ts
  private findUserWithRoles(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          where: { role: { deletedAt: null } },
          include: { role: true }
        }
      }
    });
  }
```

- [ ] **Step 4: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/auth.service.spec.ts`
Expected: PASS（含既有用例回归）。
Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全量单测通过。

- [ ] **Step 5: e2e 回归**

Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e`
Expected: auth e2e 全部原样通过（分设计 §4.4 回归门禁）。

- [ ] **Step 6: Commit**

```bash
git add apps/nestjs-server/src/modules/auth
git commit -m "feat(server): 认证链适配软删除（已删用户即时失效 + 角色/菜单过滤）"
```

---

### Task 3: BizCode 扩展 + exception-resolver Prisma 分支（TDD）

**Files:**
- Modify: `src/common/errors/biz-code.ts`
- Test: `src/common/errors/biz-code.spec.ts`
- Modify: `src/common/errors/exception-resolver.ts`
- Test: `src/common/errors/exception-resolver.spec.ts`

设计依据：分设计 §5.5。现状核验：`resolveException` 无 Prisma 分支，P2002/P2003/P2025 全落底 50000——本任务是**新增实现**。

- [ ] **Step 1: 写失败测试（biz-code.spec.ts）**

在既有断言列表中（`FORBIDDEN` 之后、`RATE_LIMITED` 之前）插入两行：

```ts
    expect(BizCode.NOT_FOUND).toBe(40404);
    expect(BizCode.CONFLICT).toBe(40900);
```

- [ ] **Step 2: 写失败测试（exception-resolver.spec.ts）**

文件头部 import 追加：

```ts
import { Prisma } from '../../generated/prisma/client.js';
```

在「未知异常归为 50000」用例之前新增 describe：

```ts
describe('resolveException · Prisma 已知错误分支', () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('mock', {
      code,
      clientVersion: '7.0.0'
    });

  it('P2002 唯一冲突 → 409 CONFLICT(40900)', () => {
    expect(resolveException(known('P2002'))).toEqual({
      status: 409,
      code: BizCode.CONFLICT,
      message: '资源唯一约束冲突'
    });
  });

  it('P2025 目标不存在 → 404 NOT_FOUND(40404)', () => {
    expect(resolveException(known('P2025'))).toEqual({
      status: 404,
      code: BizCode.NOT_FOUND,
      message: '资源不存在或已删除'
    });
  });

  it('P2003 FK 约束 → 400 VALIDATION_FAILED(40001)', () => {
    expect(resolveException(known('P2003'))).toEqual({
      status: 400,
      code: BizCode.VALIDATION_FAILED,
      message: '关联资源不存在或无效'
    });
  });

  it('其余 Prisma 已知错误仍归 50000', () => {
    expect(resolveException(known('P2010')).code).toBe(BizCode.INTERNAL_ERROR);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors`
Expected: 新用例 FAIL（`BizCode.NOT_FOUND` undefined / Prisma 错误落 50000）。

- [ ] **Step 4: 实现 biz-code.ts**

在 `FORBIDDEN: 40301,` 与 `RATE_LIMITED: 42901,` 之间插入：

```ts
  NOT_FOUND: 40404,
  CONFLICT: 40900,
```

- [ ] **Step 5: 实现 exception-resolver.ts**

头部 import 追加：

```ts
import { Prisma } from '../../generated/prisma/client.js';
```

在 `HttpException` 分支之后、最终 fallback 之前插入：

```ts
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: BizCode.CONFLICT,
          message: '资源唯一约束冲突'
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: BizCode.NOT_FOUND,
          message: '资源不存在或已删除'
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: BizCode.VALIDATION_FAILED,
          message: '关联资源不存在或无效'
        };
      default:
        break;
    }
  }
```

- [ ] **Step 6: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/common/errors`
Expected: PASS。
Run: `pnpm --filter @multi-admin/nestjs-server run typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add apps/nestjs-server/src/common/errors
git commit -m "feat(server): 错误契约扩展（40404/40900 + Prisma 错误映射分支）"
```

---

### Task 4: system 域 shared 基建

**Files:**
- Create: `src/modules/system/shared/system.constants.ts`
- Create: `src/modules/system/shared/system-shared.ts`
- Create: `src/modules/system/shared/menu-meta.dto.ts`
- Test: `src/modules/system/shared/system-shared.spec.ts`

设计依据：分设计 §3.3、§4.2、§5.4、§6。system 域一切列表/详情/子资源查询的软删过滤必须经 `alive()` 组装，禁止手写散落 `deletedAt: null`（防幽灵数据，分设计 §10）。

- [ ] **Step 1: 写失败测试**

创建 `src/modules/system/shared/system-shared.spec.ts`：

```ts
import { alive, normalizePageQuery, pageResult } from './system-shared.js';

describe('system shared 工具', () => {
  describe('alive()', () => {
    it('返回软删过滤片段且可展开进 Prisma where', () => {
      expect(alive()).toEqual({ deletedAt: null });
      expect({ ...alive(), status: 'ACTIVE' }).toEqual({
        deletedAt: null,
        status: 'ACTIVE'
      });
    });
  });

  describe('normalizePageQuery', () => {
    it('默认 page=1 pageSize=10', () => {
      expect(normalizePageQuery({})).toEqual({
        page: 1,
        pageSize: 10,
        skip: 0,
        take: 10
      });
    });

    it('兜底钳制：page 下限 1、pageSize 上限 100', () => {
      expect(normalizePageQuery({ page: 0, pageSize: 500 })).toEqual({
        page: 1,
        pageSize: 100,
        skip: 0,
        take: 100
      });
    });

    it('skip = (page - 1) * pageSize', () => {
      expect(normalizePageQuery({ page: 3, pageSize: 20 })).toEqual({
        page: 3,
        pageSize: 20,
        skip: 40,
        take: 20
      });
    });
  });

  it('pageResult 组装 {items,total,page,pageSize}', () => {
    expect(pageResult([1, 2], 42, 2, 10)).toEqual({
      items: [1, 2],
      total: 42,
      page: 2,
      pageSize: 10
    });
  });
});
```

说明：controller 层 DTO 的 `@Min/@Max` 已拒越界入参；`normalizePageQuery` 的钳制是 service 层兜底（防程序内直调），两层不冲突。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 system.constants.ts**

```ts
// src/modules/system/shared/system.constants.ts
/**
 * 超管标识：来源为 seed 内置数据（prisma/seed.ts 的 admin 用户、
 * prisma/seed-data.ts ROLES 的 admin 角色）。集中定义防字面量散落；
 * 未来升级 isSystem 标志位时只改此处（分设计 §12 backlog）。
 */
export const ADMIN_USERNAME = 'admin';
export const ADMIN_ROLE_CODE = 'admin';
```

- [ ] **Step 4: 实现 system-shared.ts**

```ts
// src/modules/system/shared/system-shared.ts
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;

/**
 * 软删除过滤片段：system 域所有列表/详情/子资源查询必须追加。
 * 统一走本工厂，防止过滤遗漏产生幽灵数据（分设计 §4.2/§10）。
 */
export function alive(): { deletedAt: null } {
  return { deletedAt: null };
}

export interface PageQueryInput {
  page?: number;
  pageSize?: number;
}

export interface NormalizedPage {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** service 层兜底钳制（controller 层 DTO 已用 @Min/@Max 约束） */
export function normalizePageQuery(query: PageQueryInput): NormalizedPage {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE))
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pageResult<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PageResult<T> {
  return { items, total, page, pageSize };
}

/**
 * 菜单前端路由元数据（meta Json 单列收纳的 12 个纯展示字段）：
 * 后端零查询/排序/过滤诉求，写路径校验、读路径透传（分设计 §3.3）。
 * showLink 不在此列——visible 为单一语义源，路由树输出 showLink = visible。
 */
export interface MenuMeta {
  redirect?: string;
  extraIcon?: string;
  enterTransition?: string;
  leaveTransition?: string;
  activePath?: string;
  auths?: string[];
  frameSrc?: string;
  frameLoading?: boolean;
  keepAlive?: boolean;
  hiddenTag?: boolean;
  fixedTag?: boolean;
  showParent?: boolean;
}
```

- [ ] **Step 5: 实现 menu-meta.dto.ts**

```ts
// src/modules/system/shared/menu-meta.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import type { MenuMeta } from './system-shared.js';

/**
 * meta Json 写路径校验：菜单域 DTO 以 @ValidateNested() + @Type(() => MenuMetaDto) 挂载。
 * 读路径不反序列化校验（写时校验、读时信任，分设计 §3.3）。
 */
export class MenuMetaDto implements MenuMeta {
  @ApiPropertyOptional({ description: '重定向路由' })
  @IsOptional()
  @IsString()
  redirect?: string;

  @ApiPropertyOptional({ description: '菜单右侧图标区' })
  @IsOptional()
  @IsString()
  extraIcon?: string;

  @ApiPropertyOptional({ description: '进场动画' })
  @IsOptional()
  @IsString()
  enterTransition?: string;

  @ApiPropertyOptional({ description: '离场动画' })
  @IsOptional()
  @IsString()
  leaveTransition?: string;

  @ApiPropertyOptional({ description: '详情页激活的菜单路径' })
  @IsOptional()
  @IsString()
  activePath?: string;

  @ApiPropertyOptional({ description: '路由绑定的权限点（前端路由级细粒度）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  auths?: string[];

  @ApiPropertyOptional({ description: 'iframe 地址' })
  @IsOptional()
  @IsString()
  frameSrc?: string;

  @ApiPropertyOptional({ description: 'iframe 显示加载动画' })
  @IsOptional()
  @IsBoolean()
  frameLoading?: boolean;

  @ApiPropertyOptional({ description: '缓存页面组件' })
  @IsOptional()
  @IsBoolean()
  keepAlive?: boolean;

  @ApiPropertyOptional({ description: '不在标签区渲染' })
  @IsOptional()
  @IsBoolean()
  hiddenTag?: boolean;

  @ApiPropertyOptional({ description: '标签区固定' })
  @IsOptional()
  @IsBoolean()
  fixedTag?: boolean;

  @ApiPropertyOptional({ description: '激活本页时显示父级菜单' })
  @IsOptional()
  @IsBoolean()
  showParent?: boolean;
}
```

- [ ] **Step 6: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system`
Expected: PASS。
Run: `pnpm --filter @multi-admin/nestjs-server run typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add apps/nestjs-server/src/modules/system/shared
git commit -m "feat(server): system 域共享基建（软删过滤工厂/分页/MenuMeta 类型与 DTO）"
```

---

### Task 5: 用户域 CRUD + 护栏 + 模块接线

**Files:**
- Create: `src/modules/system/user/dto/user.dto.ts`
- Create: `src/modules/system/user/user.service.ts`
- Create: `src/modules/system/user/user.controller.ts`
- Create: `src/modules/system/system.module.ts`
- Modify: `src/app.module.ts`
- Test: `src/modules/system/user/user.service.spec.ts`

设计依据：分设计 §5.1、§6（护栏 1/2/3/5/6/7）、§4。护栏集中在 service 层；username 不可改由 UpdateUserDto 无该字段 + ValidationPipe `whitelist` 天然实现（护栏 6）。

- [ ] **Step 1: 写失败测试（user.service.spec.ts）**

创建 `src/modules/system/user/user.service.spec.ts`：

```ts
import * as argon2 from 'argon2';
import { UserService } from './user.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

jest.mock('argon2', () => ({ hash: jest.fn() }));

const OPERATOR_ID = 'op1';

const USER_ROW = {
  id: 'u1',
  username: 'zhangsan',
  password: 'hash',
  nickname: '张三',
  status: 'ACTIVE',
  avatar: null,
  phone: null,
  email: null,
  sex: null,
  remark: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z'),
  roles: [] as Array<{ roleId: string; role: { code: string } }>
};

describe('UserService', () => {
  let service: UserService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    userRole: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    role: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      userRole: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn()
      },
      role: { findMany: jest.fn() },
      $transaction: jest.fn()
    };
    service = new UserService(prisma as unknown as PrismaService);
    (argon2.hash as jest.Mock).mockResolvedValue('hashed');
  });

  describe('list', () => {
    it('带软删过滤的分页查询，view 剔除 password、roles 为 code 数组', async () => {
      prisma.$transaction.mockResolvedValue([[USER_ROW], 1]);
      const result = await service.list({});
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
          skip: 0,
          take: 10
        })
      );
      expect(result).toEqual({
        items: [expect.objectContaining({ username: 'zhangsan', roles: [] })],
        total: 1,
        page: 1,
        pageSize: 10
      });
      expect(result.items[0]).not.toHaveProperty('password');
    });
  });

  describe('create', () => {
    it('username 预查重命中 → 40900', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({
          username: 'zhangsan',
          password: 'P@ssw0rd!',
          nickname: '张三'
        })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('roleIds 含不存在/已删角色 → 40001（护栏 7）', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.role.findMany.mockResolvedValue([]);
      await expect(
        service.create({
          username: 'a',
          password: 'P@ssw0rd!',
          nickname: 'n',
          roleIds: ['ghost']
        })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：argon2 哈希 + 角色关联 + 默认 ACTIVE（护栏 5）', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.user.create.mockResolvedValue({
        ...USER_ROW,
        roles: [{ roleId: 'r1', role: { code: 'common' } }]
      });
      const view = await service.create({
        username: 'zhangsan',
        password: 'P@ssw0rd!',
        nickname: '张三',
        roleIds: ['r1']
      });
      expect(argon2.hash).toHaveBeenCalledWith('P@ssw0rd!');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: 'hashed',
            status: 'ACTIVE',
            roles: { create: [{ roleId: 'r1' }] }
          })
        })
      );
      expect(view.roles).toEqual(['common']);
    });
  });

  describe('update 护栏', () => {
    it('禁用超管用户 → 40900（护栏 1）', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...USER_ROW, username: 'admin' });
      await expect(
        service.update('u1', { status: 'DISABLED' }, OPERATOR_ID)
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('禁用自己 → 40900（护栏 2）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(
        service.update('u1', { status: 'DISABLED' }, 'u1')
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('修改自己的角色分配 → 40900（护栏 3）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(
        service.update('u1', { roleIds: ['r1'] }, 'u1')
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('目标不存在/已删 → 40404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.update('ghost', { nickname: 'x' }, OPERATOR_ID)
      ).rejects.toMatchObject({ code: BizCode.NOT_FOUND });
    });

    it('成功路径：事务内整体替换角色 + 更新字段（含 password 可选重哈希）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.user.update.mockResolvedValue({ ...USER_ROW, nickname: '新名' });
      const view = await service.update(
        'u1',
        { nickname: '新名', password: 'NewP@ss1', roleIds: ['r1'] },
        OPERATOR_ID
      );
      expect(argon2.hash).toHaveBeenCalledWith('NewP@ss1');
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }
      });
      expect(prisma.userRole.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u1', roleId: 'r1' }]
      });
      expect(view.nickname).toBe('新名');
    });
  });

  describe('remove（软删除）', () => {
    it('目标不存在/已删 → 40404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.remove('u1', OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('禁删超管 → 40900；禁删自己 → 40900', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...USER_ROW, username: 'admin' });
      await expect(service.remove('u1', OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(service.remove('u1', 'u1')).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('软删除写 deletedAt 时间戳（不发生任何硬删除）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.user.update.mockResolvedValue(USER_ROW);
      await service.remove('u1', OPERATOR_ID);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { deletedAt: expect.any(Date) }
      });
    });
  });

  describe('roles 子资源', () => {
    it('rolesOf 只返回活跃角色且先校验主体存活', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.userRole.findMany.mockResolvedValue([
        { roleId: 'r1' },
        { roleId: 'r2' }
      ]);
      await expect(service.roleIdsOf('u1')).resolves.toEqual(['r1', 'r2']);
      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1', role: { deletedAt: null } },
        select: { roleId: true }
      });
    });

    it('setRoles 对自己 → 40900（护栏 3）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      await expect(
        service.setRoles('u1', ['r1'], 'u1')
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('setRoles 成功：事务 deleteMany + createMany（幂等整体替换）', async () => {
      prisma.user.findFirst.mockResolvedValue(USER_ROW);
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      prisma.$transaction.mockResolvedValue(undefined);
      await expect(
        service.setRoles('u1', ['r1', 'r2'], OPERATOR_ID)
      ).resolves.toEqual(['r1', 'r2']);
      expect(prisma.$transaction).toHaveBeenCalledWith([
        expect.anything(),
        expect.anything()
      ]);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/user`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 dto/user.dto.ts**

```ts
// src/modules/system/user/dto/user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import { UserStatus } from '../../../../generated/prisma/client.js';
import { MAX_PAGE_SIZE } from '../../shared/system-shared.js';

export class QueryUsersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: '用户名模糊筛选' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan', description: '用户名（活跃用户内唯一）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @ApiProperty({
    example: 'P@ssw0rd!',
    description: '明文密码，argon2 哈希后落库（护栏 5：新建必填）'
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname!: string;

  @ApiPropertyOptional({ enum: UserStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [0, 1], description: '0 女 / 1 男' })
  @IsOptional()
  @IsIn([0, 1])
  sex?: 0 | 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ type: [String], description: '创建即分配的角色 id' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

/**
 * 护栏 6：username 不可改——本 DTO 不含 username 字段，
 * ValidationPipe whitelist 下多余入参被剥离，防改名绕过护栏 1。
 */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [0, 1] })
  @IsOptional()
  @IsIn([0, 1])
  sex?: 0 | 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({
    example: 'NewP@ss1!',
    description: '可选，传则 argon2 重哈希（护栏 5）'
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '可选，传则整体替换角色分配'
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class SetUserRolesDto {
  @ApiProperty({
    type: [String],
    description: '角色 id 全量替换集（幂等；空数组 = 清空）'
  })
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}
```

- [ ] **Step 4: 实现 user.service.ts**

```ts
// src/modules/system/user/user.service.ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';
import { BizException } from '../../../common/errors/biz.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  alive,
  normalizePageQuery,
  pageResult,
  type PageResult
} from '../shared/system-shared.js';
import { ADMIN_USERNAME } from '../shared/system.constants.js';
import type {
  CreateUserDto,
  QueryUsersDto,
  UpdateUserDto
} from './dto/user.dto.js';

type UserWithRoles = Prisma.UserGetPayload<{
  include: { roles: { include: { role: true } } };
}>;

/** 响应视图：剔除 password，roles 为角色 code 数组（分设计 §3.6/§5.1） */
export interface UserView {
  id: string;
  username: string;
  nickname: string;
  status: string;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  sex: number | null;
  remark: string | null;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryUsersDto): Promise<PageResult<UserView>> {
    const { page, pageSize, skip, take } = normalizePageQuery(query);
    const where: Prisma.UserWhereInput = {
      ...alive(),
      ...(query.username
        ? { username: { contains: query.username, mode: 'insensitive' } }
        : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      this.prisma.user.count({ where })
    ]);
    return pageResult(rows.map(u => this.toView(u)), total, page, pageSize);
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    const duplicate = await this.prisma.user.findFirst({
      where: { username: dto.username, ...alive() },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '用户名已存在');
    }
    const roleIds = await this.assertActiveRoleIds(dto.roleIds ?? []);
    const password = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        password,
        nickname: dto.nickname,
        status: dto.status ?? 'ACTIVE',
        avatar: dto.avatar ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        sex: dto.sex ?? null,
        remark: dto.remark ?? null,
        roles: { create: roleIds.map(roleId => ({ roleId })) }
      },
      include: { roles: { include: { role: true } } }
    });
    return this.toView(user);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    operatorId: string
  ): Promise<UserView> {
    const target = await this.findAliveUser(id);
    // 护栏 1：禁禁用超管（禁删见 remove）
    if (target.username === ADMIN_USERNAME && dto.status === 'DISABLED') {
      throw new BizException(BizCode.CONFLICT, '不能禁用超级管理员用户');
    }
    if (target.id === operatorId) {
      // 护栏 2：不能禁用自己
      if (dto.status === 'DISABLED') {
        throw new BizException(BizCode.CONFLICT, '不能禁用自己');
      }
      // 护栏 3：不能修改自己的角色分配（防剥光自身自锁）
      if (dto.roleIds !== undefined) {
        throw new BizException(BizCode.CONFLICT, '不能修改自己的角色分配');
      }
    }
    const data: Prisma.UserUpdateInput = {};
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.sex !== undefined) data.sex = dto.sex;
    if (dto.remark !== undefined) data.remark = dto.remark;
    if (dto.password !== undefined) {
      data.password = await argon2.hash(dto.password);
    }
    const roleIds =
      dto.roleIds !== undefined
        ? await this.assertActiveRoleIds(dto.roleIds)
        : null;
    const updated = await this.prisma.$transaction(async tx => {
      if (roleIds !== null) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: roleIds.map(roleId => ({ userId: id, roleId }))
        });
      }
      return tx.user.update({
        where: { id },
        data,
        include: { roles: { include: { role: true } } }
      });
    });
    return this.toView(updated);
  }

  /** 软删除（分设计 §4）：写 deletedAt 时间戳，无硬删除 */
  async remove(id: string, operatorId: string): Promise<void> {
    const target = await this.findAliveUser(id);
    if (target.username === ADMIN_USERNAME) {
      throw new BizException(BizCode.CONFLICT, '不能删除超级管理员用户');
    }
    if (target.id === operatorId) {
      throw new BizException(BizCode.CONFLICT, '不能删除自己');
    }
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /** 用户已分配的角色 id 列表（仅活跃角色） */
  async roleIdsOf(id: string): Promise<string[]> {
    await this.findAliveUser(id);
    const rows = await this.prisma.userRole.findMany({
      where: { userId: id, role: { ...alive() } },
      select: { roleId: true }
    });
    return rows.map(r => r.roleId);
  }

  /** 整体替换用户角色（幂等；护栏 3 禁改自己） */
  async setRoles(
    id: string,
    roleIds: string[],
    operatorId: string
  ): Promise<string[]> {
    const target = await this.findAliveUser(id);
    if (target.id === operatorId) {
      throw new BizException(BizCode.CONFLICT, '不能修改自己的角色分配');
    }
    const unique = await this.assertActiveRoleIds(roleIds);
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: unique.map(roleId => ({ userId: id, roleId }))
      })
    ]);
    return unique;
  }

  /** 主体校验统一口径（分设计 §4.1）：不存在或已软删 → 40404 */
  private async findAliveUser(id: string): Promise<UserWithRoles> {
    const user = await this.prisma.user.findFirst({
      where: { id, ...alive() },
      include: { roles: { include: { role: true } } }
    });
    if (!user) {
      throw new BizException(BizCode.NOT_FOUND, '用户不存在或已删除');
    }
    return user;
  }

  /** 护栏 7：分配类入参校验目标存在且活跃；去重防复合主键冲突 */
  private async assertActiveRoleIds(roleIds: string[]): Promise<string[]> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return [];
    const found = await this.prisma.role.findMany({
      where: { id: { in: unique }, ...alive() },
      select: { id: true }
    });
    if (found.length !== unique.length) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        'roleIds 包含不存在或已删除的角色'
      );
    }
    return unique;
  }

  private toView(user: UserWithRoles): UserView {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      status: user.status,
      avatar: user.avatar,
      phone: user.phone,
      email: user.email,
      sex: user.sex,
      remark: user.remark,
      roles: user.roles.map(ur => ur.role.code),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
```

- [ ] **Step 5: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/user`
Expected: PASS。

- [ ] **Step 6: 实现 user.controller.ts**

```ts
// src/modules/system/user/user.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { UserService } from './user.service.js';
import {
  CreateUserDto,
  QueryUsersDto,
  SetUserRolesDto,
  UpdateUserDto
} from './dto/user.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermissions('system:user:query')
  @ApiOperation({ summary: '用户分页列表（username 模糊/status 筛选）' })
  list(@Query() query: QueryUsersDto) {
    return this.users.list(query);
  }

  @Post()
  @RequirePermissions('system:user:add')
  @ApiOperation({ summary: '创建用户（username 预查重；roleIds 创建即分配）' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:user:update')
  @ApiOperation({ summary: '更新用户（username 不可改；password 可选）' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.users.update(id, dto, operator.userId);
  }

  @Delete(':id')
  @RequirePermissions('system:user:delete')
  @ApiOperation({ summary: '删除用户（软删除：写 deletedAt）' })
  async remove(@Param('id') id: string, @CurrentUser() operator: AuthUser) {
    await this.users.remove(id, operator.userId);
    return null;
  }

  @Get(':id/roles')
  @RequirePermissions('system:user:query')
  @ApiOperation({ summary: '用户已分配的活跃角色 id 列表' })
  rolesOf(@Param('id') id: string) {
    return this.users.roleIdsOf(id);
  }

  @Put(':id/roles')
  @RequirePermissions('system:user:update')
  @ApiOperation({ summary: '用户角色整体替换（幂等）' })
  setRoles(
    @Param('id') id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.users.setRoles(id, dto.roleIds, operator.userId);
  }
}
```

- [ ] **Step 7: 实现 system.module.ts 并接入 app.module.ts**

创建 `src/modules/system/system.module.ts`：

```ts
// src/modules/system/system.module.ts
import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';

/** system 域：PrismaModule 是 @Global()，无需再 import */
@Module({
  controllers: [UserController],
  providers: [UserService]
})
export class SystemModule {}
```

修改 `src/app.module.ts`：import 行追加 `import { SystemModule } from './modules/system/system.module.js';`，`imports` 数组中 `AuthModule` 之后追加 `SystemModule`。

- [ ] **Step 8: 全量验证**

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck`
Expected: 无错误。
Run: `pnpm --filter @multi-admin/nestjs-server run test`
Expected: 全量单测通过。
Run: `pnpm format`（仓库根，格式化新文件）随后 `pnpm --filter @multi-admin/nestjs-server run lint`
Expected: lint 通过（--max-warnings 0）。

- [ ] **Step 9: Commit**

```bash
git add apps/nestjs-server/src
git commit -m "feat(server): 用户域 CRUD（软删除 + 护栏 1-3/5-7 + 角色分配子资源）"
```

---

### Task 6: 角色域 CRUD + 护栏

**Files:**
- Create: `src/modules/system/role/dto/role.dto.ts`
- Create: `src/modules/system/role/role.service.ts`
- Create: `src/modules/system/role/role.controller.ts`
- Modify: `src/modules/system/system.module.ts`
- Test: `src/modules/system/role/role.service.spec.ts`

设计依据：分设计 §5.2、§6（护栏 1/7）、§4。`code` 不可改（唯一业务标识）；`roles/all` 不分页全量供用户页下拉；角色-菜单分配走事务 deleteMany + createMany。

- [ ] **Step 1: 写失败测试（role.service.spec.ts）**

创建 `src/modules/system/role/role.service.spec.ts`：

```ts
import { RoleService } from './role.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

const OPERATOR_ID = 'op1';

const ROLE_ROW = {
  id: 'r1',
  code: 'editor',
  name: '编辑',
  status: 'ACTIVE',
  remark: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z'),
  menus: [] as Array<{ menuId: string }>
};

describe('RoleService', () => {
  let service: RoleService;
  let prisma: {
    role: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
    roleMenu: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    menu: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      role: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
      roleMenu: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
      menu: { findMany: jest.fn() },
      $transaction: jest.fn()
    };
    service = new RoleService(prisma as unknown as PrismaService);
  });

  describe('list / all', () => {
    it('list 带软删过滤的分页', async () => {
      prisma.$transaction.mockResolvedValue([[ROLE_ROW], 1]);
      const result = await service.list({});
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null })
        })
      );
      expect(result.total).toBe(1);
    });

    it('all 不分页返回 {id,name,code}', async () => {
      prisma.role.findMany.mockResolvedValue([ROLE_ROW]);
      await expect(service.all()).resolves.toEqual([
        { id: 'r1', name: '编辑', code: 'editor' }
      ]);
    });
  });

  describe('create', () => {
    it('code 预查重命中 → 40900', async () => {
      prisma.role.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(service.create({ code: 'editor', name: '编辑' })).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('menuIds 含已删菜单 → 40001（护栏 7）', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      prisma.menu.findMany.mockResolvedValue([]);
      await expect(
        service.create({ code: 'editor', name: '编辑', menuIds: ['ghost'] })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：事务内写角色 + 菜单关联', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      prisma.menu.findMany.mockResolvedValue([{ id: 'm1' }]);
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
      prisma.role.create.mockResolvedValue({ ...ROLE_ROW, menus: [{ menuId: 'm1' }] });
      const view = await service.create({ code: 'editor', name: '编辑', menuIds: ['m1'] });
      expect(prisma.roleMenu.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'r1', menuId: 'm1' }]
      });
      expect(view.code).toBe('editor');
    });
  });

  describe('update 护栏', () => {
    it('禁用 admin 角色 → 40900（护栏 1）', async () => {
      prisma.role.findFirst.mockResolvedValue({ ...ROLE_ROW, code: 'admin' });
      await expect(service.update('r1', { status: 'DISABLED' }, OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.CONFLICT
      });
    });

    it('目标不存在/已删 → 40404', async () => {
      prisma.role.findFirst.mockResolvedValue(null);
      await expect(service.update('ghost', { name: 'x' }, OPERATOR_ID)).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });
  });

  describe('remove（软删除）', () => {
    it('禁删 admin 角色 → 40900（护栏 1）', async () => {
      prisma.role.findFirst.mockResolvedValue({ ...ROLE_ROW, code: 'admin' });
      await expect(service.remove('r1', OPERATOR_ID)).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('软删除写 deletedAt（关联物理保留，靠查询过滤失效）', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.role.update.mockResolvedValue(ROLE_ROW);
      await service.remove('r1', OPERATOR_ID);
      expect(prisma.role.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { deletedAt: expect.any(Date) }
      });
      // 不触碰 roleMenu（关联物理保留）
      expect(prisma.roleMenu.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('menus 子资源', () => {
    it('menusOf 只返回活跃菜单', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.roleMenu.findMany.mockResolvedValue([{ menuId: 'm1' }]);
      await expect(service.menuIdsOf('r1')).resolves.toEqual(['m1']);
      expect(prisma.roleMenu.findMany).toHaveBeenCalledWith({
        where: { roleId: 'r1', menu: { deletedAt: null } },
        select: { menuId: true }
      });
    });

    it('setMenus 成功：事务 deleteMany + createMany（幂等整体替换）', async () => {
      prisma.role.findFirst.mockResolvedValue(ROLE_ROW);
      prisma.menu.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
      prisma.$transaction.mockResolvedValue(undefined);
      await expect(service.setMenus('r1', ['m1', 'm2'], OPERATOR_ID)).resolves.toEqual(['m1', 'm2']);
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/role`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 dto/role.dto.ts**

```ts
// src/modules/system/role/dto/role.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { RoleStatus } from '../../../../generated/prisma/client.js';
import { MAX_PAGE_SIZE } from '../../shared/system-shared.js';

export class QueryRoleDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: '名称模糊筛选' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '标识模糊筛选' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: RoleStatus })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'editor', description: '角色标识（活跃内唯一，创建后不可改）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*$/, { message: 'code 需字母开头，仅含字母/数字/_/-' })
  code!: string;

  @ApiProperty({ example: '编辑' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ enum: RoleStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ type: [String], description: '创建即分配的菜单 id' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuIds?: string[];
}

/**
 * 护栏：code 不可改——本 DTO 不含 code 字段，whitelist 剥离多余入参。
 * menuIds 可传则整体替换菜单分配。
 */
export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ enum: RoleStatus })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ type: [String], description: '可选，传则整体替换菜单分配' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuIds?: string[];
}

export class AssignRoleMenusDto {
  @ApiProperty({ type: [String], description: '菜单 id 全量替换集（幂等；空数组 = 清空）' })
  @IsArray()
  @IsString({ each: true })
  menuIds!: string[];
}
```

- [ ] **Step 4: 实现 role.service.ts**

```ts
// src/modules/system/role/role.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';
import { BizException } from '../../../common/errors/biz.exception.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import {
  alive,
  normalizePageQuery,
  pageResult,
  type PageResult
} from '../shared/system-shared.js';
import { ADMIN_ROLE_CODE } from '../shared/system.constants.js';
import type {
  CreateRoleDto,
  QueryRoleDto,
  UpdateRoleDto
} from './dto/role.dto.js';

type RoleWithMenus = Prisma.RoleGetPayload<{ include: { menus: true } }>;

/** 响应视图结构（toView 只依赖标量字段，不依赖关联） */
interface RoleLike {
  id: string;
  code: string;
  name: string;
  status: string;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleView {
  id: string;
  code: string;
  name: string;
  status: string;
  remark: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryRoleDto): Promise<PageResult<RoleView>> {
    const { page, pageSize, skip, take } = normalizePageQuery(query);
    const where: Prisma.RoleWhereInput = {
      ...alive(),
      ...(query.name ? { name: { contains: query.name, mode: 'insensitive' } } : {}),
      ...(query.code ? { code: { contains: query.code, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.role.count({ where })
    ]);
    return pageResult(rows.map(r => this.toView(r)), total, page, pageSize);
  }

  /** 不分页全量（用户页下拉，分设计 §5.2） */
  async all(): Promise<Array<{ id: string; name: string; code: string }>> {
    const rows = await this.prisma.role.findMany({
      where: { ...alive() },
      select: { id: true, name: true, code: true },
      orderBy: { createdAt: 'asc' }
    });
    return rows;
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    const duplicate = await this.prisma.role.findFirst({
      where: { code: dto.code, ...alive() },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '角色标识已存在');
    }
    const menuIds = await this.assertActiveMenuIds(dto.menuIds ?? []);
    const role = await this.prisma.$transaction(async tx => {
      const created = await tx.role.create({
        data: {
          code: dto.code,
          name: dto.name,
          status: dto.status ?? 'ACTIVE',
          remark: dto.remark ?? null
        }
      });
      if (menuIds.length > 0) {
        await tx.roleMenu.createMany({
          data: menuIds.map(menuId => ({ roleId: created.id, menuId }))
        });
      }
      return created;
    });
    return this.toView(role);
  }

  async update(id: string, dto: UpdateRoleDto, _operatorId: string): Promise<RoleView> {
    const target = await this.findAliveRole(id);
    // 护栏 1：禁禁用超管角色
    if (target.code === ADMIN_ROLE_CODE && dto.status === 'DISABLED') {
      throw new BizException(BizCode.CONFLICT, '不能禁用超级管理员角色');
    }
    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.remark !== undefined) data.remark = dto.remark;
    const menuIds = dto.menuIds !== undefined ? await this.assertActiveMenuIds(dto.menuIds) : null;
    const updated = await this.prisma.$transaction(async tx => {
      if (menuIds !== null) {
        await tx.roleMenu.deleteMany({ where: { roleId: id } });
        await tx.roleMenu.createMany({
          data: menuIds.map(menuId => ({ roleId: id, menuId }))
        });
      }
      return tx.role.update({ where: { id }, data });
    });
    return this.toView(updated);
  }

  /** 软删除（分设计 §4）：写 deletedAt；UserRole/RoleMenu 关联物理保留，靠查询过滤失效 */
  async remove(id: string, _operatorId: string): Promise<void> {
    const target = await this.findAliveRole(id);
    if (target.code === ADMIN_ROLE_CODE) {
      throw new BizException(BizCode.CONFLICT, '不能删除超级管理员角色');
    }
    await this.prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** 角色已分配的菜单 id 列表（仅活跃菜单） */
  async menuIdsOf(id: string): Promise<string[]> {
    await this.findAliveRole(id);
    const rows = await this.prisma.roleMenu.findMany({
      where: { roleId: id, menu: { ...alive() } },
      select: { menuId: true }
    });
    return rows.map(r => r.menuId);
  }

  /** 整体替换角色菜单（幂等；护栏 7 校验目标活跃） */
  async setMenus(id: string, menuIds: string[], _operatorId: string): Promise<string[]> {
    await this.findAliveRole(id);
    const unique = await this.assertActiveMenuIds(menuIds);
    await this.prisma.$transaction([
      this.prisma.roleMenu.deleteMany({ where: { roleId: id } }),
      this.prisma.roleMenu.createMany({
        data: unique.map(menuId => ({ roleId: id, menuId }))
      })
    ]);
    return unique;
  }

  private async findAliveRole(id: string) {
    const role = await this.prisma.role.findFirst({ where: { id, ...alive() } });
    if (!role) {
      throw new BizException(BizCode.NOT_FOUND, '角色不存在或已删除');
    }
    return role;
  }

  private async assertActiveMenuIds(menuIds: string[]): Promise<string[]> {
    const unique = [...new Set(menuIds)];
    if (unique.length === 0) return [];
    const found = await this.prisma.menu.findMany({
      where: { id: { in: unique }, ...alive() },
      select: { id: true }
    });
    if (found.length !== unique.length) {
      throw new BizException(BizCode.VALIDATION_FAILED, 'menuIds 包含不存在或已删除的菜单');
    }
    return unique;
  }

  private toView(role: RoleLike): RoleView {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      status: role.status,
      remark: role.remark,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt
    };
  }
}
```

注：`create` 直接返回事务内 `tx.role.create` 的结果（不回查，spec 的 prisma mock 因此无需提供 findUniqueOrThrow），`toView` 经 `RoleLike` 结构化接口兼容。`_operatorId` 以 `_` 前缀标注未用（角色域护栏仅针对 admin 标识，无需操作者比对）。

- [ ] **Step 5: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/role`
Expected: PASS。

- [ ] **Step 6: 实现 role.controller.ts**

```ts
// src/modules/system/role/role.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { RoleService } from './role.service.js';
import {
  AssignRoleMenusDto,
  CreateRoleDto,
  QueryRoleDto,
  UpdateRoleDto
} from './dto/role.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '角色分页列表' })
  list(@Query() query: QueryRoleDto) {
    return this.roles.list(query);
  }

  @Get('all')
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '不分页全量（用户页下拉）' })
  all() {
    return this.roles.all();
  }

  @Post()
  @RequirePermissions('system:role:add')
  @ApiOperation({ summary: '创建角色（code 预查重；menuIds 创建即分配）' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:role:update')
  @ApiOperation({ summary: '更新角色（code 不可改；menuIds 可选）' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.roles.update(id, dto, operator.userId);
  }

  @Delete(':id')
  @RequirePermissions('system:role:delete')
  @ApiOperation({ summary: '删除角色（软删除；关联物理保留）' })
  async remove(@Param('id') id: string, @CurrentUser() operator: AuthUser) {
    await this.roles.remove(id, operator.userId);
    return null;
  }

  @Get(':id/menus')
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '角色已分配的活跃菜单 id 列表' })
  menusOf(@Param('id') id: string) {
    return this.roles.menuIdsOf(id);
  }

  @Put(':id/menus')
  @RequirePermissions('system:role:update')
  @ApiOperation({ summary: '角色菜单整体替换（幂等）' })
  setMenus(
    @Param('id') id: string,
    @Body() dto: AssignRoleMenusDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.roles.setMenus(id, dto.menuIds, operator.userId);
  }
}
```

- [ ] **Step 7: 注册到 system.module.ts**

在 `system.module.ts` 的 `controllers` 追加 `RoleController`、`providers` 追加 `RoleService`（并补齐对应 import）。

- [ ] **Step 8: 全量验证**

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck` → 无错误。
Run: `pnpm --filter @multi-admin/nestjs-server run test` → 全量单测通过。
Run: `pnpm format` 随后 `pnpm --filter @multi-admin/nestjs-server run lint` → 通过。

- [ ] **Step 9: Commit**

```bash
git add apps/nestjs-server/src
git commit -m "feat(server): 角色域 CRUD（软删除 + admin 护栏 + 角色菜单分配）"
```

---

### Task 7: 菜单域 CRUD + meta 嵌套校验 + 防环

**Files:**
- Create: `src/modules/system/menu/dto/menu.dto.ts`
- Create: `src/modules/system/menu/menu-tree.ts`
- Create: `src/modules/system/menu/menu.service.ts`
- Create: `src/modules/system/menu/menu.controller.ts`
- Modify: `src/modules/system/system.module.ts`
- Test: `src/modules/system/menu/menu-tree.spec.ts`
- Test: `src/modules/system/menu/menu.service.spec.ts`

设计依据：分设计 §5.3、§6（护栏 4/7）、§3.3、§4.3。菜单删除只标当前节点（不级联、不拒绝）；防环 = service 预校验快速失败 + 事务内更新后回溯祖先链二次校验。

- [ ] **Step 1: 写失败测试（menu-tree.spec.ts）**

创建 `src/modules/system/menu/menu-tree.spec.ts`：

```ts
import { buildMenuTree } from './menu-tree.js';

const row = (
  id: string,
  parentId: string | null,
  sort = 0
) => ({ id, parentId, sort });

describe('buildMenuTree', () => {
  it('按 sort 升序组装父子树', () => {
    const tree = buildMenuTree([
      row('c1', 'p1', 1),
      row('p1', null, 0),
      row('c0', 'p1', 0)
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe('p1');
    expect(tree[0]!.children.map(c => c.id)).toEqual(['c0', 'c1']);
  });

  it('已删父节点的孤儿子树不渲染（父链自然不可见）', () => {
    // p-deleted 不在活跃行集内，其子节点成为孤儿
    const tree = buildMenuTree([row('root', null), row('orphan', 'p-deleted')]);
    expect(tree.map(n => n.id)).toEqual(['root']);
  });

  it('空集返回空数组', () => {
    expect(buildMenuTree([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 实现 menu-tree.ts，跑通测试**

创建 `src/modules/system/menu/menu-tree.ts`：

```ts
// src/modules/system/menu/menu-tree.ts
export interface MenuTreeRow {
  id: string;
  parentId: string | null;
  sort: number;
}

export type MenuTreeNodeOf<T extends MenuTreeRow> = T & {
  children: MenuTreeNodeOf<T>[];
};

/**
 * 全量活跃菜单组装树：按 sort 升序；仅从根（parentId=null）出发，
 * 已软删父节点的孤儿子树自然不可见（分设计 §4.3）。
 */
export function buildMenuTree<T extends MenuTreeRow>(
  rows: T[]
): MenuTreeNodeOf<T>[] {
  const sorted = [...rows].sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, T[]>();
  for (const node of sorted) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const toNode = (node: T): MenuTreeNodeOf<T> => ({
    ...node,
    children: (byParent.get(node.id) ?? []).map(toNode)
  });
  return (byParent.get(null) ?? []).map(toNode);
}
```

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/menu/menu-tree`
Expected: PASS。

- [ ] **Step 3: 写失败测试（menu.service.spec.ts）**

创建 `src/modules/system/menu/menu.service.spec.ts`：

```ts
import { MenuService } from './menu.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';

const MENU_ROW = {
  id: 'm1',
  parentId: null,
  type: 'MENU',
  name: 'SystemUser',
  title: 'menus.pureUser',
  icon: null,
  path: '/system/user/index',
  component: null,
  permission: null,
  sort: 0,
  visible: true,
  meta: null,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z')
};

describe('MenuService', () => {
  let service: MenuService;
  let prisma: {
    menu: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      menu: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn()
      },
      $transaction: jest.fn()
    };
    service = new MenuService(prisma as unknown as PrismaService);
  });

  describe('tree', () => {
    it('全量活跃树：带软删过滤且按树形返回', async () => {
      prisma.menu.findMany.mockResolvedValue([MENU_ROW]);
      const tree = await service.tree();
      expect(prisma.menu.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          orderBy: { sort: 'asc' }
        })
      );
      expect(tree).toHaveLength(1);
      expect(tree[0]).toMatchObject({ name: 'SystemUser', children: [] });
    });
  });

  describe('create', () => {
    it('name 预查重命中 → 40900', async () => {
      prisma.menu.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(
        service.create({ type: 'MENU', name: 'SystemUser', title: 't' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('BUTTON 型 permission 必填 → 40001', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ type: 'BUTTON', name: 'Btn', title: 't' })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('permission 已被活跃菜单占用 → 40900', async () => {
      // 第一次 findFirst（name 查重）返回 null，第二次（permission 查重）命中
      prisma.menu.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'dup' });
      await expect(
        service.create({
          type: 'BUTTON',
          name: 'Btn',
          title: 't',
          permission: 'system:user:add'
        })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('父菜单不存在/已删 → 40001（护栏 7）', async () => {
      prisma.menu.findFirst
        .mockResolvedValueOnce(null) // name 查重
        .mockResolvedValueOnce(null); // parent 存活校验
      await expect(
        service.create({
          type: 'MENU',
          name: 'Child',
          title: 't',
          parentId: 'ghost'
        })
      ).rejects.toMatchObject({ code: BizCode.VALIDATION_FAILED });
    });

    it('创建成功：meta 展开写入 + 默认值（sort=0 visible=true）', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      prisma.menu.create.mockResolvedValue(MENU_ROW);
      await service.create({
        type: 'MENU',
        name: 'SystemUser',
        title: 't',
        meta: { keepAlive: true }
      });
      expect(prisma.menu.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sort: 0,
          visible: true,
          meta: { keepAlive: true }
        })
      });
    });
  });

  describe('update（防环护栏 4）', () => {
    it('目标不存在/已删 → 40404', async () => {
      prisma.menu.findFirst.mockResolvedValue(null);
      await expect(service.update('ghost', {})).rejects.toMatchObject({
        code: BizCode.NOT_FOUND
      });
    });

    it('parentId 指向自身 → 40900（快速失败）', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW);
      await expect(
        service.update('m1', { parentId: 'm1' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });

    it('事务内更新后回溯祖先链检出环 → 40900', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW); // 目标存活
      prisma.menu.findFirst.mockResolvedValueOnce(MENU_ROW); // 目标存活
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)
      );
      prisma.menu.update.mockResolvedValue({ ...MENU_ROW, parentId: 'm2' });
      // 回溯链：m2 的父指向 m1 → 成环
      prisma.menu.findFirst
        .mockResolvedValueOnce({ parentId: 'm2' }) // 更新后的自身
        .mockResolvedValueOnce({ parentId: 'm1' }); // m2 的父
      await expect(
        service.update('m1', { parentId: 'm2' })
      ).rejects.toMatchObject({ code: BizCode.CONFLICT });
    });
  });

  describe('remove', () => {
    it('软删只标当前节点（不拒绝有子菜单，不级联）', async () => {
      prisma.menu.findFirst.mockResolvedValue(MENU_ROW);
      prisma.menu.update.mockResolvedValue(MENU_ROW);
      await service.remove('m1');
      expect(prisma.menu.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { deletedAt: expect.any(Date) }
      });
    });
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/menu`
Expected: menu-tree 用例 PASS；menu.service 用例 FAIL（模块不存在）。

- [ ] **Step 5: 实现 dto/menu.dto.ts**

```ts
// src/modules/system/menu/dto/menu.dto.ts
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { MenuType } from '../../../../generated/prisma/client.js';
import { MenuMetaDto } from '../../shared/menu-meta.dto.js';

export class CreateMenuDto {
  @ApiProperty({
    enum: MenuType,
    description: 'P5 前端负责 mock 数字 ↔ 枚举映射（分设计 §12 备案 2）'
  })
  @IsEnum(MenuType)
  type!: MenuType;

  @ApiPropertyOptional({ description: '父菜单 id，空为顶层' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: 'SystemUser', description: '路由名（活跃内唯一）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ example: 'menus.pureUser', description: 'i18n key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  component?: string;

  @ApiPropertyOptional({
    example: 'system:user:add',
    description: 'BUTTON 型必填（service 层校验）'
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  permission?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ default: true, description: 'showLink 的单一语义源' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({
    type: MenuMetaDto,
    description: '前端路由元数据（整体替换，写路径嵌套校验）'
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuMetaDto)
  meta?: MenuMetaDto;
}

/** 可改字段含 parentId（移动节点，防环见 service 护栏 4）与 meta 整体替换 */
export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
```

- [ ] **Step 6: 实现 menu.service.ts**

```ts
// src/modules/system/menu/menu.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { BizCode } from '../../../common/errors/biz-code.js';
import { BizException } from '../../../common/errors/biz.exception.js';
import type { Menu, Prisma } from '../../../generated/prisma/client.js';
import { alive, type MenuMeta } from '../shared/system-shared.js';
import { buildMenuTree, type MenuTreeNodeOf } from './menu-tree.js';
import type { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto.js';

export type MenuTreeNode = MenuTreeNodeOf<Menu>;

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全量活跃树（无分页），按 sort 升序（分设计 §5.3） */
  async tree(): Promise<MenuTreeNode[]> {
    const rows = await this.prisma.menu.findMany({
      where: { ...alive() },
      orderBy: { sort: 'asc' }
    });
    return buildMenuTree(rows);
  }

  async create(dto: CreateMenuDto): Promise<Menu> {
    await this.assertNameUnique(dto.name, null);
    this.assertButtonPermission(dto.type, dto.permission ?? null);
    if (dto.permission) {
      await this.assertPermissionUnique(dto.permission, null);
    }
    await this.assertParentAlive(dto.parentId ?? null);
    return this.prisma.menu.create({
      data: {
        type: dto.type,
        parentId: dto.parentId ?? null,
        name: dto.name,
        title: dto.title,
        icon: dto.icon ?? null,
        path: dto.path ?? null,
        component: dto.component ?? null,
        permission: dto.permission ?? null,
        sort: dto.sort ?? 0,
        visible: dto.visible ?? true,
        // class 实例展开为纯对象再写入 Json 列
        meta: dto.meta ? { ...dto.meta } : null
      }
    });
  }

  async update(id: string, dto: UpdateMenuDto): Promise<Menu> {
    const target = await this.findAliveMenu(id);
    if (dto.name !== undefined && dto.name !== target.name) {
      await this.assertNameUnique(dto.name, id);
    }
    const effectiveType = dto.type ?? target.type;
    const effectivePermission =
      dto.permission !== undefined ? dto.permission : target.permission;
    this.assertButtonPermission(effectiveType, effectivePermission);
    if (dto.permission !== undefined && dto.permission !== null) {
      await this.assertPermissionUnique(dto.permission, id);
    }
    if (dto.parentId !== undefined && dto.parentId !== target.parentId) {
      // 防环快速失败（护栏 4 第一层）
      if (dto.parentId !== null) {
        if (dto.parentId === id) {
          throw new BizException(BizCode.CONFLICT, '父菜单不能是自身');
        }
        await this.assertParentAlive(dto.parentId);
      }
    }
    const data: Prisma.MenuUpdateInput = {};
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.icon !== undefined) data.icon = dto.icon;
    if (dto.path !== undefined) data.path = dto.path;
    if (dto.component !== undefined) data.component = dto.component;
    if (dto.permission !== undefined) data.permission = dto.permission;
    if (dto.sort !== undefined) data.sort = dto.sort;
    if (dto.visible !== undefined) data.visible = dto.visible;
    if (dto.meta !== undefined) {
      data.meta = dto.meta ? { ...dto.meta } : null;
    }
    return this.prisma.$transaction(async tx => {
      const updated = await tx.menu.update({ where: { id }, data });
      // 防环二次校验（护栏 4 第二层）：同事务内更新后回溯祖先链，兕底并发窗口
      await this.assertNoCycle(tx, id);
      return updated;
    });
  }

  /** 软删只标当前节点：不级联、不因有子菜单拒绝（分设计 §4.3） */
  async remove(id: string): Promise<void> {
    await this.findAliveMenu(id);
    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  /**
   * 回溯祖先链检环：visited 从自身出发，若链上重遇已访问节点即成环。
   * 遍历不过滤软删节点（parentId 物理指针仍存在，环检测看物理链）。
   */
  private async assertNoCycle(
    tx: Prisma.TransactionClient,
    id: string
  ): Promise<void> {
    const self = await tx.menu.findFirst({
      where: { id },
      select: { parentId: true }
    });
    const visited = new Set<string>([id]);
    let cursor = self?.parentId ?? null;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        throw new BizException(BizCode.CONFLICT, '菜单父子关系检测到循环引用');
      }
      visited.add(cursor);
      const parent = await tx.menu.findFirst({
        where: { id: cursor },
        select: { parentId: true }
      });
      cursor = parent?.parentId ?? null;
    }
  }

  private async findAliveMenu(id: string): Promise<Menu> {
    const menu = await this.prisma.menu.findFirst({
      where: { id, ...alive() }
    });
    if (!menu) {
      throw new BizException(BizCode.NOT_FOUND, '菜单不存在或已删除');
    }
    return menu;
  }

  private async assertNameUnique(
    name: string,
    excludeId: string | null
  ): Promise<void> {
    const duplicate = await this.prisma.menu.findFirst({
      where: {
        name,
        ...alive(),
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '菜单名称已存在');
    }
  }

  private async assertPermissionUnique(
    permission: string,
    excludeId: string | null
  ): Promise<void> {
    const duplicate = await this.prisma.menu.findFirst({
      where: {
        permission,
        ...alive(),
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new BizException(BizCode.CONFLICT, '权限点已被其他活跃菜单占用');
    }
  }

  private assertButtonPermission(
    type: string,
    permission: string | null
  ): void {
    if (type === 'BUTTON' && !permission) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        'BUTTON 型菜单必须提供 permission'
      );
    }
  }

  private async assertParentAlive(parentId: string | null): Promise<void> {
    if (parentId === null) return;
    const parent = await this.prisma.menu.findFirst({
      where: { id: parentId, ...alive() },
      select: { id: true }
    });
    if (!parent) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        '父菜单不存在或已删除'
      );
    }
  }
}
```

- [ ] **Step 7: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/system/menu`
Expected: PASS。若「回溯祖先链检出环」用例的 mock 次序与实际调用不符，按实际 findFirst 调用序列调整 mockResolvedValueOnce 链（不修改实现逻辑）。

- [ ] **Step 8: 实现 menu.controller.ts**

```ts
// src/modules/system/menu/menu.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { MenuService } from './menu.service.js';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/menus')
export class MenuController {
  constructor(private readonly menus: MenuService) {}

  @Get()
  @RequirePermissions('system:menu:query')
  @ApiOperation({ summary: '全量活跃菜单树（无分页，按 sort 升序）' })
  tree() {
    return this.menus.tree();
  }

  @Post()
  @RequirePermissions('system:menu:add')
  @ApiOperation({ summary: '创建菜单（name/permission 预查重；meta 嵌套校验）' })
  create(@Body() dto: CreateMenuDto) {
    return this.menus.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:menu:update')
  @ApiOperation({ summary: '更新菜单（含移动节点，防环双层校验）' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuDto) {
    return this.menus.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('system:menu:delete')
  @ApiOperation({ summary: '软删除当前节点（不级联子树）' })
  async remove(@Param('id') id: string) {
    await this.menus.remove(id);
    return null;
  }
}
```

- [ ] **Step 9: 注册到 system.module.ts**

`controllers` 追加 `MenuController`、`providers` 追加 `MenuService`（补齐 import）。

- [ ] **Step 10: 全量验证**

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck` → 无错误。
Run: `pnpm --filter @multi-admin/nestjs-server run test` → 全量单测通过。
Run: `pnpm format` 随后 `pnpm --filter @multi-admin/nestjs-server run lint` → 通过。

- [ ] **Step 11: Commit**

```bash
git add apps/nestjs-server/src
git commit -m "feat(server): 菜单域 CRUD（meta 嵌套校验 + 防环双层校验 + 软删只标当前节点）"
```

---

### Task 8: route-tree 增强（枚举分支 / meta 透传 / showLink）

**Files:**
- Modify: `src/modules/auth/route-tree.ts`
- Modify: `src/modules/auth/auth.service.ts`（仅 getAsyncRoutes 一处类型断言）
- Test: `src/modules/auth/route-tree.spec.ts`

设计依据：分设计 §3.3、§9（route-tree 随 Menu 改造增强）、§10 风险 1（组装逻辑只增不改既有字段输出，P3 断言原样通过为回归门禁）。软删过滤已在 Task 2 完成，本任务只做**节点形态增强**：

1. `MenuRouteRow` 增加 `visible` 与 `meta` 字段，type 联合扩 `IFRAME | EXTERNAL`；
2. 路由型节点过滤从 `type === 'MENU'` 改为 `type !== 'BUTTON'`（IFRAME/EXTERNAL 同样进路由树，iframe 内容/外链地址由 meta.frameSrc 承载，seed 只用 MENU/BUTTON 不受影响）；
3. 所有节点 meta 输出 `showLink = visible`（单一语义源），并透传 `meta Json` 已校验字段（写时校验、读时信任）。

- [ ] **Step 1: 写失败测试（route-tree.spec.ts 增改）**

1. `row` helper 默认值补两个新字段（既有 fixture 零改动即兼容）：

```ts
const row = (
  partial: Partial<MenuRouteRow> & Pick<MenuRouteRow, 'id' | 'name'>
): MenuRouteRow => ({
  parentId: null,
  type: 'MENU',
  title: partial.name,
  icon: null,
  path: null,
  component: null,
  sort: 0,
  visible: true,
  meta: null,
  ...partial
});
```

2. 在 `describe('buildRouteTree')` 内既有用例之后追加：

```ts
  it('IFRAME/EXTERNAL 型进树，BUTTON 仍过滤', () => {
    const tree = buildRouteTree(
      [
        row({ id: 'm1', name: 'Frame', type: 'IFRAME', path: '/frame' }),
        row({ id: 'm2', name: 'Link', type: 'EXTERNAL', path: 'https://example.com' }),
        row({ id: 'b1', name: 'Btn', type: 'BUTTON' })
      ],
      ['common']
    );
    expect(tree.map(n => n.path)).toEqual(['/frame', 'https://example.com']);
  });

  it('showLink 输出为 visible；meta 字段透传且内置字段后置写入', () => {
    const tree = buildRouteTree(
      [
        row({
          id: 'm1',
          name: 'Hidden',
          path: '/hidden',
          visible: false,
          meta: { keepAlive: true, frameSrc: 'https://x.com' }
        })
      ],
      ['common']
    );
    expect(tree[0].meta.showLink).toBe(false);
    expect(tree[0].meta.keepAlive).toBe(true);
    expect(tree[0].meta.frameSrc).toBe('https://x.com');
    // title 等内置字段后置写入，任何透传字段都无法覆盖（MenuMeta 类型亦不含 title）
    expect(tree[0].meta.title).toBe('Hidden');
  });

  it('visible=true 时 showLink 为 true（默认形态回归）', () => {
    const tree = buildRouteTree(rows, ['common']);
    expect(tree[1].meta.showLink).toBe(true);
    expect(tree[1].children![0].meta.showLink).toBe(true);
  });
```

3. 既有用例的精确断言同步补新增字段（「只增不改既有字段输出」的自然结果，既有字段值均不变）：顶层 `expect(sys.meta).toEqual({ rank: 1, title: 'System', icon: 'ri:settings-3-line' })` 改为 `toEqual({ rank: 1, title: 'System', icon: 'ri:settings-3-line', showLink: true })`；叶子 `toMatchObject` 的 meta 改为 `{ title: 'SystemUser', roles: ['common'], icon: 'ri:admin-line', showLink: true }`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/route-tree.spec.ts`
Expected: FAIL（类型错误：row 缺 visible/meta；新用例断言失败：showLink undefined）。

- [ ] **Step 3: 实现 route-tree.ts**

整文件替换为：

```ts
import type { MenuMeta } from '../system/shared/system-shared.js';

export interface MenuRouteRow {
  id: string;
  parentId: string | null;
  type: 'MENU' | 'IFRAME' | 'EXTERNAL' | 'BUTTON';
  name: string;
  title: string;
  icon: string | null;
  path: string | null;
  component: string | null;
  sort: number;
  visible: boolean;
  meta: MenuMeta | null;
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
    showLink?: boolean;
  } & Partial<MenuMeta>;
  children?: RouteNode[];
}

/**
 * 路由型节点（MENU/IFRAME/EXTERNAL）按 parentId 组装树：
 * 顶层组带 rank（sort），叶子带 name/component 与可见角色集；按 sort 升序。
 * showLink = visible（单一语义源，分设计 §3.3）；meta Json 写时校验、读时透传。
 */
export function buildRouteTree(
  menus: MenuRouteRow[],
  roleCodes: string[]
): RouteNode[] {
  const nodes = menus
    .filter(m => m.type !== 'BUTTON')
    .sort((a, b) => a.sort - b.sort);
  const byParent = new Map<string | null, MenuRouteRow[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const toNode = (menu: MenuRouteRow, isTop: boolean): RouteNode => {
    const children = (byParent.get(menu.id) ?? []).map(c => toNode(c, false));
    // meta 透传先展开，内置字段（title/rank/roles/showLink/icon）后置写入防覆盖
    const node: RouteNode = {
      path: menu.path ?? '',
      meta: {
        ...(menu.meta ?? {}),
        title: menu.title,
        showLink: menu.visible,
        ...(isTop ? { rank: menu.sort } : { roles: roleCodes })
      }
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

- [ ] **Step 4: 运行测试确认全绿**

Run: `pnpm --filter @multi-admin/nestjs-server run test -- src/modules/auth/route-tree.spec.ts`
Expected: PASS（含既有断言回归，Step 1 第 3 点已同步补 showLink 字段）。

- [ ] **Step 5: 适配 auth.service.ts 的 getAsyncRoutes**

Task 2 已把两处查询加 `deletedAt: null`。Prisma `menu.findMany` 无 select 时返回完整行，`meta` 静态类型为 `JsonValue`，与 `MenuRouteRow['meta']`（`MenuMeta | null`）不直接兼容，需一处断言：

```ts
  /** get-async-routes：角色可见路由型节点树（软删过滤见查询） */
  async getAsyncRoutes(user: AuthUser) {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: user.roles }, deletedAt: null },
      select: { id: true, code: true }
    });
    const menus = await this.prisma.menu.findMany({
      where: {
        deletedAt: null,
        roles: { some: { roleId: { in: roles.map(r => r.id) } } }
      }
    });
    // meta 为写路径已校验的 MenuMeta（读时信任，分设计 §3.3）
    return buildRouteTree(menus as MenuRouteRow[], user.roles);
  }
```

import 追加：`import { buildRouteTree, type MenuRouteRow } from './route-tree.js';`（合并既有 import 行）。

- [ ] **Step 6: 全量回归**

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck` → 无错误。
Run: `pnpm --filter @multi-admin/nestjs-server run test` → 全量单测通过（auth.service.spec 的 getAsyncRoutes 用例不受影响：断言只看 where）。
Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e` → auth/health e2e 全部原样通过（分设计 §10 风险 1 回归门禁；get-async-routes 断言若含 meta 精确对象匹配，新增 showLink 字段属「只增不改」，按 Step 4 同口径补字段，不改语义）。

- [ ] **Step 7: Commit**

```bash
git add apps/nestjs-server/src/modules/auth
git commit -m "feat(server): route-tree 增强（IFRAME/EXTERNAL 分支 + meta 透传 + showLink=visible）"
```

---

### Task 9: system e2e 四类示范用例

**Files:**
- Create: `test/system.e2e-spec.ts`

设计依据：分设计 §8。四类用例：CRUD 全链路（含软删断言组）/ 授权矩阵 / 护栏 / 写后读一致性。关键约束：

- **套件级 beforeAll FLUSHDB**（分设计 §8 隔离固化）：限流计数器存 Redis 且按 IP 聚合，跨 spec 文件同分钟累积会击穿 60 次/分全局与 5 次/分登录限额触发 42901 flaky。FLUSHDB 安全：seed 在 Postgres，Redis 侧仅限流计数与会话状态；JWT 无状态 + JwtAuthGuard 实时查库，套件启动时预登录缓存的令牌在 flush 后仍可解析。
- **令牌缓存复用**：admin/common 各登录一次后全套件复用（登录限额 5 次/分），整套件新增登录仅 2 次（授权矩阵临时用户 + 一致性组幽灵用户）。
- **直库断言**：用独立 PrismaClient（与 e2e-env.ts 同构法）断言 deletedAt 等库层事实。

- [ ] **Step 1: 创建 test/system.e2e-spec.ts（全文）**

```ts
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Redis } from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { COMMON_PASSWORD } from './helpers/auth.js';

const ADMIN_PASSWORD = 'e2e-admin-password';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface LoginData {
  username: string;
  roles: string[];
  permissions: string[];
  accessToken: string;
  refreshToken: string;
}

interface UserInfo {
  username: string;
  roles: string[];
  permissions: string[];
}

describe('system RBAC CRUD (e2e)', () => {
  let app: INestApplication<Server>;
  let redis: Redis;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public'
    })
  });
  let adminToken = '';
  let commonToken = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    redis = app.get(REDIS_CLIENT);
    // 套件级 FLUSHDB：重置限流计数，防跨 spec 文件同分钟累积击穿限额（分设计 §8）
    await redis.flushdb();
    // 预登录缓存令牌：登录限额 5 次/分，全套件只登录 admin/common 各一次
    adminToken = await loginToken('admin', ADMIN_PASSWORD);
    commonToken = await loginToken('common', COMMON_PASSWORD);
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const server = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (method: 'get' | 'post' | 'put' | 'delete', url: string) =>
    server() [method] (`/api/v1${url}`);
  const expectData = async <T>(req: request.Test): Promise<T> => {
    const res = await req;
    expect(res.status).toBeLessThan(300);
    const body = res.body as Envelope<T>;
    expect(body.code).toBe(0);
    return body.data;
  };
  const expectError = async (
    req: request.Test,
    status: number,
    code: number
  ): Promise<string> => {
    const res = await req;
    expect(res.status).toBe(status);
    const body = res.body as Envelope<unknown>;
    expect(body.code).toBe(code);
    return body.message;
  };
  const loginToken = async (username: string, password: string) => {
    const res = await api('post', '/auth/login')
      .send({ username, password })
      .expect(200);
    return (res.body as Envelope<LoginData>).data.accessToken;
  };
  const adminUser = () =>
    prisma.user.findFirstOrThrow({
      where: { username: 'admin', deletedAt: null }
    });
  const adminRole = () =>
    prisma.role.findFirstOrThrow({ where: { code: 'admin', deletedAt: null } });

  // ---------- 类 1：CRUD 全链路（含软删断言组） ----------
  describe('CRUD 全链路', () => {
    it('用户域：创建 → 分页/筛选 → 更新 → 角色分配往返 → 软删语义', async () => {
      const role = await adminRole();
      const created = await expectData<{
        id: string;
        username: string;
        roles: string[];
      }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-crud-user',
            password: 'e2e-crud-password',
            nickname: 'CRUD 用户',
            roleIds: [role.id]
          })
      );
      expect(created.username).toBe('e2e-crud-user');
      expect(created.roles).toEqual(['admin']);

      const page = await expectData<{
        items: { username: string }[];
        total: number;
        page: number;
        pageSize: number;
      }>(
        api('get', '/system/users?page=1&pageSize=10&username=e2e-crud')
          .set(bearer(adminToken))
      );
      expect(page.items.map(i => i.username)).toContain('e2e-crud-user');
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(10);

      const updated = await expectData<{ nickname: string; status: string }>(
        api('put', `/system/users/${created.id}`)
          .set(bearer(adminToken))
          .send({ nickname: '已更新' })
      );
      expect(updated.nickname).toBe('已更新');

      const roleIds = await expectData<string[]>(
        api('get', `/system/users/${created.id}/roles`).set(bearer(adminToken))
      );
      expect(roleIds).toEqual([role.id]);
      await expectData(
        api('put', `/system/users/${created.id}/roles`)
          .set(bearer(adminToken))
          .send({ roleIds: [] })
      );
      expect(
        await expectData<string[]>(
          api('get', `/system/users/${created.id}/roles`).set(
            bearer(adminToken)
          )
        )
      ).toEqual([]);

      await expectData(
        api('delete', `/system/users/${created.id}`).set(bearer(adminToken))
      );
      // 软删断言组：列表不可见 / 同名可再建（部分唯一索引）/ 重复删 40404
      const afterDelete = await expectData<{ items: { username: string }[] }>(
        api('get', '/system/users?username=e2e-crud').set(bearer(adminToken))
      );
      expect(afterDelete.items.map(i => i.username)).not.toContain(
        'e2e-crud-user'
      );
      await expectData(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-crud-user',
            password: 'e2e-crud-password',
            nickname: '同名重建'
          })
      );
      await expectError(
        api('delete', `/system/users/${created.id}`).set(bearer(adminToken)),
        404,
        40404
      );
    });

    it('角色域：创建 → 菜单分配往返 → 软删后 users/roles 与 roles/all 均不可见', async () => {
      const created = await expectData<{ id: string; code: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-crud-role', name: 'CRUD 角色' })
      );

      const menus = await prisma.menu.findMany({
        where: { name: { in: ['System', 'SystemUser'] }, deletedAt: null }
      });
      await expectData(
        api('put', `/system/roles/${created.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: menus.map(m => m.id) })
      );
      expect(
        await expectData<string[]>(
          api('get', `/system/roles/${created.id}/menus`).set(
            bearer(adminToken)
          )
        )
      ).toEqual(expect.arrayContaining(menus.map(m => m.id)));

      await expectData(
        api('delete', `/system/roles/${created.id}`).set(bearer(adminToken))
      );
      const dbRole = await prisma.role.findUnique({
        where: { id: created.id }
      });
      expect(dbRole?.deletedAt).not.toBeNull();
      const all = await expectData<{ code: string }[]>(
        api('get', '/system/roles/all').set(bearer(adminToken))
      );
      expect(all.map(r => r.code)).not.toContain('e2e-crud-role');
    });

    it('菜单域：建树 → 树可见 → 软删后树不可见且子树物理保留', async () => {
      const group = await expectData<{ id: string }>(
        api('post', '/system/menus')
          .set(bearer(adminToken))
          .send({ type: 'MENU', name: 'E2EGroup', title: 'e2e 组', path: '/e2e' })
      );
      const page = await expectData<{ id: string }>(
        api('post', '/system/menus')
          .set(bearer(adminToken))
          .send({
            type: 'MENU',
            name: 'E2EPage',
            title: 'e2e 页',
            path: '/e2e/page',
            parentId: group.id
          })
      );

      const tree = await expectData<
        { name?: string; children?: unknown[] }[]
      >(api('get', '/system/menus').set(bearer(adminToken)));
      const found = JSON.stringify(tree);
      expect(found).toContain('E2EGroup');
      expect(found).toContain('E2EPage');

      await expectData(
        api('delete', `/system/menus/${group.id}`).set(bearer(adminToken))
      );
      const afterDelete = JSON.stringify(
        await expectData(api('get', '/system/menus').set(bearer(adminToken)))
      );
      expect(afterDelete).not.toContain('E2EGroup');
      expect(afterDelete).not.toContain('E2EPage');
      // §4.3：只标当前节点，子节点物理保留（孤儿不可见）
      const child = await prisma.menu.findUnique({ where: { id: page.id } });
      expect(child?.deletedAt).toBeNull();
      expect(child?.parentId).toBe(group.id);
    });
  });

  // ---------- 类 2：授权矩阵 ----------
  describe('授权矩阵', () => {
    it('单权限点角色：查询过、写操作 40301；admin 通配全过；未登录 40101', async () => {
      // 套件内建专用角色，只挂 system:user:query 一点（不动共享 common 角色）
      const role = await expectData<{ id: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-matrix-role', name: '矩阵角色' })
      );
      const btn = await prisma.menu.findFirstOrThrow({
        where: { permission: 'system:user:query', deletedAt: null }
      });
      await expectData(
        api('put', `/system/roles/${role.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: [btn.id] })
      );
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-matrix-user',
            password: 'e2e-matrix-password',
            nickname: '矩阵用户',
            roleIds: [role.id]
          })
      );
      const token = await loginToken('e2e-matrix-user', 'e2e-matrix-password');

      const page = await expectData<{ items: unknown[] }>(
        api('get', '/system/users').set(bearer(token))
      );
      expect(Array.isArray(page.items)).toBe(true);
      await expectError(
        api('post', '/system/users')
          .set(bearer(token))
          .send({
            username: 'x',
            password: 'y',
            nickname: 'z'
          }),
        403,
        40301
      );
      await expectError(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(token)),
        403,
        40301
      );

      // admin 通配 *:*:*：同一批端点全过
      await expectData<{ items: unknown[] }>(
        api('get', '/system/roles').set(bearer(adminToken))
      );
      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );

      // 未登录
      await expectError(api('get', '/system/users'), 401, 40101);
    });
  });

  // ---------- 类 3：护栏 ----------
  describe('护栏', () => {
    it('禁删/禁禁用内置 admin（40900）', async () => {
      const admin = await adminUser();
      const adminRoleId = (await adminRole()).id;
      expect(
        await expectError(
          api('delete', `/system/users/${admin.id}`).set(bearer(adminToken)),
          409,
          40900
        )
      ).toContain('admin');
      expect(
        await expectError(
          api('put', `/system/users/${admin.id}`)
            .set(bearer(adminToken))
            .send({ status: 'DISABLED' }),
          409,
          40900
        )
      ).toContain('admin');
      expect(
        await expectError(
          api('delete', `/system/roles/${adminRoleId}`).set(
            bearer(adminToken)
          ),
          409,
          40900
        )
      ).toContain('admin');
      expect(
        await expectError(
          api('put', `/system/roles/${adminRoleId}`)
            .set(bearer(adminToken))
            .send({ status: 'DISABLED' }),
          409,
          40900
        )
      ).toContain('admin');
    });

    it('禁操作自己：禁用自己/删除自己/改自己角色分配（40900）', async () => {
      const role = await expectData<{ id: string }>(
        api('post', '/system/roles')
          .set(bearer(adminToken))
          .send({ code: 'e2e-guard-role', name: '护栏角色' })
      );
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-guard-user',
            password: 'e2e-guard-password',
            nickname: '护栏用户',
            roleIds: [role.id]
          })
      );
      const token = await loginToken('e2e-guard-user', 'e2e-guard-password');

      await expectError(
        api('put', `/system/users/${tempUser.id}`)
          .set(bearer(token))
          .send({ status: 'DISABLED' }),
        409,
        40900
      );
      await expectError(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(token)),
        409,
        40900
      );
      await expectError(
        api('put', `/system/users/${tempUser.id}`)
          .set(bearer(token))
          .send({ roleIds: [] }),
        409,
        40900
      );
      await expectError(
        api('put', `/system/users/${tempUser.id}/roles`)
          .set(bearer(token))
          .send({ roleIds: [] }),
        409,
        40900
      );

      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );
    });

    it('菜单防环：父节点指向自身 40900', async () => {
      const menu = await expectData<{ id: string }>(
        api('post', '/system/menus')
          .set(bearer(adminToken))
          .send({
            type: 'MENU',
            name: 'E2ECycle',
            title: '防环用例',
            path: '/cycle'
          })
      );
      expect(
        await expectError(
          api('put', `/system/menus/${menu.id}`)
            .set(bearer(adminToken))
            .send({ parentId: menu.id }),
          409,
          40900
        )
      ).toContain('环');
      await expectData(
        api('delete', `/system/menus/${menu.id}`).set(bearer(adminToken))
      );
    });
  });

  // ---------- 类 4：写后读一致性 ----------
  describe('写后读一致性', () => {
    it('改角色-菜单关联后，common 权限集与路由树下一请求即时变化', async () => {
      const commonRole = await prisma.role.findFirstOrThrow({
        where: { code: 'common', deletedAt: null }
      });
      const baseline = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(baseline.permissions).toContain('system:user:query');

      // 摘除全部菜单 → 权限点与路由树即时清空
      await expectData(
        api('put', `/system/roles/${commonRole.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: [] })
      );
      const emptied = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(emptied.permissions).not.toContain('system:user:query');
      const routes = await expectData<unknown[]>(
        api('get', '/auth/get-async-routes').set(bearer(commonToken))
      );
      expect(routes).toEqual([]);

      // 恢复既有绑定（System 组 + SystemUser 页 + query 按钮，对齐 helpers/auth.ts）
      const menus = await prisma.menu.findMany({
        where: {
          name: { in: ['System', 'SystemUser', 'SystemUser:query'] },
          deletedAt: null
        }
      });
      await expectData(
        api('put', `/system/roles/${commonRole.id}/menus`)
          .set(bearer(adminToken))
          .send({ menuIds: menus.map(m => m.id) })
      );
      const restored = await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(commonToken))
      );
      expect(restored.permissions).toContain('system:user:query');
    });

    it('软删用户后其旧令牌下一请求 40101（P3 实时查库 + 软删过滤）', async () => {
      const tempUser = await expectData<{ id: string }>(
        api('post', '/system/users')
          .set(bearer(adminToken))
          .send({
            username: 'e2e-ghost-user',
            password: 'e2e-ghost-password',
            nickname: '幽灵用户'
          })
      );
      const token = await loginToken('e2e-ghost-user', 'e2e-ghost-password');
      await expectData<UserInfo>(
        api('get', '/auth/get-user-info').set(bearer(token))
      );

      await expectData(
        api('delete', `/system/users/${tempUser.id}`).set(bearer(adminToken))
      );
      await expectError(
        api('get', '/auth/get-user-info').set(bearer(token)),
        401,
        40101
      );
    });
  });
});
```

- [ ] **Step 2: 运行 system e2e**

Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e -- test/system.e2e-spec.ts`
Expected: 全绿。常见失败排查：
- 42901：套件内登录次数超预支（每套件只允许新增登录 2 次：矩阵临时用户 + 幽灵用户；护栏组与 CRUD 组不得新增登录）；
- 护栏组 message 断言 `toContain('admin')`/`toContain('环')` 与实际文案不符：按 Task 5/7 实现的实际 message 调整断言关键词（不改实现）；
- 时序：用例间共享库状态，若并发执行（jest 默认单 worker 串行执行 spec 文件，套件内 describe 串行）不成立再排查。

- [ ] **Step 3: e2e 全量回归**

Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e`
Expected: auth/health/system 全部通过（套件各自 beforeAll FLUSHDB，互不污染限流计数）。

- [ ] **Step 4: Commit**

```bash
git add apps/nestjs-server/test
git commit -m "test(server): system e2e 四类示范用例（CRUD/授权矩阵/护栏/写后读一致性）"
```

---

### Task 10: 合并覆盖率流水线（istanbul 官方库 + 双报表 + 门禁）

**Files:**
- Modify: `package.json`（devDependencies + scripts）
- Modify: `test/jest.base.cjs`
- Modify: `jest.config.cjs`（workspace 根，即 `apps/nestjs-server/jest.config.cjs`）
- Modify: `test/jest-e2e.cjs`
- Create: `test/merge-coverage.cjs`

设计依据：分设计 §7。链路：单测 `--coverage`（coverage/）→ e2e `--coverage`（coverage-e2e/）→ `node test/merge-coverage.cjs`（istanbul 官方合并 + 双报表 + 合并四指标 ≥80% 硬门槛）。`pnpm check` 不变（test 门仍只跑单测，门禁载体是独立命令）。

- [ ] **Step 1: 声明 istanbul 三库 devDependencies（精确版本，不进 catalog）**

在 `package.json` 的 `devDependencies` 中按字母序插入（版本与锁文件中 jest 传递依赖一致，显式声明零新下载；单消费者不进 catalog，禁止裸 require 未声明的传递依赖）：

```json
    "istanbul-lib-coverage": "3.2.2",
    "istanbul-lib-report": "3.0.1",
    "istanbul-reports": "3.2.0",
```

插入位置：`@types/supertest` 之后、`jest` 之前（保持字母序）。

Run: `pnpm install`（仓库根）
Expected: 无新下载（锁文件已有同版本），无报错。

- [ ] **Step 2: jest.base.cjs 导出共享排除清单**

`test/jest.base.cjs` 文件头部（module.exports 之前）插入：

```js
// 覆盖率排除清单（相对 src/ 的规范形态，分设计 §7）：
// generated = Prisma codegen 产物；spec/e2e-spec = 测试自身；d.ts 无可执行语句；main.ts 是 bootstrap 胶水。
// *.module.ts 装配胶水不排除——e2e 运行期真实实例化，正是合并口径的价值所在。
const coverageExclude = [
  '!generated/**',
  '!**/*.spec.ts',
  '!**/*.e2e-spec.ts',
  '!**/*.d.ts',
  '!main.ts'
];
```

并把末尾 `module.exports = { ... };` 改为：

```js
module.exports = {
  // ... 既有全部配置原样保留 ...
  coverageExclude
};
```

（即既有对象末尾追加 `coverageExclude` 一行；两份配置消费时会把它从 jest 配置中剥离，不会传给 jest。）

- [ ] **Step 3: 单测配置 jest.config.cjs 组装收集范围**

整文件替换为：

```js
// 单测配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const { coverageExclude, ...base } = require('./test/jest.base.cjs');

module.exports = {
  ...base,
  rootDir: 'src',
  setupFiles: ['<rootDir>/../test/setup-env.ts'],
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s', ...coverageExclude],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'json']
};
```

说明：单测 rootDir=src，排除清单规范形态直接可用；新增 `json` reporter 是合并脚本的输入（coverage-final.json）。

- [ ] **Step 4: e2e 配置 test/jest-e2e.cjs 组装收集范围**

整文件替换为：

```js
// e2e 配置：继承 test/jest.base.cjs（债 #1 单一事实源）
const { coverageExclude, ...base } = require('./jest.base.cjs');

module.exports = {
  ...base,
  rootDir: '.',
  setupFiles: ['<rootDir>/setup-env.ts'],
  testRegex: '.e2e-spec.ts$',
  globalSetup: '<rootDir>/global-setup.ts',
  globalTeardown: '<rootDir>/global-teardown.ts',
  // e2e rootDir=.，排除清单加 src/ 前缀重新组装（分设计 §7）
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    ...coverageExclude.map(p => p.replace('!', '!src/'))
  ],
  coverageDirectory: 'coverage-e2e',
  coverageReporters: ['text', 'lcov', 'json']
};
```

- [ ] **Step 5: 创建 test/merge-coverage.cjs**

```js
// test/merge-coverage.cjs
// 合并单测与 e2e 的 coverage-final.json（istanbul 官方库），输出双报表，
// 合并四指标 ≥80% 硬门槛失败非零退出（分设计 §7）。
const fs = require('node:fs');
const path = require('node:path');
const libCoverage = require('istanbul-lib-coverage');
const libReport = require('istanbul-lib-report');
const reports = require('istanbul-reports');

const THRESHOLD = 80;
const ROOT = path.join(__dirname, '..');
const UNIT_JSON = path.join(ROOT, 'coverage', 'coverage-final.json');
const E2E_JSON = path.join(ROOT, 'coverage-e2e', 'coverage-final.json');
const MERGED_DIR = path.join(ROOT, 'coverage-merged');

for (const file of [UNIT_JSON, E2E_JSON]) {
  if (!fs.existsSync(file)) {
    console.error(
      `[merge-coverage] 缺少 ${file}；` +
        '请先跑 pnpm --filter @multi-admin/nestjs-server run test:coverage（或分别执行 test:cov 与 test:e2e --coverage）。'
    );
    process.exit(1);
  }
}

function summarize(map) {
  return libReport.createContext({ coverageMap: map }).getSummary();
}

function printRow(label, s) {
  console.log(
    `${label.padEnd(10)} | ` +
      `lines ${s.lines.pct}% (${s.lines.covered}/${s.lines.total}) | ` +
      `branches ${s.branches.pct}% (${s.branches.covered}/${s.branches.total}) | ` +
      `functions ${s.functions.pct}% (${s.functions.covered}/${s.functions.total}) | ` +
      `statements ${s.statements.pct}% (${s.statements.covered}/${s.statements.total})`
  );
}

const unit = libCoverage.createCoverageMap(require(UNIT_JSON));
const e2e = libCoverage.createCoverageMap(require(E2E_JSON));
const merged = libCoverage.createCoverageMap();
merged.merge(unit.toJSON());
merged.merge(e2e.toJSON());

console.log('== 双覆盖率报表 ==');
printRow('单测-only', summarize(unit));
printRow('合并', summarize(merged));

// 合并报表落盘 coverage-merged/（text + lcov + json，供人工排查与后续消费）
const context = libReport.createContext({
  dir: MERGED_DIR,
  coverageMap: merged
});
for (const name of ['text', 'lcovonly', 'json']) {
  reports.create(name, {}).execute(context);
}

// 硬门槛：只挂合并四指标 ≥80%（单测-only 列仅展示，下限棘轮留 backlog）
const s = summarize(merged);
const failed = ['lines', 'branches', 'functions', 'statements'].filter(
  metric => s[metric].pct < THRESHOLD
);
if (failed.length > 0) {
  console.error(
    `[merge-coverage] 门禁失败：合并 ${failed.join('/')} 低于 ${THRESHOLD}%，` +
      '缺口文件见上方双报表与 coverage-merged/lcov-report。'
  );
  process.exit(1);
}
console.log(`[merge-coverage] 门禁通过：合并四指标均 ≥${THRESHOLD}%`);
```

- [ ] **Step 6: package.json 新增 test:coverage 脚本**

`scripts` 中 `test:e2e` 行之后插入：

```json
    "test:e2e": "jest --config ./test/jest-e2e.cjs",
    "test:coverage": "pnpm run test:cov && pnpm run test:e2e -- --coverage && node test/merge-coverage.cjs"
```

- [ ] **Step 7: 首次实测**

Run: `pnpm --filter @multi-admin/nestjs-server run test:coverage`
Expected: 双报表输出，`coverage-merged/` 生成；理想态直接门禁通过。

若门禁失败（分设计 §10 预案：缺口集中在存量 0% 胶水层 filter/strategy/dto/controller）：按双报表定位缺口文件，在**对应域的既有/本计划单测中补真实行为断言**清偿（DI 胶水层 controller/module/guard 的缺口由 system e2e 真实执行覆盖，若仍缺则在 system.e2e-spec.ts 补对应端点调用），**禁止为凑数写空断言**。清偿后重跑直至通过。

- [ ] **Step 8: 回归既有门禁**

Run: `pnpm --filter @multi-admin/nestjs-server run test` → 全绿（单测收集范围变化不影响用例）。
Run: `pnpm check` → 全绿（口径不变，test 门仍只跑单测）。

- [ ] **Step 9: 忽略产物目录核验**

核验仓库根 `.gitignore` 是否已含 `coverage` 通配（既有 `apps/nestjs-server/coverage/` 存在说明已被忽略）；新增的 `coverage-e2e/` 与 `coverage-merged/` 位于同一 workspace 目录下，若 `git status` 显示它们未被忽略，在 `.gitignore` 的 coverage 条目旁补齐（与既有写法一致）。

- [ ] **Step 10: Commit**

```bash
git add apps/nestjs-server/package.json apps/nestjs-server/jest.config.cjs apps/nestjs-server/test pnpm-lock.yaml
git commit -m "feat(server): 单测+e2e 合并覆盖率流水线（istanbul 官方合并 + 双报表 + 80% 门禁）"
```
（若 Step 9 改了 .gitignore 则一并 add。）

---

### Task 11: 文档同步 + 全链路验收

**Files:**
- Modify: `AGENTS.md`（仓库根）
- Modify: `docs/tasks/2026-08-16-nestjs-backend-foundation/2026-08-16-nestjs-backend-foundation-design.md`（总 spec）
- Modify: `docs/engineering/build-and-verify.md`
- Modify: `docs/tasks/README.md`

仓库硬规则：改变已文档化行为的代码变更必须在同一提交内更新对应文档；活文档 frontmatter 的 `last_verified` 同步到实施当日。

- [ ] **Step 1: AGENTS.md 两处更新**

1. 「项目概览」表中 `apps/nestjs-server` 行改为：

```markdown
| `apps/nestjs-server`    | NestJS 后端：骨架与横切基建、Prisma + Redis、认证链（JWT 双令牌轮换 + RBAC 守卫链）、system RBAC CRUD（全局软删除）与单测/e2e 合并覆盖率门禁均已交付，前端联调待 P5 |
```

2. 「常用命令」代码块内 `pnpm --filter @multi-admin/nestjs-server run test:e2e` 行之后追加：

```bash
pnpm --filter @multi-admin/nestjs-server run test:coverage  # 单测+e2e 合并覆盖率（≥80% 门禁），前置 compose postgres/redis
```

- [ ] **Step 2: 总 spec 落实 P4 修订备案（分设计 §12 共 7 项）**

对 `2026-08-16-nestjs-backend-foundation-design.md`：

1. §9 测试体系表两行改为（对齐备案 1）：

```markdown
| 覆盖率门槛 | statements/branches/functions/lines 均 80%；载体为独立 `test:coverage` 合并流水线（单测+e2e，istanbul 官方库合并 + 双报表，P4 落地）——原「jest coverageThreshold 随 pnpm check 自动生效」口径作废 |
| 门禁接入 | `pnpm check` 的 test 门维持单测不变；合并覆盖率门禁独立命令 `pnpm --filter @multi-admin/nestjs-server run test:coverage`（前置 compose postgres/redis） |
```

2. §11 阶段拆分表 P4 行改为：

```markdown
| P4 测试门禁 + system RBAC CRUD | 三域 CRUD（全局软删除）+ 两类分配端点、错误契约扩展（40404/40900）、护栏 8 项、system e2e 四类示范用例、单测+e2e 合并覆盖率 ≥80% 双报表门禁；dept/监控域不在基架阶段（备案 3） | `test:coverage` 合并四指标 ≥80%，system/auth/health e2e 全绿，`pnpm check` 全绿 |
```

3. 文件末尾（§12 之后）追加（沿用 P2 完成判定的备案落实体例）：

```markdown
### P4 修订备案（已完成，2026-08-19）

P4 分设计（`...-phase4-design.md`）§12 的 7 项修订已逐条落实：

1. 覆盖率门禁载体改为独立 `test:coverage` 合并流水线 + 双报表（§9 两行已改，备案 1）✅
2. system 端点完全 RESTful + 字段全面标准化；auth 域已交付端点形态不动；P5 适配清单（api 层路径/字段/分页/menuType 映射/rank↔sort）登记于分设计 §12 备案 2 ✅
3. P4 范围收窄：dept 域与监控域不实施，`system:dept:*` seed 点保留不消费（§11 P4 行已改，备案 3）✅
4. 数据模型：User/Role 补列、MenuType 扩 IFRAME/EXTERNAL、Menu meta Json 单列，一次 migration（§6.2 事实已被 P4 migration 覆盖，备案 4）✅
5. 高级密码策略登记 backlog（备案 5）✅
6. 错误码表新增 `NOT_FOUND: 40404`（§5 错误码段，备案 6）✅
7. 三表软删除全局改造（deletedAt + 部分唯一索引 + 全查询过滤 + 认证链波及适配）；restore 端点/超管标志位化/单测覆盖率下限棘轮/防环 DB 层加固登记 backlog（备案 7）✅
```

注意：若 §5 错误码表（第 60-85 行区间）尚无 40404 行，同步补一行 `| 40404 | NOT_FOUND | 业务资源不存在或已软删 |`（按表格既有列形制）。

- [ ] **Step 3: build-and-verify.md 增补合并覆盖率小节**

1. frontmatter `last_verified` 改为实施当日日期（格式 `YYYY-MM-DD`）；
2. 「nestjs-server e2e 测试」节之后追加：

```markdown
## nestjs-server 合并覆盖率流水线

- 命令：`pnpm --filter @multi-admin/nestjs-server run test:coverage`，链路：单测 `--coverage`（coverage/）→ e2e `--coverage`（coverage-e2e/）→ `test/merge-coverage.cjs`（istanbul 官方库合并 + 双报表 + 合并四指标 ≥80% 硬门槛，失败非零退出）。
- 前置与 e2e 相同：`docker compose up -d postgres redis`；合并报表产物在 `coverage-merged/`。
- 收集范围与排除清单为 `test/jest.base.cjs` 共享常量（单测 rootDir=src、e2e rootDir=. 各自组装）；`*.module.ts` 装配胶水不排除（e2e 运行期真实实例化）。
- `pnpm check` 口径不变（test 门仍只跑单测），覆盖率门禁是独立命令不并入日常门禁。
```

- [ ] **Step 4: docs/tasks/README.md 热索引更新**

「进行中」表 NestJS 后端基架补全行说明改为：

```markdown
总体设计见 [2026-08-16-nestjs-backend-foundation/](./)，总-分结构，分 P1~P5 五阶段；P1~P4 已完成，P5（contracts 与前端对齐）待启动
```

- [ ] **Step 5: 全链路验收（对照分设计 §11 完成判定 8 项）**

依次执行并逐项确认：

Run: `pnpm --filter @multi-admin/nestjs-server run typecheck` → 无错误。
Run: `pnpm --filter @multi-admin/nestjs-server run lint` → 通过。
Run: `pnpm --filter @multi-admin/nestjs-server run test` → 全绿。
Run: `pnpm --filter @multi-admin/nestjs-server run test:e2e` → auth/health/system 全绿。
Run: `pnpm --filter @multi-admin/nestjs-server run test:coverage` → 双报表输出、合并四指标 ≥80%、门禁通过。
Run: `pnpm check` → 全绿。

逐项核对分设计 §11 清单：migration 落地（含四处部分唯一索引）；三域 CRUD + 分配端点全量可用（Swagger `System` tag 可目验：`pnpm dev:server` 后访问 Swagger 页面，验毕停掉）；软删除语义；exception-resolver Prisma 分支；护栏 8 项双层覆盖；e2e 四类用例；双报表；文档同步（本任务前四步）。

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs
git commit -m "docs(docs): 同步 P4 交付文档（总 spec 修订备案 + 覆盖率流水线 + 热索引）"
```

（提交 scope 白名单含 `docs`；主题禁大写开头。）

---

## 自审记录（计划作者，2026-08-19）

1. **spec 覆盖**：分设计 §3（migration）→ Task 1；§4.4（认证链波及）→ Task 2；§5.5（错误契约）→ Task 3；§3.3/§5.4/shared（§6 常量）→ Task 4；§5.1/§6 护栏（用户域）→ Task 5；§5.2（角色域）→ Task 6；§5.3/§4.3/护栏 4（菜单域）→ Task 7；§3.3+§9 route-tree 增强 → Task 8；§8 四类 e2e → Task 9；§7 覆盖率流水线 → Task 10；§1 验收 6/§11 完成判定/§12 修订备案 → Task 11。无遗漏。
2. **占位符扫描**：无 TBD/TODO；所有代码步骤均含完整代码；命令均含预期输出。
3. **类型一致性**：`alive()` / `normalizePageQuery` / `pageResult` / `PageResult` / `MenuMeta` / `MenuMetaDto`（Task 4 定义）在 Task 5-8 消费一致；`UserView`（Task 5）与 `RoleLike`（Task 6）不跨任务引用；`MenuRouteRow.visible/meta` 与 type 联合扩展在 Task 1（schema）→ Task 8（route-tree）→ Task 2/5-7（service 查询）链路上字段名一致；`BizCode.NOT_FOUND/CONFLICT` 在 Task 3 定义、Task 5-7 的 service 拦截优先于 Prisma 兜底，口径一致。
