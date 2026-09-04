# 生产安全基线（Tier 2 #6）（已归档）

> ⚠️ **历史过程记录，非事实源。** 引用结论前必须先核对下方「稳定结论去向」对应的事实源。

- **状态**：已完成，2026-08-29 归档（worktree + Subagent-Driven 实施，7 提交合并 master，非 root 真实链路验收通过、pnpm check 全绿）

## 稳定结论去向

| 结论 | 事实源 |
| --- | --- |
| 镜像 pin 约定与季度巡检 | [build-and-verify.md](../../../engineering/build-and-verify.md) |
| 已关闭条目 ①② | [backlog.md](../../../governance/backlog.md) |
| 巡检脚本 | [scripts/ops/check-digests.sh](../../../../scripts/ops/check-digests.sh) |
| 速查 | [AGENTS.md](../../../../AGENTS.md) |

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-08-27-server-security-baseline-design.md](2026-08-27-server-security-baseline-design.md) | 设计文档（非 root + digest pin 变更矩阵 + USER node 安全分析 + pin 注释约定 + 实施期修正标注） |
| [2026-08-27-server-security-baseline-plan.md](2026-08-27-server-security-baseline-plan.md) | 实施计划（Task 0-5，验收路径 + 自审记录 + 执行偏差 bullet） |
