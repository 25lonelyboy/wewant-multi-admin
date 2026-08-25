# ops 脚本自动化操作集

**状态**：已完成（2026-08-25）

## 任务概述

沉淀 7 个自动化脚本到 `scripts/ops/`，消除 push → CI → 诊断循环中的手动断点。5 Shell + 2 ESM 分层，人和 AI Agent 均可调用。

## 过程文件

| 文件 | 职责 |
|------|------|
| [2026-08-25-ops-scripts-design.md](2026-08-25-ops-scripts-design.md) | 设计文档（6 场景梳理 + 技术选型 + 各脚本详细设计） |
| [2026-08-25-ops-scripts-plan.md](2026-08-25-ops-scripts-plan.md) | 实施计划（7 个 Task + 完整代码） |

## 稳定结论位置

| 结论 | 位置 |
|------|------|
| ops 脚本命令速查与前置依赖 | [docs/engineering/build-and-verify.md](../../engineering/build-and-verify.md#ops-自动化脚本scriptsops) |
| package.json ops:* 别名 | [package.json](../../../package.json) |
| 脚本实现 | [scripts/ops/](../../../scripts/ops/) |

## 实施提交

| Commit | 说明 |
|--------|------|
| `55d053b` | 设计文档登记 |
| `192f0aa` | 实施计划登记 |
| `2107d8d` | env-up/down 启停脚本 |
| `f106007` | fix: redis elapsed 计数器共享 |
| `1210fc2` | ci-status/ci-logs CI 诊断脚本 |
| `2979218` | fix: gh API double-call |
| `d46cb24` | pre-push + docker-smoke |
| `4ca1114` | coverage.mjs |
| `6100100` | package.json + docs 注册 |
| `90f2846` | 热索引收口 |
