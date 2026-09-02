# 登录限流账号维度与失败锁定（Tier 2）（已归档）

> ⚠️ **历史过程记录，非事实源。** 引用结论前必须先核对下方「稳定结论去向」对应的事实源。

- **状态**：已完成，2026-08-28 归档（worktree + Subagent-Driven 实施，6 提交合并 master，单测 / e2e / 覆盖率门禁复验全绿）

## 稳定结论去向

| 结论 | 事实源 |
| --- | --- |
| 错误码 42301 | [contracts.md](../../../architecture/contracts.md) |
| 限流与锁定行为 | [backend.md](../../../architecture/backend.md) |
| 已关闭条目与管理员解锁端点登记 | [backlog.md](../../../governance/backlog.md) |

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| `2026-08-27-login-account-lockout-design.md` | 设计文档（7 项锁定决策 D1-D7 + 变更矩阵 + e2e 三拆分策略） |
| `2026-08-27-login-account-lockout-plan.md` | 实施计划（Task 0-6，TDD 步骤 + 验收对照表 + 风险预案） |
