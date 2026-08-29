# pure-web 测试基建批次 B2 设计（状态机/store 组）

> 分批次设计文档：承接 [总体设计](./2026-08-29-pure-web-testing-foundation-design.md) 第 6 章 B2 行。[B1 设计](./2026-08-29-pure-web-testing-foundation-b1-design.md) 已定稿并处于执行前沿；B2 实施前须满足 [前置依赖](#3-前置依赖与事实校准)。

## 1. 范围与子任务拆解

B2 共 5 个子任务；localforage 归置动作随 B2.5 一并落盘。strict 数据为本设计期实测（探针 tsconfig = 主 tsconfig + strict 全开 + include 含 `types/*.d.ts`）。

| 子任务 | 模块 | 规模（总行数，实测） | strict 错误（实测） |
| --- | --- | --- | --- |
| B2.1 | `utils/http/index.ts` token 刷新状态机 | 240 | 11（TS18048×4 + TS2345×5 + TS2349×2） |
| B2.2 | `store/modules/user.ts` | 131 | 3（TS2345×1 + TS7006×2） |
| B2.3 | `store/modules/permission.ts` | 76 | 1（TS2345×1） |
| B2.4 | `store/modules/multiTags.ts` | 139 | 14（TS2322×6 + TS2339×1 + TS2366×1 + TS2532×1 + TS7006×5） |
| B2.5 | 小 store 群（`app` / `settings` / `epTheme`）+ `localforage` + store 基础设施（`index` / `utils` / `types`） | 91+36+50 + 110 + 10+29 | 5 + 7 + 0 + 3 + 0 |

## 2. 子任务测试策略

**全局口径（已确认）**：mock 最小化——仅 mock 外部边界（axios 网络库、`@/api/*` HTTP 边界、i18n 展示层）；store 间、store 与 B1 已测模块之间使用真实组合；B2 整体安排在 B1 之后执行正是为了复用已验证依赖资产，不留集成负债。

### 2.1 `utils/http/index.ts` token 刷新状态机

- **拦截器层**：vi.mock('axios') 注入可编程 fake instance（仅需拦截器收集器结构），直接驱动 request 拦截 fulfilled（白名单 `/refresh-token` `/login` 放行、expires 过期判定、未过期 Authorization 注入、无 token 放行、beforeRequestCallback 短路）与 response 拦截 rejected（isCancelRequest 分流、40102 → `refreshAndRetry`、其他错误 toast）
- **状态机层**：并发 3 个 40102 → `handRefreshToken` 单飞一次 → 队列重放全员成功；刷新失败 → 队列清空 + `logOut` + warning
- **测试资产**：`resetHttp()` helper（静态 requests / isRefreshing / initConfig 清理，each setup 调用）；`vi.setSystemTime` 控制 expires 判定
- 依赖切点：vi.mock('@/api/user') + vi.mock('@/store/modules/user') 可选真实、vi.mock('@/plugins/i18n')；auth 用 B1.4 真实实现

### 2.2 `store/modules/user.ts`

- 9 个 SET 动作 + `loginByUsername` 全分支（code 0 → `setToken` cookie 双写 + resolve / else reject / catch reject）+ `handRefreshToken` 全分支 + `logOut` 全链（fire-and-forget、本地清理、`removeToken`、tags 重置、路由跳转）
- 依赖切点：vi.mock('@/api/user')（HTTP 边界）；auth、storageLocal 均真实
- **与 B2.1 联动集成用例**：`http` 40102 → 真实 `user.handRefreshToken` → 队列重放全链路绿

### 2.3 `store/modules/permission.ts`

- 复用 B1.3 真实纯函数：`handleWholeMenus`（真实 constantMenus + 构造动态路由断言组装结果）、`clearCache`（倒序删除语义）、`cacheOperate` refresh / add / delete 三模式、`clearAllCachePage`
- mock 仅 multiTags hook 读数

### 2.4 `store/modules/multiTags.ts`

- state 初始化双支（multiTagsCache 开关 + fixedTag 过滤）；`multiTagsCacheChange` 双向 storage；`tagsCache`
- `handleTags` 四模式全分支：equal / push（hiddenTag、isUrl、title 空、showLink false、去重、dynamicLevel 替换、MaxTagsLevel 裁剪六个早退 + 正常入列）/ splice（position 有无）/ slice
- mock 仅 storageLocal 与 permission hook

### 2.5 小 store 群 + 基础设施

| 单元 | 策略 |
| --- | --- |
| `app.ts` | state 初始化回退链（storage 命中/未命中）、`TOGGLE_SIDEBAR` 三分支 + `toggleSideBar`、5 个 setter |
| `settings.ts` | `CHANGE_SETTING` 反射守卫两分支、`changeSetting` |
| `epTheme.ts` | `fill` getter 双支、`setEpThemeColor`（layout 空值早退 + 正常写回） |
| `localforage` | `StorageProxy` set/get/remove/clear/keys + 过期判定三分支（expires 0 永久 / 未过期 / 已过期） |
| store 基础设施 | 0 errors 随本任务末尾一次迁入清单（barrel 依赖所有模块，最后收口） |

## 3. 前置依赖与事实校准

1. **B1 批次落盘**：B2.1 的真实 auth（B1.4 已测）、B2.3 的纯函数簇（B1.3 已测）、message（B1.5 已测）均已迁入清单且有测试——mock 最小化口径直接复用这些资产
2. **事实校准窗口**：本设计期 strict 数据（44 个总错误）已是实测值（探针含 `types/*.d.ts`），校准需求低于 B1；计划编写时仅需复核「B1 执行期间是否触碰过 B2 模块」（预期不触碰）
3. **清单基线**：B2 开始时 `tsconfig.strict.json` 已含 B1 全部资产（router/utils、auth、小工具群等），B2 各子任务按域内文件 + spec 追加迁入
4. **B2.2 的特殊依赖窗口**：`logOut` 引用真实 multiTags 实现，但 multiTags 的测试在 B2.4 才落——B2.2 期间 multiTags 处于「真实代码可运行、测试未覆盖」窗口期，由 B2.4 补测关闭，不构成负债（同一批次内闭环）

## 4. 执行编排

- **模式**：串行单 worktree `feat/pure-web-testing-b2`（延续 B1 模式：worktree + subagent-driven）
- **顺序**：B2.1 → B2.2（含与 B2.1 联动集成用例）→ B2.3 → B2.4 → B2.5
- **每子任务节奏**：TDD 红→绿→重构；strict 修复与测试同节奏；结束 = 测试 ≥80%（glob 键追加）+ strict 清零迁清单（域内文件 + spec）+ 独立提交（scope `web`）
- **B2.1 测试基础设施专项**：`resetHttp()` helper + axios fake instance + `vi.setSystemTime` 为 B2.1 内部一次性资产，不扩散到其他子任务

## 5. 统一验收

| 子任务 | 验收三件（齐备才算完成） |
| --- | --- |
| B2.1~B2.5 | ① 模块测试 ≥80% 行+分支（`vitest.config.ts` glob 键按序追加）② 文件+spec strict 零错误迁清单 ③ 独立提交 + 受影响文档同提交 |
| B2.2 附加 | 联动集成用例绿（`http` 40102 → 真实 `user.handRefreshToken` → 重放全链路） |
| 全局 | 防漏断言计数只增不减；`pnpm check` 全绿；无新增豁免项（B2 全组正常迁入，不扩大豁免面） |

继承总体设计第 7 章三件套（测试 ≥80% / strict 清零迁清单 / conventional commits + 文档同提交）。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| axios 拦截器驱动细节（fake instance 需拦截器收集器） | B2.1 首个用例验证 fake instance 结构；仅需 interceptors 两个 use 收集功能 |
| 静态状态重置遗漏导致用例互踩 | `resetHttp()` helper 集中清单：requests / isRefreshing / initConfig，each setup 调用；发现字段遗漏即补 |
| i18n 重依赖（`@/plugins/i18n` 拉 vue-i18n 实例链） | vi.mock('@/plugins/i18n')（低负债边界 mock，与「真实组合优先」不冲突——i18n 属外部展示层） |
| `user.logOut` 在 B2.4 测试未落前引用真实 multiTags | 窗口期为批内闭环（B2.4 补测关闭），不计负债 |
| multiTags state 初始化读 permission 资产 | B2.3 先行（既定顺序）保障 |
| B2.5 混合 5 个单元测试面广 | 单元间互不依赖，spec 按单元分文件；barrel 随本任务末尾一次迁入 |
| B1 执行期间触碰 B2 模块源码 | 事实校准第 2 条：计划编写时复核 |

## 7. 文档治理

- 本文档：`docs/tasks/2026-08-29-pure-web-testing-foundation/`（同目录）；总设计第 6 章 B2 表已加链接
- 实施计划（writing-plans 产物）：`...-b2-plan.md` 同目录
- backlog：无新增条目（B2 无豁免项）；localforage 归置随 B2.5 关闭
- 收口：随总任务目录归档