# pure-web 测试基建与 strict 类型安全——B4 收口批次实施计划

> 系列收口计划：存量 129 项 + 豁免区 2 项（monitor/logs、print.ts）+ ReCropper 转在用，全部迁入单一
> strict tsconfig；删除 7 个零引用遗留组件；新增 Playwright E2E 基建；拆除迁移期双 config 与断言机制。
> 执行完毕后，总体设计（2026-08-29）声明的全部范围收口，任务目录归档。

## 0. 决策记录（用户已确认，2026-08-31）

| 决策点 | 结论 |
| --- | --- |
| 测试口径 | 全口径尽量清零：每文件 strict 零错误 + 迁入；行为可达即测 ≥80%（行+分支）；仅 jsdom/第三方内部不可达处双向登记豁免，不留静默技术债 |
| E2E | 纳入本批次（Playwright，基于 `VITE_MOCK=true` dev server，不依赖后端） |
| 遗留组件 | 纳入删除（实测修正后为 **7 个**，见 §1.2） |

## 1. 现状证据（2026-08-31 实测）

### 1.1 存量盘点（与 `assert-strict-manifest.mjs` 同口径）

- 清单 **125** 项 / 豁免展开 **26** 项 / 存量待迁移 **129** 项
- 存量构成：`src/views` 55、`src/layout` 42、`src/directives` 7、`src/api` 4、`src/plugins` 4、
  `src/router` 4、`build/*` 5、`mock/*` 5、`src/config/index.ts`、`src/main.ts`、`src/App.vue`

### 1.2 A3 盘点勘误（实测新发现，必须先处理）

- **ReCropper 非遗留**：`ReCropperPreview/src/index.vue` 实测 `import ReCropper from '@/components/ReCropper'`
  （其 spec 亦以 `vi.mock('@/components/ReCropper')` 桩之，反向佐证依赖存在）。A3 组件盘点「零引用」结论对其有误。
  **处置**：ReCropper 转在用，随本批次迁入（T2）；删除名单收缩为 **7 个**。
- **`src/views/monitor/logs/**` 非空**：实测 7 文件（3 `hook.tsx` + 4 `.vue`，strict 错误 21 个），
  现处豁免清单条目②。T11 迁移并同提交移除豁免条目。

### 1.3 strict 错误实测（`vue-tsc --noEmit --skipLibCheck --strict` 全量，exit 2）

总量 **510 个 / 62 文件**。按处置分流后：

| 处置 | 文件数 | 错误数 | 说明 |
| --- | ---: | ---: | --- |
| 随遗留组件删除消失 | 4 | 97 | ReSelector 46 + ReSeamlessScroll 30 + ReVxeTableBar 11 + ReFlop 10（其余 3 个零错误） |
| 待迁移（本计划） | 55 | 413 | 见 §4 各任务分摊 |
| 其中 ReCropper | 1 | 6 | T2 |
| 其中 print.ts | 1 | 13 | T3 |
| 其中 monitor/logs | 3 | 21 | T11 |

待迁移文件错误数明细（0 错误者未列，共 74 个零错误文件纯机械迁入+测试）：

```
 34 src/layout/hooks/useTag.ts                      24 src/views/system/user/utils/hook.tsx
 34 src/layout/components/lay-sidebar/…/SidebarItem.vue   21 src/layout/components/lay-setting/index.vue
 31 src/layout/components/lay-search/…/SearchModal.vue    18 src/layout/components/lay-tag/index.vue
 18 src/views/system/role/utils/hook.tsx            13 src/utils/print.ts
 12 src/layout/components/lay-sidebar/…/SidebarBreadCrumb.vue   12 src/views/system/user/tree.vue
 10 src/layout/hooks/useDataThemeChange.ts           9 src/layout/components/lay-search/…/SearchHistory.vue
  9 src/views/account-settings/components/Profile.vue  9 src/views/monitor/logs/system/hook.tsx
  9 src/views/system/menu/utils/hook.tsx              8 src/layout/hooks/useNav.ts
  8 src/layout/index.vue                              8 src/plugins/i18n.ts
  8 src/router/index.ts                               7 src/directives/longpress/index.ts
  7 src/views/monitor/online/hook.tsx                 7 src/views/system/menu/form.vue
  6 src/components/ReCropper/src/index.tsx            6 src/layout/components/lay-notice/…/NoticeItem.vue
  6 src/views/monitor/logs/login/hook.tsx             6 src/views/monitor/logs/operation/hook.tsx
  6 src/views/system/dept/utils/hook.tsx              4 src/layout/components/lay-search/…/SearchResult.vue
  4 src/layout/hooks/useMultiFrame.ts                 4 src/layout/components/lay-sidebar/NavMix.vue
  4 src/views/login/utils/verifyCode.ts               4 src/views/account-settings/components/SecurityLog.vue
  ≤3 其余（App.vue 2 / config 3 / longpress 见上 / LoginRegist 3 / LoginUpdate 3 / login/index 3 /
     motion 1 / elementPlus 1 / compress 1 / api/mock 1 / main 1 / 等）
```

> 口径说明：逐文件计数由正则解析诊断行得出，多行诊断归属存在少量串扰；§4 各任务错误数为规划量级，
> 执行时以实际修复为准。另：域总量中约 15 个为清单内既有模块诊断串的测量噪声（清单域已实测零错误，
> 由 `check-strict-web.mjs` 门禁保证），不影响任务划分。

### 1.4 环境事实（免重复验证）

- `vitest.config.ts` `test.include` 已覆盖 `src/**/*.spec.{ts,tsx}` + `build/*.spec.ts`（B3 修正后），本计划**不改**
- mock 登录不校验验证码（`mock/login.ts`）；前端仅校验 4 位长度（`views/login/utils/rule.ts`）→ E2E 任填 4 位数字
- `VITE_MOCK` 默认 `true`（`.env.example`）；离线态 fake-server 整体接管，无 proxy
- 断言脚本枚举范围 `src / build / mock`（`.d.ts` 除外）→ `e2e/` 目录天然不受清单约束
- `tsconfig.json` include 不含 `e2e/` → E2E 文件不卷入收口后的全量 strict 检查
- jsbarcode 仅 `ReBarcode` 消费（grep 实证）→ 随组件删除

## 2. 执行模式与纪律

- **worktree + subagent-driven**：worktree 分支 `feat/b4-testing-closeout`，基线 `master`
- **任务串行**：清单/豁免变更为冲突热点，不并行；每任务独立提交、独立可回滚
- **TDD**：红 → 绿 → 重构；每任务验收三合一（测试 ≥80% + strict 零错误 + 迁入清单）
- **B3 教训强制项**（执行者必读）：
  1. **禁止**以删除运行时绑定、丢弃参数、收窄模板能力换取类型绿灯
     （B3 Critical 根因：`ref="domRef"` 被删致验证码失效；`h(icon, attrs)` 的 attrs 被丢）
  2. 测试断言以**设计预期行为**为准，禁止把破损行为反向固化为预期并归因环境
  3. 模板 ref 统一回调形式（`bindCanvas` 先例）；字符串 `ref` 读取不被 vue-tsc 认可
  4. `@/utils/auth`、store 模块禁止整模块 mock（hasAuth/hasPerms 本身即被测对象；store 用真实 pinia + 状态注入）
  5. 覆盖率门禁失败 → 补用例，禁止降阈值/改阈值键绕过
  6. 豁免条目移除与迁入清单必须**同一提交**；新文件必进清单（断言自动拦截）
  7. 提交遵守 conventional commits + scope 白名单；改变已文档化行为同提交更新文档

## 3. 覆盖率阈值策略

- 沿用文件级/glob 级 `thresholds` 键，行+分支 ≥80%
- **可测域**（域级 glob 键，减少键爆炸）：
  `src/layout/**`、`src/views/system/**`、`src/views/login/**`、`src/views/welcome/**`、
  `src/views/account-settings/**`、`src/views/monitor/**`、`src/directives/**`、`src/api/**`、
  `src/router/**`、`mock/**`、`build/**`、`src/components/ReCropper/**`（Canvas 绘制行按先例不入键）
- **不给键 + 双向登记**（测试金字塔分工，由 E2E 兜底，非技术债）：
  `src/main.ts`、`src/App.vue`、`src/plugins/*`（echarts/elementPlus/i18n/vxeTable 初始化装配）、
  `src/config/index.ts`——登记位置：任务提交内联注释 + 收口文档归档表
- Canvas 三件（ReImageVerify/ReCropperPreview/ReQrcode）与 ReCropper：绘制行为不入覆盖键（先例已立）

## 4. 任务分解（13 任务）

### T1 删除 7 个遗留组件 + 豁免消减 + jsbarcode 移除

- **删除目录**：`src/components/{ReBarcode,ReFlop,ReSeamlessScroll,ReSelector,ReSplitPane,ReTreeLine,ReVxeTableBar}`
  （grep 实证零外部引用；`ReCropper` **不删**）
- 同步移除 `tsconfig.strict.exemptions.json` 对应 7 条目录豁免（保留 monitor/logs 与 print.ts）
- `pnpm --filter @multi-admin/pure-web remove jsbarcode`（唯一消费者已删）
- 更新 `component-inventory.md`（ReCropper 勘误 + 遗留表改 7 项 + 删除记录）、
  `docs/governance/backlog.md`（「pure-web 遗留组件处置」条目关闭，注明删除提交）
- **验收**：`pnpm check` 全绿（断言枚举通过：删除文件不触发防漏/防倒退）；
  `pnpm build:web` 通过（确认无隐藏引用）
- **提交**：`chore(web): 移除七个零引用 pure-admin 遗留组件与 jsbarcode 依赖` +
  `docs(repo): 遗留组件删除收口——盘点勘误与 backlog 关闭`

### T2 ReCropper 转在用迁移

- 修复 6 个 strict 错误（`src/index.tsx`）；`src/svg/index.ts` 已零错误
- 薄测试（Canvas 先例）：实例创建/图片设置/裁剪事件接线的逻辑分支；cropperjs 渲染行为不测
- 迁入清单 + 移除豁免条目同提交；登记覆盖键（绘制行除外）
- **验收**：spec 通过 + 覆盖达标（除豁免行）+ `ReCropperPreview` 既有 spec 仍绿
- **提交**：`test(web): ReCropper 转在用迁入——strict 清零与裁剪逻辑薄测试`

### T3 print.ts strict 清零迁入

- 修复 13 个错误（机械：隐式 any / null 窄化）；既有薄测试保持；迁入清单 + 移除豁免条目同提交
- 覆盖键不给（iframe 打印行 jsdom 不可达，登记理由；E2E 不回补——见 §3 测试金字塔分工）
- **提交**：`test(web): print.ts strict 清零迁入清单，覆盖豁免双向登记`

### T4 接线配置组迁移（25 文件，约 25 错误）

- `build/{cdn,compress,info,optimize,plugins}.ts`（1 错误）：配置工厂纯函数，断言返回结构 ≥80%
- `mock/*.ts`（5）：fake 路由契约断言（信封同形、字段齐全）
- `src/api/*.ts`（4，1 错误）：请求函数与路径断言（axios 实例真实、adapter 级或 baseURL 断言）
- `src/router/{index.ts,enums,modules/*}`（8 错误）：路由表结构 + getHistoryMode 接线断言
  （`router/utils.ts` 已在清单，避免重复）
- `src/plugins/*`（9 错误）：仅 strict 修复 + 迁入；不给覆盖键（§3）
- `src/config/index.ts`（3）、`src/main.ts`（1）、`src/App.vue`（2）：strict 修复 + 迁入；不给键（§3）
- **验收**：全部迁入清单；可测键达标；`pnpm check` 全绿
- **提交**：`test(web): 接线配置组迁移——build/mock/api/router/plugins strict 清零与契约测试`

### T5 directives 组迁移（7 文件，7 错误）

- `auth`/`perms`（真实 hasAuth/hasPerms，禁整模块 mock，B1.4 资产复用）、`copy`、`longpress`（7 错误）、
  `optimize`、`ripple`、`index.ts`
- 行为测试：指令挂载/事件触发/卸载清理（jsdom 可达部分）；域级键 ≥80%
- **提交**：`test(web): directives 组迁移——七指令行为测试与 strict 清零`

### T6 layout hooks 组迁移（4 文件，56 错误）

- `useTag.ts`（34）、`useNav.ts`（8）、`useDataThemeChange.ts`（10）、`useMultiFrame.ts`（4）
- 复用 B2 的 pinia 真实 store + 状态注入模式；`useTag` 重点：初始化双支/早退/动态替换/裁剪（B2.4 同构经验）
- **验收**：域内分支覆盖 ≥80%（高错误文件逐函数对表）
- **提交**：`test(web): layout hooks 组迁移——标签/导航/主题/多页签状态机测试`

### T7 layout 侧边栏组迁移（12 文件，约 52 错误）

- `SidebarItem.vue`（34，递归菜单）、`SidebarBreadCrumb.vue`（12）、`NavMix`（4）、`NavVertical`（1）、
  `NavHorizontal`、`SidebarLinkItem`（1）、`SidebarExtraIcon`/折叠组/`SidebarLogo`（零错误）
- 组件测试基建复用（mountWithEP + 路由注入）；递归渲染用浅层路由数据
- **提交**：`test(web): layout 侧边栏组迁移——菜单递归/面包屑/导航形态测试`

### T8 layout 搜索组迁移（7 文件，约 46 错误）

- `SearchModal.vue`（31）、`SearchHistory.vue`（9）、`SearchHistoryItem`（2）、`SearchResult.vue`（4）、
  `types.ts`、`index.vue`、`SearchFooter.vue`（零错误）
- 搜索交互：输入过滤/键盘导航/历史持久化（storageLocal mock 边界）
- **提交**：`test(web): layout 搜索组迁移——模态搜索与历史记录测试`

### T9 layout 设置+标签组迁移（13 文件，约 59 错误）

- `lay-setting/index.vue`（21，主题面板）、`lay-tag/index.vue`（18）、`TagChrome.vue`、
  `lay-content`（2）、`lay-frame`（1）、`lay-panel`（1）、`lay-notice/*`（NoticeItem 6 + index 1 + data）、
  `layout/index.vue`（8）、`frame.vue`（1）、`redirect.vue`、`types.ts`（均零错误项纯迁入）
- **提交**：`test(web): layout 设置与标签组迁移——主题面板/标签栏/通知测试`

### T10 views/system 组迁移（24 文件，约 76 错误）

- 四域同构（`hook.tsx` + `rule.ts` + `types.ts` + 页面）：
  user（hook 24 + tree 12 + form 2 件）、role（hook 18）、menu（form 7 + hook 9）、dept（hook 6）、`hooks.ts`
- 模板化策略：hook 逻辑（表格查询/表单校验/提交分支）为测试主体；页面容器薄接线断言
- **提交**：`test(web): views/system 四域迁移——CRUD hook 分支与表单校验测试`

### T11 views 其余域 + monitor/logs 豁免移除（38 文件，约 64 错误）

- login（10 文件，14 错误）：`index.vue` + 四组件 + `rule/motion/verifyCode/enums/static`；
  验证码联动（与 ReImageVerify 集成断言）
- welcome（9，4 错误）、account-settings（5，18 错误）、error/empty（4，零错误）
- **monitor**：`online`（hook 7）+ `logs` 7 文件（21 错误）——**迁移与豁免条目②移除同提交**
- **提交**：`test(web): views 其余域迁移——登录/工作台/账户/监控含 logs 豁免移除`

### T12 Playwright E2E 基建（新增域）

- 依赖：`@playwright/test`（pure-web 本地 devDep，`^` 范围线）；仅装 chromium
- `playwright.config.ts`：`testDir: './e2e'`；`webServer`: `cross-env VITE_MOCK=true vite --port 5199 --strictPort`，
  `url: 'http://localhost:5199'`，`reuseExistingServer: !process.env.CI`；`use.baseURL`
- 用例（行为断言，不测第三方内部）：
  1. `auth.spec.ts`：表单空校验 → admin + 任填 4 位验证码（§1.4 事实）→ 登录成功 → 首页/菜单渲染 → 登出回登录页
  2. `routing.spec.ts`：动态路由冒烟（一级菜单逐项导航 + 403/404 守卫直达）
  3. `verify.spec.ts`：验证码 canvas 渲染 + 点击刷新 + 打印入口触发（print.ts 行为级回补）
- 脚本：`"test:e2e": "playwright test"`；`turbo.json` 增加 `test:e2e` 任务（`cache: false`，不并入 `pnpm check`——本地门禁保持快速）
- CI：`ci.yml` 追加 `e2e-web` job（报警式，对齐 ADR-006）：ubuntu + frozen-lockfile 安装 +
  `pnpm exec playwright install chromium --with-deps` + `turbo run test:e2e --filter=pure-web`
- **验收**：本地 `pnpm --filter @multi-admin/pure-web run test:e2e` 全绿；`pnpm check` 不受影响
- **提交**：`test(web): Playwright E2E 基建——登录链路与动态路由冒烟` + `docs(repo): e2e-web CI job 与测试分工说明`

### T13 最终态收口（迁移期机制拆除）

1. `tsconfig.json`：`"strict": true`、删除 `"strictFunctionTypes": false`（对齐 internal/tsconfig/web.json 口径）；
   include 无需变更（迁移期即全量覆盖，语义由宽松转严格）
2. 删除 `tsconfig.strict.json` / `tsconfig.strict.exemptions.json` /
   `scripts/assert-strict-manifest.mjs` / `scripts/check-strict-web.mjs`
3. `apps/pure-web/package.json` typecheck 改 `tsc --noEmit --skipLibCheck && vue-tsc --noEmit --skipLibCheck`
4. `scripts/check.mjs` 移除「strict manifest 断言」阶段；`.husky/pre-commit` 移除断言行
5. 文档收口：
   - `docs/engineering/build-and-verify.md` 增补「pure-web 测试基建」节（vitest + Playwright + 单一 strict config 事实）
   - `docs/governance/backlog.md`：关闭「测试基建与 strict 迁移」「E2E」「上游同步评估机制保留但标注已具备脚本」「最终态收口」「print/Canvas 回补（注明覆盖口径终态）」
   - 任务目录移入 `docs/tasks/archive/2026-08-29-pure-web-testing-foundation/`（建冷索引），
     `docs/tasks/README.md` 行移入「最近已完成」，`docs/README.md` 索引同步
6. 覆盖率阈值键整理：收口后逐键核验无死键（删除文件对应的既有键同步清理）
- **验收**：`pnpm check` 全绿（新链）+ `test:coverage` 全阈值达标 + `test:e2e` 绿 + 全仓无 `strict.exemptions` 残留引用
- **提交**：`chore(web): strict 最终态收口——双 config 并回单一与迁移期断言拆除` +
  `docs(repo): 测试基建系列收口归档——backlog 关闭与结论提升`

## 5. 风险与对策

| 风险 | 对策 |
| --- | --- |
| layout/views 组件测试遇 element-plus 深层渲染不可达 | 断言自身逻辑分支，EP 内部不测；不可达行单点登记而非域级豁免 |
| echarts/sortablejs/typeit 等重依赖阻塞视图测试 | 视图层只测数据装配与事件接线，第三方实例创建打桩（jsdom 先例：ResizeObserver/toDataURL） |
| 删组件误伤隐藏引用 | T1 前重跑全仓引用 grep + `pnpm build:web` 双证 |
| E2E webServer 启动慢/端口冲突 | `--strictPort` + CI 独立 runner；`timeout` 120s |
| 收口步骤顺序错致断言误报 | T13 严格按 1→4 顺序（先并 config 后删断言脚本），每步 `pnpm check` 验证 |
| 清单变更冲突（若有并行诉求） | 本计划任务串行，无并行；合并前 rebase master |

## 6. 终态数字（预期）

| 指标 | 现状 | 终态 |
| --- | --- | --- |
| 单一 strict config 覆盖 | 125/280（45%） | 全量（删除 7 组件后约 255 文件）100% |
| 豁免清单 | 10 条模式 / 展开 26 项 | **0（文件删除）** |
| 断言/迁移期脚本 | 2 个 | 0 |
| 测试层 | 单测 48 套件 | 单测全量 + E2E 3 套件 |
| CI job | 5 | 6（+e2e-web） |
| strict 错误 | 413（待迁移域） | 0 |
