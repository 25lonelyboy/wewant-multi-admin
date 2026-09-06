# pure-web 前端测试评估规范与覆盖缺口补齐设计

- **目标**：为 pure-web 建立可持续的前端测试评估规范（六层分类框架 + 双层 E2E + 阈值终态），并首次应用于 118 个未登记文件的覆盖缺口补齐，最终收敛 `vitest.config.ts` 的 91 个逐文件 glob 键膨胀。
- **来源**：`/brainstorming`（2026-09-06）。初始意图「pure-web 尚有哪些未纳入测试体系…不能让 thresholds 配置一直维持当前情况」；范围扩展「建立前端测试评估规范，为后续新增功能/页面判定测什么层级、达到什么阈值」。
- **状态**：设计已确认（2026-09-06，五段逐项裁决 + 双层 E2E 批判性评估）。
- **关联决策**：[ADR-008](../../decisions/ADR-008-tiered-e2e-testing.md)（双层 E2E 测试策略，本次同写）；P5「pure-web 直连真实后端、mock 降级为离线开关」决策的测试落地。
- **适用边界**：pure-web 专属（不推广到 uni-mobile / electron-desktop）；强制力为「文档指南 + 报警式门禁兜底」，非阻断式硬卡。

## 背景与问题

三个交织的问题：

1. **thresholds 配置膨胀**：`vitest.config.ts` 现有 91 个逐文件 glob 键（全部 `lines:80,branches:80`，唯一例外 `build/info.ts: {lines:75,branches:65}`）。每次新增测试须手动追加键，配置随测试增长线性膨胀。
2. **覆盖缺口**：209 个 `coverage.include` 源文件中，118 个未登记 thresholds 键（含 B4 已知约 30 个模板 jsdom 受限的 Vue 组件），不受阈值保护。
3. **mock-only E2E 的 false-green 缺口**：CI `e2e-web` job 跑 `VITE_MOCK=true`（mock），但 P5 决策已锁定 pure-web 直连真实后端为生产现实。生产链路（浏览器→proxy `/api/v1`→NestJS→postgres/redis）从未被前端 E2E 验证；且前端经历大量调整（B1-B4 strict 迁移 + 组件测试重构）后，直连链路是否仍完好未知。

**关键认知修正**：上一轮结论认为「逐文件 glob 键是 vitest 4 API 限制下不可替代的形态」。本设计发现——该结论的真实成因是 `coverage.exclude` 不完整（含大量未登记的 T3/T4/T5 文件拉低聚合）。**一旦按分类框架做 comprehensive exclude，全局聚合阈值形态即解锁**，91 个 glob 键可收敛为「全局聚合 + 少量 crown-jewel」。

---

## 第 1 部分：前端测试评估规范（治理工件）

### 1.1 测试哲学基线：Testing Trophy

采用 Kent C. Dodds 的 **Testing Trophy**（Autonoma 2026-04 复证），而非 Testing Pyramid——pure-web 是组件驱动的 Vue3 前端，Trophy 的「集成优先」比 Pyramid 的「单测优先」confidence-per-dollar 更高。四层：Static（基座）→ Unit（薄）→ Integration（主层）→ E2E（小顶层）。

### 1.2 六层分类框架

| 层 | 定义 | 判据 | 测试方式 | 阈值 | coverage 处置 |
|---|---|---|---|---|---|
| **第 0 层 Static** | 类型 + lint 基座 | 所有代码强制 | strict typecheck（`tsc` + `vue-tsc`）+ eslint `--max-warnings 0` | 通过/失败 | 已有，不涉及 |
| **T1 纯逻辑** | util / hook / store / api / 路由守卫 | 有业务逻辑分支且可脱离 DOM 验证 | 单测，真实依赖（禁整模块 mock 被测对象） | ≥80% lines+branches | 计入聚合 |
| **T2 交互组件** | 用户事件 / 表单 / 条件渲染组件 | 有逻辑且需 mount 验证交互 | 集成测试，**mount 真实子依赖，stub 最小化** | ≥80% lines+branches | 计入聚合【trophy 主层】 |
| **T3 页面壳** | 仅组合子组件、逻辑已下沉 hook 的页面 | 无独立逻辑分支 | smoke render（断言关键元素/出口，**非恒真**） | 不设阈值 | exclude |
| **T4 jsdom 受限** | canvas / 打印 / 复杂 DOM API | 有逻辑但 jsdom 不可达 | 薄逻辑测试 + **E2E 回补** | 不设阈值 | exclude + **豁免双向登记** |
| **T5 无逻辑** | barrel re-export / plugin 注册 / 入口 bootstrap / 静态路由配置 / 静态页 | 无业务逻辑 | 不测 | 不设阈值 | exclude |
| **E2E 关键旅程**（正交维度） | 用户可观测 + 多步 + 跨层 + 高风险路径 | 见第 3 部分判据 | Playwright，双层（Tier A/B） | 旅程通过/失败，**非百分比** | 不产 vitest coverage |

**exclude 治理铁律**：每条 exclude 必须映射 T3/T4/T5 + 附理由，**禁止「测不到就排除」**——这是 B4「降阈红线」在全局聚合形态下的等价物，防「数字游戏」。

**scope out**（记 backlog，本次不做）：视觉回归 / Storybook / Vitest Browser Mode（T4 canvas 的未来演进选项，可能替代部分豁免）。

### 1.3 判定决策树（每个新文件/新功能按此分类）

```
新文件
├─ 有业务逻辑分支（if/switch/计算/状态转换）？
│   ├─ 纯函数 / util / hook / store / api / 路由守卫 ────────→ T1（单测 ≥80%，真实依赖）
│   └─ 交互组件（用户事件 / 表单 / 条件渲染）──────────────→ T2（集成测试，mount 真实子依赖，≥80%）
├─ 无独立逻辑、仅组合子组件的页面壳（逻辑已下沉 hook）？──→ T3（smoke render 断言关键出口，exclude）
├─ 有逻辑但 jsdom 不可达（canvas / 打印 / 复杂 DOM API）？─→ T4（薄测试 + E2E 回补 + 豁免双向登记 + exclude）
└─ 无逻辑（barrel / plugin / 入口 / 静态路由配置 / 静态页）？→ T5（不测 + exclude）

正交叠加：该文件是否在「用户可观测 + 多步 + 跨层 + 高风险」关键旅程上？
          → 是则额外补 E2E（Tier A mock + Tier B real，见第 3 部分）
```

### 1.4 三原则

1. **测行为不测实现**：断言用户可观测结果，禁恒真断言、禁测 mock 行为（superpowers testing-anti-patterns 铁律）。
2. **真实组合优先，mock 只在边界**：mock 仅限外部边界（axios 实例、第三方、时间/随机）；**禁整模块 mock 被测依赖**（如 `@/utils/auth` 的 `hasAuth`/`hasPerms` 即被测对象，保持真实）。
3. **越接近真实使用，信心越足**：能 T1 不 T2、能 T2 不上 E2E；但高风险跨层旅程必须有真 E2E（Tier B）兜底。

---

## 第 2 部分：阈值与配置终态

### 2.1 终态形态 (a)：全局聚合 + crown-jewel

三形态对比后选 **(a)**：

| 形态 | 优点 | 缺点 | 裁决 |
|---|---|---|---|
| **(a) 全局聚合 + crown-jewel** | 收敛 91 键为 2 行 + ~8 键；关键逻辑 elevated bar；comprehensive exclude 后聚合数学可达 | 需先做全 exclude 治理 | ✅ **推荐** |
| (b) `perFile: true` | 每文件独立强制 | 脆弱、逼 exclude 膨胀、新文件即红 | ❌ |
| (c) 纯全局聚合 | 最简 | 最弱，关键逻辑被平均掩盖 | ❌ |

```typescript
// vitest.config.ts coverage.thresholds 终态（Phase F 翻转后）
thresholds: {
  lines: 80,
  branches: 80,
  // crown-jewel：安全关键逻辑，elevated bar ≥90（清单 ≤8，Phase 0 探针确认）
  'src/utils/auth.ts':         { lines: 90, branches: 90 },  // hasAuth/hasPerms 权限判定
  'src/store/modules/user.ts': { lines: 90, branches: 90 },  // token/session 状态机
  'src/utils/http/index.ts':   { lines: 90, branches: 90 },  // 信封解包 + BizCode 40102 刷新拦截
  'src/router/guards.ts':      { lines: 90, branches: 90 }   // 权限路由守卫（精修：从 router/index.ts 抽取）
}
```

### 2.2 coverage.exclude 双层治理

- **配置内联理由**（`vitest.config.ts`）：每条 exclude 后缀 `// T<n>: <理由>`。
- **规范文档主表**（living）：exclude 清单权威表，CI doc-lint `covers` 保护不陈旧。

```typescript
// 示例为终态示意：vitest.config.ts 独立于 vite.config.ts（无 viteBase 导入），
// 实施时 exclude 为纯内联数组（现仅 '**/*.d.ts' + '**/*.spec.ts' 两条，逐条追加）
exclude: [
  '**/*.d.ts', '**/*.spec.*', '**/*.test.*', 'src/test-utils/**',  // 非业务代码
  // ── T5 无逻辑 ──
  'src/main.ts', 'src/App.vue',               // T5: bootstrap / 根壳
  'src/plugins/*.ts',                          // T5: app.use 副作用注册
  'src/views/error/*.vue', 'src/views/empty/index.vue',  // T5: 静态页
  // ── T4 jsdom 受限（豁免双向登记 + E2E 回补）──
  'src/utils/print.ts',                        // T4: DOM 打印不可达
  'src/components/ReImageVerify/**',           // T4: canvas 验证码
  'src/components/ReCropper/**',               // T4: cropper（E2E 永久豁免）
  'src/components/ReQrcode/**', 'src/components/ReCropperPreview/**',  // T4: canvas
  'src/views/welcome/components/charts/*.vue', // T4: echarts 渲染
  // ── T3 页面壳（个案枚举，逻辑已下沉 hook）──
  // Phase 1 分类产出精确清单
]
```

**barrel 通配符警告**：`src/components/*/index.ts` 不可直接用通配——须先逐文件验证确为纯 re-export，否则误排有逻辑文件违反治理铁律。

### 2.3 过渡翻转路径 + 数学保证

- **Phase 1**：扩 exclude 清基线（T3/T4/T5 分类）。
- **Phase 2~N**：补测 T1/T2，per-file 键作**脚手架**（翻转前临时保护）。
- **翻转闸门**：当所有非排除文件 per-file 键全绿 ≥80% → 删 91 键 → 换全局聚合 + crown-jewel。
- **数学保证**：若每个非排除文件 ≥80%，则聚合必 ≥80%——「per-file 键全绿」是「全局形态必过」的充分证据。

### 2.4 三处精修

1. **router/index.ts 拆分、抽 guards.ts**：现状 `src/router/index.ts` 无 thresholds 键、无测试（118 未登记之一，beforeEach 守卫与 bootstrap 混杂于 235 行单文件）。精修——守卫逻辑抽到 `src/router/guards.ts` 作 crown-jewel（≥90），bootstrap 部分按 T5 分类 exclude。
2. **build/info.ts 探针期判定**：唯一非标键（75/65）。Phase 0b 判定属 T1/T2（补到 80）或 T4（重分类 + exclude + 理由），**不许灰色地带**。
3. **crown-jewel 清单 ≤8**：由 Phase 0 探针确认最终清单，控制在 8 个内（auth / user store / http / router guards 为已知核心）。

---

## 第 3 部分：双层 E2E（决策理由见 ADR-008）

### 3.1 E2E 与 T1-T5 的正交关系

E2E 和 T1-T5 是**两个正交维度**：T1-T5 分类**文件**（产 vitest coverage，受阈值门禁）；E2E 分类**旅程**（Playwright 通过/失败，**不产 coverage**）。

**关键推论**：
1. Playwright 跑真浏览器不产 vitest coverage → 文件即使被 E2E 走过，coverage 报告里仍是 0%（除非另有单测）。
2. **T4 豁免文件即使有 E2E 回补，仍须 exclude 出阈值 + 豁免双向登记**——E2E 回补是「行为验证」，不是「覆盖率验证」，两者不能互替。
3. crown-jewel 文件可受双重保障：单测（进阈值 ≥90）+ E2E 旅程（不进阈值）。

### 3.2 现有 4 套件 9 test 画像（已逐个核实）

| 套件 | test 数 | 类型 | 覆盖 |
|---|---|---|---|
| `auth.spec` | 1 | 纯旅程 | 表单校验→登录→首页菜单→退出 |
| `routing.spec` | 4 | 旅程+守卫 | 菜单导航 / 403 路由存在+meta / 404 兜底渲染 / 未登录重定向 |
| `components.spec` | 2 | **T4 豁免回补** | ReQrcode canvas / ReCropperPreview 经用户管理页 |
| `verify.spec` | 2 | **T4 豁免回补** | ReImageVerify 验证码刷新 / print.ts 模块加载 |

**结构洞察**：9 test 里 4 个是 T4 豁免回补（豁免债务补偿，非旅程膨胀），5 个真旅程。

### 3.3 双层 E2E 定义

| | **Tier A：前端集成 E2E（mock）** | **Tier B：真实后端 E2E 冒烟** |
|---|---|---|
| 后端 | `VITE_MOCK=true`（fake-server） | `VITE_MOCK=false`（proxy→NestJS→postgres/redis） |
| 正名 | 浏览器级**前端集成测试**（非真 E2E） | **真 E2E**（全栈，user-observable outcome） |
| 触发 | 每次 push（现有 `e2e-web` job） | 合 master / nightly（新增 `e2e-web-real` job） |
| 特性 | 快 / 确定 / 并行安全 | 慢 / 可能 flaky / 需 env 编排 |
| 覆盖 | UI 旅程、T4 canvas 回补、边缘渲染、表单校验（~80% 大头） | 生产接线：proxy、真实信封、双令牌轮换、锁定码（~20% 信心层，3-5 test） |
| 强制力 | 报警式不拦截 | 报警式不拦截 |

**双模切换机制**（避免测试代码翻倍，依 ui-testing-best-practices「黄金组合」+ 车辆监控范式）：

```typescript
// e2e/ 双模改造：同一套代码，env 切后端
const E2E_MODE = process.env.E2E_MODE ?? 'mock';         // mock | real
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS ?? 'admin123';  // real 模式 CI 注入 ADMIN_INIT_PASSWORD

// tag 分流（Playwright grep 选层）：
test('登录→首页→退出 @real-backend', ...);   // Tier B 跑
test('ReQrcode canvas 非空 @mock-only', ...); // 仅 Tier A 跑
```

**必改造点（车辆监控「坑 2」直接命中）**：`loginAsAdmin` 现硬编码 `admin/admin123`（`auth.spec.ts` L24-25），真实后端用 `ADMIN_INIT_PASSWORD`（`ci.yml` L89）——凭证不 env 化则 Tier B 必挂。

### 3.4 强制 E2E 旅程清单 + 缺口

判据：**用户可观测 + 多步 + 跨层 + 高风险**。

| 旅程 | 现状 | 处置 |
|---|---|---|
| 登录→首页→退出 | ✅ `auth`（Tier A） | 保持；同旅程 Tier B 对真实后端复跑 |
| 未登录守卫重定向 | ✅ `routing#4` | 保持 |
| 动态路由注册+菜单导航 | ✅ `routing#1` | 保持 |
| 404 兜底渲染 | ✅ `routing#3` | 保持 |
| T4 豁免回补（qrcode/cropper/验证码/print） | ✅ `components`+`verify` | 保持（`@mock-only`） |
| **403 真实拒绝旅程** | ⚠️ 半覆盖（`routing#2` 只验路由存在+meta） | **补全**为真实无权限导航触发 403 渲染 |
| **核心 CRUD 全链路** | ❌ 缺口（`routing#1` 只到页面可达） | **补「用户管理」一条代表旅程**（增→查→改→删），Tier A + Tier B 双模 |
| **token 静默轮换（BizCode 40102）** | ❌ 缺口 | **三层不塌缩**：T1 单测（`http/index.spec.ts` 已存在）+ Tier A mock 旅程 + Tier B real 轮换 |
| **账号锁定 42301 前端处理** | ❌ 前端缺口（后端 e2e 已有） | Tier B 补：连续错误登录→锁定提示前端渲染 |
| ~~账号锁定独立旅程~~ | — | pure-web 无前端 lock 逻辑（backend-only），不单独列 |

### 3.5 Trophy 权重护栏（防 E2E 膨胀）

- E2E 只覆盖「跨层 + 用户可观测 + 多步 + 高风险」核心旅程，Tier A 控制在 ~12-14 test。
- T4 回补 E2E 是必要债务（随豁免文件走，不随功能走），不计入旅程膨胀预算。
- **新增旅程判据**（决策树终点）：「删掉这条 E2E，是否有一个跨层 bug 只有真浏览器能抓到？」否 → 降级 T2 集成测试。

---

## 第 4 部分：补齐路线图（6 Phase）

### 4.0 总览与排序原则

```
Phase 0 探针 → Phase 1 exclude 治理 → Phase 2~N 分域补测 → Phase T Tier B 基建 → Phase F 翻转闸门
（暴露风险）    （分类118文件+清基线）   （T1/T2 主体，可并行）  （依赖0a直连通）     （终态收敛）
```

1. **直连回归探针最先（0a）**——前端大量调整后直连可能已漂移，最早暴露；避免在 mock 幻觉下补完一堆测最后发现直连是坏的。
2. **exclude 治理早做（Phase 1）**——解锁全局聚合阈值可行性，把 118 文件分「补测集/exclude 集」。
3. **Tier B 基建依赖 0a 通过**——直连不通则 Tier B 无从谈起。
4. **翻转闸门最后**——所有补测 + exclude 完成后收敛配置。

### 4.1 Phase 0：探针（可行性 + 回归体检）

| 探针 | 动作 | 判定 |
|---|---|---|
| **0a 直连回归体检**（最高优先） | 起 nestjs-server（:3000，需 postgres+redis）→ pure-web `VITE_MOCK=false`（默认态）→ Playwright 最小登录旅程（凭证用真实 `ADMIN_INIT_PASSWORD`；**显式验证验证码兼容**——`auth.spec.ts` L27-33 从 pinia store 读前端 canvas 验证码，real 模式后端对 verifyCode 的校验语义未知，探针必须覆盖） | **通**→Tier B 可继续；**断**→先修直连链路（proxy/信封解包/BizCode/验证码语义/菜单渲染漂移），闭合 false-green 的必要回归修复，可能超工作量但不可跳 |
| **0b build/info.ts 分类** | 判定唯一非标键（75/65）属 T1/T2 还是 T4 | T1/T2→补到 80；T4→重分类+exclude+理由 |
| **0c exclude 可行性** | 扩 exclude 后跑全局聚合阈值 | 验证终态形态 (a) 数学假设 |

### 4.2 Phase 1：exclude 治理落地（分类 118 未登记文件）

**核心认知**：118 未登记文件**不是全部补测**——先按六层框架分类，分两集合：

| 集合 | 构成（预估，精确清单是 Phase 1 产出） | 处置 |
|---|---|---|
| **补测集（T1/T2）** | views/system CRUD hooks、layout hooks、store/api/util、交互组件 | Phase 2~N 补测，进 thresholds |
| **exclude 集（T3/T4/T5）** | ~30 个模板 jsdom 受限 Vue 组件、barrel、plugins、入口、静态页、canvas 类 | exclude + 双层登记 + T 理由 |

**产出**：① exclude 主表（规范文档，每行映射 T 类 + 理由）② 配置内联理由 ③ T4 豁免双向登记（豁免清单 + 薄测试 + E2E 回补三齐全）④ barrel 通配前逐文件验证纯 re-export。

### 4.3 Phase 2~N：分域补测 T1/T2（主体，可并行分域）

| 域批次 | 文件群 | 重点 | 呼应 |
|---|---|---|---|
| 域1 | layout/components(26) | 递归菜单/面包屑/标签栏交互组件 T2 | — |
| 域2 | views/system(24) | CRUD hooks T1 + 页面壳 T3 exclude | Tier B CRUD 旅程 |
| 域3 | views/login(6) + welcome(6) | 登录表单校验 T2 + 图表 T4 exclude | Tier B 登录/锁定 |
| 域4 | account-settings(5) + monitor(5) | 设置交互 T2 + monitor 豁免归零复核 | — |
| 域5 | 剩余（ReCropper/ReImageVerify/hooks/error 等） | T4 canvas 豁免复核 + hooks T1 | Tier A canvas 回补 |

**每域 TDD 铁律**：红→绿→重构→提交；T2 mount 真实子依赖、stub 最小化（禁整模块 mock 被测依赖、禁恒真断言）；覆盖率 ≥80% 才登记 per-file 键。

### 4.4 Phase T：Tier B 基建（依赖 0a 通过）

| 子任务 | 动作 | 靶点 |
|---|---|---|
| **T.1 双模改造** | `loginAsAdmin` 凭证 env 化 + baseURL 切换 + tagging（`@mock-only`/`@real-backend`） | auth.spec L24-25 硬编码必改 |
| **T.2 Tier B 冒烟**（3-5 test） | 登录 → 用户管理 CRUD → token 真实轮换（40102）→ 账号锁定 42301 前端处理，against 真实 nestjs+postgres+redis | 验 mock 永远验不了的生产链路 |
| **T.3 CI job** | 新增 `e2e-web-real`（报警式，合 master/nightly，起 postgres+redis+server，`VITE_MOCK=false`，`--grep @real-backend`） | 复用 coverage job services 范式 + digest pin |
| **T.4 契约桥接确认** | packages/contracts 编译期形状绑定 + Tier B runtime 行为验证互补，**不引 Pact**（YAGNI） | 对齐 P5 选定机制 |

### 4.5 Phase F：翻转闸门（终态收敛）

- **闸门条件**：所有非排除文件 per-file 键全绿 ≥80%。
- **翻转动作**：删 91 逐文件键 → 换全局聚合 `lines:80,branches:80` + ~8 crown-jewel per-file `90` 键。
- **同步**：AGENTS.md L35 硬规则「glob 键」→「全局聚合 + crown-jewel」；build-and-verify.md 测试小节刷新；规范文档提升 living（视实际情况）。

### 4.6 风险预案

| 风险 | 触发 | 预案 |
|---|---|---|
| 直连回归探针失败 | 前端大量调整致 proxy/信封/token/锁定码漂移 | 0a 前置暴露；先修直连；Tier B 工作量可能超预期，是 (a) 一次到位的代价 |
| Tier B flaky | 共享 postgres/redis 互踩（build-and-verify.md L90 已载限流互踩教训） | 串行 `workers:1` + 用例边界重置共享态（flushdb）+ 专用 test seed |
| exclude 误排有逻辑文件 | barrel 通配匹配到非纯 re-export | 通配前逐文件验证；每条 exclude 映射 T 类 + 理由；doc-lint covers 保护 |
| 补测集低估 | 静态盘点常低估（B4 dual measurement 教训） | Phase 1 分类用全量 vue-tsc + per-file 求和双重测量 |

### 4.7 每 Phase 验收门禁

- **Phase 0**：探针报告（直连通/断 + info.ts 分类 + exclude 可行性数学验证）。
- **Phase 1**：exclude 主表 + 双层登记 + doc-lint covers 通过 + 补测集/exclude 集精确清单。
- **Phase 2~N**：每域 `pnpm check` 绿（typecheck + per-file 键 coverage 达标）。
- **Phase T**：Tier A 现有 9 test 仍绿 + 新增旅程（403 补全 / CRUD 双模 / token mock 轮换）绿（合计 ~12-14）+ Tier B 3-5 test 真实后端绿 + `e2e-web-real` 报警式跑通。
- **Phase F**：全局聚合形态 coverage-web 绿 + 91 键删除 + crown-jewel 键达标 + AGENTS.md 措辞同步。

---

## 第 5 部分：治理落位

### 5.1 产出物与落位时序（过程材料 → 提升事实源）

| 产出物 | 落位 | 时序 | 治理依据 |
|---|---|---|---|
| 设计文档（本文） | `docs/tasks/2026-09-06-frontend-testing-standard/…-design.md` | 本次 | 过程材料隔离 |
| 实施计划 | 同目录 `…-plan.md` | writing-plans 阶段 | 过程材料 |
| ADR-008 双层 E2E | `docs/decisions/ADR-008-tiered-e2e-testing.md` | 本次（决策已锁定） | 跨域决策唯一存放地 |
| living 规范文档 | `docs/engineering/frontend-testing-standard.md` | 落地后提升（**视实际情况而定**，不硬绑 Phase F） | 活文档收口提升事实源 |
| build-and-verify.md L97-101 | 收敛为命令速查 + 链接 | 规范提升时同步 | 事实源唯一 |
| apps/pure-web/AGENTS.md L35 | glob 键 → 全局聚合 + crown-jewel | Phase F 翻转同一提交 | docs-in-same-commit |
| backlog 登记 | `docs/governance/backlog.md` | 本次（scope 外项） | living 登记册 |

### 5.2 ADR vs living 规范职责切分

- **ADR-008（不可变决策）**：记**为什么**——mock 不是真 E2E、80/20 权衡、Tier B 报警式低频、不引 Pact、对齐 P5 直连决策。写定不改。
- **frontend-testing-standard.md（living 实践）**：记**怎么做**——六层框架、判定决策树、阈值终态、exclude 治理铁律、双层 E2E 操作细则。随代码演进，frontmatter covers 保护。

### 5.3 强制力机制（文档指南 + 报警式门禁兜底）

| 层 | 机制 | 强制力 |
|---|---|---|
| 分类判定 | AGENTS.md 硬规则「新页面/模块必须带单测纳入同一门槛」+ 规范判定决策树 | 文档指南（agent/人遵循） |
| 覆盖率兜底 | vitest thresholds（全局聚合 + crown-jewel）+ CI `coverage-web` | 报警式 |
| Tier A E2E | `e2e-web` job（mock） | 每 push 报警式 |
| Tier B E2E | `e2e-web-real` job（真实后端） | 合 master/nightly 报警式 |
| exclude 治理 | doc-lint ④ covers 漂移 | 报警式 |
| 契约桥接 | contracts 编译期 typecheck + Tier B runtime + mock-only 端点登记 | typecheck 硬 + 报警 |

全链报警式不拦截，契合项目 CI 哲学（「CI 红 → 下一项工作先修 CI」）。

### 5.4 doc-lint / backlog 接线

**frontend-testing-standard.md 提升 living 时的 frontmatter covers**：
```yaml
status: living
covers:
  - apps/pure-web/vitest.config.ts
  - apps/pure-web/playwright.config.ts
  - apps/pure-web/e2e/
  - .github/workflows/ci.yml
  - apps/pure-web/AGENTS.md
last_verified: <提升日>
```

**backlog 登记（scope 外）**：视觉回归 / Storybook / Vitest Browser Mode（T4 演进）；Tier B 探针暴露的超范围直连修复；账号锁定 42301 前端 E2E 若首版未完整。

### 5.5 转 writing-plans 交接

```
本次 brainstorming（五段设计）→ 设计文档（本文）+ ADR-008
  → Spec 自审 → 用户审阅 → writing-plans 生成实施计划（按 Phase 0~F 拆 bite-sized TDD 任务）
  → subagent-driven-development 执行（worktree 隔离）
```

**提交前清理**：`scripts/tmp-coverage-gap.mjs`（缺口盘点临时脚本）必须删除；Phase 1 分类用「全量 vue-tsc + per-file 求和」双重测量替代。

---

## 附录 A：缺口盘点快照（2026-09-06）

- **总量**：209 个 `coverage.include` 源文件 / 91 已登记 thresholds 键 / **118 未登记** / 122 spec 文件。
- **未登记目录聚合**（前几名）：`src/layout/components`(26)、`src/views/system`(24)、`src/views/login`(6)、`src/views/welcome`(6)、`src/views/account-settings`(5)、`src/views/monitor`(5)、`src/plugins`(4)、`ReCropper`(3)、`ReImageVerify`(3)、`src/layout`(3)、`layout/hooks`(3)、`views/error`(3)，及大量 1-2 个的 barrel/组件。
- **来源**：临时脚本 `scripts/tmp-coverage-gap.mjs`（提交前删除）。**Phase 1 将用全量 vue-tsc + per-file 求和双重测量精化**（B4 教训：静态盘点常低估）。

## 附录 B：社区最佳实践参照

| 来源 | 支撑点 |
|---|---|
| Testing Trophy（Kent C. Dodds，Autonoma 2026-04 复证） | 集成优先；真 E2E 定义 = full stack + real DB + user-observable |
| superpowers test-driven-development + testing-anti-patterns.md | 禁测 mock 行为、禁恒真断言铁律（T2 真实依赖） |
| ui-testing-best-practices「黄金组合」2026-02 | 前端集成 stub（快 5-10×）+ 后端 E2E real，`TEST_MODE` env 双模切换 |
| Playwright Network Mocking（testdino 2026-02） | 80/20 法则：mock 80% 求速度，real 20% 求信心 |
| 飞书 OpenClaw 2026-02 | 双层 E2E：冒烟（≤50 case，允许 mock，合主干）+ 全量（real，低频） |
| 车辆监控 JUnit+Playwright 2026-08 | 关 mock 跑联调；「坑 2」mock/real 密码切换（本项目直接命中） |
| alexop.dev Vue3 Pyramid 2025-12 | 黄金法则「mock 越少越好，每个 mock 都是谎」；契约测试大厂用、现阶段 YAGNI |
| 51testing/CSDN 2025 | 「不要被覆盖率高的 E2E 迷惑」；模块完成后 mock 应改真实，避免集成漏测 |
| ECharts 双 runner | Jest 逻辑 + Karma 渲染，验证 T4「jsdom 受限」分类合理性 |
