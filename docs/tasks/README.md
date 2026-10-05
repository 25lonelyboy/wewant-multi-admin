# 任务过程材料（热索引）

大任务、大阶段、专项治理或跨模块调研的过程材料目录。**每任务一行，只列进行中 + 最近已完成**；已归档任务的条目与结论去向见 [archive/README.md](archive/README.md)。

## 进行中

暂无。

## 最近已完成

| 任务 | 收口说明 |
|---|---|
| pure-web 前端测试评估规范与覆盖缺口补齐 | Phase F 收口完成：阈值翻转（91 键 → 全局聚合 + crown-jewel 90）+ living 规范落位 + 索引与任务状态同步；规范 → [frontend-testing-standard.md](../engineering/frontend-testing-standard.md)，决策 → [ADR-008](../decisions/ADR-008-tiered-e2e-testing.md)，过程 → [2026-09-06-frontend-testing-standard/](2026-09-06-frontend-testing-standard/) |

## 规则

- 新任务建目录 `docs/tasks/<YYYY-MM-DD>-<短名>/`，过程文件（plan / decisions / verification / retrospective）同用日期前缀，只追加不改写。
- 收口时把结论提升到事实源、稳定决策写成 ADR，本 README 更新为一行记录。
- 完成超 90 天或结论提升完毕的任务移入 `archive/`（建目录时同步建冷索引），本 README 同步删除该行——归档任务的结论去向由冷索引承载。
- 小任务不建目录，可复用结论直接写入事实源。
