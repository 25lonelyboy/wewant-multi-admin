# 任务归档（冷索引）

完成超 90 天或结论提升完毕的任务，过程文件原件存放于此。**只追加不改写**，需要恢复原始过程时按需读取；结论一律以 `docs/architecture/`、`docs/engineering/` 与 ADR 为准。

## 2026-08-12-repo-foundation-and-desktop —— 仓库基架与桌面端阶段 1

| 文件 | 说明 |
|---|---|
| `2026-08-12-repo-foundation-and-desktop.md` | 阶段 1 专项执行计划（Part A 基架 / Part B harness / Part C 桌面端，13 任务） |
| `2026-08-14-electron-desktop-impl.md` | 桌面端实施计划（托盘、协议、构建链） |
| `2026-08-14-electron-desktop-design.md` | 桌面端设计文档 |

结论去向：可复用结论在 `docs/architecture/` 与 `docs/engineering/`；稳定决策落为 [ADR-001](../../decisions/ADR-001-electron-desktop.md) / [ADR-002](../../decisions/ADR-002-dependency-catalog.md) / [ADR-003](../../decisions/ADR-003-electron-toolchain-pin.md)。

归档日期：2026-08-16（结论提升完毕）。

## 2026-08-16-nestjs-backend-foundation —— NestJS 后端基架补全（P1-P5）

| 文件 | 说明 |
|---|---|
| `2026-08-16-nestjs-backend-foundation-design.md` | 总体设计（后端选型 / 目录规划 / 横切基建） |
| `2026-08-16-nestjs-backend-foundation-phase1-plan.md` | P1 实施计划（骨架 + 健康检查） |
| `2026-08-16-nestjs-backend-foundation-phase2-design.md` | P2 设计（配置校验 / 信封 / 日志） |
| `2026-08-16-nestjs-backend-foundation-phase2-plan.md` | P2 实施计划 |
| `2026-08-17-nestjs-backend-foundation-phase3-design.md` | P3 设计（Prisma + Redis） |
| `2026-08-17-nestjs-backend-foundation-phase3-plan.md` | P3 实施计划 |
| `2026-08-18-nestjs-backend-foundation-phase4-design.md` | P4 设计（认证模块 + JWT） |
| `2026-08-19-nestjs-backend-foundation-phase4-plan.md` | P4 实施计划 |
| `2026-08-21-nestjs-backend-foundation-phase5-design.md` | P5 设计（前端契约对接 + 直连切换） |
| `2026-08-22-nestjs-backend-foundation-phase5-plan.md` | P5 实施计划（Task 1-21） |

结论去向：契约包事实源 → [contracts.md](../../architecture/contracts.md)；技术选型 → [ADR-004](../../decisions/ADR-004-contracts-and-backend-stack.md)；仓库结构 → [repo-structure.md](../../architecture/repo-structure.md)；构建与验证 → [build-and-verify.md](../../engineering/build-and-verify.md)；待跟进项 → [backlog.md](../../governance/backlog.md)。

归档日期：2026-08-22（P5 全部门禁通过，结论提升完毕）。

## 2026-08-23-turbo-build-orchestration —— Turborepo 构建编排全量迁移

| 文件 | 说明 |
|---|---|
| `README.md` | 任务入口、范围、状态、稳定结论去向 |
| `2026-08-23-turbo-build-orchestration-design.md` | 设计文档（现状问题 / 方案对比 / 任务图建模 / 决策锁 / 验收标准） |
| `2026-08-23-turbo-build-orchestration-plan.md` | 实施计划（Task 0-6，7 个任务的完整规格） |

结论去向：构建编排决策 → [ADR-005](../../decisions/ADR-005-turbo-build-orchestration.md)；仓库结构 → [repo-structure.md](../../architecture/repo-structure.md)；契约包 → [contracts.md](../../architecture/contracts.md)；桌面端 → [desktop-app.md](../../architecture/desktop-app.md)；门禁与构建链 → [build-and-verify.md](../../engineering/build-and-verify.md)；已关闭 backlog → [backlog.md](../../governance/backlog.md)。

归档日期：2026-08-24（结论提升完毕）。

## 2026-08-23-github-cicd —— GitHub CI/CD 演进方案

| 文件 | 说明 |
|---|---|
| `2026-08-23-github-cicd-design.md` | 演进设计（影响面评估 / 切片路线 / Job 拓扑） |
| `2026-08-23-github-cicd-plan.md` | 实施计划（Task 0-6 + 文档治理收尾） |
| `2026-08-23-github-cicd-roadmap.md` | 迁移路线图 |
| `2026-08-23-github-cicd-evolution.dot` | 演进拓扑图（Graphviz DOT） |

结论去向：CI 决策 → [ADR-006](../../decisions/ADR-006-github-ci.md)；门禁与构建链 → [build-and-verify.md](../../engineering/build-and-verify.md)；CI 配置 → [.github/workflows/ci.yml](../../../.github/workflows/ci.yml)。

归档日期：2026-08-26（结论提升完毕，CI 首跑通过 + DATABASE_URL 修复落地）。

## 2026-08-25-ops-scripts —— ops 脚本自动化操作集

| 文件 | 说明 |
|---|---|
| `README.md` | 任务入口、稳定结论位置、实施提交记录 |
| `2026-08-25-ops-scripts-design.md` | 设计文档（6 场景梳理 + 5 Shell / 2 ESM 选型 + 各脚本详细设计） |
| `2026-08-25-ops-scripts-plan.md` | 实施计划（7 个 Task + 完整代码） |

结论去向：ops 脚本命令速查 → [build-and-verify.md](../../engineering/build-and-verify.md)；脚本实现 → [scripts/ops/](../../../scripts/ops/)；package.json ops:* 别名 → [package.json](../../../package.json)。

归档日期：2026-08-26（结论提升完毕）。
