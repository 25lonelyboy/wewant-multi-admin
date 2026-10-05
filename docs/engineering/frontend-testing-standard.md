---
status: living
covers:
  - apps/pure-web/vitest.config.ts
  - apps/pure-web/playwright.config.ts
  - apps/pure-web/e2e/
  - .github/workflows/ci.yml
  - apps/pure-web/AGENTS.md
last_verified: 2026-09-08
---

# pure-web 前端测试评估规范

> 决策理由见 [ADR-008](../decisions/ADR-008-tiered-e2e-testing.md)（双层 E2E）；本文记「怎么做」，随代码演进维护。

## 1. 六层分类框架

| 层级 | 定义 | 处置 |
|------|------|------|
| T1 纯逻辑 | 无 DOM 依赖，输入→输出可断言 | 单测 ≥80/80 |
| T2 集成交互 | 含组件交互/状态流 | 集成测试 ≥80/80 |
| T3 页面壳 | 仅 template 组合子组件，无独立分支 | smoke + exclude |
| T4 jsdom 受限 | canvas/echarts/DOM 打印等 | 薄测试 + E2E 回补 + exclude |
| T5 无逻辑 | barrel/纯类型/入口/静态页 | exclude + 理由 |
| A 类已测 | 有 spec 但未登记 threshold | 补键 ≥80/80 |

### 判定决策树

新文件 → 有 DOM/canvas/echarts？→ T4
→ 有 if/computed/事件分支？→ T1 或 T2
→ 仅 template 组合？→ T3
→ 纯 re-export/类型/配置？→ T5

## 2. 阈值终态

三层，全部落在 `apps/pure-web/vitest.config.ts`：

- **全局聚合兜底**：lines / branches ≥80，作用于未单列的文件。
- **crown-jewel ≥90**（6 键）：auth / user store / http / guards / tree / permission。
- **T1/T2 文件级 ≥80/80**（3 键）：`ReCol` / `ReFlicker` / `ReText`，按 §5 随组件测试落地时登记。

这三层是**执行策略，不是数学保证**：全局阈值只看聚合值，未单列的文件不做 per-file 校验。"非排除文件逐个达 80"是目标态，靠 §5 的登记流程维持，不靠配置自动强制。

### crown-jewel 降级阈值（2 处）

| 文件 | 阈值 | 降级理由 |
|------|------|----------|
| `src/utils/http/index.ts` | branches=88 | `PureHttp.initConfig` 是 private static 且全仓无赋值点，请求/响应拦截器里读它的两个回调分支恒不成立；请求拦截器的 error handler 属防御性代码（fulfilled 分支永不抛） |
| `src/router/guards.ts` | branches=85 | `whiteList` 仅含 `'/login'`，而进入白名单判定前已确认 `to.path !== '/login'` —— 判定恒假，其 `return true` 分支不可达 |

论证与阈值同处维护（`vitest.config.ts` 的内联注释），避免两处漂移。

## 3. exclude 治理

- 每条 exclude 映射 T3/T4/T5 + 理由
- 配置内联理由 + 本文主表双处同源
- T4 豁免双向登记：薄测试 + E2E 回补 + 主表登记，三者缺一视为技术债

### exclude 主表

见 [pure-web-exclude-registry.md](pure-web-exclude-registry.md)（与本文同属 engineering 事实源层）。

## 4. 双层 E2E 操作细则

### Tier A（mock 模式）
- `VITE_MOCK=true`，mock 后端
- 标签：`@mock-only`
- 旅程：登录/路由/组件/验证码

### Tier B（real 模式）
- `E2E_MODE=real`，真实后端
- 标签：`@real-backend`
- 旅程：登录冒烟/CRUD/token 轮换/账号锁定
- CI：`e2e-web-real` job（报警式 + nightly）

## 5. 新增单元判定流程

新文件加入时：
1. 按决策树判定层级
2. T1/T2：写测试 + 加 threshold 键 ≥80/80
3. T3：写 smoke + 加 exclude
4. T4：写薄测试 + 登记 exclude-registry + E2E 旅程覆盖
5. T5：加 exclude + 内联理由
6. 若属 crown-jewel 域：门槛提升到 ≥90
