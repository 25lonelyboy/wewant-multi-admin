# 任务过程材料（热索引）

大任务、大阶段、专项治理或跨模块调研的过程材料目录。**每任务一行，只列进行中 + 最近已完成**。

## 进行中

| 任务 | 说明 |
|---|---|
| NestJS 后端基架补全 | 总体设计见 [2026-08-16-nestjs-backend-foundation/](2026-08-16-nestjs-backend-foundation/)，总-分结构，分 P1~P5 五阶段；P1~P4 已完成，P5 分设计已产出（[phase5-design](2026-08-16-nestjs-backend-foundation/2026-08-21-nestjs-backend-foundation-phase5-design.md)，直连真实后端口径），待实施 |

## 最近已完成

| 任务 | 收口说明 |
|---|---|
| 仓库基架与桌面端阶段 1 | 结论已提升至 `docs/architecture/` 与 `docs/engineering/`，稳定决策落为 ADR-001/002/003；过程原件已移入 [archive/2026-08-12-repo-foundation-and-desktop/](archive/2026-08-12-repo-foundation-and-desktop/) |

## 规则

- 新任务建目录 `docs/tasks/<YYYY-MM-DD>-<短名>/`，过程文件（plan / decisions / verification / retrospective）同用日期前缀，只追加不改写。
- 收口时把结论提升到事实源、稳定决策写成 ADR，本 README 更新为一行记录。
- 完成超 90 天或结论提升完毕的任务移入 `archive/`（建目录时同步建冷索引）。
- 小任务不建目录，可复用结论直接写入事实源。
