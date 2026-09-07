# pure-web 前端测试评估规范与覆盖缺口补齐

- **状态**：已完成（Phase F 收口：阈值翻转 + living 规范落位 + 索引同步）
- **目标**：建立 pure-web 前端测试评估规范（六层分类框架 + 双层 E2E + 阈值终态），首次应用于 118 个未登记文件的覆盖缺口补齐，收敛 `vitest.config.ts` 的 91 个逐文件 glob 键膨胀。

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-09-06-frontend-testing-standard-design.md](2026-09-06-frontend-testing-standard-design.md) | 设计文档（五段：六层分类框架 / 阈值配置终态 / 双层 E2E / 6 Phase 补齐路线图 / 治理落位）；核心决策 → [ADR-008](../../decisions/ADR-008-tiered-e2e-testing.md) |
| [2026-09-06-frontend-testing-standard-plan.md](2026-09-06-frontend-testing-standard-plan.md) | 实施计划（Task 0-17：基线 → 探针 → exclude 治理 → 分域补测 → Tier B 基建 → 翻转收口） |
| [classification-118.md](classification-118.md) | 118 个未登记文件的六层分类判定结果 |
| [exclude-registry.md](exclude-registry.md) | exclude 主表（T3/T4/T5 映射 + 理由） |
| [probe-0a-report.md](probe-0a-report.md) | 探针报告 0a：覆盖率基线采集 |
| [probe-0c-report.md](probe-0c-report.md) | 探针报告 0c：配置终态验证 |
