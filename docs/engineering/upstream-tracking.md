---
status: living
covers:
  - scripts/ops/upstream-diff.sh
last_verified: 2026-09-02
---

# pure-web 上游同步跟踪

vue-pure-admin 为 template 衍生模式（无 fork 跟踪、无 merge 历史），上游跟进采用「基线快照 + 选择性吸收」。本文档是上游基线的唯一事实源，由周期性评估机制长期维护（触发规则登记于 [backlog](../governance/backlog.md)「pure-web 上游同步周期评估机制」条目）。

## 机制

1. 周期触发：上游大版本发布或季度巡检。
2. 运行差异报告：`pnpm ops:upstream-diff <基线SHA> [target-ref]`（脚本实现见 [upstream-diff.sh](../../scripts/ops/upstream-diff.sh)），产出上游改动清单、文件变更地图、冲突面清单三件套。
3. 逐项决策「吸收 / 跳过」；吸收项走正常子任务流程（strict 保持零错误 + 测试验收）。
4. 吸收合入后，将下方基线推进到所吸收的 target ref，并在历史记录追加一行（只追加不改写）。

## 当前基线

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/pure-admin/vue-pure-admin |
| 接入提交（本仓） | 94a2cf9（2026-08-10，template 衍生，无 merge 历史） |
| 基线提交（上游） | e40eb37d606174099906aecfa891159b2d5b434e |
| 基线参考版本 | v7.0.0（2026-04-07） |
| 定位日期 | 2026-08-29 |

## 基线推进历史

| 日期 | 基线推进至 | 说明 |
| --- | --- | --- |
| 2026-08-29 | e40eb37（≈v7.0.0） | 首次定位（任务过程记录见 [archive 任务目录](../tasks/archive/2026-08-29-pure-web-testing-foundation/)，仅作追溯线索） |
