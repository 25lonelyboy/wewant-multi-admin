# pure-web 测试基建批次 B1 设计（纯函数组）

> 分批次设计文档：承接 [总体设计](./2026-08-29-pure-web-testing-foundation-design.md) 第 6 章 B1 行。B0（vitest 基建与样板模块）与 A 批次（strict 迁移机制）不在本文范围；B1 实施前须满足 [前置依赖](#3-前置依赖与事实校准)。

## 1. 范围与子任务拆解

B1 共 5 个待执行子任务 + 1 个归置动作；B1.1 / B1.2 已由 B0 完成（`build/utils.ts` + `utils/tree.ts` 已迁入清单）。

| 子任务 | 模块 | 规模参考（总行数，实测） | strict 错误 |
| --- | --- | --- | --- |
| B1.3 | `router/utils.ts` 纯函数簇 | 424 | 20（设计期估） |
| B1.4 | `utils/auth.ts` | 142 | 部分 |
| B1.5 | 小工具群：`responsive` / `message` / `mitt` / `preventDefault` + `propTypes` / `progress` / `globalPolyfills` | 48+95+21+28+39+17+7 | 少量 |
| B1.6 | `sso.ts` + `chinaArea.ts` | 59+190 | chinaArea 实测 20（单文件 strict 实测，见 2.6） |
| B1.7 | `print.ts`（新增） | 223 | 实测 13（豁免，见 2.7） |
| 归置 | `localforage/index.ts` → B2 | — | — |

## 2. 子任务测试策略

### 2.3 `router/utils.ts` 纯函数簇

- 测试对象：`ascending` / `filterTree` / `filterChildrenTree` / `isOneOfArray` / `filterNoPermissionTree` / `getParentPaths` / `findRouteByPath` / `formatFlatteningRoutes` / `formatTwoStageRoutes` 等纯函数导出簇
- mock `storageLocal`；`import.meta.glob` 由 vitest 原生支持，子任务首个用例即验证；动态 import（`IFrame` 常量指向 `.vue`）不测
- 脱离 router 实例（`createRouter`）测试纯函数簇；strict 修复与测试同节奏推进

### 2.4 `utils/auth.ts`

- `formatToken`（纯）+ `hasPerms`（vi.mock `useUserStoreHook`）+ `getToken` / `setToken` / `removeToken` **全部本子任务测**：jsdom 下 js-cookie 原生可用，pinia store hook 与 `storageLocal` 一律 vi.mock
- 覆盖 `setToken` 三分支（expires > 0 cookie 天数换算 / 否则会话 cookie / `username && roles` 双写 else 从 storage 回读）、`getToken` cookie 优先 localStorage 兜底、`removeToken` 三清理

### 2.5 小工具群

| 模块 | 策略 |
| --- | --- |
| `message.ts` | vi.mock('element-plus') 断言调用参数；真实插件基建留 B3.1 沉淀 |
| `responsive.ts` | `injectResponsiveStorage` 全分支：merge 缺省 + Storage.getData 命中/未命中 + `MultiTagsCache` 开关 |
| `mitt.ts` | emitter 订阅/广播/解绑语义测试（mitt 库自身不测） |
| `preventDefault.ts` | jsdom 触发 keydown/contextmenu/selectstart/dragstart，断言 `preventDefault` 调用与 `isImgElement` 分支 |
| `propTypes.ts` | vue-types 行为薄测试（`propTypes.string.def()` 等运行时断言） |
| `progress/index.ts` | vi.mock('nprogress') 断言 configure 参数透传 |
| `globalPolyfills.ts` | 冒烟构造调用断言无抛错 |

无逻辑 / 配置类文件写薄测试即可自然达标，**不引入测试豁免机制**。

### 2.6 `sso.ts` + `chinaArea.ts`

- `sso.ts` **可测性拆分重构**：IIFE 拆为导出函数（`getSsoParams` / `isSsoLogin` / `buildSsoRedirectUrl`）+ 5 行无逻辑入口 IIFE；三分支全测（非 SSO 早退 / 参数齐 setToken+replace / 参数不齐返回）；入口副作用 vi.mock `./auth` + jsdom `location`
- `chinaArea.ts`：`convertTextToCode` 省市县路径测试铺底；单文件 strict 实测 20 个错误，两类机械修复：9 个 TS7053 索引访问（`REGION_DATA['86']` 解构区）+ 11 个 TS7005/TS7034 隐式 any 变量（数据构造区），修 + 测同节奏，**不重构数据结构**

### 2.7 `print.ts`（薄测试 + 豁免清单）

- **strict 修复成本实测**：13 个错误（TS7006 × 8 / TS2531 × 2 / TS2366 / TS2322 / TS18047）+ 9 处 `@ts-expect-error`，全为机械级（参数标注 + 空值守卫），估 40-60 行 diff——成本低但收益有限
- **真正门槛在覆盖率**：`writeIframe` 的 iframe onload、`document.execCommand`、`setDomHeight` 等 jsdom 不可达，80% 行+分支需大量 fake iframe 编织，断言脆弱
- **决策（已确认）：薄测试 + 豁免清单**：
  - 薄测试覆盖可稳定断言部分：`extendOptions`（纯）、conf 合并（构造）、`getStyle` 字符串拼接（jsdom 文档片段）
  - 不进 `tsconfig.strict.json` 清单，登记豁免清单（防漏断言「新文件 ⊆ 清单 ∪ 豁免」兼容）——**架构性豁免**（DOM 打印 jsdom 不可达），非懒迁移
  - backlog 登记「print.ts strict+覆盖补全」，待 jsdom 能力或 E2E 基建成熟后回补

## 3. 前置依赖与事实校准

1. **第一批次落盘**：`feat/pure-web-testing-foundation` 合入 master（B0 vitest 基建 + A2 双 tsconfig 与清单断言 + A0/A1/A3 盘点资产）
2. **事实校准**：设计期 strict 错误数为估算，实施计划编写时以 A1 产物 + A2 实测为准；单项差异超 30% 时重估该子任务规模口径
3. **清单基线**：B1 开始时 `tsconfig.strict.json` include = `build/utils.ts` + `src/utils/tree.ts` + `types/*.d.ts`（B0 迁入后状态）

## 4. 执行编排

- **模式**：串行单 worktree `feat/pure-web-testing-b1`，延续第一执行会话模式（worktree + subagent-driven）
- **顺序**（按依赖深度）：B1.3 → B1.4 → B1.5 → B1.6 → B1.7
- **每子任务节奏**：TDD 红 → 绿 → 重构；strict 修复与测试同节奏；结束 = 测试达标 + strict 清零迁清单（域内文件 + spec）+ 独立提交（scope `web`；涉及机制/豁免文件时按变更面 `internal` / `repo`）
- **B1.7 特殊化**：豁免流，不进 strict 清单；验收为薄测试绿 + 豁免清单登记 + backlog 补全项

## 5. 统一验收

| 子任务 | 验收三件（齐备才算完成） |
| --- | --- |
| B1.3~B1.6 | ① 模块测试 ≥80% 行+分支（`vitest.config.ts` glob 键按序追加）② 文件+spec strict 零错误迁入清单 ③ 独立提交 + 受影响文档同提交 |
| B1.7 | ① 薄测试绿 ② 豁免清单登记 ③ 提交 + backlog 登记 |
| 全局 | 防漏断言计数只增不减；`pnpm check` 全绿 |

继承总体设计第 7 章三件套（测试 ≥80% / strict 清零迁清单 / conventional commits + 文档同提交）。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| `import.meta.glob`（router/utils）在 vitest 环境 | B1.3 首个用例兑现验证 |
| element-plus ElMessage（message.ts） | B1 阶段 vi.mock；真实插件基建留 B3.1 |
| js-cookie / sso 的 `window.location` 浏览器 API | jsdom 原生支持 + sso 重构后入口副作用 mock |
| chinaArea 数据模块 20 errors | 索引访问 + 隐式 any 两类机械修复，修+测铺底，不重构数据结构 |
| print.ts 豁免被误判污染 | 豁免条目写理由 + backlog 双向登记 |
| B0 落盘晚于 B1 设计 | 设计→计划之间设事实校准步骤（第 3 节第 2 条） |
| 清单变更为冲突热点 | 串行单 worktree，清单变更按序落盘零冲突 |

## 7. 文档治理

- 本文档：`docs/tasks/2026-08-29-pure-web-testing-foundation/`（同目录，与总体设计同任务区）；总设计第 6 章 B1 行已加链接
- 实施计划（writing-plans 产物）：`...-b1-plan.md` 同目录
- backlog：开放表新增「print.ts strict+覆盖补全」（豁免状态声明）；localforage 归置由 B2 计划承接
- 收口：随总任务目录归档