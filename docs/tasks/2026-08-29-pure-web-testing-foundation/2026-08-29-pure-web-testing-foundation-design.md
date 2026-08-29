# pure-web 测试基建与 strict 类型安全总体设计

> 总体设计文档：覆盖批次 A（strict 类型安全迁移，含上游更新策略前置）+ 批次 B（vitest 测试基建与模块测试）。本文档为「总」级设计，各子任务执行前按需产出「分」级计划（沿用本目录日期前缀命名，只追加不重写）。

## 1. 背景与现状（证据）

| 事实 | 数据 | 来源 |
| --- | --- | --- |
| 测试基建完全空白 | 0 个 spec/test 文件；无 vitest 依赖；无 test 脚本 | 全量扫描 + package.json |
| 全仓唯一宽松 tsconfig | `strict: false` + `strictFunctionTypes: false`；nestjs-server 与 uni-mobile 均已 strict | 四端 tsconfig 对比 |
| 企业级基线现成未消费 | `internal/tsconfig/base.json` 含 strict 全套开关，`web.json` 工厂就绪（`exactOptionalPropertyTypes` 已注释，不在对齐口径内） | internal/tsconfig/* |
| strict 存量错误量 | 纯 TS 文件 384 个（`tsc --strict` 实测）；其中隐式 any 系 195 个（51%）机械可修；Top 10 文件占 55% | 实测日志 |
| .vue 错误量 | 未取得（vue-tsc 全量进程异常退出），列为 A1 首个执行步骤补测 | 实测 |
| 业务关键资产 | token 刷新状态机（`utils/http/index.ts`）、动态路由重建算法（`router/utils.ts` 425 行）、按钮级鉴权（`utils/auth.ts`）均零回归保护 | 代码阅读 + 架构审查记忆 |
| turbo 插座已预留 | `test` / `test:watch` / `test:coverage` 任务已存在（`cache: false`），加同名脚本即自动纳入 `pnpm check` | turbo.json |
| vitest 与 vite 8 兼容 | vitest 4.1.11 peerDependencies 声明 `vite ^6 || ^7 || ^8`（Rolldown 内核官方支持）；Node ≥24 满足 | npm registry 实测 |
| 组件资产构成 | 24 个组件目录：在用 15 个（含 main.ts 全局注册 ReAuth/RePerms、登录页 ReQrcode/ReTypeit/ReImageVerify），零引用遗留 9 个 | 引用盘点实测 |
| 上游关系 | template 衍生模式（接入提交 94a2cf9，2026-08-10），无 upstream remote、无 merge 历史 | git remote/log 实测 |

## 2. 目标与边界

**总目标**：pure-web 补齐 vitest 测试基建与 strict 类型安全，达到企业级一般水平——对齐 `internal/tsconfig` 基线（不含 `exactOptionalPropertyTypes`）、模块级 ≥80% 覆盖率（对齐 nestjs-server 口径）。

**本次范围**：

- 批次 A0：上游基线建立与差异全景报告（第 4 章）
- 批次 A1-A3：strict 迁移（第 5 章）
- 批次 B0-B3：vitest 基建与模块测试（第 6 章）

**明确不纳入**（登记 backlog，见第 10 章）：

- Playwright E2E（登录 → 动态路由全链路）
- 遗留组件删除（只盘点豁免，删除另行决策）
- 组件抽取 packages 公共模块（独立架构决策）
- 全仓覆盖率门禁收紧（本次只覆盖 pure-web 模块级阈值）
- `exactOptionalPropertyTypes`（已注释，不启用）

## 3. 总体架构

### 3.1 双 tsconfig 分层（strict 增量迁移机制）

```
apps/pure-web/tsconfig.json        ← 现状语义收窄为「存量豁免区」：宽松检查，include 维持全量覆盖
apps/pure-web/tsconfig.strict.json ← 新增：extends internal/tsconfig/web.json（strict 基线）
                                      include = 已清零文件清单（初始仅含实测零错误文件）
```

- **执行主体（否则清单永不编译、类型零强制）**：typecheck 脚本改造为双 config 串行——`tsc --noEmit && tsc -p tsconfig.strict.json --noEmit && vue-tsc --noEmit`（清单含 `.vue` 时对应以 `vue-tsc -p tsconfig.strict.json` 执行；内存参数对齐 build 脚本既有做法）
- **快照唯一事实源**：`tsconfig.strict.json` 的 `include` 清单本身即快照，不设第二份快照文件，断言直接对其枚举比对
- **双重断言（`scripts/check.mjs` + pre-commit 双通道）**：
  - **枚举校验（防漏）**：不在 `git HEAD` 树中的**新文件**（含未跟踪文件）必须进清单或豁免清单——存量文件不进清单不违规（迁移期豁免语义由宽松 `tsconfig.json` 承载），新文件漏加即失败，杜绝宽松区逃逸；
  - **计数只增不减（防倒退）**：已迁入条目减少即失败；
  - 断言失败必须输出具体缺失/倒退文件名（可操作性优先，避免诱发绕过）；
  - **拦截通道**：`pnpm check`（本地门禁）+ pre-commit（提交边界）——CI 为报警式不拦截（ADR-006），pre-commit 才是防漏的真正兜底；全量迁入后的最终态收口（拆除双 config + 断言）已登记 backlog
- **测试文件位置**：co-located `*.spec.ts`（与被测文件同目录）——位于 `src` 内，天然受现有 `include`、lint glob（`src mock build`）、prettier 覆盖；新测试文件同样强制进清单
- **豁免清单管理**：遗留组件等明确豁免项单独登记；防漏枚举以「新文件 ⊆ 清单 ∪ 豁免」为期望集，豁免清单与迁移清单互补
- **迁入路径唯一**：对应模块测试任务完成（测试 ≥80% + strict 零错误）
- 迁移中途文件同时被宽松与严格两个 config 检查，无冲突（宽松通过是严格通过的必要非充分子集）；重复编译成本在迁移期可接受，全部迁入后随宽松豁免语义一并消除。IDE 层入口仍是 `tsconfig.json`，strict 侧由 CI 断言 + 双 config typecheck 兜底

### 3.2 vitest 基建

- **独立 `vitest.config.ts`**：继承 `@` / `@build` alias 与 `__APP_INFO__` define；plugins 仅 `@vitejs/plugin-vue` + vueJsx。**不合并 vite.config.ts**（规避 `rolldownOptions`、fake-server/cdn-import 构建期插件在测试环境的冲突）
- **环境分层**：默认 `node`（纯函数/状态机最快）；组件测试文件头部 `// @vitest-environment jsdom`
- **覆盖率**：`@vitest/coverage-v8`，模块级 ≥80%（行 + 分支），按模块分组 threshold
- **scripts**：`test` / `test:watch` / `test:coverage`（对齐 turbo 任务名）；`test:coverage` 追加 `NODE_OPTIONS=--max-old-space-size=8192`（v8 coverage 内存敏感，对齐 build 脚本既有做法）
- **依赖落位（已有 / 新增分列）**：

  | 依赖 | 状态 | 版本口径 |
  | --- | --- | --- |
  | `@vitejs/plugin-vue` / `@vitejs/plugin-vue-jsx` | 已在 devDeps（catalog 消费） | 沿用 `catalog:`，无需新增 |
  | `@faker-js/faker` | 已在 devDeps（`^10.5.0`） | 直接复用为测试数据工厂，无需新增 |
  | `vitest` | 新增 | `^4.1`（4.1.11 已验证与 vite 8 peer 兼容；不追 5.x 大版本） |
  | `@vue/test-utils` | 新增 | `^2.5`（registry 实测 latest 2.5.0，无 3.x；devDeps 与 vitest 4.1 / vue 3.5 同线） |
  | `jsdom` | 新增 | 与 `@vitest/coverage-v8` 兼容线 |
  | `@vitest/coverage-v8` | 新增 | 与 `vitest` 同版本 |
  | `eslint-plugin-vitest` | 新增 | 最新稳定线 |

  新增依赖均留 pure-web 本地（catalog 判据：待第二消费者出现再整合）；测试框架无仓库精确 pin 必要，采用 `^` 范围线
- **eslint 集成**：pure-web 本地 `eslint.config.js` 追加测试文件块（eslint-plugin-vitest）；待第二端接入再上移 internal 工厂

### 3.3 CI 集成

- **gate job**：零改动自动纳入（`pnpm check` → `turbo run test`）
- **新增 `coverage-web` 独立 job**：无 postgres/redis services，报警式（对齐 ADR-006 风格），与既有 coverage job 并行互不阻塞；B0 起 glob 键逐模块 ≥80% 阈值随批次 B 迁入逐个追加
- **重复执行成本有意接受**：gate（`turbo run test`）与 coverage-web（`test:coverage`）会各跑一遍 pure-web 测试——与 nestjs-server 既有 gate + coverage 双跑模式一致，报警式不拦截下隔离性优先于去重

## 4. 批次 A0：上游基线建立与差异全景报告

**背景**：pure-web 为 vue-pure-admin template 衍生（非 fork 跟踪），本地已深度定制。跟进上游的正确姿势是「基线快照 + 选择性吸收」，而非全量 merge。

**A0 交付物**（轻量版必做；graft 完整版可选增强，见 4.4）：

1. 上游基线记录：`git fetch upstream`（pure-admin/vue-pure-admin），按接入日期（2026-08-10）定位基线版本 SHA，登记于本目录活文档
2. ops 报告脚本：`scripts/ops/upstream-diff.sh`——输入基线 SHA 与新 tag，输出三件套：
   - 上游改动清单（`git log` 按 layout / 在用组件 / 工具源码 / 依赖四类切分）
   - 文件变更地图（`git diff --stat --find-renames`）
   - 冲突面清单（两方改动交集，逐文件标注「仅上游改 / 两边都改」）
3. 首次差异全景报告：执行脚本产出当前漂移地图，作为批次 A strict 清零顺序与 A3 组件盘点的输入
4. 周期机制：backlog 登记周期性条目——上游大版本或季度触发，跑脚本产出评估报告，逐项决策「吸收 / 跳过」；吸收项走正常子任务流程（strict 迁入 + 测试验收）

**报告对主线的输入价值**：

- strict 清零顺序叠加「文件性质」维度：本地深度定制文件优先清零，上游原生未动文件靠后
- 组件盘点交叉验证：上游对在用组件的近期改动 = 未来吸收时的高危区 = 测试重点
- 9 个遗留组件从评估面剔除，评估成本减半

**注意**：`git replace --graft` 会改动 git 历史引用（replace refs 需团队传播），作为可选增强项后置——评估报告用途只需基线 SHA 字符串，不需 graft。

## 5. 批次 A：strict 类型安全迁移

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| A0 | 上游基线 + ops 报告脚本 + 首次差异全景报告（第 4 章） | 脚本可执行，报告入库 |
| A1 | 补测 `.vue` 全量 strict 错误（vue-tsc，加 `NODE_OPTIONS=--max-old-space-size=8192` 规避内存瓶颈；上次进程异常未取得数据） | 精确错误总量 + 文件分布 |
| A2 | 建 `tsconfig.strict.json` + 双重断言脚本（枚举防漏 + 计数防倒退，见 3.1；挂 `pnpm check` + pre-commit 双通道）+ typecheck 脚本改造（双 config 串行）+ 初始清单（实测零错误文件先行迁入：`utils/tree.ts` 等；`build/utils.ts` 有 2 个错误留 B0 修复） | `pnpm check` 通过、双 config typecheck 生效、断言可在 check 与提交边界拦截漏加/倒退 |
| A3 | 组件盘点落档：在用 15 / 遗留 9 清单 + 依赖复杂度表 + 上游差异交叉验证；遗留组件处理决策登记 backlog | 清单文档入库 |

**存量 strict 错误修复策略**：不做一次性全量清零，随批次 B 逐模块推进（每模块测试任务 = 测试 + strict 清零 + 迁入清单，三合一）。批次 B 之外的存量文件保持在宽松 tsconfig 检查下（不倒退），全部迁入完成时删除宽松 tsconfig 的存量豁免语义（最终态评估另立）。

## 6. 批次 B：vitest 基建与模块测试（子任务清单）

依赖关系：B0 依赖 A2（测试文件从第一天进 strict 清单）；A0/A1/A3 与 B0 可并行；B1 → B2 → B3 严格串行（后者复用前者的 mock/store 测试资产）。

### B0 vitest 基建（1 子任务）

依赖安装 → `vitest.config.ts` → scripts → eslint 测试块 → 样板模块全量测试（`wrapperEnv` 全分支 + 同步导出 + getPackageSize 闭包重构 + `tree.ts` 全 6 函数，glob 键阈值行+分支 ≥80% 实测达标）打通链路 → 两模块 strict 清零并当场迁入清单（三合一验收）→ CI `coverage-web` job。
**验收**：`pnpm check` 全绿、check.mjs 覆盖枚举 ✔、两样板模块（`build/utils.ts` + `utils/tree.ts`）行+分支 ≥80% 实测达标、CI 四 job 变五 job 全绿。

### B1 纯函数组（4 子任务，按依赖深度排序）

> B1 批次详细设计已定稿：见 [B1 设计文档](./2026-08-29-pure-web-testing-foundation-b1-design.md)（实际待执行 5 子任务 B1.3~B1.7 + localforage 归 B2；print.ts 豁免口径另定）。下表为摘要，B1 细节以批次设计为准。

| 序 | 模块 | strict 实测 | 备注 |
| --- | --- | --- | --- |
| B1.1 | ~~`build/utils.ts`~~ | ~~2 个（`TS7053:71` + `TS7006:84`）~~ | **B0 已完成**：wrapperEnv 全分支 + 同步导出 + getPackageSize 闭包重构，修复后当场迁入清单 |
| B1.2 | ~~`utils/tree.ts`~~ | ~~0 个（A2 已迁入）~~ | **B0 已完成**：全 6 导出函数测试 ≥80%，与 spec 一并迁入清单 |
| B1.3 | `router/utils.ts` 纯函数簇 | 20 个错误 | ascending / filterTree / getParentPaths / findRouteByPath / formatFlatteningRoutes / formatTwoStageRoutes / getHistoryMode 等；mock `storageLocal` 后脱离 router 实例测试 |
| B1.4 | `utils/auth.ts` 纯函数部分 | 部分 | formatToken / hasPerms（mock pinia store）；setToken cookie 双写联动留 B2 与 store 集成测 |
| B1.5 | `utils/responsive / message / mitt / preventDefault` 小工具群 | 少量 | 合并一个任务 |
| B1.6 | `utils/sso.ts` + `utils/chinaArea.ts` | chinaArea 21 个错误 | 数据重模块独立任务 |

### B2 状态机/store 组（5 子任务）

| 序 | 模块 | 要点 |
| --- | --- | --- |
| B2.1 | `utils/http/index.ts` token 刷新状态机 | **最高价值**：并发 401 → 单飞刷新 → 队列重放 → 刷新失败全员登出全分支；axios adapter mock + fake timers |
| B2.2 | `store/modules/user.ts` | 登录 / 登出 fire-and-forget / 刷新轮换全分支；与 B2.1 联动集成测试 |
| B2.3 | `store/modules/permission.ts` | 菜单 / 扁平化路由缓存操作 |
| B2.4 | `store/modules/multiTags.ts` | 14 个 strict 错误；user store 的依赖 |
| B2.5 | `store/modules/app / settings / epTheme` | 小 store 群合并一个任务 |

### B3 在用组件组（前置细化盘点后 3 批）

**B3.0 前置**：15 个在用组件逐个标注依赖与 strict 错误数（依赖 A3 清单细化）。

| 批 | 组件 | 策略 |
| --- | --- | --- |
| B3.1 低复杂度 | ReCol、ReText、ReIcon、ReSegmented、ReAnimateSelector、ReCountTo、ReFlicker | 直接 VTU 测；先沉淀组件测试基建（element-plus 插件注册、ResizeObserver mock、`~icons/` 虚拟导入 alias） |
| B3.2 中复杂度 | ReAuth、RePerms、ReDialog、ReTypeit、ReImageVerify | 复用 B2 的 store mock 资产 |
| B3.3 高复杂度 | RePureTableBar、ReCropperPreview、ReQrcode | 重型依赖（@pureadmin/table / cropperjs / qrcode），每组件独立任务，只测容器与关键行为不测第三方内部 |

**9 个遗留组件**（ReBarcode、ReDrawer、ReFlop、ReSeamlessScroll、ReSelector、ReSplitPane、ReTreeLine、ReCropper、ReVxeTableBar）：不测、不进 strict 清单（豁免区），删除决策登记 backlog。

## 7. 统一验收标准与组织约束

每个模块子任务的验收（三者齐备才算完成）：

1. 该模块测试 ≥80% 行 + 分支覆盖（`test:coverage` 实测数据，非估算）
2. 该模块全部文件 strict 零错误并迁入 `tsconfig.strict.json` 清单
3. 提交遵守 conventional commits（scope `web` / `repo` 按变更面），同一提交内更新受影响文档（硬规则）

组织约束：

- 每个子任务独立提交、独立可回滚
- 子任务执行采用 TDD（红 → 绿 → 重构），strict 修复与测试同节奏推进
- B1-B3 组内子任务可经 worktree 并行，但 `tsconfig.strict.json` 清单变更为冲突热点，并行时合并前对齐
- 组件测试避免快照断言（大组件快照脆弱），断言行为

## 8. 风险与注意事项

| 风险 | 缓解 |
| --- | --- |
| vitest 4.1 + vite 8（Rolldown）是较新组合 | 独立 vitest.config.ts 隔离 rolldownOptions 等 Vite 8 专属配置；B0 样板测试先行验证 |
| `import.meta.glob`（router/utils）在测试环境 | vitest 原生支持；B1.3 任务首个用例即验证 |
| `~icons/` 等 unplugin 虚拟导入在测试环境解析失败 | vitest.config 补 alias/mock；B3.1 组件基建首个用例即验证（影响 ReIcon 等） |
| js-cookie / localforage / storageLocal 浏览器 API | node 环境测试统一 vi.mock；jsdom 环境原生可用，注意差异 |
| element-plus 组件测试基建缺失 | B3.1 前置沉淀：插件注册 + ResizeObserver mock + （可选）@testing-library/vue |
| vue-tsc 全量内存瓶颈 | A1 执行时加 `NODE_OPTIONS=--max-old-space-size=8192`（对齐 build 脚本既有做法） |
| strict 清单断言误伤 | 断言为枚举防漏 + 计数防倒退（见 3.1），不含内容校验；迁入动作仅在子任务验收时发生；失败输出具体文件名 |
| 上游 fetch 失败阻塞 A0 | 报告脚本支持「无基线模式」：仅输出本地侧信息，基线定位降级后置 |

## 9. 展望（不纳入本次，登记 backlog）

- Playwright E2E：登录 → 动态路由全链路（B2 完成后评估启动）
- 遗留组件处置：盘点清单就绪后独立决策（删除 / 保留豁免）
- 组件抽取 packages：独立架构决策（与 E2E 基建联动评估）
- electron-desktop vitest 接入：届时 vitest 升 catalog + eslint 工厂上移（第二消费者判据）
- `exactOptionalPropertyTypes` 强化项：单独评估，不在企业级一般水平口径内

## 10. 文档治理

- 本目录：`docs/tasks/2026-08-29-pure-web-testing-foundation/`（进行中任务目录，README 索引登记）
- backlog 登记（开放表）：
  - pure-web 测试基建与 strict 迁移（本任务）
  - pure-web E2E 测试基建
  - pure-web 遗留组件处置决策
  - pure-web 上游同步周期评估机制
- 收口时：任务目录归档 `archive/`，README 索引更新，backlog 关闭与迁移
