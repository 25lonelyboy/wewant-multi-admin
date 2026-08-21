# NestJS 后端基架补全 P5 分设计：contracts 与前端直连对齐

> 总设计：[2026-08-16-nestjs-backend-foundation-design.md](./2026-08-16-nestjs-backend-foundation-design.md)。本文档为 P5 阶段「分」设计（只追加不改写）。P5 是本任务域（2026-08-16-nestjs-backend-foundation）的最终阶段，收口时任务目录归档、未处置 backlog 迁移至事实域。

## 1. 目标与范围

**目标**：P5 结束时 pure-web 开发模式**直连真实后端**（登录 → 动态路由 → system 三域 CRUD + 详情 → 账户个人信息全走真库），`packages/contracts` 成为前后端契约唯一事实源并建立长期对齐机制；mock 降级为 env 开关的离线模式；文档收尾（architecture 契约规范、ADR-004、AGENTS.md、全局 backlog）。

**口径修订（对总 spec §11 P5 行）**：总 spec 验收口径「pure-web mock 态运行正常、联调当天零改动切换」作废，实际口径为**直连真实后端 + mock 离线降级**。理由：澄清阶段用户明确选择直连；mock 保留为离线开关而非默认数据源。总 spec §11 将在 P5 文档收尾任务中追加修订指针。

**实施策略**：横向分层五层推进——① contracts 建包 → ② server 迁移 + 详情端点 + seed 裁剪 → ③ pure-web api/页面适配 → ④ vite proxy 直连 + 离线开关 → ⑤ 文档收尾。每层有独立验证点（typecheck/单测/e2e/手工清单）。

## 2. 已锁定决策（澄清阶段产出）

| # | 决策点 | 结论 | 被否方案及理由 |
| --- | --- | --- | --- |
| 1 | P5 边界 | 直连真实后端（推翻总 spec「mock 态运行正常」字面口径） | 纯契约对齐不联调（「前端联调待 P5」文档陈述落空）；保留 mock 默认（双数据源常态维护成本高） |
| 2 | dept/监控域 | seed 菜单树移除 Dept 页与 Monitor 整组；前端 views/api/mock 一律不动，backlog 登记「待后端实现后重新启用」 | 剪除模板存量（用户明确要求前端功能保持不动）；页面保留供数（无后端支撑） |
| 3 | mock 去留 | 保留 vite-plugin-fake-server 作离线降级模式（`VITE_MOCK` env 开关），mock 升级契约同形 | 彻底移除 mock（用户选择保留离线能力） |
| 4 | 详情接口 | P5 补齐 user/role/menu 三个 `GET /:id`，菜单附父链完整性校验，关闭 backlog #1/#2 | 不加（用户明确要求补齐） |
| 5 | contracts 范围 | 总 spec §8 清单 + System 域 VO/请求类型/分页等通用契约；**通用层/域层两级分层**，通用项不埋在域目录下 | 仅总 spec 字面清单（前端自造类型，契约包名不副实） |
| 6 | 对齐机制 | M1 编译期绑定 + 分层护栏（见 §3.3） | M2 运行时 zod schema（契约包失去零运行时定位、与 class-validator 双轨冲突）；M3 OpenAPI codegen（引入工具链、事实源转移，单人项目过重） |
| 7 | 实施策略 | 方案 A 横向分层 | 方案 B 纵向域切片（公共件仍需先铺、server 横切迁移拆不干净）；方案 C mock-first（单人会话无并行收益） |
| 8 | 高级密码策略（P4 记录 5） | 当前不做、**不关闭**，迁移至全局 backlog；触发条件：多用户/多端真实接入场景出现 | 直接关闭（用户明确要求保留登记）；P5 实施（argon2 成本参数已是强度底线，当前 ROI 低） |
| 9 | 未处置 backlog 归宿 | 任务域收口时迁移至 `docs/governance/backlog.md`（见 §7.2） | 留守 tasks/archive（退出默认读取路径等于活埋）；进事实源层（违反「事实只写已验证行为」红线）；进 decisions/（不满足 ADR 准入） |
| 10 | mine 域（审查新增） | P5 只补 profile：migration 补 User 四列 + 新增 `GET /auth/profile`；mine-logs 与头像上传登记 backlog | 全补（SecurityLog 表 + 三处埋点 + UA 解析约一个迷你域体量，且提前破备案 3 排除的日志域口子）；不补（账户设置页静态可达，直连后坏页体验不一致） |

## 3. contracts 包设计（`packages/contracts`，`@multi-admin/contracts`）

### 3.1 包定位与构建形态

纯 TS 类型 + 常量，**零运行时依赖**；禁止 class-validator 装饰器、zod schema、任何运行时库 import（靠零依赖 package.json 与 review 约定约束，不额外加 lint 规则，YAGNI）。

构建照搬 `packages/common` 的 tsdown 模板：ESM + CJS 双格式 + dts（`index.d.ts` / `index.d.cts`）、`platform: 'neutral'`、target es2022。理由：消费方横跨 Vite（ESM）、Nest（`"type": "module"`）、jest 三处，双格式零解析风险，模板已在 common 验证。

构建顺序保障：消费方（nestjs-server / pure-web）的 `pretypecheck` / `pretest` / `build` 前置串联 contracts 构建（幂等、秒级），根 `pnpm build` 全 workspace 覆盖，杜绝陈旧 dist 类型失真。

### 3.2 目录结构：通用层 / 域层两级

**分层准则（写入契约规范文档，作为未来业务扩展的识别准绳）**：

- **通用层**：与业务域无关、≥2 个域会消费的契约。新出现的通用诉求一律先落通用层；
- **域层**：按业务域平行建目录（`auth/`、`system/`，未来平级新增），域内类型不跨域引用；跨域共享即上提通用层；
- **上提准绳**：出现第二个消费者时上提；无消费场景不预造（批量操作结果、通用排序/过滤参数本轮不做）。

```
packages/contracts/src/
├── common/                    # 通用层（跨域复用）
│   ├── envelope.ts            # ApiResponse<T>
│   ├── biz-code.ts            # BizCode 常量
│   ├── pagination.ts          # PageQuery {page,pageSize}、PageResult<T> {items,total,page,pageSize}
│   └── conventions.ts         # 约定类型：ISO 8601 时间字符串类型别名、id 为 string 等表达约定
├── auth/                      # 域层：认证
│   └── index.ts               # LoginRequest/TokenPair/登录响应/刷新响应/UserProfile（mine profile：avatar/email/phone/description，均可空）/AsyncRouteNode（动态路由节点）
├── system/                    # 域层：system 三域
│   ├── user.ts                # UserVO、CreateUserRequest、UpdateUserRequest
│   ├── role.ts                # RoleVO、CreateRoleRequest、UpdateRoleRequest
│   ├── menu.ts                # MenuVO（含 MenuMeta）、MenuType 常量、CreateMenuRequest、UpdateMenuRequest
│   └── index.ts
└── index.ts                   # 桶导出
```

**本轮识别的通用契约清单**：

| 通用项 | 本轮消费方 | 前瞻性判定 |
| --- | --- | --- |
| `ApiResponse<T>` / `BizCode` | 全端点 | 天然通用 |
| `PageQuery` / `PageResult<T>` | 三域列表 | 泛型化一次到位，未来列表端点直接复用 |
| ISO 8601 时间字符串约定 | 三域 VO 的 createdAt/updatedAt | 全库统一表达，避免各域自写注释 |
| `MenuMeta` | 留在 `system/menu` | 仅菜单域消费不上提；未来 uni-mobile 消费路由树走 auth 域 AsyncRouteNode，仍不升通用层 |

### 3.3 长期对齐机制（M1 四件套）

1. **编译期绑定**：server 与 pure-web 均 `workspace:*` 依赖 contracts，根 `pnpm typecheck` 全 workspace 门禁——任一端字段漂移立即编译报错；
2. **e2e 引用契约常量**：server e2e 对信封与 BizCode 的断言直接引用 contracts，运行时形状被测试钉住；
3. **契约一致性单测**：auth + user/role/menu 每域一条——DTO/序列化产物实例 `satisfies` 契约 VO，字段漂移编译期即红；
4. **contracts 先行流程文档化**：`docs/architecture/` 契约规范写明扩展流程——新业务端点一律先在 contracts 落类型 → server 实现 → 前端消费；AGENTS.md 架构要点同步一条。

局限声明：M1 不防「两端同时错」（类型对了语义错），由 e2e 示范用例兜底。

## 4. server 侧改造

### 4.1 contracts 消费与迁移

- nestjs-server 增加 `@multi-admin/contracts: workspace:*`；
- **迁移即删除原址**（不留 re-export 过渡壳，typecheck 兜底 import 修正）：
  - `BizCode`：`src/common/errors/biz-code.ts` → contracts `common/biz-code.ts`；
  - `ApiResponse<T>`：`src/common/interceptors/response-envelope.interceptor.ts` 内接口 → contracts `common/envelope.ts`；
  - Auth 域响应类型（登录响应/profile/async-routes 节点类型）→ contracts `auth/`；**`TokenPair`（含 `sid` 的内部类型）不整体迁入**：contracts 只定义对外契约形状，刷新响应与登录令牌部分同形 `{accessToken, refreshToken, expires}`，`sid` 留 server 内部（refresh 端点同步剥离，见 §5.3）；
- **class-validator 的 DTO 类留在 server**（校验是服务端职责），字段形状与契约类型以 `satisfies` 绑定；
- 分页响应走 contracts `PageResult<T>`（users/roles 列表已是 `{items,total,page,pageSize}` 形态，仅类型来源切换；menu 为全量活跃树无分页，roles `/all` 为不分页数组，二者不套 PageResult）。

### 4.2 三个详情端点（关闭 P4 backlog #1/#2）

| 端点 | 行为 | 权限点 |
| --- | --- | --- |
| `GET /api/v1/system/users/:id` | 活跃记录返回 UserVO；不存在/已软删 → 40404 | `system:user:query` |
| `GET /api/v1/system/roles/:id` | 同上返回 RoleVO | `system:role:query` |
| `GET /api/v1/system/menus/:id` | 同上返回 MenuVO，**附加父链完整性校验**：沿 parentId 上行须全部 alive 至根；断链（逻辑孤儿）按 40404 处理 | `system:menu:query` |

菜单断链按 40404 的理由：与「孤儿子树在树/列表中自然隐身」的 P4 §4.3 既有语义对齐——父链断裂的节点在所有读路径上均视为不存在。配套：三域各补单测 + system e2e 补详情用例（200 / 40404 / 断链 40404）；Swagger 注解同步。

### 4.3 seed 菜单裁剪

- `prisma/seed-data.ts`：`MENU_TREE` 移除 System 组下 Dept 页与 Monitor 整组；`PAGE_PERMISSION_PREFIX` 移除 `SystemDept`；按钮权限点随树推导自然 16 → 12（注释同步）；
- **连带测试更新（同一任务内）**：auth e2e 的 get-async-routes 树形断言、`buildButtonSeeds` 推导断言、system e2e 中依赖 seed 菜单数量的断言；
- 前端 dept/监控 views/api/mock 一律不动；分设计与全局 backlog 登记「dept/监控域待后端实现后重新启用」。

### 4.4 mine profile 端点（决策 #10）

- 一次 migration 为 User 表补 4 个 nullable 列：`avatar String?` / `email String?` / `phone String?` / `description String?`（存量数据零破坏；e2e globalSetup migrate 链自动应用）；
- 新增 `GET /api/v1/auth/profile`：返回 UserProfile `{avatar, username, nickname, email, phone, description}`（四新字段均可空）；已交付的 `get-user-info` 端点不动；
- 头像上传/文件存储本轮不做：avatar 仅字符串字段（未来置入 URL），上传链路登记 backlog（§7.3）。

### 4.5 回归门禁

单测 + e2e 全绿；`test:coverage` 合并四指标 ≥80%（新端点摊薄覆盖率，用例必须真实覆盖行为，不允许空断言灌水）。

## 5. pure-web 侧改造

### 5.1 数据源切换与离线开关

- **复用既有 `VITE_MOCK` 链路**：`build/plugins.ts` 已按 `VITE_MOCK` 条件注册 fake-server（关闭时整个插件不挂载），`.env.development` 已默认 `VITE_MOCK=false`；P5 仅在 `vite.config.ts` 补 `server.proxy`（现为空 `{}`）：`/api/v1` → `http://localhost:3000`（server env.schema PORT 默认值，已核实）；`VITE_PORT` 8848 与 `CORS_ORIGIN` 默认值对齐（dev 直连走同源 proxy，不触发 CORS）；
- 注意存量事实：fake-server `enableProd: true`——构建期若 `VITE_MOCK=true` mock 会注入生产产物；`pnpm build:web` 验收须在默认 env 下复核；
- mock 文件 URL 全部升级 `/api/v1` 前缀 + 契约同形（信封/字段名/分页/menuType/expires 时间戳），开关切回 true 时离线全功能可用；两态下前端 api 层代码零差异（同 baseURL、同路径、同形状）；
- mock 响应体以 contracts 类型约束的共享 fixture 组织，压制双源形状漂移。

### 5.2 api 层重写（类型全部来自 contracts）

- auth 域（`src/api/user.ts` 的 login/refresh/getMine、`src/api/routes.ts` 的 async-routes）：路径换 `/api/v1/auth/*`，形态以 P3 已交付端点为准（不做 RESTful 改造，总 spec 既定），类型换 contracts `auth/`；`getMine` 改调 `GET /api/v1/auth/profile`（决策 #10）；前端不消费 `get-user-info`（用户信息取自登录响应），该端点保持不动；
- `src/api/system.ts` user/role/menu 部分按 P4 实际交付端点集重写（更新动词为 **PUT** 而非 PATCH）：
  - users：`GET /users`（PageQuery 走 query 参数，废 POST body 查询）/ `POST` / `PUT /:id` / `DELETE /:id` / `GET /:id`（P5 新增）/ `GET|PUT /:id/roles`；
  - roles：同构 + `GET /all`（不分页，用户页下拉）+ `GET|PUT /:id/menus` + `GET /:id`（P5 新增）；
  - menus：`GET`（全量活跃树，无分页）/ `POST` / `PUT /:id` / `DELETE /:id` / `GET /:id`（P5 新增）；
  - 类型换 contracts `system/`；**dept/监控函数原样保留**（决策 #2）；
- 自造的 `Result` / `ResultTable` 类型删除，统一用 contracts `ApiResponse<T>` / `PageResult<T>`。

### 5.3 认证链路适配

- 登录/刷新响应按契约形状适配 `src/utils/auth.ts` `DataInfo`：`expires` 为**毫秒时间戳 number**（后端契约既定，token.service 注释明写「前端一行切换」，模板 auth.ts 预留切换点：`DataInfo<number>` + `expires = data.expires`）；`avatar: string | null` 可空展示；
- server refresh 端点同步剥离 `sid`（会话内部实现细节不入契约），刷新响应与登录令牌部分同形 `{accessToken, refreshToken, expires}`（§4.1）；
- http 拦截器错误判定改引用 contracts `BizCode`：40102（access 过期）走模板既有单飞刷新骨架（`isRefreshing` + 请求队列），refresh 亦失败则清态回登录页；其余非 0 code 走统一错误提示。

### 5.4 system 三域页面适配（`views/system/user|role|menu` 及其 hook）

- 分页形态 `{list,total,pageSize,currentPage}` → `PageResult {items,total,page,pageSize}`（仅 user/role 两个列表页；menu 页为树形无分页）；
- 时间列 `createdAt/updatedAt` 为 ISO 字符串（dayjs 直接解析，无旧格式兼容负担）；
- menuType：表单/展示处数字 0/1/2/3 与 contracts `MenuType` 常量互转，映射表作为前端常量紧邻契约消费处定义（后端枚举为事实源，前端数字仅为模板控件表达）；
- `rank` 一律改用 `sort`，不建映射层（P4 分设计记录 2 既定）。

适配圈死锁：仅三域 views/hook + account-settings（见 §5.5）+ api 层 + 拦截器 + store 认证动作，其余模板文件不动。

### 5.5 account-settings 适配（决策 #10）

- `getMine` 改调 `GET /api/v1/auth/profile`，`UserInfo` 类型换 contracts UserProfile（email/phone/description/avatar 均可空，空态展示正常）；
- `getMineLogs` 指向 `/api/v1/mine-logs`（端点预留位，P5 不实现）：直连态该请求 404，SecurityLog 标签呈空表/失败提示（属预期过渡态，验收清单与 backlog 登记）；离线态由升级后的 mock 正常供数；组件代码不动。

### 5.6 门禁

pure-web typecheck（`strict: false` 现状不动，消费 contracts 编译必须过）、lint（`--max-warnings 0`）、`pnpm build:web` 通过（electron 链路载体不回归）。

## 6. 测试与验收

**contracts 包自身**：纯类型 + 常量无运行时逻辑，不设测试基建，typecheck + lint 即门禁（YAGNI）。

**server 自动测试**：见 §4.2 / §4.3 / §4.4 与 §3.3 第 3 件。

**联调手工验收清单（P5 出口考试）**：

1. 启动链：compose postgres/redis → migrate + seed → `pnpm dev:server` → `pnpm dev:web`；
2. admin 登录 → 侧边栏仅 System 组三页（Dept/Monitor 不可见）；
3. 三域 CRUD 全操作 + `GET /:id` 详情回填 + 软删后 40404 提示；
4. account-settings 个人信息正常展示（四新字段可空空态正常），SecurityLog 标签空态属预期；
5. access 过期触发 40102 静默刷新（临时调低 `JWT_ACCESS_TTL` 验证），refresh 失效回登录页；
6. 登出后旧 access 被黑名单拒绝；
7. `VITE_MOCK=true` 离线态：登录/路由/三域列表/个人信息/安全日志（mock 契约同形）全流程可用；
8. `pnpm build:web` 产物正常；
9. `pnpm check` 全绿 + server `test:coverage` 合并四指标 ≥80% + 双端 typecheck 消费 contracts。

## 7. 文档收尾与 backlog 处置

### 7.1 文档动作（docs-in-same-commit）

- `docs/architecture/` 新增**契约规范**文档：contracts 先行扩展流程、通用层/域层分层准则与上提准绳、信封与错误码表（自总 spec §5 提升）、分页/时间约定；登记进 architecture README 索引；
- **ADR-004**（总 spec §2 既定义务）：Prisma vs Drizzle、Lucia/Better Auth（2025-03 弃维）、zod vs Joi 对照结论 + 本轮新增决策（contracts 包形态 tsdown 双格式、M1 对齐机制、P5 直连口径推翻 mock 态验收）；
- `repo-structure.md`：新增 `packages/contracts` 行；pure-web 行改「默认直连 + 离线 mock 开关」；nestjs-server 行「前端联调待 P5」→ 已联调；
- `AGENTS.md`：workspace 表补 contracts 行、架构要点补 contracts 先行一条、pure-web/nestjs-server 行更新；
- 总 spec §11 P5 行追加修订指针（实际口径以本分设计为准）；
- `build-and-verify.md` 补 contracts 构建链与 `VITE_MOCK` 开关说明。

### 7.2 全局 backlog 归档机制（本轮新立）

**问题**：任务域（tasks/）中识别但未处置关闭的 backlog，随任务归档进入 `tasks/archive/` 后退出默认读取路径，等于活埋。

**判定（逐层排除）**：

| 候选 | 判定 | 依据 |
| --- | --- | --- |
| architecture / engineering / product / operations | ❌ | 红线「事实只写已验证行为，未落地意图不进事实源」 |
| decisions/（ADR） | ❌ | ADR 准入为「不可逆、影响边界、含真实权衡」，延期项是可重议开放事项 |
| tasks/archive 原地留守 | ❌ | 归档防误读机制将其定性为「仅显式追溯的历史」 |
| **governance/** | ✅ | 治理分类学中 governance 层职责谱含 roadmap，全局 backlog 为同类职责（未落地意图的活登记册） |

**落地**：新建 `docs/governance/backlog.md`（frontmatter `status: living` + `last_verified`）+ governance README 索引；修订 `docs/README.md` 目录职责表 governance 行（原「职责并入本文件，不单独建目录」声明仅针对文档体系维护规则，backlog 是新职责）。

**登记规则**：每条含来源任务与日期、优先级、现状结论、**再议触发条件**、源文档指针；单向指针——任务文档原 backlog 章节留一行「已迁移至 governance/backlog.md」；条目清偿/关闭时更新处置记录。

### 7.3 backlog 处置表

| 项 | 处置 |
| --- | --- |
| P4 #1 详情接口 / #2 菜单父链校验 | P5 交付，关闭 |
| P4 #3 子资源替换并发窗口 | 不关闭，迁移至 `docs/governance/backlog.md`；触发条件：真实高并发管理场景出现 |
| P4 #4 e2e 套件级临时数据清理 | 不关闭，迁移至 backlog；触发条件：global-teardown 兜底失效或套件间污染复现 |
| 高级密码策略（P4 记录 5） | 当前不做、不关闭，迁移至 backlog；触发条件：多用户/多端真实接入场景出现（argon2 成本参数目前是强度底线） |
| dept/监控域后端实现 | 新增登记入 backlog；触发条件：两域业务需求立项（届时 seed 菜单树恢复节点） |
| mine-logs 个人安全日志（决策 #10） | 不关闭，登记入 backlog；触发条件：监控域登录日志立项时统一设计 SecurityLog 数据源（避免两套日志方案） |
| 头像上传与文件存储（决策 #10） | 不关闭，登记入 backlog；触发条件：文件存储基建（本地盘/对象存储 + 上传端点）引入时 |

**任务域归档**：P5 收口且结论提升完成后，`docs/tasks/2026-08-16-nestjs-backend-foundation/` 整体移入 `docs/tasks/archive/`，README 加归档横幅与稳定结论位置，热索引更新。

## 8. 风险登记

| # | 风险 | 缓解 |
| --- | --- | --- |
| R1 | pure-web `strict: false` 模板存量，适配波及面可能超预估 | 适配圈死锁（§5.4），typecheck 兜底 |
| R2 | mock 与真实后端双源形状漂移 | mock 响应体以 contracts 类型约束的共享 fixture 组织；离线/直连两态都进验收清单 |
| R3 | vite proxy 与 fake-server 同路径冲突 | `VITE_MOCK` 条件注册插件（关闭时整个插件不挂载） |
| R4 | contracts dist 陈旧导致类型失真 | 消费方 pre 钩子串联 contracts 构建 + 根 build 覆盖 |
| R5 | seed 裁剪连锁 e2e 断言失败 | 已识别（async-routes/按钮推导/菜单计数），同任务内修正 |
| R6 | 生产形态跨域（nginx → server） | 本阶段联调走 dev proxy 同源；CORS 沿用 P1 既有 `CORS_ORIGIN` 配置，零新增工作，文档点名 |

## 9. 完成判定

- [ ] contracts 建包，通用层/域层落位，双端 `workspace:*` 消费且 typecheck 通过
- [ ] BizCode/ApiResponse/Auth 契约类型迁移完成（refresh 剥离 sid），server 原址删除、import 修正
- [ ] 三域 `GET /:id` 交付（含菜单父链校验），单测 + e2e 覆盖
- [ ] User 补四列 migration + `GET /auth/profile` 交付（mine profile），account-settings 适配
- [ ] seed 菜单树裁剪（Dept/Monitor），连带测试更新
- [ ] 契约一致性单测每域一条 + e2e 引用契约常量
- [ ] pure-web api 层按端点集重写 + 页面适配 + 拦截器 BizCode 化
- [ ] `VITE_MOCK` 双态验收：直连全链路 + 离线全功能
- [ ] `pnpm check` 全绿；server `test:coverage` 合并四指标 ≥80%
- [ ] 文档收尾完成：契约规范、ADR-004、repo-structure/AGENTS/build-and-verify 更新、总 spec 修订指针
- [ ] `docs/governance/backlog.md` 建立，7 项 backlog 迁移/登记，任务目录归档

## 10. 审查修订记录（2026-08-21）

对初版（commit e13f63b）做代码取证审查，发现 4 项契约事实错误（C）、2 项信息遗漏（I）、3 项表述不精确（M），全部修订落盘；另据用户追问新增决策 #10。

| # | 级别 | 问题 | 取证依据 | 修订 |
| --- | --- | --- | --- | --- |
| C1 | 契约事实 | mine 域盲区：账户设置页静态可达，初版未规划直连后行为 | `remaining.ts` `/account-settings` 静态路由（showLink:false）；mock/mine.ts 双端点 | 新增决策 #10 + §4.4 profile 端点 + §5.5 适配 + backlog 2 项 |
| C2 | 契约事实 | `expires` 误写为 ISO 字符串 | token.service.ts 实为毫秒时间戳 number，注释「契约：前端一行切换」 | §5.3 改 `DataInfo<number>` + 模板预留切换点 |
| C3 | 契约事实 | 端点清单不符：更新动词、子资源端点、菜单分页 | 三域 controller 实为 `@Put(':id')`；roles GET /all、GET\|PUT :id/menus、users GET\|PUT :id/roles；menus 全量树无分页 | §5.2 端点集按实交付重写 |
| C4 | 契约事实 | 把已有 VITE_MOCK 机制写成新建 | build/plugins.ts 已按 VITE_MOCK 条件注册 fake-server（enableProd:true），.env.development 已 false | §5.1 改「复用既有链路，仅补 proxy」 |
| I1 | 遗漏 | refresh 响应泄露内部 `sid` | auth.service refresh 直接返回 TokenPair（含 sid） | §4.1/§5.3 补「refresh 端点剥离 sid」 |
| I2 | 遗漏 | 登录响应 `avatar: null` 未提 | auth.service profileOf 返回 avatar: null | §5.3 补「avatar 可空展示」 |
| M1 | 表述 | get-user-info 端点归属表述错误 | 前端不消费 get-user-info（用户信息取自登录响应） | §5.2 明确「该端点保持不动」 |
| M2 | 表述 | proxy 目标端口未写实 | env.schema PORT 默认 3000；VITE_PORT 8848 = CORS_ORIGIN 默认 | §5.1 写实 `http://localhost:3000` 与同源依据 |
| M3 | 表述 | 分页适用范围不精确 | menu 全量树、roles /all 均不分页 | §4.1/§5.4 限定 PageResult 仅 user/role 列表 |

**决策 #10（审查中新增）**：mine 域 P5 只补 profile（User 补四列 + `GET /auth/profile`）；mine-logs 需 SecurityLog 表 + 埋点 + UA 解析约一个迷你域体量且提前破备案 3 口子，头像上传依赖文件存储基建，二者登记 backlog（§7.3）。
