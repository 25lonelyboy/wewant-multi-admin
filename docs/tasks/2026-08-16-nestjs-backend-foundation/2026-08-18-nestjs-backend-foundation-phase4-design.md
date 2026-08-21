# NestJS 后端基架补全 · P4 system RBAC CRUD 与测试门禁设计

> 本文档为总 spec（`2026-08-16-nestjs-backend-foundation-design.md`）P4 阶段的「分」设计。总 spec 已锁定的决策（信封契约、RBAC 模型、守卫链顺序等）此处不重复，仅记录 P4 范围内的澄清结论、设计细化与对总 spec 的修订备案。
>
> P4 双重身份：总 spec §11 的「测试门禁」阶段 + P3 分设计 §1 显式顺延的「system 四页 CRUD」（P4 收窄为三域，见 §1）。
>
> **修订记录**：本文档初版落盘后（commit ac59cbb）经两轮评审复审（2026-08-19）——内部审查 4 项必修 + 外部评审采纳项 + 用户拍板「删除操作全部走软删除」全局改造。以下各节为**最新生效口径**，决策演进见 §2 双表。

## 1. P4 范围与验收口径

**功能主线**（P3 顺延项，澄清后收窄）：用户 / 角色 / 菜单三域 RESTful CRUD + 用户-角色分配 + 角色-菜单分配；**所有删除操作走软删除**（§4）。消费 seed 既有 16 权限点（`system:{user|role|menu|dept}:{query|add|update|delete}` 形态，dept 点保留但无消费方），**不新增权限点**；错误码新增 1 个 `NOT_FOUND: 40404`（§5.5）。

**测试门禁主线**（总 spec §9/§11）：单测 + e2e 合并覆盖率 80% 四指标门槛 + 双报表（独立命令，见 §7）、system e2e 四类示范用例（§8）、隔离策略固化。

**明确不做**（YAGNI 裁剪）：

| 项 | 理由 |
| --- | --- |
| dept 域（表/树端点/前端页面接口） | schema 无 Dept 表，属业务域；seed 的 `system:dept:*` 权限点保留不消费 |
| 监控域（在线用户/四类日志） | 需 3-4 张新表 + 采集机制，偏离基架定位 |
| 高级密码策略（新建用户随机密码、首登强制改密、90 天过期） | **backlog 已登记**，留基架完善收尾阶段统一决策 |
| 独立重置密码端点 | P4 用「更新时可选传 password」覆盖，细粒度权限点需求不成立 |
| 软删除恢复端点（restore / 已删列表） | 数据模型保留可恢复性即可，端点留 backlog（§4.6） |

**验收口径**：

1. 三域 CRUD 端点全部可用且挂 `@RequirePermissions`；护栏用例（§6）拒绝路径生效
2. 软删除语义正确：删除写 `deletedAt`、全查询不可见、已删名字可复用、P3 认证链对已删用户即时失效
3. system e2e 四类示范用例全绿（§8）；既有 auth/health e2e 回归不破坏
4. `pnpm --filter @multi-admin/nestjs-server run test:coverage` 合并覆盖率四指标 ≥80%（双报表输出）
5. `pnpm check` 全绿（口径不变：prettier/typecheck/lint/单测）
6. 文档同步：AGENTS.md、总 spec 修订备案、`docs/engineering/build-and-verify.md`（test:coverage 命令与 e2e 前置条件）

## 2. 澄清阶段结论

### 2.1 初次澄清（历史快照）

> 下表为初版落盘时的结论快照；与 §2.2 复审拍板冲突处，以复审拍板为准。

| 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- |
| P4 功能范围 | 三域 CRUD + 测试门禁（零新增权限点） | 含 dept 域（多一次迁移 + 树形 CRUD 成本）；含监控域（范围膨胀偏离基架）；仅测试门禁（RBAC 管理闭环缺失） |
| 端点契约风格 | **完全 RESTful**：GET + query 查询、标准动词写操作、`/system/*` 分组 | 收拢分组 + 继承 mock 语义（POST 查询欠 REST 语义）；完全继承 mock（平铺路径污染根域，与 P3 端域分组方向相悖） |
| 写操作护栏 | 最小必要护栏，集中 service 层 | 强保护内置种子（未来清理 seed 菜单需改码解锁）；不加护栏（误操作可锁死系统） |
| 密码策略 | 新建必填、更新可选传则重置；高级策略入 backlog | 独立重置密码端点（需新增权限点，过度设计） |
| 门禁挂载 | 独立命令，`pnpm check` 不变（test 门仍只跑单测） | 并入 pnpm check（硬依赖本机 postgres/redis，日常门禁变重变慢） |
| e2e 示范用例 | 四类（CRUD 全链路/授权矩阵/护栏/写后读一致性）+ 隔离策略文档固化 | 两类（护栏端到端路径缺验证）；加并发用例（system CRUD 无高并发需求） |

### 2.2 评审复审拍板（2026-08-19，覆盖初版对应结论）

| 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- |
| 模型字段缺口 | Menu 前端路由元数据走 **`meta Json?` 单列**；MenuType 枚举扩展保留；User/Role 补列 | 平铺 13 列（schema 耦合 vue-pure-admin 实现细节，升级即 migration）；全量 JSONB（后端组装路由树需运行时解析，类型安全最弱） |
| 响应字段命名 | **全面标准化**：`createdAt/updatedAt` ISO 8601 字符串、`visible`、分页 `{items,total,page,pageSize}`；P5 一次性适配前端 | 保留 mock 形态（P4 已破形走 RESTful，唯一理由「省 P5 适配」不成立——api 层反正要重写；长期映射层技术债） |
| 删除语义 | **全局软删除**：三表 `deletedAt DateTime?`，所有 DELETE 写时间戳，无硬删除 | 硬删除（不可恢复 + 级联子树断言在 Prisma 下不成立：自关系无 onDelete 时默认 SetNull）；有子菜单拒绝删除（被软删除方案取代） |
| 唯一约束 | username / role.code / menu.name / menu.permission 四处改**部分唯一索引**（`WHERE deletedAt IS NULL`），已删名字可复用 | 全局唯一不变（已删名字永久占用，反直觉陷阱） |
| 恢复能力 | 只留数据模型能力（清空 deletedAt 即恢复），**P4 不开 restore 端点**，登记 backlog | 同步交付 restore 端点（三域多 6 端点 + 配套测试，P4 膨胀） |
| 覆盖率合并实现 | 基于 **istanbul 官方库**（`istanbul-lib-coverage/lib-report/reports`，显式声明 devDependencies） | 自研手动合并（格式兼容与计数口径漂移风险）。注：评审原称「jest 内置零依赖」在本仓 pnpm 严格隔离下不成立——未声明即幻影依赖，必须显式声明 |
| 覆盖率报表 | **双报表**：单测-only 与合并两列四指标；硬门槛只挂合并 ≥80% | 单列合并（e2e 灌水掩盖单测退化不可见）；单测-only 门槛（胶水层 0% 缺口靠容器 mock 测试补齐属反模式） |
| 超管判定 | 常量集中定义（`code === 'admin'` / `username === 'admin'`），标志位升级入 backlog | `Role.isSystem / User.isSuperAdmin` 标志位（连锁改 migration/seed/`derivePermissions` 通配逻辑与全部 P3 回归；「多超管」当前是假想需求） |

## 3. 数据模型迁移（一次 migration）

**原则**：新列一律 nullable 或带默认值，seed 与存量数据零破坏；e2e globalSetup 的 migrate 链自动应用。

### 3.1 三表软删除列

User / Role / Menu 各加 `deletedAt DateTime?`。中间表 UserRole / RoleMenu **不加**——主体被软删后经查询过滤自然失效（§4.2）。不加 `@@index([deletedAt])`（数据量小，YAGNI）。

### 3.2 User 加列（对齐 mock 用户字段，dept 除外）

```prisma
model User {
  // 既有：id / username / password / nickname / status / roles / createdAt / updatedAt / deletedAt(新)
  avatar  String?
  phone   String?
  email   String?
  sex     Int?      // 0|1；TS 侧 type Sex = 0 | 1 + 具名常量，DTO @IsIn([0, 1])
  remark  String?
}
```

### 3.3 Menu：枚举扩展 + meta Json

- **MenuType 枚举扩展**：`MENU | BUTTON` → `MENU | IFRAME | EXTERNAL | BUTTON`（对应 mock menuType 0/1/2/3）。migration 用 `ALTER TYPE ... ADD VALUE`。seed 只用 MENU/BUTTON，不受影响。枚举保留平铺的原因：后端组装路由树需按 type 分支（IFRAME/EXTERNAL 节点形态不同），属后端语义而非纯展示。
- **新增 `meta Json?` 单列**，收纳 12 个纯展示字段（后端零查询/排序/过滤诉求，纯透传前端路由 meta）：`redirect / extraIcon / enterTransition / leaveTransition / activePath / auths / frameSrc / frameLoading / keepAlive / hiddenTag / fixedTag / showParent`。
- **showLink 不入 meta**：其语义与既有 `visible` 重复，`visible` 保持后端唯一事实源；路由树组装时输出 `meta.showLink = visible`（单一语义源，避免两处真值）。
- **rank 不入 meta**：契约直接使用 schema 既有 `sort`，P5 前端适配（不再维护 rank↔sort 映射）。
- 不加 GIN 索引（meta 无查询场景）。
- 类型策略：定义 `MenuMeta` TS 接口 + 嵌套 DTO（`@ValidateNested()` + `@Type(() => MenuMetaDto)`）校验写路径；读路径类型断言直出（写时校验、读时信任）。

### 3.4 Role 补列

`remark String?` + `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt` + `deletedAt`。

### 3.5 唯一约束改造（部分唯一索引）

schema 中移除 username / code / name / permission 的 `@unique`（Prisma 无法表达部分索引），migration 内手写 raw SQL：

```sql
DROP INDEX "User_username_key";            -- 及其余三处等价约束
CREATE UNIQUE INDEX "User_username_alive" ON "User"(username) WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Role_code_alive"     ON "Role"(code)     WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_name_alive"     ON "Menu"(name)     WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Menu_permission_alive" ON "Menu"(permission) WHERE "deletedAt" IS NULL;
```

重复「创建 → 删除」循环永不冲突（已删记录退出约束域）；唯一约束只保护活跃记录。**代价**：Prisma 不再代理唯一性，创建/更新必须 service 层预查重（`findFirst` 带 `deletedAt: null`）返 40900；P2002 映射保留作并发兜底（§5.5）。移除 `@unique` 后 `findUnique({where:{username}})` 失去类型资格，统一改 `findFirst`。

### 3.6 序列化约定（标准化）

- 时间字段输出 **ISO 8601 字符串**（`createdAt` / `updatedAt`，Prisma Date 原生序列化形态）。
- 布尔/枚举字段用 schema 原名（`visible`、`type` 枚举字符串）。
- 分页响应 data：`{items, total, page, pageSize}`。
- 密码 hash 永不进响应（总 spec §6.1 既有约束），用户 DTO 序列化剔除 `password`。
- auth 域已交付端点（get-user-info / get-async-routes）形态**不动**——其结构由前端路由框架决定且已随 P3 交付；标准化只作用于 P4 新增的 system CRUD 端点。

## 4. 软删除全局语义

### 4.1 删除写入

三域所有 DELETE 端点执行 `update({ where: { id }, data: { deletedAt: new Date() } })`，无任何硬删除。目标不存在或已删 → 40404（§5.5）。**主体校验统一口径**：所有按 id 定位主体的端点（GET/PUT/DELETE 及 `/roles`、`/menus` 子资源端点）先校验主体存在且活跃，不满足一律 40404。

### 4.2 查询过滤

所有列表 / 树 / 全量 / 子资源查询（含 `roles/all`、menus 树、用户角色 id 列表、角色菜单 id 列表）追加 `deletedAt: null` 过滤。过滤条件统一走 system 域公共查询工具（如 `alive()` where 片段工厂）防遗漏——「软删后残留幽灵数据」是本改造最大风险面（§10）。

### 4.3 菜单删除语义

只标记当前节点；子树与 RoleMenu 关联**物理保留**，靠父链与菜单过滤自然不可见。不级联、不因有子菜单拒绝、不改自关系 `onDelete`（SetNull 现状不再构成问题——没有硬删除触发它）。

### 4.4 P3 已交付代码的波及适配

软删除必须同步改认证链，否则已删用户仍可登录/持权：

| 适配点 | 行为 |
| --- | --- |
| `auth.service.validateUser`（登录） | 追加 `deletedAt: null`；已删用户按「不存在」处理（dummy hash 时序拉平逻辑不变） |
| `auth.service.resolveSessionUser`（每请求） | 同上；已删 → 40101，已持有令牌即时失效（P3 实时查库口径的自然延伸） |
| `auth.service.refresh` | 已删 → 40103 |
| `permissionsOf` | 过滤已软删角色与已软删菜单——被删菜单的 BUTTON 权限点即时失效 |
| `route-tree` / get-async-routes | 过滤已软删菜单 |

P3 既有 auth e2e 断言全部原样通过为回归门禁；新增「删用户后旧令牌即时 401」用例入 §8 写后读一致性组。

### 4.5 护栏适配

见 §6 护栏 1/2/6/7——软删 admin 用户/角色虽可恢复，但会即时锁死在线会话与权限，保护不降级。

### 4.6 恢复能力（backlog）

数据模型保留可恢复性（清空 `deletedAt` 即恢复）。restore 端点、已删列表查询、物理清理策略（如 90 天后清除）均留 backlog。

## 5. RESTful 端点契约

路径分组 `/system/*`；全局守卫链不变（Throttler → JwtAuth → Permissions）；所有端点非 `@Public`，全部挂 `@RequirePermissions`。Swagger tag `System`（P3 预留位兑现）。

### 5.1 用户域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/users?page&pageSize&username&status` | `system:user:query` | 分页 + 筛选；items 项含 roles（code 数组）、剔除 password |
| `POST /system/users` | `system:user:add` | username/password/nickname 必填，status 默认 ACTIVE，avatar/phone/email/sex/remark 可选，`roleIds?` 创建即分配；username 预查重 → 40900 |
| `PUT /system/users/:id` | `system:user:update` | 可改：nickname/status/avatar/phone/email/sex/remark；password 可选（传则 argon2 重置）；`roleIds` 可选（传则整体替换）；**username 不可改**（与 role code 对齐，防绕过 admin 判定护栏） |
| `DELETE /system/users/:id` | `system:user:delete` | 软删除（§4） |
| `GET /system/users/:id/roles` | `system:user:query` | 返回活跃角色 id 列表（对 mock `/list-role-ids`） |
| `PUT /system/users/:id/roles` | `system:user:update` | body `{roleIds}` 整体替换（幂等语义，Swagger 明示） |

### 5.2 角色域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/roles?page&pageSize&name&code&status` | `system:role:query` | 分页 + 筛选 |
| `GET /system/roles/all` | `system:role:query` | 不分页全量 `{id,name,code}`（用户页下拉，对 mock `/list-all-role`） |
| `POST /system/roles` | `system:role:add` | code 预查重 → 40900 |
| `PUT /system/roles/:id` | `system:role:update` | 可改 name/status/remark，**code 不可改**（唯一业务标识） |
| `DELETE /system/roles/:id` | `system:role:delete` | 软删除；UserRole/RoleMenu 关联物理保留，查询过滤自然失效 |
| `GET /system/roles/:id/menus` | `system:role:query` | 返回活跃菜单 id 列表（对 mock `/role-menu-ids`） |
| `PUT /system/roles/:id/menus` | `system:role:update` | body `{menuIds}` 整体替换（事务 deleteMany + createMany，幂等语义 Swagger 明示） |

### 5.3 菜单域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/menus` | `system:menu:query` | 全量活跃树（无分页），按 sort 升序；对 mock `/menu` + `/role-menu` |
| `POST /system/menus` | `system:menu:add` | type 用枚举字符串入参（`MENU/IFRAME/EXTERNAL/BUTTON`，P5 前端映射 mock 数字）；name 预查重 → 40900；permission 仅 BUTTON 型必填；meta 走嵌套 DTO 校验 |
| `PUT /system/menus/:id` | `system:menu:update` | 可改字段含 parentId（移动节点）与 meta 整体替换；防环见 §6 护栏 4 |
| `DELETE /system/menus/:id` | `system:menu:delete` | 软删除当前节点（§4.3） |

### 5.4 分页与响应形态

- 分页响应 data：`{items, total, page, pageSize}`；查询参数 GET query 化（`page` 默认 1、`pageSize` 默认 10、上限 100）。
- 树形/全量端点（menus、roles/all）data 直接为数组。

### 5.5 错误契约（exception-resolver 扩展）

现状核验：`resolveException` 无 Prisma 分支，P2002/P2003/P2025 目前全部落底 50000——本项为**新增实现**而非复用：

| Prisma 错误 | 归码 | 语义 |
| --- | --- | --- |
| P2002（唯一冲突） | 40900 | 并发兜底（主路径是 service 预查重） |
| P2025（更新/删除目标不存在） | **40404**（新增 `BizCode.NOT_FOUND`，总 spec §5 码段表同步登记） | 资源不存在或已软删；主路径是 §4.1 主体校验，本映射为兜底 |
| P2003（FK 约束，roleIds/menuIds/parentId 含不存在或已软删 id） | 40001 | 入参非法；主路径是 service 预校验存在性与活跃态 |

## 6. 写操作护栏（service 层集中实现，单测全覆盖）

| # | 护栏 | 违反时 |
| --- | --- | --- |
| 1 | 禁软删/禁禁用超管 `admin` 用户与 `admin` 角色（防自锁；软删虽可恢复但即时锁死会话，保护不降级） | BizException 40900 + 明确 message |
| 2 | 操作者不能禁用/删除自己（`@CurrentUser` 比对） | 同上 |
| 3 | **操作者不能修改自己的角色分配**（`PUT /users/:id`（含 roleIds）与 `PUT /users/:id/roles`，target === operator 时拒绝；防剥光自身角色自锁） | 同上 |
| 4 | 菜单 parentId 变更防环：service 预校验（快速失败）+ **同事务内更新后回溯祖先链二次校验**（兜底并发窗口）；不上 ltree 扩展（管理后台低并发，扩展管理成本不值） | 同上 |
| 5 | 新建用户 password 必填；更新可选（传则 argon2 重哈希） | 40001 DTO 校验 |
| 6 | username 不可改（`PUT /users/:id` DTO 无 username 字段；防先改名再删绕过护栏 1） | DTO 层天然拒绝 |
| 7 | 分配类操作校验目标存在且活跃：roleIds/menuIds/parentId 含不存在或已软删 id → 预校验 40001（P2003 兜底同码） | 40001 |
| 8 | 角色/菜单/用户变更后**不做会话吊销**：P3 JwtAuthGuard 实时查库 + §4.4 过滤，禁用/软删/改权下一请求即生效 | —（设计事实，非实现项） |

超管判定统一走集中定义的常量（`'admin'` 字面量单处定义 + 注释 seed 来源）；`isSystem` 标志位化留 backlog。

## 7. 测试门禁：合并覆盖率流水线

**载体**：新增 `test:coverage` 脚本链（独立命令，`pnpm check` 不变）：

```
单测 jest --coverage（coverage/）
  → e2e jest --config test/jest-e2e.cjs --coverage（coverage-e2e/）
  → node test/merge-coverage.cjs（istanbul 官方合并 + 双报表 + 门槛校验）
```

- **合并脚本基于 istanbul 官方库**：`createCoverageMap()` + 两次 `merge()`，口径与 istanbul/jest 官方报告 100% 一致（初版「自研手动合并 + 对拍」方案作废，对拍风险项随之删除）。
- **依赖声明**：`istanbul-lib-coverage` / `istanbul-lib-report` / `istanbul-reports` 声明为 nestjs-server **devDependencies**。核验：三者已随 jest 传递存在于锁文件（3.2.2 / 3.0.1 / 3.2.0），显式声明零新下载；单消费者不进 catalog；**不得裸 require 未声明的传递依赖**（pnpm 严格隔离，幻影依赖为仓库硬规则所禁）。
- **双报表**：输出「单测-only」与「合并」两列四指标；硬门槛只挂合并四指标 ≥80%，失败非零退出。单测-only 列用于防 e2e 灌水掩盖单测退化；单测下限棘轮留 backlog。
- **收集范围与排除清单以共享常量落进 `test/jest.base.cjs`**（单一事实源），由单测/e2e 两份配置各自按 rootDir 组装 `collectCoverageFrom`（单测 rootDir=src、e2e rootDir=.，相对路径不同，不能原样复用同一数组）。排除清单与理由：

| 排除项 | 理由 |
| --- | --- |
| `src/generated/**` | Prisma codegen 产物，非手写代码 |
| `**/*.spec.ts` / `**/*.e2e-spec.ts` | 测试文件自身 |
| `**/*.d.ts` | 类型声明无可执行语句 |
| `main.ts` | bootstrap 胶水（总 spec §12 既有预案） |

  **注意**：`*.module.ts` 装配胶水**不排除**——e2e 运行期真实实例化它们，正是合并口径的价值所在。
- e2e 纳入合并口径的理由（复审结论）：无 CI、成本已被独立命令隔离；覆盖缺口集中在 DI 胶水层（controller/module/guard/filter/strategy 实测 0%），这些文件强写单测 = mock Nest 容器属反模式，e2e 是其正当覆盖来源。
- 总 spec §9「jest coverageThreshold 自动随 pnpm check 生效」口径作废，改由本流水线承担（修订备案 1）。
- 前置条件：e2e 需本机 compose postgres/redis 健康（总 spec §12 既有前提），写入 build-and-verify.md。

## 8. system e2e 四类示范用例与隔离固化

新增 `test/system.e2e-spec.ts`，复用既有登录 helper 与 fixture：

1. **CRUD 全链路**：三域创建→查（分页/筛选断言）→改→删；**软删除断言组**：删后列表/树不可见、同名可再建（部分唯一索引）、40404 on 重复删；用户-角色、角色-菜单分配往返。
2. **授权矩阵**：套件内建测试角色仅挂 `system:user:query` 一点 → 查询过、写操作 40301；admin 通配全端点通过；未登录 40101。
3. **护栏用例**：软删 admin 角色 / 禁用 admin 用户 / 禁用自己 / 删除自己 / 修改自己角色分配 / 菜单父节点指向自身 → 40900 业务码与 message 断言。
4. **写后读一致性**：改角色-菜单关联后，get-user-info/get-async-routes 权限集与路由树即时变化；**软删用户后其旧令牌下一请求 401**——验证 P3 实时查库 + §4.4 过滤口径。

**隔离策略固化**（修订：新增一处机制）：既有 globalSetup（幂等建 `multi_admin_test` → migrate → seed）+ globalTeardown（truncate 全表 + FLUSHDB）维持；**新增每个 spec 文件 `beforeAll` FLUSHDB**——限流计数器存 Redis 且按 IP 聚合，跨 spec 文件在同一分钟内累积，system e2e 请求量（CRUD 全链路 + 授权矩阵多次登录 + 护栏 + 一致性）叠加 auth e2e 消耗会击穿全局限额（60 次/分）与登录限额（5 次/分）触发 42901 flaky。beforeAll FLUSHDB 安全：seed 在 Postgres，Redis 侧仅限流计数与会话状态，各套件自行重新登录。

## 9. 模块落位与依赖

```
src/modules/system/
├── system.module.ts
├── user/{user.controller,user.service,user.service.spec}.ts + dto/
├── role/{role.controller,role.service,role.service.spec}.ts + dto/
├── menu/{menu.controller,menu.service,menu.service.spec}.ts + dto/
└── shared/（alive() 过滤工厂、分页 skip/take 组装、MenuMeta 接口与嵌套 DTO）
test/system.e2e-spec.ts
test/merge-coverage.cjs
```

- **运行时零新增依赖**：CRUD 全部用既有 Prisma/class-validator/Swagger 能力；`meta Json` 为 Prisma 原生类型。
- istanbul 三库为 devDependencies（§7）。
- 分页/过滤公共小工具留在 system 域内（单消费者，YAGNI，不上提 common）。
- route-tree.ts（P3 产物）随 Menu 改造增强：IFRAME/EXTERNAL 节点分支、`meta Json` 透传组装（含 `showLink = visible` 输出）、软删过滤；既有断言为回归基线。

## 10. 风险与预案

| 风险 | 预案 |
| --- | --- |
| Menu 改造（枚举/meta Json/软删）冲击 route-tree 与 get-async-routes 既有断言 | 组装逻辑只增不改既有字段输出；P3 e2e 断言原样通过为回归门禁 |
| **软删过滤遗漏产生幽灵数据**（软删除最大风险面） | 过滤统一走 shared `alive()` 工厂禁止手写散落；e2e 软删断言组兜底（删后不可见 + 分配链路失效） |
| 唯一冲突检测机制变更（Prisma 不再代理） | service 预查重为主路径 + P2002 映射兜底；并发窗口残余重复概率极低且后果为 500 级显性错误，可接受 |
| e2e 限流击穿（60/分全局 + 5/分登录，跨套件共享 Redis 计数） | 每 spec beforeAll FLUSHDB（§8） |
| 部分唯一索引 raw SQL migration 正确性 | `migrate deploy` 幂等回归 + e2e「删除后同名重建」用例断言 |
| e2e 依赖本机 compose postgres/redis | build-and-verify.md 写明前置条件（总 spec §12 既有预案） |
| migration 影响测试库/生产启动链 | e2e globalSetup 与 Dockerfile `migrate deploy` 同链自动应用；枚举 ADD VALUE 幂等性回归验证 |
| 合并覆盖率首次实测不达 80% | 缺口集中在存量 0% 文件（filter/strategy/dto/controller），随 system 域单测补全任务一并清偿；以实测为准，不为凑数写空断言 |
| 护栏「admin 标识」耦合 seed 字面量 | 判定常量单处定义并注释来源（seed 内置）；标志位化留 backlog |

## 11. P4 完成判定

- [ ] 一次 migration 落地（三表 deletedAt、User 加列、Menu 枚举扩展 + meta Json、Role 补列、四处部分唯一索引），`migrate deploy` 幂等回归通过
- [ ] 三域 CRUD + 两类分配端点全量可用（标准字段名 + `{items,total,page,pageSize}`），Swagger `System` tag 可见（非生产）
- [ ] 软删除语义全链路正确（§4，含 P3 认证链波及适配与 e2e 断言）
- [ ] exception-resolver Prisma 分支落地（P2002→40900 / P2025→40404 / P2003→40001）
- [ ] 护栏 8 项（§6）单测 + e2e 双层覆盖
- [ ] system e2e 四类示范用例全绿（§8）；auth/health e2e 回归不破坏
- [ ] `test:coverage` 双报表输出，合并四指标 ≥80%；`pnpm check` 全绿
- [ ] 文档同步：AGENTS.md、总 spec 修订备案（§12）、build-and-verify.md

## 12. 对总 spec 的修订备案

| # | 修订 | 影响章节 |
| --- | --- | --- |
| 1 | 覆盖率门槛载体从「jest coverageThreshold 随 pnpm check 自动生效」改为「独立 `test:coverage` 合并流水线（单测+e2e）+ 双报表」，合并基于 istanbul 官方库（显式 devDeps）；pnpm check 的 test 门维持单测不变 | §9 测试体系「门禁接入」行 |
| 2 | system 端点契约完全 RESTful 且**字段名全面标准化**（ISO 时间串 / visible / `{items,total,page,pageSize}`），初版「保留 mock 形态」口径作废。auth 域已交付端点形态不动。P5 适配清单：`src/api/system.ts` 改 RESTful 路径/方法/参数、去 dept/监控域调用、字段名与分页形态适配、menuType 数字↔枚举映射、rank↔sort 归一 | §8 接口契约 |
| 3 | P4 范围收窄：dept 域与监控域不在基架阶段实施；`system:dept:*` seed 权限点保留不消费 | §11 P4 行（口径补充） |
| 4 | 数据模型：User/Role 补列、MenuType 扩 IFRAME/EXTERNAL、**Menu 前端元数据走 meta Json 单列**（替代平铺 13 列）；一次 migration | §6.2 数据模型 |
| 5 | 高级密码策略登记 backlog，留基架完善收尾阶段决策 | 新增 backlog |
| 6 | 错误码表新增 `NOT_FOUND: 40404`（业务资源不存在/已软删） | §5 错误码 |
| 7 | **三表软删除全局改造**（deletedAt + 部分唯一索引 + 全查询过滤 + 认证链波及适配）；restore 端点、超管标志位化、单测覆盖率下限棘轮、防环 DB 层加固（ltree）登记 backlog | §6.2 数据模型、§5、§9 |

## 13. Backlog 登记（P4 复盘审查，2026-08-21）

P4 交付后复盘审查发现的待改进项（另：seed 菜单两轮回填事务化已当场清偿，commit `b25f7f0`）：

| # | 优先级 | 事项 | 现状与结论 | 建议处置时机 |
| --- | --- | --- | --- | --- |
| 1 | P1 | 三域均缺 `GET /:id` 详情接口 | 规格内裁剪（端点表本就未定义）；列表接口已返回全量字段 | P5 与前端联调契约一并决策 |
| 2 | P2 | 菜单软删后子节点成“逻辑孤儿” | §4.3 刻意设计（不级联，孤儿子树从树中自然隐身）；`findAliveMenu` 不校验父链 | 与 #1 绑定：若引入详情接口，同步补父链完整性校验 |
| 3 | P2 | 子资源替换的并发窗口 | `deleteMany+createMany` 已在 `$transaction` 内；残余窗口在事务外的 `assertActiveRoleIds/assertActiveMenuIds` 预校验，后果因全查询 `alive()` 过滤而无害 | 管理后台低并发不做隔离级别/行锁；真实高并发需求出现时再决策 |
| 4 | P3 | e2e 套件级临时数据清理 | `global-teardown` 已全表 truncate + FLUSHDB，跨运行零污染；套件内靠唯一命名 + 套件级 FLUSHDB 规避 | 卫生项，有余力时补 afterAll 定点清理 |

