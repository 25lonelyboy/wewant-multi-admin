# pure-web 上游基线记录（活文档）

| 项 | 值 |
| --- | --- |
| 上游仓库 | https://github.com/pure-admin/vue-pure-admin |
| 接入提交（本仓） | 94a2cf9（2026-08-10，template 衍生，无 merge 历史） |
| 基线提交（上游） | e40eb37d606174099906aecfa891159b2d5b434e |
| 基线参考版本 | v7.0.0（2026-04-07） |
| 定位日期 | 2026-08-29 |

基线用途：`pnpm ops:upstream-diff <基线SHA> [target-ref]` 的第一个参数。
更新规则：吸收上游变更并合入后，将基线推进到所吸收的 target ref（追加一行历史记录，不改写）。
