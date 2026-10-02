---
status: accepted
date: 2026-10-02
---

# ADR-009 IoT 平台 P1 技术选型：EMQX 接入 + TDengine 时序存储

## 背景

P1 目标是在本仓库上落地一个工程级 IoT 平台（云侧 + 模拟设备打穿数据链路），作为个人项目的可控支柱与公开证据链载体。增量 0（认知建设，六讲讲义）已完成，进入开发前的选型阶段。

P1 的两个基础设施组件需要在动工前拍板：**设备接入（MQTT Broker）** 与 **遥测存储（时序数据库）**。约束条件：

1. **P1 定位是学习载体与证据链**，不是企业级交付——但选型要能说清"上生产会怎么变"（决策卡固定栏目：生产环境额外约束 / P1 的取舍 / 触发点）。
2. **许可必须可讲清**：P1 可能开源，且是求职叙事的素材，许可边界不能含糊。
3. **免费额度要够 P1 用**，且不能因为免费额度把关键能力挡在门外。
4. **与现有栈的关系要明确**：本仓库后端是 NestJS + Prisma + PostgreSQL + Redis，新增组件不得破坏既有分层与契约先行流程。
5. **为增量 6 的压测留出空间**（M3 的压测报告与博客素材）。

选型经两张决策卡（Broker / 时序库）逐项核实后拍板；版本、许可、EOL 与竞品格局的完整底稿见 vault 的《MQTT Broker 调研报告（2026.10）》《时序库调研报告（2026.10）》，事实性断言的查证状态见 vault 的《查证台账》。本 ADR 只记决策理由、权衡与影响。

## 决策

### D1 设备接入：EMQX 6.3.x LTS（单节点）

采纳 EMQX，单节点部署，落在 BSL 1.1 的免费额度内。

理由：
- 内置 **Dashboard** 直接支撑增量 1 的验收判据（"消息在 Broker 侧可见"），不必自建观测手段。
- 内置**规则引擎**可与增量 5（阈值告警）衔接，先在接入层跑通规则、再落到应用层。
- 认证后端可对接 **Redis / SQL**，复用仓库既有 Redis。
- 工具链完整（MQTTX、emqtt-bench、mqtt-jmeter），增量 6 压测有现成工具。
- 免费额度为"**单节点生产使用、规模不限、全部功能可用**"；6.3.x 是最新 LTS（支持至 2029-09）。

许可边界（必须记录）：自 v5.9.0 起为 **BSL 1.1**（非 OSI 开源，对外表述用 source-available）；**付费触发点为三件事——多节点集群 / 对外托管 / 嵌入转售**，与节点规模无关。P1 为自用单节点，不触发。

### D2 遥测存储：TDengine 社区版（单节点起步）

采纳 TDengine，与 PostgreSQL 形成**双库分治**：设备档案、告警记录等状态数据仍由 Prisma 管理于 PostgreSQL；遥测数据（`timestamp + device + metric + value`）写入 TDengine。

理由：
- **三家候选的免费档能力差异是决定性的**：TimescaleDB 是 PG 扩展（省事但无集群）；InfluxDB 3 Core 被官方定位为 **non-production / 单节点**，长周期历史查询与 compaction 属 Enterprise；只有 **TDengine 把集群与核心功能放进开源许可**（官方 README 原文："core modules, including cluster feature … are all available under open source licenses"）。P1 是学习载体，免费档能摸到集群与降采样这类真能力，比"单节点够用"更有价值。
- **与 IoT 场景天然契合**：超级表（STable）+ 每设备子表的建模，可直接对应设备层级（车间→产线→设备）；降采样与窗口函数内置，为将来的 OEE 类指标留出能力。
- **国内工业圈认知度高**，与目标岗位（工业软件/智能制造）的技术对话一致。

许可边界（必须记录）：服务端为 **AGPL-3.0**。按 §13 原文，义务要件是"**修改了程序**"与"**通过网络对外交互**"同时满足；P1 为不修改源码的内部自用，**不产生源码公开义务**。两个降低风险的事实：官方 Node 连接器 **`@tdengine/websocket` 是 MIT**（被链接进应用的是 MIT 代码）；通信在 WebSocket 进程边界之外，应用侧不构成衍生作品。**红线是"修改它 + 拿去对外服务或嵌入转售"**，届时须走商业授权或按 AGPL 义务设计。

### D3 集成形态

- **新增 iot 域**（`apps/nestjs-server` 的第四个域），按仓库既有域聚合模式组织；接入层经 EMQX，存储层写 TDengine。
- **TDengine 客户端固定用 `@tdengine/websocket`**（MIT、官方推荐、要求服务端 ≥ 3.3.2.0）；官方另两个连接器（native `@tdengine/client`、`@tdengine/rest`）已明确停止维护，不使用。
- **契约先行**：iot 域的类型与错误码先进 `packages/contracts`，前端（pure-web）与后端各自接线。
- 部署：EMQX 与 TDengine 进 `docker-compose.yml`，与 postgres / redis 同栈，镜像沿用 digest pin 约定。

### D4 生产化触发条件（本决策的边界，不是待办）

| 触发事件 | 需要回头处理的事 |
| --- | --- |
| 需要多节点集群 / 高可用 | EMQX 走商业授权（或评估 VerneMQ 等 Apache-2.0 且支持集群的替代） |
| 产品对外提供服务或嵌入转售 | TDengine 的 AGPL 义务重估：走商业授权，或按 AGPL 义务设计 |
| 真实数据量进入生产 | 按 3 年设备数规划 TDengine 集群与副本；留存与降采样按合规倒推 |
| 需要向团队交接运维 | Erlang（EMQX）与 TDengine 两套技术栈的运维能力匹配评估 |

## 被否决的替代方案

| 方案 | 否决理由 |
| --- | --- |
| **Broker 用 Mosquitto** | 许可最干净（EPL/EDL）、极轻，但开源版**无 Web UI、无集群**（属商业 Pro）；增量 1 的"消息可见"验收需自建观测手段，工具链也不如 EMQX 完整 |
| **Broker 用 EMQX 5.8.9（最后的 Apache 版）** | 可换取许可自由，但社区版停发（2025-12-31），后续补丁以 `e5.8.x`（企业版）命名继续——等于把生产压在补丁来源不明的基线上 |
| **时序库用 TimescaleDB** | 优势是复用现有 PG/Prisma、零新增系统，属"省事路线"；但免费档无集群，且其关键收益（Prisma × hypertable 的配合）需实测才能确认，故事性弱于"免费即含集群" |
| **时序库用 InfluxDB 3 Core** | 许可最干净（MIT/Apache-2.0）、SQL 主语言；但官方定位为**非生产的单节点版**，长周期历史查询与 compaction 属 Enterprise——而历史数据压缩与长周期保留正是时序库对 IoT 的核心价值。Enterprise 有免费 At-Home 档（限 2 CPU、单节点），留作后续评估 |
| **时序库用云服务（云厂商 IoT/TSDB）** | 云 IoT 平台近期收缩（阿里云官方计费文档载明自 2025-02-01 起不再支持新购），且学习价值低于自建；数据主权与可迁移性也更差 |

## 影响

- `docker-compose.yml` 新增两个服务（EMQX、TDengine），沿用 digest pin；本地开发前置从「postgres + redis」扩为四个服务。
- `apps/nestjs-server` 新增 iot 域（聚合模块模式），`packages/contracts` 新增 iot 类型与错误码段——契约先行流程不变。
- 后端演进路线图（ADR-007）的**阶段 D「第二域扩展」被本决策触发**：system 域只读查询门面、`schema.prisma` 多文件拆分、e2e 分层下沉、`common/` 与 `infra/` 二分等预埋项，按 backlog 既有触发条件逐项处置。
- 新增两条生产化待处置项进 backlog：EMQX 集群的商业授权路径评估、TDengine 的 AGPL 义务重估。
- 落地的实施细节（iot 域分层、超级表建模、双库边界、模拟器形态、验收判据）写入 `docs/architecture/` 与对应任务目录，本 ADR 不承载。
- 选型底稿：vault `iot-learning/决策卡-Broker选型.md`、`决策卡-时序库选型.md`、`MQTT-Broker-调研报告-2026.10.md`、`时序库-调研报告-2026.10.md`（个人知识库，非本仓库事实源）。
