# server 镜像启动冒烟（Tier 2）（已归档）

> ⚠️ **历史过程记录，非事实源。** 引用结论前必须先核对下方「稳定结论去向」对应的事实源。

- **状态**：已完成，2026-08-29 归档（worktree + Subagent-Driven 实施，3 提交合并 master，本地端到端 + CI 首跑双验证通过）

## 稳定结论去向

| 结论 | 事实源 |
| --- | --- |
| 冒烟机制与 `ops:server-smoke` 速查、pipefail 教训 | [build-and-verify.md](../../../engineering/build-and-verify.md) |
| 已关闭条目与演进信号登记 | [backlog.md](../../../governance/backlog.md) |
| 探针脚本 | [scripts/ops/server-smoke.sh](../../../../scripts/ops/server-smoke.sh) |
| CI 集成 | [.github/workflows/ci.yml](../../../../.github/workflows/ci.yml) |

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-08-28-server-image-smoke-design.md](2026-08-28-server-image-smoke-design.md) | 设计文档（7 项锁定决策 D1-D7：探针深度 / 双分支宿主适配 / 三段断言 / CI services 集成） |
| [2026-08-28-server-image-smoke-plan.md](2026-08-28-server-image-smoke-plan.md) | 实施计划（Task 0-7 全部勾选；含 SIGPIPE/pipefail 修正同步与 Self-Review 记录） |
