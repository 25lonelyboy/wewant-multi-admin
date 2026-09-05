# doc-lint 接入门禁链

- **状态**：设计已确认，实施计划已就绪，待实施
- **目标**：doc-lint 从「依赖自觉执行」升级为「机械保障」——pre-push 阻断 + CI 报警兜底，前置清项归零基线。

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-09-05-doc-lint-gate-integration-design.md](2026-09-05-doc-lint-gate-integration-design.md) | 设计文档（三问澄清锁定方向：阻断式为主 / 先清项再接入 / 独立 CI job） |
| [2026-09-05-doc-lint-gate-integration-plan.md](2026-09-05-doc-lint-gate-integration-plan.md) | 实施计划（4 任务 / 3 提交漂移链推演；已审查修正：登记本文件消除孤儿、Step6 时序纠偏、CI job fetch-depth:0） |
