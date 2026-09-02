# pure-web 测试基建与 strict 类型安全（已归档）

> ⚠️ **历史过程记录，非事实源。** 本文档及同目录文件为任务过程快照，只追加不改写；引用结论前必须先核对下方「稳定结论去向」对应的事实源。

- **范围**：批次 A0–A3（上游基线、strict 测量、双 tsconfig 断言机制、组件盘点）+ 批次 B0–B3（vitest 基建与纯函数 / store / 组件测试）+ 批次 B4 收口（遗留组件处置、全域迁移、E2E 基建、最终态拆除）
- **状态**：已完成，2026-09-02 归档（B4 收口批次 13 任务全部完成 + 审查修复 5 项提交）
- **终态指标**：单测 122 文件全绿 / E2E 9 用例 / strict 单一 tsconfig 全量迁入、豁免清零

## 稳定结论去向

| 结论 | 事实源 |
| --- | --- |
| 测试分层（vitest 单测 / Playwright E2E / 覆盖率阈值）与构建验证命令 | [build-and-verify.md](../../../engineering/build-and-verify.md) |
| 已关闭条目（测试基建 / E2E / 最终态收口 / print.ts / Canvas 豁免 / vitest 兼容）与开放条目（上游周期评估 / 组件抽取） | [backlog.md](../../../governance/backlog.md) |
| 上游基线记录（长期维护，已提升出本目录） | [upstream-tracking.md](../../../engineering/upstream-tracking.md) |

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| `2026-08-29-pure-web-testing-foundation-design.md` | 总设计：双 tsconfig 分层 + vitest 基建 + 模块化覆盖 + 上游策略前置 |
| `2026-08-29-pure-web-testing-foundation-plan.md` | 总体实施计划 |
| `2026-08-29-a1-vue-strict-measurement.md` | A1 `.vue` 全量 strict 错误实测 |
| `2026-08-29-pure-web-testing-foundation-b1-design.md` | B1 分批设计（纯函数组） |
| `2026-08-29-pure-web-testing-foundation-b2-design.md` | B2 分批设计（状态机 / store 组） |
| `2026-08-29-pure-web-testing-foundation-b3-design.md` | B3 分批设计（在用组件组） |
| `2026-08-30-pure-web-testing-foundation-b1-plan.md` | B1 实施计划 |
| `2026-08-30-pure-web-testing-foundation-b2-plan.md` | B2 实施计划 |
| `2026-08-30-pure-web-testing-foundation-b3-plan.md` | B3 实施计划 |
| `2026-08-31-pure-web-testing-foundation-b4-plan.md` | B4 收口批次计划（13 任务） |
| `component-inventory.md` | 组件资产盘点（16 在用 / 8 遗留，勘误后口径） |
| ~~`upstream-baseline.md`~~ | 已提升为活文档 → [upstream-tracking.md](../../../engineering/upstream-tracking.md)（上游同步为持续性机制，不随任务归档） |
