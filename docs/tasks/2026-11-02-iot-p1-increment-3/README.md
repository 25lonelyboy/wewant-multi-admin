# IoT 平台 P1 · 增量 3「物模型」· L1 阶段目标

- **状态**：L1 已定稿；S0 已完成（2026-11-02）；D2、D4 已收口（2026-11-03）；S0.5 已完成（2026-11-04）；S1 已完成（2026-11-04）；D2 补版本与版本快照（2026-11-04）；S3 已完成（2026-11-04）；D3 已定稿（2026-11-05）；S2 已完成（2026-11-05）；S4 已完成（2026-11-06）；D1 已定稿（2026-11-07）；S5 已完成（2026-11-07）
- **时间窗**：2026-11-02 ~ 11-15（每周 8–10 h）｜下一里程碑 M2 = 2026-12-06
- **判据**：[阶段地图](../../governance/iot-stage-map.md) §2 —— 新增设备只按物模型注册即可接入，**不改代码**
- **覆盖层**：治理（并改存储与计算的接口面）
- **规划上下文**：L0 阶段地图 §1–§3；缺口来源见 [backlog](../../governance/backlog.md) 中物模型相关 7 项

## 当前状态（2026-11-06）

**已完成**：S0「债务清理与护栏」四项 + 两个计划外缺陷修复（worker 镜像起不来、探针 fail-open）；**D2** 六个子问题全部定案；**D4** 三项全部定案；**S0.5「单设备单子表」** 交付完成——契约与档案去掉采集点层（`TelemetryPayload.localPointId`、`DeviceRecord.singlePoint/points`、`SubtableRef.pointKey` 均已删除，查档失败只剩 `unknown-device`），超表改 `{模型编码}`、子表改 `{模型编码}_{deviceId}`（P1 占位模型编码 `p1`），超表与降采样表的单位列全部删除（降采样行 16 → 13 列）。两条本机实测通过（`ADD COLUMN` 传播到已有子表、列名上限 64 / 表名上限 192）。提交在 master、未推送。

**S0.5 验收证据**（2026-11-04，重建卷后取证）：`SHOW wewant_iot.STABLES` = `p1`，`SHOW wewant_iot_ds.STABLES` = `p1_1m` / `p1_1h` / `p1_1d`；`SHOW wewant_iot.TABLES` 100 张子表均为 `p1_<deviceId>`；`DESCRIBE wewant_iot.p1` 无任何 `_unit` 列，降采样超表 13 个数据列（+ `deviceId` 标签）；`tdengine:init` 连跑两次表数与名集合一致；`subtable:audit` 四桶全空、退出 0；`consumer.e2e` 所在套件 8/8 通过；`pnpm check` 与 `pnpm doc:lint` 全绿。

**S1「契约与类型系统」** 交付完成——`TelemetryMetric.value` 改为 `MetricValue` 联合（number / boolean / string / 对象），`IotChannel` 扩出 `service` / `event`（只留位，订阅端仍只订遥测、解析函数仍只认 `telemetry`）；**类型档位表**（六档 + `VARCHAR(N)` 上限 65517 字节）与**标识符校验**（`checkMetricKey` / `checkModelCode`，覆盖字符集、长度 58 / 172、保留词、`_unit` 保留后缀与折小写归一化）落在 `packages/device-registry`——按 [contracts.md](../../architecture/contracts.md) 的包边界，它们描述列与表名的形状，不属线上契约；模拟器新增 `SIM_EXTRA_METRIC`，可造带布尔 / 枚举测点的设备。

**S1 验收证据**（2026-11-04）：device-registry 20/20、iot-worker 149/149、iot-simulator 7/7 单测通过；iot-worker e2e 8/8 通过；`pnpm check` 与 `pnpm doc:lint` 全绿；`SIM_DEVICE_COUNT=1 SIM_EXTRA_METRIC=boolean` 起一台设备，EMQX 上收到的载荷含 `power_state: true`，与三个数值测点并列。

**S3「物模型定义」** 交付完成——八档声明类型与「聚合 → 列类型」事实表；`ModelDeclaration` / `ModelVersion` 两级结构，校验成功时返回**归一化后**的声明（key 折小写、聚合集去重并按固定顺序排列）；十二个结构错误码与一个不阻断的警告；降采样列推导（属性按声明顺序 × 聚合按固定顺序，某组合算不出列即整体失败）；P1 首份模型。落库与注册接口归 S2 / S4，列集合的接线归 S5。

**S3 验收证据**（2026-11-04）：device-registry 49/49 单测通过；`P1_MODEL` 过自身校验器、推导出 12 列（`sum_temperature` … `max_current`，类型 `DOUBLE` / `BIGINT` / `FLOAT`），与 S0.5 落地的降采样超表逐列一致；`pnpm check` 与 `pnpm doc:lint` 全绿。

**S2「档案落 PG」** 交付完成——四张表（`IotDeviceModel` / `IotModelVersion` / `IotDevice` / `IotDeviceModelUsage`）与 partial unique index 落在同一份迁移；只读仓储 `DeviceRegistryRepository` 提供查在用设备、枚举在用设备、按使用史展开子表期望集三个读法，子表名一律取自 `subtableName()`；`runSeed()` 注入 `p1` 模型、版本 1（`ACTIVE`）、100 台设备与各自的 open usage。`DeviceRegistry` 接口未动，worker 读档案仍归 D1，注册写入归 S4。

**S2 验收证据**（2026-11-05）：迁移 `20261105144320_iot_device_registry` 在本地库与测试库执行成功，`\dt` 见四表；seed 连跑两次后设备 / usage / 版本 / 模型行数恒为 100 / 100 / 1 / 1；`test/iot-registry.e2e-spec.ts` 6/6 通过（只认 ACTIVE、当前模型由 open usage 推出、期望集含新旧子表、命名同源、同一设备第二条 open usage 被拒、指向不存在版本的 usage 被拒、seed 幂等）；server 全量 e2e 38/38 通过；`pnpm --filter @multi-admin/nestjs-server run test`、`pnpm check`、`pnpm doc:lint` 全绿。

**S4「注册路径」** 交付完成——四个命名函数与 `DS_LEVELS`（连同库名、分钟级 KEEP）移入 `packages/device-registry`，版本状态拆成设备两态 / 版本三态并补「同一模型至多一个 `ACTIVE` 版本」的库级唯一索引；`rawColumnOf` 补齐原始列映射；server 以懒连接接入 TDengine，按声明生成 DDL（不带 `IF NOT EXISTS`，加列按列展开，降采样超表按表在不在建或 `ALTER`）；`POST /api/v1/iot/models` 与 `POST /api/v1/iot/devices` 两个接口支持 `dryRun`，设备 `deviceId` 由平台签发，失败整体回滚、档案不落库。S4 交付后新模型的设备仍收不了数据——worker 的 detection 与写入器还按 `RAW_METRICS` 写死，归 S5。

**S4 验收证据**（2026-11-06）：`test/iot-registration.e2e-spec.ts` 19/19 通过（真 PG + 真 TDengine）——含 BOOL / 枚举测点的新模型注册后 `SHOW` 与 `DESCRIBE` 全部由声明生成；同模型第二台设备只多一套子表；加属性后原始超表与三张降采样超表各多一列、旧版本 `SUPERSEDED`；减属性放行且旧列保留；降采样某一级被手工删列后，重放只补该级、已有列的两级不重复 `ALTER`；幂等重放表数与行数不变；引用非 ACTIVE 模型、档案非 ACTIVE、非法档位、布尔 + `sum`、改 key 的 kind、表已存在均返回明确错误且 PG 不留半条；失败后同一 `localDeviceId` 重试成功；无聚合模型只有 1 张子表，聚合从无到有后三张降采样超表与已有设备的三张子表被补出且可重放。server 单测 266/266、全量 e2e 57/57；合并覆盖率 lines 94.54% / branches 81.38% / functions 91.86% / statements 93.94%（门禁 ≥80%）；`pnpm check`、`pnpm doc:lint` 全绿。测试用的稳定 `deviceId` 由 `DeviceIdIssuer` 覆盖提供，只为让「手工占住同名子表」有可复现靶子。

**S5「消费与降采样接线」** 交付完成——worker 的档案来源从编译期常量换成业务 Redis 的**全量快照**：server 每 500 ms 判定重建（键/快照缺失、`rev > built`、或距上次成功满 60 秒），先读 `rev` 再读库、Lua 条件写保证版本不倒退；worker 每 500 ms 轮询并在换入时建索引，冷启动拉不到快照就退避重试、**不启动消费环与降采样环**。消费环按 `localDeviceId + ts` 判定设备 usage 与模型版本区间，再按该时刻的声明过滤：测点集合、类型、量程全部来自物模型（`RAW_METRICS` / `DEFAULT_METRIC_RANGES` 已从仓库删除），BOOL / INT / 枚举按声明绑定，单位不符整条丢弃、过滤后为空整条丢弃。降采样环的 SQL 与行解析共用快照里的列清单，并且**只有 leader 持有环**（队列 Redis 抢锁 / 续期，续期失败立即关闭）。发布可指定 `effectiveFrom`、注册可指定 `fromAt`、新增撤销未生效版本接口（事务内清引用、删版本行、回填前驱）。

**S5 验收证据**（2026-11-07）：`test/iot-scheduling.e2e-spec.ts` 3/3（真 PG + 真 TDengine）——发布未来版本后按 `fromAt` 选到 v2、回溯发布 400、撤销后 `usage.version` 置空 / 版本行消失 / 前驱 `effectiveTo` 为 `null` 且恢复 `ACTIVE`；`fromAt` 早于最早生效时刻 409 且 `data.earliestEffectiveFrom` 正确；有排期设备时撤销唯一版本 409 并列出设备。`test/iot-snapshot.e2e-spec.ts` 2/2——注册后 2 秒内 `built` 前进且快照含新设备；删掉 `built` 后自动重建。server 单测 272/272、全量 e2e 62/62；worker 单测 164/164、e2e 8/8。`pnpm check`、`pnpm doc:lint` 全绿。

**下一步**：S6「注销与遗产清理」——代码前置 D5（注销口径与清理范围）未定，开工前先定 D5。

**未决**：D5（注销口径与遗产清理范围，含设备排期的改期与撤销）。按子任务前置排：D5 随 S6 定。

**怎么验证已有结论**：

```bash
pnpm ops:env-up
pnpm --filter @multi-admin/nestjs-server run test:e2e -- test/iot-registry.e2e-spec.ts
pnpm --filter @multi-admin/nestjs-server run test:e2e -- test/iot-registration.e2e-spec.ts
pnpm --filter @multi-admin/nestjs-server run test:e2e -- test/iot-scheduling.e2e-spec.ts
pnpm --filter @multi-admin/nestjs-server run test:e2e -- test/iot-snapshot.e2e-spec.ts
pnpm --filter @multi-admin/iot-worker run subtable:audit     # 四桶应全空、退出 0（无快照时退出 2）
pnpm --filter @multi-admin/iot-worker run downsample:verify  # 无流量时应退出 1
pnpm check
```

**环境注意**：跑 iot-worker 的 e2e 前先 `docker compose stop worker`——两者消费同一队列，worker 会抢走测试 job；worker 现需业务 Redis 的 `REDIS_URL`（快照来源，**指向宿主 `127.0.0.1`**，`.env` 里的 compose 服务名在宿主机解析不到），e2e 用例自行写入 P1 快照。表结构变更后需 `docker compose down -v` 再 `pnpm ops:env-up` 重建（本地开发库可丢）。

**已知未修**（均有触发点，明细在 `.superpowers/sdd/progress.md`，缺口已登记 [backlog](../../governance/backlog.md)）：e2e 的降采样侧证据是构造必然；`healthcheck-core` 的重试分支无单测；结构体内部字段不可查；错钟设备的全部数据会被拒、现象与设备掉线相同（D4 代价，告警接收方缺位）；`asProperties` 在 JSON 损坏时静默返回 `[]`，会建出只有 `ts` 的超表而不是报错（`models.service` / `devices.service` 各一份实现，连同 `toJson` 重复定义）；`DEVICE_ID_ATTEMPTS` 用尽后抛 `duplicate-device`，实际语义是「签发不出唯一编号」；`translateError` 用正则匹配 `already exists` 猜 TDengine 错误，未按错误码判定。

## 过程文件

| 文件 | 说明 |
| --- | --- |
| 本文件 | L1 阶段目标（判据拆解 / 遗产处置 / 交付块 / 三条接缝 / 验收证据 / 不做清单 / 待决策排序） |
| [2026-11-01-thing-model-industry-input.md](2026-11-01-thing-model-industry-input.md) | 四家物模型实现的一句话结论 + 对三条接缝的含义 + **D2 二维矩阵** + 倾向与代价（D2 决策卡的前置输入） |
| [2026-11-02-d2-decision-card.md](2026-11-02-d2-decision-card.md) | **D2 决策卡（已定稿）**：六个子问题的结论、被否决的候选与代价；含本机实测结论 |
| [2026-11-03-d4-decision-card.md](2026-11-03-d4-decision-card.md) | **D4 决策卡**：时间戳边界、报文大小上限、单位换算收尾；含超界处置的四种失败行为与代价 |
| [2026-11-04-s05-implementation-plan.md](2026-11-04-s05-implementation-plan.md) | **S0.5 实施计划**：T1–T6，逐项含类型形状、改动点、验收与危险动作 |
| [2026-11-04-s1-implementation-plan.md](2026-11-04-s1-implementation-plan.md) | **S1 实施计划**：T1–T6，载荷值联合类型与通道扩位（contracts）、类型档位表与标识符校验（device-registry）、模拟器布尔 / 枚举 profile |
| [2026-11-04-s3-implementation-plan.md](2026-11-04-s3-implementation-plan.md) | **S3 实施计划**：T1–T6，八档属性类型与聚合 → 列类型表、声明 / 版本两级、降采样列推导、P1 首份模型 |
| [2026-11-05-d3-input.md](2026-11-05-d3-input.md) | **D3 前置材料**：两库无共同事务的三种失败形态、SiteWise latest / active、入口形态 / 建表归属 / 状态机粒度 / 审计口径 / 重试语义五个子问题、八条决策轴的按轴自检 |
| [2026-11-05-d3-decision-card.md](2026-11-05-d3-decision-card.md) | **D3 决策卡（已定稿）**：HTTP 入口 + JWT、server 建表且命名函数进包、两套状态机、已 ACTIVE 即幂等、注册失败整体回滚且档案不落库、重建库只限开发环境 |
| [2026-11-05-s2-implementation-plan.md](2026-11-05-s2-implementation-plan.md) | **S2 实施计划**：T1–T5，四张表的 Prisma 模型、只读仓储（不实现 `DeviceRegistry`，形态归 D1）、seed 与幂等验收 |
| [2026-11-05-s4-implementation-plan.md](2026-11-05-s4-implementation-plan.md) | **S4 实施计划**：T1–T8，命名函数移包与版本状态拆枚举、原始列类型推导、TDengine 懒连接、按模型推导的 DDL、物模型定义与设备注册两个接口（`deviceId` 由平台签发）、失败整体回滚与真库 e2e |
| [2026-11-06-d1-input.md](2026-11-06-d1-input.md) | **D1 前置材料**：worker 当前读编译期常量、负结果缓存 5 分钟、降采样环同源；判据 A 拆成四条可验条件；直连 / 快照 / 服务三形态的机制与代价；五个待答子问题与按轴自检 |
| [2026-11-07-d1-decision-card.md](2026-11-07-d1-decision-card.md) | **D1 决策卡（已定稿）**：快照 + 本地全量、一份全量三合一、口径按数据时间戳、版本与档案同用区间排期、A4 定义与 500ms 轮询、写路径只递增 + 节流重建 + 条件写、降采样单写者、快照类型进 device-registry |
| [2026-11-07-s5-implementation-plan.md](2026-11-07-s5-implementation-plan.md) | **S5 实施计划**：T1–T9，快照类型与绑定类型、排期与撤销（发布 `effectiveFrom` / 注册 `fromAt` / 撤销版本）、server 侧构建与重建、写路径挂 rev、worker 侧客户端与启动门禁、消费环与降采样环改造、脚本与审计 |
| [2026-11-01-backlog-triage.md](2026-11-01-backlog-triage.md) | 开放表 70 项分诊：本增量必须 11 / 顺手 5 / 只定口径 3 / 不做（明细，不计入必读） |
| [2026-11-01-scope-and-task-map.md](2026-11-01-scope-and-task-map.md) | **范围定稿**：8 个子任务与出口、5 项决策各自落在哪个子任务前、执行顺序、预算与砍线 |
| [2026-11-01-s0-plan.md](2026-11-01-s0-plan.md) | **S0 设计与实施计划**：子表审计脚本、对账护栏、e2e 残留清理、worker 健康检查；含危险动作闸 |
| [2026-11-02-s0-implementation-plan.md](2026-11-02-s0-implementation-plan.md) | **S0 实施计划**：Task 1–6，逐步骤含代码、命令、预期输出与提交点 |
| [2026-11-02-s0-baseline.md](2026-11-02-s0-baseline.md) | **S0 验收记录**：环境启动后与收口时的表数、跳过 `down -v` 的依据、六项验收判据与命令输出 |

## 1. 判据拆成三条可测断言

| # | 断言 | 红了意味着 |
| --- | --- | --- |
| A | 注册一条档案 + 一个物模型（纯数据），**不重启 worker** 即可查档成功、落库到新子表 | 注册是代码改动，判据假 |
| B | 新设备的测点集合、类型与单位来自物模型，**不来自 `RAW_METRICS` 常量或 `DEFAULT_METRIC_RANGES`**；两种模型（含布尔/枚举测点）的设备共存于同一份代码 | 仍是"改常量 + 重建表" |
| C | 注册一个**新设备类型**时，原始超表列、子表、**降采样超表列**全部由模型生成，仓库无 diff | 新类型要人写 DDL |

A 是运行期断言，B / C 是结构性断言。**只有 A 通过不算判据成立。**

⭐ C 的后半句是本轮补的：降采样列若仍由人加，注册新属性后降采样环会因缺 `sum_xxx` 列**整级失败**——判据 C 不覆盖它，就是假的。

## 2. 遗产处置（本增量必须表态，不往后推）

判据只用一条：**这条现状是"以后改更贵"，还是沉没成本**。下表是**具名遗产**；backlog 开放表 70 项的分诊（本增量必须 11 项、顺手 5 项）见 [2026-11-01-backlog-triage.md](2026-11-01-backlog-triage.md)。

| 遗产 | 处置 | 理由 |
| --- | --- | --- |
| 契约 `value: number` | **本增量改正**：改为 number / boolean / string 联合类型，类型由模型声明 | 现在无真实设备、无历史；以后改要设备固件 + 全部历史 + 列类型不可改 |
| 超表三测点全 `FLOAT` | **改正**：列类型由模型定（BOOL / INT / BIGINT / DOUBLE / NCHAR） | 列类型不可逆，必须写第一行前定 |
| 降采样列写死三测点 | **改正**：DS 列由模型推导（每属性固定四聚合） | 不改则判据 C 不成立 |
| 子表只增不减 / 现原始 100 + 降采样 300（均与注册表对齐） | **本增量交付检测**：只读审计（表存在 ⇔ **曾注册**，四桶——换型号保留 `deviceId`，旧模型子表合法）；开发环境清库走重建卷；正式删除路径归注销流程 | 越晚越分不清孤儿与在用；按核验时的真实规模估，D2 的迁移成本才看得清 |
| `iot-worker` 不碰 PG | **已处置**：worker 仍不读 PG，档案与模型来自业务 Redis 快照（D1） | "不碰 PG"从实现副产品升级为依赖边界 |
| 上报时间戳无边界/时钟偏差检查 | **接受代价** | 触发点：接入第一台真实设备，或增量 5 做实时判定 |
| 降采样 K 之外的自愈盲区 | **接受代价** | 触发点：增量 6 缺口检测 |
| 无认证 / 无 TLS、无备份自动化 | **接受代价** | 触发点：非回环暴露之前 / 存真实数据之前 |

## 3. 本阶段能做什么

1. **档案落 PG + 状态机**：`PENDING → ACTIVE`，消费者只认 ACTIVE。worker 读业务 Redis 的档案快照，`packages/device-registry` 只保留命名、设备标识、快照类型与模型推导词汇。
2. **物模型**：按三元组结构建（`kind: property / service / event`），**本增量只实现属性通路**；数值 / 布尔 / 字符串 / **结构体**（序列化存一列），枚举用 INT + 取值表；**数组拒绝**。声明了 service/event 的模型在注册时明确报告"已定义未实现"。
3. **注册路径**：写档案 + 写模型 + 建超表（新模型）或加列（模型内演进）+ 建子表（原始 1；降采样 3 仅在聚合集非空时）+ 降采样列按各属性声明的聚合集推导。
4. **命名空间规则**：属性 key 即列名、**列名不可改**；扁平 key（分组留作模型元数据），小写字母开头、只含字母数字下划线、长度 ≤ 58；保留词 `ts` / `deviceId`；**改 key 等于新建模型类型**。

## 4. 三条接缝（阶段地图 §3）

- **档案 ↔ 子表预建**：字面"同事务"**不成立**（PG 事务管不了 TDengine DDL）。用状态机把一致性从写入时刻挪到读取时刻，孤儿由状态机产出、由 §2 的检测动作清理。
- **物模型 ↔ 单位与量纲**：单位在模型内**不可变**——改单位等于新建模型类型，随之新超表、新子表名（`deviceId` 不变）（[D2 决策卡 §10](2026-11-02-d2-decision-card.md)）；**单位列取消**，单位只在模型声明、写入侧校验；展示单位的换算是读取层的事。
- **设备注销 ↔ 子表清理**：软注销 + `deviceId` 永不复用 + 只读审计（表存在 ⇔ **曾注册**——换型号保留 `deviceId`、旧模型子表合法存在）。**审计工具无删除路径**；删除分别由开发环境重建库与注销流程承担；物理删设备与回收仍在用子表不做。

## 5. 能看到什么（验收证据，先证明会红）

| 证据 | 怎么取 |
| --- | --- |
| 注册 → 落库 | 注册一台新类型设备（含 BOOL 与枚举测点，与 P1 三测点不同）→ 模拟器上报 → `SELECT` 到数据；全程仓库无 diff、worker 不重启 |
| 建表幂等 | 建表脚本重跑前后 `SHOW <db>.TABLES` 计数与名集合一致；不产生未登记子表 |
| 降采样跟着模型走 | 新属性按**它声明的聚合集**自动出现对应列（未声明的属性不产生列）；`telemetry_1m` 有该属性的聚合值 |
| 清理可核 | 孤儿检测在清理前报出非零名单，清理后归零；dry-run 名单与实际删除一致 |
| 拒绝路径 | 非法单位 / 未知类型档位 / **非法聚合组合**（如 `sum` 配 `BOOL`）/ 引用非 ACTIVE 模型 / 属性 key 撞保留词或超长 → 明确错误码，不落半条数据 |
| 判据会红 | 临时把物模型读回 `RAW_METRICS` 常量，B / C 断言必须失败（红一次再改回） |

## 6. 明确不做

- 下行实现（命令 / 服务调用 / 可写属性 / 校时）：**模型结构留位、主题 channel 留位，实现留后续增量**
- 事件通路（设备上报 alert/error）
- **数组**类型；任意表达式派生量（transform）与自定义聚合——聚合集只支持 `sum` / `count` / `min` / `max` 的子集
- 物模型版本**迁移与历史回填**：只做"不可变 + ACTIVE/SUPERSEDED"，代价登记 backlog
- 层级 / 组件的**实体**（只留命名规则）；设备组与资产树
- 测点集合不重定：本增量交付"可定义"，P1 三测点仍是模拟器口径；从效率指标倒推测点集合另立（backlog 已有条目）

## 7. 待决策

编号固定；**按子任务的前置排**：D2 / D4 已定、版本边界并入 D2 §11，S3 无未决前置；S2 / S4 前定 D3；S5 前定 D1；D5 的注销与清理口径随 S6 定。对应关系见 [范围定稿](2026-11-01-scope-and-task-map.md) §3。

| # | 问题 | 为什么排在这 |
| --- | --- | --- |
| D1 | 档案存哪 + **iot-worker 怎么读到**（目标：不耦合 PG schema） | 判据 A 的运行期前提；**已定（2026-11-07）**，见 [决策卡](2026-11-07-d1-decision-card.md) |
| D2 | 模型 → 超表：**超表划分粒度 × 列集合由谁定**（含列类型与 DS 列），必须列矩阵 | **已定（2026-11-03）**，见 [决策卡](2026-11-02-d2-decision-card.md) |
| D3 | 注册的原子性、入口形态、状态机与孤儿处置 | 接缝 1 的落法 |
| D4 | 单位换算时机 + 时间戳上界 + 报文上限 | **已定（2026-11-03）**，见 [D4 卡](2026-11-03-d4-decision-card.md) |
| D5 | 注销口径 + 遗产清理的范围与顺序（含批内同键冲突的处置口径） | 接缝 3 + §2 的落地；版本边界已由 [D2 §11](2026-11-02-d2-decision-card.md) 定 |

**超窗取舍**：先砍 D5 的清理范围（保留检测、清理分次），再砍 §2 里的 e2e 残留清理（这属测试债，可单独立项）。

## 8. 材料分置

工程事实 → 本目录与 `docs/`；学习材料（物模型建模、四家实现对照、TDengine 列集合与超表语义）→ 知识库 `iot-learning/`，两边互相指路。
