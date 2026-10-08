# IoT 平台 P1 · 增量 2「数据链路：缓冲 + 存储」

- **状态**：进行中（决策卡材料已备，候选方案待填写）
- **目标**：遥测可靠落库
- **交付判据**：**落库可见**（能在 TDengine 里查到数据）——M1 的 ① 项
- **规划上下文**：知识库《wewant 个人项目（AI 编程探索）》的「P1 增量计划（1-7）」节
- **选型依据**：[ADR-009](../../decisions/ADR-009-iot-platform-p1-stack.md)、[ADR-010](../../decisions/ADR-010-ingest-buffer-bullmq.md)

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-10-07-decisions.md](2026-10-07-decisions.md) | 决策卡：背景 / 前置 / 约束 / 项级背景 / 待决策 4 项 |
| [2026-10-07-decision-1-schema.md](2026-10-07-decision-1-schema.md) | **第 1 项（schema）· 已定稿**：七轴结论 + AI 补全与纠偏 + 时变主数据 + **生产前提复核（§5）** + **外部参照（§5.5，AWS IoT Lens）** + 结论四件（§6.4） |
| [2026-10-07-decision-2-write-path.md](2026-10-07-decision-2-write-path.md) | **第 2 项（写入方式）· 已定稿**：项级背景 + **10 条决策轴全部作答** + 13 项待实测 + 结论四件（§9） |
| [2026-10-08-decision-4-lifecycle.md](2026-10-08-decision-4-lifecycle.md) | **第 4 项（数据生命周期）· 材料已备**：`KEEP`/`DURATION`/`TTL` 关系 + **降采样三条路（流实测可用 / TSMA / 应用层）** + 删除四手段 + 容量量级 + 备份缺口 + **10 条决策轴**（候选方案待填） |
| [2026-10-08-internal-scenario-review.md](2026-10-08-internal-scenario-review.md) | **前提复议 · 作为 P2 启动输入（不在 P1 内实施，见 §5）**：以"工厂内部效率自用"为条件复核前两项决策——3 个前提级发现 + 逐项复核 + A/B/C/D 四类遗漏 + 三档结论 + **P2 启动读取顺序（第 0 步＝先采效率基线）** |
| [scripts/probe/tdengine-semantics.mjs](../../../scripts/probe/tdengine-semantics.mjs) | TDengine 语义探针（零依赖，走 taosAdapter REST）：省略列语义 / `ALTER STABLE` 代价 / 虚拟表能力边界 / 跨超表查询约束。**决策卡 §4.5 的四条实测结论由它产出** |
| [scripts/probe/tdengine-container.sh](../../../scripts/probe/tdengine-container.sh) | 起临时容器 → 等 taosAdapter 就绪 → 跑探针；`--down` 停掉 |

## 范围边界

**做**：BullMQ 缓冲层 + TDengine 超级表建模 + `@tdengine/websocket` 写入；状态数据留 PG。

**链路**：

```text
设备/模拟器 → EMQX →（iot 域订阅）→ BullMQ 队列 → 消费者 → TDengine
```

**不做**：物模型与设备注册（属增量 3）、实时监控与看板（属增量 4）、告警（属增量 5）。

## 与增量 1 的关系

增量 1 做到「订阅 + 每秒聚合打印日志」——**数据不落库**。本增量在订阅与存储之间插入缓冲层，并把数据落到 TDengine。
