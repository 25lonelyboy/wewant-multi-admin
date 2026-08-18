# NestJS 后端基架补全 · P4 system RBAC CRUD 与测试门禁设计

> 本文档为总 spec（`2026-08-16-nestjs-backend-foundation-design.md`）P4 阶段的「分」设计。总 spec 已锁定的决策（信封契约、错误码、RBAC 模型、守卫链顺序等）此处不重复，仅记录 P4 范围内的澄清结论、设计细化与对总 spec 的修订备案。
>
> P4 双重身份：总 spec §11 的「测试门禁」阶段 + P3 分设计 §1 显式顺延的「system 四页 CRUD」（P4 收窄为三域，见 §1）。

## 1. P4 范围与验收口径

**功能主线**（P3 顺延项，澄清后收窄）：用户 / 角色 / 菜单三域 RESTful CRUD + 用户-角色分配 + 角色-菜单分配。消费 seed 既有 16 权限点（`system:{user|role|menu|dept}:{query|add|update|delete}` 形态，dept 点保留但无消费方），**不新增权限点、不新增错误码段**。

**测试门禁主线**（总 spec §9/§11）：单测 + e2e 合并覆盖率 80% 四指标门槛（独立命令，见 §6）、system e2e 四类示范用例（§7）、既有隔离策略文档固化。

**明确不做**（YAGNI 裁剪）：

| 项 | 理由 |
| --- | --- |
| dept 域（表/树端点/前端页面接口） | schema 无 Dept 表，属业务域；seed 的 `system:dept:*` 权限点保留不消费 |
| 监控域（在线用户/四类日志） | 需 3-4 张新表 + 采集机制，偏离基架定位 |
| 高级密码策略（新建用户随机密码、首登强制改密、90 天过期） | **backlog 已登记**，留基架完善收尾阶段统一决策 |
| 独立重置密码端点 | P4 用「更新时可选传 password」覆盖，细粒度权限点需求不成立 |

**验收口径**：

1. 三域 CRUD 端点全部可用且挂 `@RequirePermissions`；护栏用例（§5）拒绝路径生效
2. system e2e 四类示范用例全绿（§7）；既有 auth/health e2e 回归不破坏
3. `pnpm --filter @multi-admin/nestjs-server run test:coverage` 合并覆盖率四指标 ≥80%
4. `pnpm check` 全绿（口径不变：prettier/typecheck/lint/单测）
5. 文档同步：AGENTS.md、总 spec 修订备案、`docs/engineering/build-and-verify.md`（test:coverage 命令与 e2e 前置条件）

## 2. 澄清阶段结论

| 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- |
| P4 功能范围 | 三域 CRUD + 测试门禁（零新增权限点） | 含 dept 域（多一次迁移 + 树形 CRUD 成本）；含监控域（范围膨胀偏离基架）；仅测试门禁（RBAC 管理闭环缺失） |
| 端点契约风格 | **完全 RESTful**：GET + query 查询、标准动词写操作、`/system/*` 分组 | 收拢分组 + 继承 mock 语义（POST 查询欠 REST 语义）；完全继承 mock（平铺路径污染根域，与 P3 端域分组方向相悖） |
| 模型字段缺口 | **全量对齐 mock**：User 加列、Menu 扩字段 + MenuType 扩枚举、Role 补 remark/时间戳（一次 migration） | 契约收敛不加列（前端页面字段大面积缺）；只加常用四列（半对齐留尾巴） |
| 写操作护栏 | 最小必要护栏（§5），集中 service 层 | 强保护内置种子（未来清理 seed 菜单需改码解锁，灵活性差）；不加护栏（误操作可锁死系统） |
| 密码策略 | 新建必填、更新可选传则重置；高级策略入 backlog | 独立重置密码端点（需新增权限点，过度设计） |
| 覆盖率口径 | **单测 + e2e 合并覆盖率**，独立 `test:coverage` 命令 | 单测口径 + 胶水排除（不反映真实链路覆盖）；不设门槛（违背总 spec §9 已锁决策） |
| 门禁挂载 | 独立命令，`pnpm check` 不变（test 门仍只跑单测） | 并入 pnpm check（硬依赖本机 postgres/redis，日常门禁变重变慢） |
| e2e 示范用例 | 四类（CRUD 全链路/授权矩阵/护栏/写后读一致性）+ 隔离策略仅文档固化 | 两类（护栏端到端路径缺验证）；加并发用例（system CRUD 无高并发需求） |

## 3. 数据模型迁移（一次 migration）

**原则**：新列一律 nullable 或带默认值，seed 与存量数据零破坏；e2e globalSetup 的 migrate 链自动应用，无需额外适配。

### 3.1 User 加列（全量对齐 mock 用户字段，dept 除外）

```prisma
model User {
  // 既有：id / username / password / nickname / status / roles / createdAt / updatedAt
  avatar  String?
  phone   String?
  email   String?
  sex     Int?      // 沿用 mock 语义 0/1，DTO @IsIn([0,1])
  remark  String?
}
```

### 3.2 Menu 扩字段（对齐 vue-pure-admin 元数据全集）

- **MenuType 枚举扩展**：`MENU | BUTTON` → `MENU | IFRAME | EXTERNAL | BUTTON`（对应 mock menuType 0/1/2/3）。migration 用 `ALTER TYPE ... ADD VALUE`。seed 只用 MENU/BUTTON，不受影响。
- **新增 13 列**（均为 nullable 或布尔默认值）：`redirect`、`extraIcon`、`enterTransition`、`leaveTransition`、`activePath`、`auths`、`frameSrc`（均 String?）+ `frameLoading Boolean @default(true)`、`keepAlive`/`hiddenTag`/`fixedTag`/`showParent Boolean @default(false)`、`showLink Boolean @default(true)`。
- **字段映射约定**（避免语义重复列）：mock `rank` ↔ schema 既有 `sort`；mock `showLink` ↔ 契约序列化输出，schema 侧**复用既有 `visible`**（即契约层 `showLink = visible`，不新增 showLink 列）；mock `menuType` ↔ `type` 枚举。

### 3.3 Role 补列

`remark String?` + `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`（mock 角色列表含 createTime/updateTime/remark，现 schema 缺失）。

### 3.4 序列化约定

- 响应字段名**保留 mock 形态**（`createTime` = `createdAt` 毫秒时间戳、`updateTime` 同理），HTTP 语义 RESTful 而字段名从前端兼容，P5 适配代价最小化（修订备案 2）。
- 密码 hash 永不进响应（总 spec §6.1 既有约束），用户 DTO 序列化剔除 `password`。

## 4. RESTful 端点契约

路径分组 `/system/*`（沿用 P3 端域收拢先例）；全局守卫链不变（Throttler → JwtAuth → Permissions）；所有端点非 `@Public`，全部挂 `@RequirePermissions`。Swagger tag `System`（P3 预留位兑现）。

### 4.1 用户域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/users?page&pageSize&username&status` | `system:user:query` | 分页 + 筛选；list 项含 roles（code 数组）、剔除 password |
| `POST /system/users` | `system:user:add` | body 含 username/password（必填）/nickname/status/全量对齐字段/`roleIds?`（创建即分配） |
| `PUT /system/users/:id` | `system:user:update` | password 可选（传则 argon2 重置）；`roleIds` 可选（传则整体替换分配） |
| `DELETE /system/users/:id` | `system:user:delete` | 硬删除，UserRole 级联（schema onDelete Cascade 既有） |
| `GET /system/users/:id/roles` | `system:user:query` | 返回角色 id 列表（对 mock `/list-role-ids`） |
| `PUT /system/users/:id/roles` | `system:user:update` | body `{roleIds}` 整体替换 |

### 4.2 角色域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/roles?page&pageSize&name&code&status` | `system:role:query` | 分页 + 筛选 |
| `GET /system/roles/all` | `system:role:query` | 不分页全量 `{id,name,code}`（用户页下拉，对 mock `/list-all-role`） |
| `POST /system/roles` | `system:role:add` | code 唯一约束冲突 → 派生码 40900 |
| `PUT /system/roles/:id` | `system:role:update` | 可改 name/status/remark，code 不可改（唯一业务标识） |
| `DELETE /system/roles/:id` | `system:role:delete` | RoleMenu/UserRole 级联删除 |
| `GET /system/roles/:id/menus` | `system:role:query` | 返回关联菜单 id 列表（对 mock `/role-menu-ids`） |
| `PUT /system/roles/:id/menus` | `system:role:update` | body `{menuIds}` 整体替换（事务 deleteMany + createMany） |

### 4.3 菜单域

| 端点 | 权限点 | 说明 |
| --- | --- | --- |
| `GET /system/menus` | `system:menu:query` | 全量树（无分页，树形结构），按 sort 升序；对 mock `/menu` + `/role-menu` |
| `POST /system/menus` | `system:menu:add` | name 唯一冲突 → 40900；permission 仅 BUTTON 型必填校验 |
| `PUT /system/menus/:id` | `system:menu:update` | 可改字段含 parentId（移动节点），禁止指向自身/自身子树（防环，service 校验） |
| `DELETE /system/menus/:id` | `system:menu:delete` | **级联删整棵子树** + RoleMenu 关联（Prisma cascade）；Swagger 明示该行为 |

### 4.4 分页与响应形态

- 分页响应 data 保留 `{list, total, pageSize, currentPage}`（前端 ReTable/useTable 直接消费形态）；查询参数 GET query 化（`page` 默认 1、`pageSize` 默认 10、上限 100）。
- 树形/全量端点（menus、roles/all）data 直接为数组。
- 错误复用既有 BizCode 与派生规则：唯一约束冲突 → 40900（409 派生）；护栏拒绝 → 40900（业务规则冲突语义）；入参校验 → 40001。**无新增码段**。

## 5. 写操作护栏（service 层集中实现，单测全覆盖）

| # | 护栏 | 违反时 |
| --- | --- | --- |
| 1 | 禁删/禁禁用超管 `admin` 用户与 `admin` 角色（防自锁） | BizException 40900 + 明确 message |
| 2 | 操作者不能禁用/删除自己（`@CurrentUser` 比对） | 同上 |
| 3 | 菜单 parentId 变更禁止成环（指向自身或自身子孙） | 同上 |
| 4 | 新建用户 password 必填；更新可选（传则 argon2 重哈希） | 40001 DTO 校验 |
| 5 | 角色/菜单/用户变更后**不做会话吊销**：P3 JwtAuthGuard 实时查库，禁用/改权下一请求即生效 | —（设计事实，非实现项） |

## 6. 测试门禁：合并覆盖率流水线

**载体**：新增 `test:coverage` 脚本链（独立命令，`pnpm check` 不变）：

```
单测 jest --coverage（coverage/）
  → e2e jest --config test/jest-e2e.cjs --coverage（coverage-e2e/）
  → node test/merge-coverage.cjs（自研合并 + 门槛校验）
```

- **合并脚本自研**（`test/merge-coverage.cjs`，零新增依赖）：读两份 `coverage-final.json`，按文件路径合并 statement/branch/function 计数映射（计数相加、键取并集），写出合并产物后**直接计算四指标百分比并校验 ≥80%**，输出汇总表 + PASS/FAIL，失败非零退出。不引入 istanbul-merge/nyc 工具链。
- **收集范围与排除清单以共享常量落进 `test/jest.base.cjs`**（单一事实源），由单测/e2e 两份配置各自按 rootDir 组装 `collectCoverageFrom`（单测 rootDir=src、e2e rootDir=.，相对路径不同，不能原样复用同一数组）。排除清单与理由：

| 排除项 | 理由 |
| --- | --- |
| `src/generated/**` | Prisma codegen 产物，非手写代码 |
| `**/*.spec.ts` / `**/*.e2e-spec.ts` | 测试文件自身 |
| `**/*.d.ts` | 类型声明无可执行语句 |
| `main.ts` | bootstrap 胶水（总 spec §12 既有预案） |

  **注意**：`*.module.ts` 装配胶水**不排除**——e2e 运行期真实实例化它们，正是合并口径的价值所在。
- 总 spec §9「jest coverageThreshold 自动随 pnpm check 生效」口径作废，改由本流水线承担（修订备案 1）。
- 前置条件：e2e 需本机 compose postgres/redis 健康（总 spec §12 既有前提），写入 build-and-verify.md。

## 7. system e2e 四类示范用例与隔离固化

新增 `test/system.e2e-spec.ts`，复用既有登录 helper 与 fixture：

1. **CRUD 全链路**：三域创建→查（分页/筛选断言）→改→删；用户-角色、角色-菜单分配往返；菜单删除后子树与角色关联消失（级联断言）。
2. **授权矩阵**：套件内建测试角色仅挂 `system:user:query` 一点 → 查询过、写操作 40301；admin 通配全端点通过；未登录 40101。
3. **护栏用例**：删 admin 角色 / 禁用 admin 用户 / 禁用自己 / 菜单父节点指向自身 → 40900 业务码与 message 断言。
4. **写后读一致性**：改角色-菜单关联后，重新登录（或 get-user-info/get-async-routes）权限集与路由树即时变化——验证 P3 实时查库口径。

**隔离策略固化**（不新增机制）：既有 globalSetup（幂等建 `multi_admin_test` → migrate → seed）+ globalTeardown（truncate 全表 + FLUSHDB）已覆盖 Postgres 与 Redis 双状态；本阶段仅在分设计 + build-and-verify.md 成文固化（总 spec §9 状态隔离行兑现）。套件内新增的测试角色/用户由 truncate 统一清理，无需用例级 teardown。

## 8. 模块落位与依赖

```
src/modules/system/
├── system.module.ts
├── user/{user.controller,user.service,user.service.spec}.ts + dto/
├── role/{role.controller,role.service,role.service.spec}.ts + dto/
└── menu/{menu.controller,menu.service,menu.service.spec}.ts + dto/
test/system.e2e-spec.ts
test/merge-coverage.cjs
```

- **零新增运行时依赖**：CRUD 全部用既有 Prisma/class-validator/Swagger 能力。
- 分页查询通用形态（page/pageSize/筛选 → skip/take/where）在 system 域内抽公共小工具，不上提到 common（单消费者，YAGNI）。
- route-tree.ts（P3 产物）随 Menu 扩列同步增强：IFRAME/EXTERNAL 节点与新增 meta 字段（frameSrc/keepAlive 等非空即输出）；既有断言为回归基线。

## 9. 风险与预案

| 风险 | 预案 |
| --- | --- |
| Menu 扩列/枚举扩展冲击 route-tree 与 get-async-routes 既有断言 | 新列全 nullable/默认值，组装逻辑只增不改既有字段；P3 e2e 断言原样通过为回归门禁 |
| 自研合并脚本计数口径与 istanbul 不一致 | 实施时用 istanbul 文本报告对拍一次（冒烟即弃），四指标算法取 istanbul 同口径（covered/total 比值，branch 按组计） |
| e2e 依赖本机 compose postgres/redis | build-and-verify.md 写明前置条件（总 spec §12 既有预案） |
| migration 影响测试库/生产启动链 | e2e globalSetup 与 Dockerfile `migrate deploy` 同链自动应用；枚举 ADD VALUE 幂等性在 migrate deploy 回归验证 |
| 合并覆盖率首次实测不达 80% | 缺口集中在存量 0% 文件（filter/strategy/dto/controller），随 system 域单测补全任务一并清偿；以实测为准，不为凑数写空断言 |
| 护栏「admin 标识」耦合 seed 字面量 | 判定统一走 `code === 'admin'` / `username === 'admin'` 常量并注释来源（seed 内置），未来可配置化留 backlog |

## 10. P4 完成判定

- [ ] 一次 migration 落地（User 加列 / Menu 扩列 + 枚举扩展 / Role 补列），`migrate deploy` 幂等回归通过
- [ ] 三域 CRUD + 两类分配端点全量可用，Swagger `System` tag 可见（非生产）
- [ ] 护栏 5 项（§5）单测 + e2e 双层覆盖
- [ ] system e2e 四类示范用例全绿（§7）；auth/health e2e 回归不破坏
- [ ] `test:coverage` 合并四指标 ≥80%；`pnpm check` 全绿
- [ ] 文档同步：AGENTS.md、总 spec 修订备案（§11）、build-and-verify.md

## 11. 对总 spec 的修订备案

| # | 修订 | 影响章节 |
| --- | --- | --- |
| 1 | 覆盖率门槛载体从「jest coverageThreshold 随 pnpm check 自动生效」改为「独立 `test:coverage` 合并流水线（单测+e2e）」，pnpm check 的 test 门维持单测不变 | §9 测试体系「门禁接入」行 |
| 2 | system 端点契约**完全 RESTful**（GET query 查询 + 标准动词），与 pure-web mock 平铺 POST 查询构成契约偏离；响应 data 字段名保留 mock 形态（list/total/pageSize/currentPage/createTime）最小化前端适配。P5 适配清单增补：`src/api/system.ts` 全部请求改 RESTful 路径/方法/参数、去掉 dept/监控域调用、字段名按 §3.4 映射 | §8 接口契约 |
| 3 | P4 范围收窄：dept 域与监控域不在基架阶段实施（mock 有而 schema 无的域一律留业务阶段）；`system:dept:*` seed 权限点保留不消费 | §11 P4 行（口径补充） |
| 4 | User/Menu/Role 全量对齐 mock 字段，P4 产生一次 migration；MenuType 枚举扩展 IFRAME/EXTERNAL | §6.2 数据模型 |
| 5 | 高级密码策略（随机初始密码/首登强制改密/90 天过期）登记 backlog，留基架完善收尾阶段决策 | 新增 backlog（本文档 §1） |
