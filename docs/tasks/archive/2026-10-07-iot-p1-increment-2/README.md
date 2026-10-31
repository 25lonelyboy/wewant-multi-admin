# IoT 平台 P1 · 增量 2「数据链路：缓冲 + 存储」

> **⚠️ 历史过程记录，非事实源。** 最终结论位置见下方「稳定结论去向」。引用本目录内容前，请先以事实源核对。

- **状态**：已完成（2026-10-31 验收通过，已归档）
- **目标**：遥测可靠落库
- **交付判据**：**落库可见**（能在 TDengine 里查到数据）——M1 的 ① 项
- **规划上下文**：知识库《wewant 个人项目（AI 编程探索）》的「P1 增量计划（1-7）」节
- **选型依据**：[ADR-009](../../../decisions/ADR-009-iot-platform-p1-stack.md)、[ADR-010](../../../decisions/ADR-010-ingest-buffer-bullmq.md)

## 过程文件索引

| 文件 | 说明 |
| --- | --- |
| [2026-10-07-decisions.md](2026-10-07-decisions.md) | 决策卡：背景 / 前置 / 约束 / 项级背景 / 待决策 4 项 |
| [2026-10-07-decision-1-schema.md](2026-10-07-decision-1-schema.md) | **第 1 项（schema）· 已定稿**：七轴结论 + AI 补全与纠偏 + 时变主数据 + **生产前提复核（§5）** + **外部参照（§5.5，AWS IoT Lens）** + 结论四件（§6.4）+ **子表命名与采集点标识（§8）** + **单位模型（§4.6）** + **P1 超表清单（§9，DDL 已实跑复核）** |
| [2026-10-07-decision-2-write-path.md](2026-10-07-decision-2-write-path.md) | **第 2 项（写入方式）· 已定稿**：项级背景 + **10 条决策轴全部作答** + 结论四件（§9）+ **写入形态探针（§10）** |
| [2026-10-08-decision-4-lifecycle.md](2026-10-08-decision-4-lifecycle.md) | **第 4 项（数据生命周期）· 已定稿**：`KEEP`/`DURATION`/`TTL` 关系 + 降采样路径（⚠️ **§11 选定里的「流计算」一行与 §14.3 的建流语句已由 [降采样设计](2026-10-12-downsample-design.md) 取代**；`TSMA` 是查询加速、不是本项工具）+ 删除四手段 + **两轮 32 项本机实测** + 逐轴补全与纠偏 + 四项补充探索 + **结论四件（§11）** + **备份/恢复往返探针（§12）** + **流写法实测（§13）与降采样库 schema（§14）** |
| [2026-10-08-decision-3-protocol-version.md](2026-10-08-decision-3-protocol-version.md) | **第 3 项（`mqtt.js` 协议版本）· 已定稿**：现状（**两端都跑在 3.1.1，且都没人选过**）+ **25 项本机实测**（EMQX 零配置、**跨版本矩阵载荷无损**、可混用、User Properties 只在双 5.0 时透传、**3.1.1 下 `properties` 被静默忽略**；凭据 10 用例两版行为一致）+ **5.0 七项特性逐个对照** + **会话语义** + **trace 的业界定位**（OTel 未覆盖 MQTT）+ 逐轴补全与纠偏 + **结论四件（§8）** + **混用可观测性实测（§4.12）** + **订阅端 QoS 与会话（§9）** |
| [2026-10-08-internal-scenario-review.md](2026-10-08-internal-scenario-review.md) | **前提复议 · 作为 P2 启动输入（不在 P1 内实施，见 §5）**：以"工厂内部效率自用"为条件复核前两项决策——3 个前提级发现 + 逐项复核 + A/B/C/D 四类遗漏 + 三档结论 + **P2 启动读取顺序（第 0 步＝先采效率基线）** |
| [2026-10-09-buffer-layer.md](2026-10-09-buffer-layer.md) | **缓冲层：Redis 形态与队列形态——五项全部定稿**：Redis **独立实例**（理由见 ADR-010 D4）/ 队列命名 / **worker 独立入口** / 保留策略 / **消息信封＝原始报文** / **Redis 挂时订阅端落本地** |
| [2026-10-09-plan.md](2026-10-09-plan.md) | **实施计划**：依赖顺序 T0–T9 + 贯穿约束 C1–C9 + 逐任务验收；**交付判据三条**（落库可见 / 降采样在跑 / 重投不丢）；⭐ **新增 worker 应用（`apps/`）与 `packages/device-registry`**；库名 `wewant_iot` / `wewant_iot_ds` |
| [2026-10-12-downsample-design.md](2026-10-12-downsample-design.md) | **降采样：改为 worker 侧定时重算——已定**。**取代** [决策 4](2026-10-08-decision-4-lifecycle.md) §11 选定里的「路径：流计算」一行与 §14.3 的建流语句（**§14 的 schema 一字不改**）。依据＝7 条本机实测（流在本版本上分区不成立）+ 社区版最新镜像就是 3.4.2.8。选定：**BullMQ 调度 + 每次重算最近 K 个已闭合窗口 + 三级平级**；判据②改写为**逐条对账** |
| [2026-10-12-fix-plan.md](2026-10-12-fix-plan.md) | **第二轮实施计划（收口修复）**：**27 条覆盖清单**逐条挂到任务上（降采样重建 / 三处 P0 / 决策遵从缺口 / 测试与判据 / 文档与台账对齐）；分组 F1–F11 + 复验 F10；含**三处按建议写定** |
| [scripts/probe/tdengine-semantics.mjs](../../../../scripts/probe/tdengine-semantics.mjs) | TDengine 语义探针（零依赖，走 taosAdapter REST）：省略列语义 / `ALTER STABLE` 代价 / 虚拟表能力边界 / 跨超表查询约束 |
| [scripts/probe/tdengine-lifecycle.mjs](../../../../scripts/probe/tdengine-lifecycle.mjs) | TDengine 生命周期探针（零依赖）：社区版审计能力 / `ALTER DATABASE` 能力边界 / 跨库查询 / 三级链式降采样 / `avg of avg` 偏差 / 窗口 offset 与时区 |
| [scripts/probe/tdengine-container.sh](../../../../scripts/probe/tdengine-container.sh) | 起临时容器 → 等 taosAdapter 就绪 → 跑探针；`--down` 停掉 |
| [scripts/probe/taosdump-roundtrip.sh](../../../../scripts/probe/taosdump-roundtrip.sh) | **taosdump 备份 / 恢复往返探针**（零依赖，内容全部在容器内执行）：`-M all` 往返、`-S`/`-E` 时间范围归档、`-M ext-meta` 备份流定义、`-W` 改名恢复、**`-M` 两侧不一致时的静默失效** |
| [apps/nestjs-server/scripts/tdengine-stmt-probe.mjs](../../../../apps/nestjs-server/scripts/tdengine-stmt-probe.mjs) | **TDengine STMT 写入形态探针**（用仓库里真正的 `@tdengine/websocket`）：一次 exec 跨多子表、两种跨子表写法、`USING` 语法自动建表、单次 bind/exec 的 32767 行上限、错误处理形态。⚠️ **它在 nestjs-server 目录下**——连接器依赖按 catalog 规则只属于该应用 |
| [apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs](../../../../apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs) | **TDengine「形态②」探针**（用仓库里真正的 `@tdengine/websocket`）：`INSERT INTO <stb> (tbname, tag…, ts, …)` 且 `tbname` 作普通绑定参数时——缺子表是**报错还是静默建表**、一次 `exec` 能否跨 100 个子表；**STMT2 与 STMT1 两条路径都测**。⚠️ **它在 nestjs-server 目录下**，自建临时库 `probe_stmt_tb` 并跑完**整库删掉** |
| [apps/iot-simulator/scripts/mqtt-protocol-probe.mjs](../../../../apps/iot-simulator/scripts/mqtt-protocol-probe.mjs) | MQTT 协议版本探针（用 `mqtt@5.16.0` 真实建连，**不改 EMQX 配置**）：3.1.1 / 5.0 混用、**跨版本矩阵（载荷无损）**、User Properties 透传、`properties` 在 3.1.1 下被静默忽略。⚠️ **它在模拟器目录下**——`mqtt` 依赖按 catalog 规则只属于模拟器，仓库根没有 |
| [apps/iot-simulator/scripts/mqtt-credential-probe.mjs](../../../../apps/iot-simulator/scripts/mqtt-credential-probe.mjs) | MQTT 凭据探针（需一个**配了认证器**的独立 Broker）：3.1.1 × 5.0 × {无凭据 / 正确 / 错误密码 / 不存在用户 / 二进制密码 / 增强认证属性}，对比失败原因码。⚠️ **默认无认证的 1883 不适用** |

## 范围边界

**做**：BullMQ 缓冲层 + TDengine 超级表建模 + `@tdengine/websocket` 写入；状态数据留 PG。

**链路**：

```text
设备/模拟器 → EMQX →（iot 域订阅）→ BullMQ 队列 → 消费者 → TDengine
```

**不做**：物模型与设备注册（属增量 3）、实时监控与看板（属增量 4）、告警（属增量 5）。

## 与增量 1 的关系

增量 1 做到「订阅 + 每秒聚合打印日志」——**数据不落库**。本增量在订阅与存储之间插入缓冲层，并把数据落到 TDengine。

## 稳定结论去向

遥测链路与降采样环事实 → [backend.md](../../../architecture/backend.md)；库表、建库脚本与逐条对账脚本 → [build-and-verify.md](../../../engineering/build-and-verify.md)；选型与缓冲口径 → [ADR-009](../../../decisions/ADR-009-iot-platform-p1-stack.md) / [ADR-010](../../../decisions/ADR-010-ingest-buffer-bullmq.md)；待跟进项 → [backlog.md](../../../governance/backlog.md)。
