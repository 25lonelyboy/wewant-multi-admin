---
status: living
covers:
  - apps/pure-web/vitest.config.ts
  - apps/pure-web/playwright.config.ts
  - apps/pure-web/e2e/
  - .github/workflows/ci.yml
  - apps/pure-web/AGENTS.md
last_verified: 2026-09-06
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

- 全局聚合 lines/branches ≥80
- crown-jewel 6 键 ≥90（auth / user store / http / guards / tree / permission）
- 数学保证：非排除文件 per-file ≥80 ⇒ 聚合 ≥80

### crown-jewel 降级阈值（2 处，有代码证据）

| 文件 | 阈值 | 降级理由 |
|------|------|----------|
| `src/utils/http/index.ts` | branches=88 | `initConfig` 为 `private static = {}` 且全仓无赋值点，L100/L167 分支不可达；请求拦截器 error handler（fulfilled 永不抛）为防御性代码 |
| `src/router/guards.ts` | branches=85 | `whiteList` 仅含 `'/login'`，L109 已排除 `'/login'`，L110-111 为不可达死代码 |

降级论证详见 `vitest.config.ts` 内联注释。

## 3. exclude 治理

- 每条 exclude 映射 T3/T4/T5 + 理由
- 配置内联理由 + 本文主表双处同源
- T4 豁免双向登记：薄测试 + E2E 回补 + 主表登记，三者缺一视为技术债

### exclude 主表

见 [exclude-registry.md](../tasks/2026-09-06-frontend-testing-standard/exclude-registry.md)

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
