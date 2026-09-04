# Turborepo 构建编排全量迁移

> **⚠️ 历史过程记录，非事实源。** 最终结论位置见下方「稳定结论去向」。引用本目录内容前，请先以事实源核对。

## 范围

以 `turbo.json` 任务图取代全部 npm pre hook，全仓四端 + 共享包统一纳管；同步完成门禁纯校验化（lint 去 `--fix`）与 test 覆盖枚举。

## 状态

已完成，2026-08-23。5 个提交：

| Commit | 说明 |
|---|---|
| `d1ec306` | 设计文档与实施计划 |
| `b2f8c27` | turbo 编排骨架（catalog pinned + turbo.json + 冒烟） |
| `5216629` | 核心迁移（删 pre 钩子 + 入口统一 + 门禁纯校验化 + 脚本精简） |
| `c4c28ea` | Docker 构建链改 `--filter X...` 拓扑 |
| `e2d57ea` | ADR-005 + 架构/工程文档同步 + backlog 关闭 |

## 文件

| 文件 | 说明 |
|---|---|
| [2026-08-23-turbo-build-orchestration-design.md](2026-08-23-turbo-build-orchestration-design.md) | 设计文档（现状问题 / 方案对比 / 任务图建模 / 决策锁 / 验收标准） |
| [2026-08-23-turbo-build-orchestration-plan.md](2026-08-23-turbo-build-orchestration-plan.md) | 实施计划（Task 0-6，7 个任务的完整规格） |

## 稳定结论去向

| 结论域 | 事实源 / ADR |
|---|---|
| 构建编排选型决策 | [ADR-005](../../../decisions/ADR-005-turbo-build-orchestration.md) |
| 仓库结构与依赖图 | [repo-structure.md](../../../architecture/repo-structure.md) |
| contracts 契约包消费方式 | [contracts.md](../../../architecture/contracts.md) |
| 桌面端打包链 | [desktop-app.md](../../../architecture/desktop-app.md) |
| 门禁与构建链工程实践 | [build-and-verify.md](../../../engineering/build-and-verify.md) |
| Agent 指引（常用命令 + 架构要点） | [AGENTS.md](../../../../AGENTS.md) |
| 已关闭 backlog（2 条） | [backlog.md](../../../governance/backlog.md) |

归档日期：2026-08-24（结论提升完毕）。
