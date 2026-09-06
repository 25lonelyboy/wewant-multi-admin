# pure-web 前端测试评估规范与覆盖缺口补齐

- **状态**：设计 + 实施计划已完成，待提交与执行
- **目标**：建立 pure-web 前端测试评估规范（六层分类框架 + 双层 E2E + 阈值终态），首次应用于 118 个未登记文件的覆盖缺口补齐，收敛 `vitest.config.ts` 的 91 个逐文件 glob 键膨胀。

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-09-06-frontend-testing-standard-design.md](2026-09-06-frontend-testing-standard-design.md) | 设计文档（五段：六层分类框架 / 阈值配置终态 / 双层 E2E / 6 Phase 补齐路线图 / 治理落位）；核心决策 → [ADR-008](../../decisions/ADR-008-tiered-e2e-testing.md) |
| [2026-09-06-frontend-testing-standard-plan.md](2026-09-06-frontend-testing-standard-plan.md) | 实施计划（Task 0-17：基线 → 探针 → exclude 治理 → 分域补测 → Tier B 基建 → 翻转收口）；执行产物：classification-118.md / exclude-registry.md / probe-*.md 随任务落盘后回补本表 |
