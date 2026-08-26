# 任务过程材料（热索引）

大任务、大阶段、专项治理或跨模块调研的过程材料目录。**每任务一行，只列进行中 + 最近已完成**。

## 进行中

| 任务 | 说明 |
|---|---|
| Server 基建速赢（Tier 1） | 4 项独立改进：校验错误字段明细 / JWT secret min(32) / 请求体大小 env 可配置 / Prisma 慢查询日志+连接池 max；设计 → [design.md](2026-08-26-server-infra-quickwins/2026-08-26-server-infra-quickwins-design.md)，计划 → [plan.md](2026-08-26-server-infra-quickwins/2026-08-26-server-infra-quickwins-plan.md) |

## 最近已完成

| 任务 | 收口说明 |
|---|---|
| ops 脚本自动化操作集 | 7 个脚本落地；结论 → [build-and-verify.md](../engineering/build-and-verify.md)；已归档 [archive/2026-08-25-ops-scripts/](archive/2026-08-25-ops-scripts/) |
| GitHub CI 落地 | 四 job 异步安全网 + DATABASE_URL 修复；决策 → [ADR-006](../decisions/ADR-006-github-ci.md)；已归档 [archive/2026-08-23-github-cicd/](archive/2026-08-23-github-cicd/) |
| Turborepo 构建编排全量迁移 | 5 提交完成 turbo.json 任务图取代 pre hook + 门禁纯校验化 + Docker 拓扑修复；决策 → [ADR-005](../decisions/ADR-005-turbo-build-orchestration.md)，工程实践 → [build-and-verify.md](../engineering/build-and-verify.md)；过程原件已移入 [archive/2026-08-23-turbo-build-orchestration/](archive/2026-08-23-turbo-build-orchestration/) |
| NestJS 后端基架补全（P1-P5） | 五阶段全部完成；契约包事实源 → [contracts.md](../architecture/contracts.md)，技术选型 → [ADR-004](../decisions/ADR-004-contracts-and-backend-stack.md)，待跟进项 → [governance/backlog.md](../governance/backlog.md)；过程原件已移入 [archive/2026-08-16-nestjs-backend-foundation/](archive/2026-08-16-nestjs-backend-foundation/) |
| 仓库基架与桌面端阶段 1 | 结论已提升至 `docs/architecture/` 与 `docs/engineering/`，稳定决策落为 ADR-001/002/003；过程原件已移入 [archive/2026-08-12-repo-foundation-and-desktop/](archive/2026-08-12-repo-foundation-and-desktop/) |

## 规则

- 新任务建目录 `docs/tasks/<YYYY-MM-DD>-<短名>/`，过程文件（plan / decisions / verification / retrospective）同用日期前缀，只追加不改写。
- 收口时把结论提升到事实源、稳定决策写成 ADR，本 README 更新为一行记录。
- 完成超 90 天或结论提升完毕的任务移入 `archive/`（建目录时同步建冷索引）。
- 小任务不建目录，可复用结论直接写入事实源。
