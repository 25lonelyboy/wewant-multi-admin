# 增量 2 第 3 项决策：`mqtt.js` 的协议版本（MQTT 3.1.1 ↔ 5.0）

- **状态**：✅ **已定稿**——十轴全部作答 + 逐轴补全与纠偏 + **结论四件（§8）**；**25 项本机实测**（协议行为 15 项见 §4.3，凭据 10 项见 §4.11）
- **日期**：2026-10-08
- **决策人**：用户 ｜ 材料准备：AI
- **对应**：决策卡 §5 第 3 项（`mqtt.js` 的 `protocolVersion`）
- **来源**：本项由知识库《增量1-验收复盘（MQTT 设备接入）》「遗留」一节提出（决策人 2026-10-05 提出，列入增量 2 决策卡）
- **口径**：**【已核实】**＝官方一手或本机实测（出处在附录）｜**【本机实测】**＝在本机 `mqtt@5.16.0` + `emqx/emqx:6.3.1` 上跑出来的｜**【AI 判断】**＝无来源的推论，待验证

---

## 1. 背景：这一项要决定什么

**要决定的是**：本平台两端的 MQTT 客户端，连 Broker 时用哪个协议版本——**MQTT 3.1.1（`protocolVersion: 4`）还是 MQTT 5.0（`protocolVersion: 5`）**。

**为什么必须现在定**（决策卡的原文理由）：
> **落在设备侧**——现在改模拟器零成本，将来现场硬件要固件升级

⭐ 这句话是本项的核心张力：**改模拟器是一行代码，改现场一批真实硬件是一次固件升级**。两边的代价差了三个数量级，而**决定必须在"还没上现场"的时候做**。

**增量 1 给这项的定性**（复盘原文）：
> 这是本增量唯一一处像欠债的地方——**不是"我们决定用 3.1.1"，而是"没人决定过"**。

**不做的后果**：`mqtt.js` 的默认值继续生效（= 3.1.1），而**没有人知道这是默认值还是选择**。上现场时若设备发 5.0，平台侧的 5.0 能力（元数据、原因码）全程收不到。

---

## 2. 已定死的前置（**不在本卡范围**）

| 项 | 结论 | 出处 |
| --- | --- | --- |
| Broker | **EMQX 6.3.x LTS**（社区版，单节点） | [ADR-009](../../../decisions/ADR-009-iot-platform-p1-stack.md) |
| 客户端库 | `mqtt.js`（`mqtt@5.16.0`） | 同上 |
| 主题结构 | `wewant/devices/{deviceId}/{channel}`（含 `telemetry` 通道） | `packages/contracts/src/iot/telemetry.ts`，增量 1 冻结 |
| 载荷格式 | `{ deviceId, ts(epoch ms), metrics: [{key, value, unit}] }` | 同上 |
| QoS | **0 → 1**（2026-10-09 改，见 §9） | 增量 1；**§9** |
| clientId 约定 | 设备侧用 `deviceId`（与生产「clientId 绑定设备身份」同形） | `apps/iot-simulator/src/device.ts` |

⚠️ 主题结构与载荷是**已进契约的应用层约定**——本项**不改它们**。

---

## 3. 约束

| 类别 | 内容 |
| --- | --- |
| **时间** | 窗口 10/07 → 10/19 |
| **技术** | 契约先行；新依赖过 catalog 判据；**服务端能力须社区版自带**（企业版特性不可用） |
| **组织** | 单人项目 |
| **不可逆性** | ⭐ **协议版本是"发出去就收不回"的约定之一**（增量 1 复盘的"必须先定"清单：协议版本 / 主题结构 / 凭据形态 / 上报频率） |
| **现场** | 真实设备侧的协议支持度**目前没有任何输入** |

---

## 4. 项级背景

### 4.1 现状：两端都是 3.1.1，而且都没人选过【已核实：读本仓库代码】

| 位置 | 代码 | 实际协议版本 |
| --- | --- | --- |
| **设备侧（模拟器）** | `apps/iot-simulator/src/device.ts:20`：`mqtt.connect(url, { clientId: deviceId, clean: true })` | **3.1.1**（未传 `protocolVersion`） |
| **后端订阅端** | `apps/nestjs-server/src/modules/iot/telemetry/telemetry-subscriber.service.ts:56`：`mqtt.connect(url, { clientId: \`nestjs-server-${pid}\` })` | **3.1.1** |
| **E2E 发布者** | `apps/nestjs-server/test/iot.e2e-spec.ts:53` | **3.1.1** |

⭐ **三处都没有显式的 `protocolVersion`**——`mqtt.js` 的默认值是 `4`（3.1.1）。**没有任何一行代码表达过"我们选 3.1.1"这个意思。**

### 4.2 两个版本差什么

| 能力 | MQTT 3.1.1 | MQTT 5.0 |
| --- | --- | --- |
| **User Properties**（自定义键值元数据） | ❌ | ✅ |
| **Reason Code**（细粒度失败原因） | ❌ 失败只有 `0x80` 一种 | ✅ 一整套原因码 |
| **Session Expiry Interval**（会话存活时长可控） | ❌ 只有 Clean Session 0/1 | ✅ |
| **Will Delay Interval**（遗嘱延迟发布） | ❌ | ✅ |
| **Message Expiry Interval**（消息过期） | ❌ | ✅ |
| **Topic Alias**（主题别名，省带宽） | ❌ | ✅ |
| **Subscription Identifier**（订阅标识） | ❌ | ✅ |
| **流控**（`Receive Maximum` / `Maximum Packet Size`） | ❌ | ✅ 服务端 CONNACK 下发 |
| **增强认证**（SCRAM / Kerberos） | ❌ | ✅ |
| **共享订阅 `$share/{group}/{topic}`** | ⚠️ **规范上是 5.0 特性，但 EMQX 对 3.1.1 客户端也扩展支持** | ✅ |
| **主题结构 / 载荷语义** | 无关 | 无关 |

⚠️ **最后两行要留意**：一条是"看着像独有、其实不是"，一条是"看着像有差别、其实没有"。

### 4.3 ⭐ 本机实测：迁移面【本机实测，15 项】

> 探针：`apps/iot-simulator/scripts/mqtt-protocol-probe.mjs`（用 `mqtt@5.16.0` 真实建连；**全程未改 EMQX 任何配置**）。

| # | 实测 | 结果 |
| --- | --- | --- |
| **P0** | `protocolVersion: 4` 建连 | ✅ 成功 |
| **P1** | ⭐ `protocolVersion: 5` 建连 | ✅ **成功——未改 EMQX 任何配置** |
| **P1.1** | 服务端 CONNACK properties（仅 5.0 有） | `receiveMaximum: 32`、`maximumPacketSize: 1048576`、`retainAvailable: true`、`sharedSubscriptionAvailable: true`、`subscriptionIdentifiersAvailable: true`、**`topicAliasMaximum: 65535`**、`wildcardSubscriptionAvailable: true` |
| **P2** | ⭐ **版本混用**：3.1.1 发布者 → 5.0 订阅者（同一 Broker、同一监听器） | ✅ **消息正常到达** |
| **P3** | ⭐ **User Properties 端到端透传**（发布侧带 `{traceId, deviceId}`） | ✅ 订阅侧**完整收到** `{"userProperties":{"traceId":"trace-abc-123","deviceId":"dev1"}}` |
| **P3.1** | ⚠️ 对照：**3.1.1 发布者**带同样的 `properties` | ⚠️ **发布侧不报错、订阅侧收到 `properties: null`——被静默忽略** |
| **P4** | 5.0 下 `clean: true` + `properties.sessionExpiryInterval: 300` | ✅ 建连成功（CONNECT 上的 properties 被接受） |
| **P4.1** | ⚠️ 对照：3.1.1 上带同样的 properties | ⚠️ **建连成功，properties 被忽略** |
| **P5** | SUBSCRIBE 的返回 | `granted=[{topic, qos:2, nl:false, rap:false, rh:0}]`（5.0 的订阅选项） |

**跨版本矩阵（回答"5.0 订阅端能不能解析 3.1.1 的报文"与"混用会不会丢数据"）**：

| # | 组合 | 载荷 | `properties` |
| --- | --- | --- | --- |
| **P6.1** | 3.1.1 发布 → 3.1.1 订阅（基线） | ✅ 完整一致 | 空 |
| **P6.2** | ⭐ **3.1.1 发布 → 5.0 订阅** | ✅ **完整一致** | 空（**正确**——3.1.1 发布者本就没有 properties） |
| **P6.3** | **5.0 发布 → 3.1.1 订阅** | ✅ 完整一致 | 空（**被丢弃**） |
| **P6.4** | 5.0 发布 → 5.0 订阅（基线） | ✅ 完整一致 | ✅ **透传** |
| **P7** | 5.0 发布（带 `traceId`）→ 3.1.1 订阅 | ✅ 完整 | ⛔ **被丢弃**（订阅侧 `null`） |
| **P8** | 3.1.1 发布 **20 条** → 5.0 订阅 | ✅ **20/20 全到、顺序保持** | —— |

**五条结论**：

1. ⭐ **EMQX 侧零配置改动**——默认监听器同时接受 3.1.1 与 5.0（P1）。决策卡给出的三条待核实里，这一条**已结案**。
2. ⭐ **两个版本可以并存于同一 Broker、同一监听器**（P2 / P6），且**载荷无损、顺序保持**（P8）⇒ **迁移不是"一刀切切换"，可以是渐进的**。这一条**改变了本项的成本结构**：现场设备支持度不再是"全有或全无"的开关。
3. ⭐⭐ **协议版本只影响"协议元数据"层，不影响"应用层载荷"**——跨版本矩阵四种组合下**载荷全部完整一致**（P6.1–P6.4）。⇒ **5.0 订阅端完全能解析 3.1.1 的报文。**
4. ⭐ **User Properties 只在"两端都是 5.0"时存在**（P6.4）；任一端是 3.1.1 就被静默丢弃（P6.3 / P7）。
5. ⛔ **⚠️ 一个"用错版本不报错"的坑**（P3.1 / P4.1 / P6.3）：**在 3.1.1 上传 `properties`，发布侧不报错、对端收不到**——静默丢弃。这正是"默认拿到什么就用什么"最容易咬人的形态：**写了 5.0 的代码跑在 3.1.1 上，功能悄悄不生效。**

### 4.4 EMQX 侧是否需要改配置

✅ **不需要**（P1 实测）。当前 compose 里 EMQX **没有任何配置文件**，全走默认——5.0 照样连得上。

⭐ 一条**不能想当然的对照**：共享订阅 `$share/` 看起来像 5.0 独有，但 EMQX 官方明说它对 3.1.1 客户端也扩展支持（原文见附录）。⇒ **为"用共享订阅"而升级协议版本，理由不成立。**

### 4.5 契约是否需要新增字段

✅ **不需要**（【已核实】读契约）。契约里只有**主题结构**与**载荷结构**，两者都是**应用层**的、与协议版本无关。

⚠️ **但有一个例外情形要先想清楚**：如果要用 User Properties 传 trace 上下文，**它不是契约字段，是链路元数据**——那就产生一个新问题：**trace 上下文由谁生成、在哪一跳注入、后端从哪里取**。这与"契约要不要改"是两个问题。

### 4.6 收益清单：5.0 的能力里，本项目现在用得上哪些

用前提复议的口径（工厂内部自用）逐条过滤：

| 5.0 能力 | 本项目当前 | 判断依据 |
| --- | --- | --- |
| ⭐ **User Properties** | ✅ **用得上** | trace 上下文传播——增量 1 验收时讨论过；P3 实测可用 |
| ✅ **Reason Code** | ✅ **用得上** | 诊断粒度；与增量 2「写入失败分三类」是同一诉求的两端 |
| ⚠️ **Will Delay Interval** | ⚠️ **增量 4 可能用** | 设备在线视图里抑制网络抖动造成的误告警 |
| **Session Expiry Interval** | ⚠️ **变得相关** | ⛔ 原记"价值低"的理由是"用 QoS 0、不依赖 Broker 攒消息"——**2026-10-09 起订阅端用持久会话（§9）**，它正是 BullMQ 挂掉时的第二道兜底 |
| **Topic Alias** | ❌ 价值低 | 内网带宽不是瓶颈（前提复议 §3 E3 已把"极致带宽优化"降级） |
| **Message Expiry Interval** | ⚠️ **变得相关** | ⛔ 原记「无排队消息」——持久会话下会有积压消息（§9） |
| **流控（Receive Maximum）** | ⚠️ **变得相关** | ⛔ 原记「用 QoS 0，不涉及在途确认窗口」——订阅端成了 QoS 1 的接收者（§9），在途确认窗口存在 |
| **Subscription Identifier** | ❌ 暂用不上 | 当前只有一个通配订阅 |
| ⚠️ **共享订阅** | ❌ **不是 5.0 独有** | EMQX 对 3.1.1 也支持（§4.4） |
| **增强认证（SCRAM）** | ⚠️ 将来 | ⭐ **community 版实测可用**（§4.11(c)）——此前据文档目录位置推断的"属企业版"不成立 |

⇒ **⭐ 一句话判断**：**MQTT 5.0 当前的收益是"为将来留能力"，不是解决现在的痛点。**

⚠️ 这个判断很重要，因为它决定本项按哪种类型处理——**是"必须现在定的结构性选择"，还是"可以后补的能力增量"**。

### 4.7 成本与不可逆性

| 环节 | 切到 5.0 的代价 |
| --- | --- |
| 模拟器（设备侧） | **一行**（加 `protocolVersion: 5`） |
| 后端订阅端 | **一行** |
| E2E 测试的发布者 | **一行** |
| EMQX 配置 | **零**（P1 实测） |
| 契约 | **零**（§4.5） |
| ⚠️ **现场真实设备** | **固件升级**——⭐ **这才是本项唯一不可逆的那一项** |

⚠️ **但"不可逆"的边界比想象中窄**：由于**两个版本可混用**（P2），**现场设备支持度不是全有或全无**——可以分批、可以不统一。

⚠️ **一处仍需注意**：如果将来要**强制**现场设备用 5.0（比如为了拿 trace），那就变成一次"全厂固件升级"，代价回到最大。⇒ **"是否强制"与"是否使用"是两个不同的决定。**

### 4.8 MQTT 5.0 的七项特性：各自解决什么问题【已核实：EMQX 官方清单】

EMQX 官方把 5.0 的新特性归纳为七项。逐条对照本项目：

| # | 特性 | 它解决什么问题（官方表述） | 本项目 |
| --- | --- | --- | --- |
| 1 | **Reason Code** | *"can provide a reason code for **every acknowledgement packet**, giving us a better understanding of why a disconnection or failure occurred"*——诊断与精确错误处理 | ✅ **用得上** |
| 2 | **Session Expiry Interval** | 指定"断开后会话保留多久"。此前版本"会话要么立即结束、要么无限期" | ⚠️ **变得相关**（§9）：**持久会话正是 BullMQ 挂掉时的第二道兜底** |
| 3 | **Topic Alias** | 用短数字别名替代完整主题名，"significantly reducing the size of the MQTT header and **conserving network bandwidth**" | ❌ 价值低（内网带宽不是瓶颈） |
| 4 | **User Properties** | 在报文头里放自定义元数据——官方举例"the message's timestamp, device location, or other application-specific data" | ⚠️ **用途未确认**（见 §4.10） |
| 5 | **Subscription Options** | 每个订阅单独控制：是否收 retained、是否收自己发的（No Local）等 | ⚠️ 暂用不上（当前只有一个通配订阅） |
| 6 | **Request/Response** | 请求方指定"回执主题"，对端直接回到该主题（配合 Correlation Data 匹配） | ⚠️ **增量 3+ 若有下行指令可能用** |
| 7 | **Shared Subscription** | 多个订阅者平摊同一主题的消息、提升吞吐与容灾 | ❌ **不是 5.0 独有**（见下） |

**AWS 另列的几项**（其 5.0 支持面：Shared subscriptions / Clean Start and Session Expiry / **Reason code on all ACKs** / Topic aliases / **Message expiry** / Other）：`Message Expiry Interval`、`Maximum Packet Size` 等——⚠️ 本项目用 QoS 0 直通，**均用不上**。

⭐ **一句总结**：**七项里，本项目现在真正用得上的只有两项——`Reason Code` 与 `User Properties`**；而 `User Properties` 的用途（trace 关联）本身还没确认（§4.10）。

⚠️ **两条"看着像 5.0 独有、其实不是"的**（两处官方原文）：

| 特性 | 谁说的 |
| **共享订阅** | EMQX：*"even **extends compatibility to MQTT 3.1.1 clients** … just by using the `$share/{group}/{topic}` format"*；AWS：*"AWS IoT Core supports shared subscriptions for **both MQTT 3.1.1 and MQTT 5**"* |
| **持久会话** | AWS 把 Clean Start / Session Expiry 归在其 5.0 支持面里，但**3.1.1 也有 Clean Session**——差别在"粒度"，不在"有没有" |

⇒ **为"用共享订阅"而升级协议版本，理由不成立。**

### 4.9 「会话语义」是什么

**会话（Session）＝ Broker 上为该 `clientId` 保存的状态**——包括该客户端的**订阅列表**、**未确认的 QoS>0 消息**、**待投递消息**。会话的有无，决定"客户端断线再上来时，Broker 还记不记得它"。

两个版本对它的控制方式不同：

| | MQTT 3.1.1 | MQTT 5.0 |
| 字段 | **`Clean Session`**（二值） | 拆成**两个独立字段** |
| 管什么 | 一次决定全部：`0`＝保留会话（**无限期**）；`1`＝每次连接都新建、丢弃旧的 | **`Clean Start`**：只管"这次连接**开始时**怎么对待旧会话"（`1`＝新建并终止旧会话；`0`＝恢复旧会话）<br>**`Session Expiry Interval`**：管"这次连接**结束后**会话留存多久"（秒；**未指定时默认 0**＝断开立即终止） |
| 灵活性 | 只能"无限期"或"立刻没有" | 可以给一个**具体时长** |

**AWS 官方原文**（措辞最清楚的一处）：
> **Clean Start controls the beginning of the connecting session and the end of the previous session.**
> **Session Expiry Interval controls the end of the connecting session.**

⭐ **对本项目的实际含义**：当前代码写的是 `clean: true`。**切到 5.0 之后它仍然表达 `Clean Start = 1`，而 `Session Expiry` 默认 0** ⇒ **行为与现在完全一致**。⇒ **迁移本身不改变会话语义**。⛔ **但 2026-10-09 起我们主动去用它了**（§9）。

⛔ **本节原结论已由 §9 改写**：原先记的是「用不上会话保留」，理由是「数据靠 BullMQ 缓冲、且用 QoS 0」。**2026-10-09 起订阅端改用持久会话**——它正是 **BullMQ 挂掉时的第二道兜底**。

### 4.10 trace 关联：业界是什么状况

#### (a) 两条标准事实

1. **W3C Trace Context** 定义的是 **HTTP 头**（`traceparent` / `tracestate`）。对非 HTTP 协议，规范第 5 节原文：
   > *"While trace context **is defined for HTTP**, the authors acknowledge it is also relevant for other communication protocols. **Extensions of this specification, as well as specifications produced by external organizations, define the format of trace context serialization and deserialization for other protocols.**"*
2. ⛔ **OpenTelemetry 的 messaging 语义约定**覆盖：Kafka / RabbitMQ / RocketMQ / SNS / SQS / Google Cloud Pub/Sub / Azure Service Bus / Azure Event Hubs——**没有 MQTT**。

⇒ ⭐ **MQTT 上的分布式追踪，目前没有公认的标准绑定**（W3C 把它交给外部规范，而该规范尚未出现）。

#### (b) 由此得到三条【AI 判断】

1. **"用 User Properties 传 `traceparent`"是可行但无标准的做法**——它是一个**自定约定**，不是"接标准"。
2. ⭐ **不需要为了追踪而依赖 User Properties**：**载荷在所有协议版本组合下都完整**（P6 实测），而 **User Properties 只在两端都是 5.0 时才存在**（P7）⇒ **把关联信息放进载荷，与协议版本无关，混合环境下也不会断**。
3. ⭐ **载荷里已经有天然的关联键**：契约冻结的 **`deviceId` + `ts`**——两者组合即可定位"哪台设备的哪一刻"，且**不需要设备侧配合**。

#### (c) 决策人提出的两种情形

| 情形 | 结论 |
| **(a) 设备端由我们自己开发** | 能加（可以带 User Properties） |
| **(b) 老设备改造由厂商做** | ⚠️ 不一定能加 |

⭐ **但关键点在于：追踪的注入点可以在平台侧，不必在设备侧。**

链路是 `设备 → EMQX → 订阅 → BullMQ → 消费者 → TDengine`——**从"订阅端"往后的每一跳都是我们的**。若追踪的目的是"**排障：这条数据为什么没进库**"，那么**起点放在订阅端就够了**，不需要设备配合。

⇒ **(b) 不是"追踪做不了"，而是"追踪的起点落在平台侧"**。设备的 User Properties 只在"要跨『设备到平台』这一跳追踪"时才有用——而那通常是设备厂商自己的事。

### 4.11 凭据现状；以及"切 5.0 后凭据是不是和从前一样"

#### (a) 现状：本项目**没有任何凭据**【已核实：本机 EMQX REST API + 读仓库】

| 事实 | 出处 |
| --- | --- |
| **EMQX 认证器列表为空**（`GET /api/v5/authentication` 返回 `[]`） | 本机 EMQX 实测 |
| `MQTT_URL` 里**没有 username / password**（`mqtt://127.0.0.1:1883`） | `.env` / `.env.example` / `docker-compose.yml` / CI |
| 两端代码**都没有传 `username` / `password`** | `device.ts` / `telemetry-subscriber.service.ts` |
| 官方原文：*"By default, EMQX allows all clients to connect if authentication is not enabled"* | 增量 1 复盘已引 |

⇒ 现状是"**接入，不是认证**"——这是增量 1 给出的定性。

#### (b) ⭐ 实测：3.1.1 与 5.0 的凭据行为**一致**，差别只在"原因码"

在一个**独立**的临时 EMQX 上配好「密码认证器（内置数据库）+ 用户 `dev1`」后，跑 10 个用例：

| 用例 | MQTT 3.1.1 | MQTT 5.0 |
| --- | --- | --- |
| 不带凭据 | ❌ `code=5` Not authorized | ❌ `code=135`（＝**0x87** Not authorized） |
| ⭐ **正确凭据** | ✅ **成功** | ✅ **成功** |
| 错误密码 | ❌ `code=4` Bad username or password | ❌ `code=134`（＝**0x86** Bad User Name or Password） |
| 不存在的用户 | ❌ `code=5` | ❌ `code=135` |
| **二进制密码（`Buffer`）** | —— | ✅ **成功**（5.0 规范里 password 本就是二进制数据） |
| 带 `authenticationMethod` 属性（增强认证） | —— | ❌ `code=135`（该 Broker 未配增强认证器） |

⭐ **三条结论**：

1. **基本用户名 / 密码流程在两个版本下完全一致**——怎么传、怎么校验、成功与失败的结果都一样。
2. **差别只在失败时的原因码**：3.1.1 只有笼统的 `4`（凭据错）/ `5`（未授权）；**5.0 用标准原因码 `0x86`（用户名或密码错误）/ `0x87`（未授权）**。
3. 5.0 **多**了一项能力：**password 可以是二进制**（3.1.1 是 UTF-8 字符串）。

#### (c) ⭐ 修正：MQTT 5.0 增强认证（SCRAM）**在 community 版可用**

⚠️ **本次材料早期版本据"该文档在 Enterprise 目录下"推断它属企业版——实测证否**：

- 在**同一个 `emqx/emqx:6.3.1` 镜像**上，`POST /api/v5/authentication` 用 `mechanism: "scram"` **成功建成认证器**（`scram:built_in_database`），并**成功加入用户**。
- ⚠️ **一处容易误判的**：`GET /api/v5/nodes` 的 `edition` 字段报 **`Enterprise`**，但 `emqx ctl license info` 显示 **`type: community`** ⇒ **不要用 `edition` 字段判断授权类型**。

⇒ **增强认证是 5.0 在 community 版就可用的能力**，不是企业版专属。（Kerberos 未单独测。）

#### (d) 对本项决策的含义

⭐ **凭据这一块，"切 5.0"不改变任何既有的选择空间**：

- 基本凭据形态（每设备凭据 / 共享凭据 / 证书）**两个版本都支持**，**选择空间相同**
- 5.0 **额外**多了增强认证与更细的原因码
- ⇒ **凭据形态的决定与协议版本的决定，相互独立，可以分开做**

⚠️ 但有一条**耦合**：增量 1 把"**凭据形态**"列为"必须先定"（因为改动会落到设备上）——它与协议版本**同属"连上之前"的约定**，**两者都要在设备侧固化之前定**。

### 4.12 混用的可观测性：EMQX 能查出每条连接的协议版本【本机实测，2026-10-09】

> 本节补上轴 4「允许混用」缺的那一半支撑——原 §7 第 2、3 项。

| 项 | 结果 |
| --- | --- |
| **字段** | **`proto_ver`** —— 3.1.1 连接为 `4`，5.0 连接为 `5` |
| **位置** | `GET /api/v5/clients`、`GET /api/v5/clients/{clientid}`；Dashboard 走同一接口 |
| **鉴权** | `POST /api/v5/login` 取 token → `Authorization: Bearer` |
| **无区分力的** | `proto_name` —— 两条连接都是 `"MQTT"`；`/api/v5/nodes` 只有聚合口径，没有每连接版本 |
| **配置** | **零**——不需要为它改 EMQX 任何配置 |

⭐ **含义**：**"允许混用"的可见性一直是有的**，不需要平台侧自己维护一份。⇒ **§8 代价陈述第 2 条（"允许混用缺可见性"）撤销**。

⚠️ 但有一条**不能混为一谈**：`proto_ver` 是**连接态**信息（当前这条连接跑在哪个版本），**设备档案里记的协议版本是另一件事**——§8 触发点第 1 条（接入第一台真实设备时记进设备档案）**不变**。

**顺带两条（同批实测）**：

- **共享订阅在混用下正常**：`$share/<group>/<topic>` 下 5.0 与 3.1.1 订阅者混编，10 条消息按 5/5 分派——共享生效，不是全量广播
- **订阅端能拿到 `subscriptionIdentifier`**：5.0 订阅带 `subscriptionIdentifier: 42`，投递报文上可读到

---

## 5. 决策轴与答复

### 5.1 轴清单（含答复摘要）

| # | 问题 | 决策人的答复 |
| --- | --- | --- |
| 1 | **后端订阅端**用哪个版本？ | **倾向 5.0**；⚠️ 但**定之前先要确认：5.0 能不能解析 3.1.1 的报文**。并明确原则：**后端要尽可能兼容多版本，以预防现场不同时期的设备协议不同** |
| 2 | **模拟器**用哪个版本？ | **两个都用**——一部分 3.1.1、一部分 5.0，用来模拟现场设备版本不一致的场景 |
| 3 | **要不要现在启用某项 5.0 能力**？ | ⚠️ **反问**："5.0 这些新特性各自的使用场景是什么？"——目前对版本的考虑**只是"想模拟现场不同时期、不同厂商协议不同的情况"**，所以倾向**尽量兼容** |
| 4 | **对现场设备的版本要求**？ | **允许混用** |
| 5 | **会话语义怎么定**？ | ⚠️ **反问**："这里的会话语义是什么意思啊" |
| 6 | **契约要不要动**？ | ⚠️ **反问 + 补充**：先弄清 **trace ID 在本场景是否有意义**；且要**分两种情形**——① 设备端由我们自己开发 ⇒ 可以加；② 老设备改造由厂商做 ⇒ 不一定能加 |
| 7 | **测试覆盖**？ | **两个版本都要测** |
| 8 | **降级策略**？ | **按"能兼容现场多协议混合"处理**；⚠️ **反问**："用 5.0 是不是能够兼容这种情况呢？" |
| 9 | 若现在不定，触发点是什么？ | ⭐ **没有后续触发点了——现在就需要兼容 3.1.1 和 5.0** |
| 10 | 凭据形态与版本的关系要不要一起看？ | **先看凭据的实际情况**；⚠️ **反问**："在 5.0 这里是不是和以前一样？" |

### 5.2 决策人原话

> 1. 订阅端我倾向于用 5.0 版本，不过在这个决定之前，要先看一下 5.0 版本能不能解析 3.1.1 的报文。我们后端肯定要尽可能地去兼容多个版本的协议，以预防在生产现场，不同时期产生的设备采用的协议不同的情况。
> 2. 模拟器两个版本，一部分要用 3.1.1，一部分要用 5.0，用来模拟现场设备采用不同版本的场景。
> 3. 5.0 版本这些新特性各自的使用场景是什么？这个我还不是很清楚。目前我对版本的考虑，仅仅只是想要模拟现场不同时期、不同厂商采用不同协议的情况，所以觉得应该尽量去兼容。具体的属性特性有什么用，我目前还不太清楚。而且我们之前对 Trace ID 的讨论，仅仅只是讨论它对我们的场景是否有用，这个我也没办法去判断，可能要结合业界的一些情况去做一下了解。
> 4. 允许混用，用来模拟不同设备采用的协议版本不一致的情况。
> 5. 这里的会话语义是什么意思啊？
> 6. 要先弄明白 trace ID 在我们这个场景下是否有意义。而且这里要分两种情况：① 如果生产环境下设备端是我们自己开发的，我们可以加；② 但是很多情况下，对老设备的改造是由厂商进行的，这个不一定能加。
> 7. 测试都要覆盖，两个版本都要测。
> 8. 降级策略按照能够兼容现场多协议混合的情况来处理，采用能够兼容这种方式。用 5.0 版本是不是能够兼容这种情况呢？
> 9. 没有后续触发点了，现在就需要兼容 3.1.1 和 5.0 了。
> 10. 你看一下凭证状态，看一下实际情况，在 5.0 这里是不是和以前一样。

---

## 6. AI 补全与纠偏（逐轴）

### 轴 1 · 后端订阅端倾向 5.0（前置条件已核）

✅ **用户设的前置条件已确认**：**5.0 订阅端完全能解析 3.1.1 的报文**——跨版本矩阵实测载荷**完整一致**（§4.3 P6.2）、**20 条突发全到且顺序保持**（P8）。

✅ **"后端要尽可能兼容多版本"这个方向有云厂商一手支撑**（AWS 原文）：
> *"AWS IoT Core also supports **cross MQTT version (MQTT 3 and MQTT 5) communication**. An MQTT 3 publisher can send an MQTT 3 message to an **MQTT 5 subscriber that will be receiving an MQTT 5 publish message**, and vice versa."*

⚠️ **但一处要写清**：**"跨版本兼容"是 Broker 的职责，不是订阅端代码的职责**。订阅端选 5.0 只是"用它自己的连接"；它**收到什么格式，由 EMQX 按订阅端的版本生成**。
⇒ 订阅端切 5.0 **不会让 3.1.1 设备的数据丢失**（实测），但**也不会自动让平台"读懂"3.1.1 设备没有的元数据**。

⚠️ **一处必须提前知道**：**5.0 订阅端无法区分"对方根本没发 properties"与"对方发了但被 Broker 丢弃"**——两种情况在订阅侧都表现为 `properties: null`（§4.3 P6.2 与 P6.3 的订阅端表现相同）。
⇒ **若将来任何逻辑依赖 User Properties，在混合环境里会静默按"没有"处理。** 处置要么**建立"哪台设备在哪个版本上"的可见性**，要么**不依赖它**（见轴 6）。

### 轴 2 · 模拟器两版并存

✅ 可行——实测两版本可在同一 Broker、同一监听器共存，且互不干扰（§4.3 P6）。这条**正是"允许混用"的落地形态**。

⚠️ **补全两条**：
1. **"设备 ↔ 版本"的对应关系要可见**——否则排查时无法知道"这台设备跑在哪个版本上"。建议在启动日志或模拟器的查询接口里带上。
2. E2E 也要覆盖两版（轴 7 已答）——且**至少要覆盖"跨版本"那一种组合**（见轴 7）。

### 轴 3 · 5.0 特性各自的使用场景

✅ **已按 EMQX 官方七项清单整理成表**（§4.8）。**本项目现在真正用得上的只有两项：`Reason Code` 与 `User Properties`**——而 `User Properties` 的用途（trace 关联）本身还没确认（轴 6）。

⭐ **一条重要的定性**：决策人的理由是"**想模拟现场协议不一致的情况**" ⇒ **这是"能力就绪"的诉求，不是"某个特性需要"的诉求**。
⇒ 两者的差别在于：**前者不需要现在就确定用哪些特性**，只需要**把版本选到能覆盖它的那一档**。

⚠️ 但**"尽量兼容"不等于"版本越高越好"**，也不等于"两边都要改"：
- **3.1.1 的客户端连不上 5.0 专属能力**（这是协议层面的限制，无法绕过）
- **5.0 的客户端在混合环境里是安全的**（实测）
⇒ **"订阅端选 5.0 + 设备端任选"确实是最兼容的组合**。

### 轴 4 · 允许混用

✅ 实测支持（P2 / P6 / P8），且**云厂商同样是这个立场**（AWS 有专门的 "cross MQTT version communication" 表述）。

⚠️ **补全**：混用下有一条**静默失效**风险（§4.3 结论 5）——**用错版本不报错**。
⇒ **"允许混用"必须配一条可观测性要求**：**能看出每条连接用的是哪个版本**。
✅ **这条要求已经能满足**（§4.12 实测）：EMQX 的 `GET /api/v5/clients` 直接暴露 **`proto_ver`**，3.1.1 为 `4`、5.0 为 `5`，零配置。⇒ 现场出现"某批设备少了某个功能"时，可以从连接侧定位到是哪些设备跑在 3.1.1 上。

### 轴 5 · 会话语义

✅ **已解释**（§4.9）：会话＝Broker 为该 `clientId` 保存的状态（订阅列表 + 未确认的 QoS>0 消息 + 待投递消息）。3.1.1 用二值的 `Clean Session`；5.0 拆成 **`Clean Start`（管连接**开始**时怎么对待旧会话）** 与 **`Session Expiry Interval`（管连接**结束**后会话留存多久，默认 0）**。

⭐ **对本项目的实际含义**：当前 `clean: true` **切到 5.0 后行为不变**（Session Expiry 默认 0）。⛔ **但这条已由 §9 改写**——改用**持久会话**（`clean: false` + Session Expiry > 0），因为它是 **BullMQ 挂掉时的第二道兜底**。

### 轴 6 · trace ID 是否有意义；两种情形

✅ **已答**（§4.10）：**MQTT 上的分布式追踪目前没有公认的标准绑定**——OpenTelemetry 的 messaging 语义约定未覆盖 MQTT；W3C Trace Context 定义的是 HTTP 头，把非 HTTP 协议的绑定交给"本规范的扩展与外部组织的规范"。

⭐ **三条判断**（§4.10(b)）：
1. **"用 User Properties 传 `traceparent`"是可行但无标准的做法**——是自定约定，不是"接标准"
2. ⭐ **不需要为了追踪而依赖 User Properties**——载荷在所有协议版本组合下都完整（P6），而 User Properties 只在两端都是 5.0 时才存在（P7）⇒ **把关联信息放进载荷，与协议版本无关，混合环境下也不会断**
3. ⭐ **载荷里已经有天然的关联键**：契约冻结的 **`deviceId` + `ts`**——不需要设备侧配合

⭐ **对两种情形的回答**：
- **(a) 设备端自研** ⇒ 能加
- **(b) 老设备由厂商改造** ⇒ ⚠️ **不是"追踪做不了"，而是"追踪的起点落在平台侧"**——从**订阅端**往后的每一跳都是我们的；若目的是"排障：这条数据为什么没进库"，**起点放在订阅端就够了**

⚠️ **一处必须写清**：**若采用"User Properties 传 trace"，就必须放弃"混用环境下也能追踪"的预期**——3.1.1 那一跳必断（P7），且 5.0 侧**无法区分"没发"与"被丢"**（轴 1 补全）。

### 轴 7 · 两个版本都测

✅ 与决策人答复一致。

⚠️ **补全**：E2E 覆盖两版，**不能只测"各自能通"**——至少要覆盖 **"3.1.1 发布 → 5.0 订阅"** 这一种，因为**那正是现场的实际形态**（老设备 + 新平台侧）。

### 轴 8 · 降级策略；"5.0 能否兼容混合"

✅ **决策人的反问有确定答案：能。**
- **实测**：4 种组合载荷**全部完整一致**（P6.1–P6.4）、20 条突发全到且顺序保持（P8）
- **云厂商一手印证**：AWS 原文 *"AWS IoT Core also supports cross MQTT version (MQTT 3 and MQTT 5) communication"*

⚠️ **但"兼容"要分层说清**：

| 层 | 混用时 |
| --- | --- |
| **应用层载荷**（主题 + 载荷） | ✅ **完整，不受版本影响** |
| **协议元数据**（`properties` / User Properties） | ⛔ **在 3.1.1 那一跳静默丢失** |

⇒ ⭐ **"5.0 能兼容混合"成立的前提是"不依赖协议元数据"。** 一旦依赖（如 trace），混用就会打折。

### 轴 9 · 没有后续触发点，现在就要兼容

✅ **这条把本项从"可延后"改成了"现在做"**。

⚠️ **两条连带影响**：
1. **增量 1 复盘里那条"若维持 3.1.1，则迁 5.0 登记 backlog"的规定不再适用**——决策不是"维持 3.1.1"，而是**现在就兼容两者**。
2. ⚠️ **"兼容"要落到"两版都覆盖"上**，而不是"保证不报错"——见轴 7（两版都测）与轴 4（混用的可观测性）。

⭐ **一条判据**：既然**没有触发点**，本项就**不能靠"将来再说"消化风险**，代价必须在**实现时**一次付清。⇒ **实现清单至少包含**：模拟器两版（轴 2）、E2E 跨版本用例（轴 7）、**混用可见性**（可由 EMQX 的 `proto_ver` 直接满足，§4.12——平台侧不必自建）。

### 轴 10 · 凭据的实际情况；5.0 下是否与从前一样

✅ **已查清并实测**（§4.11）：

| 问题 | 答案 |
| --- | --- |
| **现状** | 本项目**没有任何凭据**——EMQX 认证器为空、`MQTT_URL` 里没有账号密码、两端代码都没传 |
| ⭐ **5.0 下是否和以前一样** | **基本流程一样，只多了两样** |

- **一样**：怎么传 `username` / `password`、怎么校验、成功与失败的结果——**10 个用例实测两版完全一致**
- **多的第一样**：**失败原因码更细**——5.0 用标准 `0x86` / `0x87`；3.1.1 只有笼统的 `4` / `5`
- **多的第二样**：**password 可以是二进制**（3.1.1 是 UTF-8 字符串）

⭐ **额外查实一条**：**MQTT 5.0 增强认证（SCRAM）在 community 版可用**——实测在 `emqx/emqx:6.3.1` 上建成认证器并加入用户。
⚠️ 至此本项目已第三次遇到同一类教训：**"某版本有没有某能力"，能起容器就直接起，别用文档目录位置或 release 元数据推**。

⚠️ **补全一条**：**凭据形态的决定与协议版本的决定相互独立**——两个版本都支持同样的凭据形态（每设备凭据 / 共享凭据 / 证书），5.0 只是"**多给了选项**"。⇒ **两者可以分开做**。

⚠️ 但**两者同属"连上之前"的约定**（增量 1 的"必须先定"清单：协议版本 / 主题结构 / 凭据形态 / 上报频率），**都要在设备侧固化之前定**。

---

## 7. 待核实 / 待实测

| # | 项 | 怎么验 |
| --- | --- | --- |
| 1 | **EMQX 社区版**对 MQTT 5.0 增强认证的 **Kerberos** 变体是否可用（SCRAM 已实测可用） | 实测 |
| 4 | **现场常见工业设备的 MQTT 5.0 支持度** | ⚠️ **目前无任何来源**——需要在 P2 接触真实设备时采集 |
| 5 | `mqtt.js` 5.0 下 `resubscribe` / `autoUseTopicAlias` 等选项的默认行为 | 读源码或实测 |

✅ **已结案**：

- 「**EMQX 能否看出每条连接用的协议版本**」→ **能**。字段 **`proto_ver`**（3.1.1 → `4`，5.0 → `5`），零配置（§4.12，2026-10-09 实测）
- 「**混用下共享订阅的行为**」→ **正常**。5.0 与 3.1.1 订阅者混编于 `$share/` 下，10 条按 5/5 分派（§4.12）
- 「**`subscriptionIdentifier` 在订阅端能否拿到**」→ **能**（§4.12）
- 「**`clean` 在 5.0 下的确切语义**」→ 已由 **AWS 官方原文**（§4.9）与 **`mqtt.js` 类型定义**（附录 1）共同确定
- 「**增强认证 SCRAM 是否属企业版**」→ **不属**。实测在 `emqx/emqx:6.3.1`（`license type: community`）上建成 `scram:built_in_database` 认证器并加入用户（§4.11(c)）

---

## 8. 定稿：结论四件

> 十轴全部作答。按决策卡模板收口四件：**选定 / 代价陈述 / 退出成本 / 触发点**。

**① 选定**

```text
后端订阅端（nestjs-server）   protocolVersion = 5（MQTT 5.0）
                              —— 前置条件已核：5.0 订阅端解析 3.1.1 报文载荷完全无损（§4.3 P6.2 / P8）

模拟器（设备侧）              **两版并存** —— 一部分 3.1.1、一部分 5.0
                              · 用来模拟现场"不同时期 / 不同厂商协议不同"
                              · ⚠️ 「设备 ID ↔ 协议版本」的对应关系要**可见**（日志或接口）

对现场设备的要求              **允许混用，不强制统一**（实测两版可在同一监听器共存、载荷无损）

契约                          **不动**。主题与载荷是应用层约定，与协议版本无关（§4.5）
                              · 关联信息用**载荷里已有的 `deviceId` + `ts`**

追踪                          ⚠️ **本项不引入对 User Properties 的依赖**
                              —— MQTT 上分布式追踪**没有公认标准绑定**（§4.10）；
                                 且 User Properties 只在两端都是 5.0 时存在，与"允许混用"冲突

会话                          **`clean: false` + `properties.sessionExpiryInterval > 0`**（持久会话）
                              ⛔ 原定「`clean: true` 保持不变」已由 §9 改写——会话保留是
                                 BullMQ 挂掉时的第二道兜底；另：订阅请求 `{ qos: 1 }`，`clientId` 固定

测试                          **两个版本都覆盖**；且至少要覆盖 **「3.1.1 发布 → 5.0 订阅」** 这一跨版本组合
                              —— 那正是现场的实际形态

凭据                          ⛔ **本项不改**。现状是"接入不是认证"（无认证器、URL 无账号密码）
                              · 查实：**两版凭据基本流程一致**，5.0 只多了"原因码更细 + 二进制密码"（§4.11）
                              · ⇒ **凭据形态是另一个独立的决定**，本项不代它拍板

触发点                        ⭐ **没有触发点 —— 本项现在做**（决策人 2026-10-08）
```

⛔ **本项不决定的两件事**（同属"设备侧固化前必须定"，但各自独立）：
1. **凭据形态**（每设备凭据 / 共享凭据 / 证书）——增量 1 已把它列入"必须先定"，目前仍是空的
2. **要不要做"设备到平台"这一跳的追踪**——若要，需先定注入点在设备侧还是平台侧

**② 代价陈述（这套选择会怎么坏）**

| # | 失败模式 | 什么时候会咬人 |
| --- | --- | --- |
| 1 | ⭐ **混用下的静默降级**——`properties` 在 3.1.1 那一跳被丢弃、**不报错**；且 5.0 订阅端**分不清"对方没发"与"被丢弃"** | 一旦有任何逻辑去读 `properties` |
| 2 | **测试面翻倍**——两版并存 ⇒ 组合变多，**跨版本那一组最容易漏** | E2E 只测"各自能通"时 |
| 3 | **3.1.1 设备的能力上限是硬的**——拿不到标准原因码、二进制密码、User Properties | 平台侧若按 5.0 假设写逻辑 |
| 4 | **`clean` 两个版本同名不同源**——代码看起来一样，语义来源不同 | 将来有人改它、只想到一个版本时 |
| 5 | **凭据与版本都被"设备侧固化"锁住，但本项只定了版本** | 现场设备出厂后才发现凭据形态要改 |
| 6 | **没有触发点 ⇒ 风险不能后置**——所有代价必须在实现时一次付清 | 现在 |
| 7 | ⚠️ **EMQX 授权类型的判断本身就是坑**——`/nodes` 的 `edition` 报 `Enterprise`，实际 `license type` 是 `community` | 将来评估"某功能能不能用"时误判 |

**③ 退出成本（想换掉要付什么）**

| 换什么 | 代价 |
| --- | --- |
| **订阅端 5.0 → 3.1.1** | **零**——一行；但丢掉 5.0 侧的标准原因码与元数据能力 |
| **订阅端 3.1.1 → 5.0** | **零**——一行 |
| **模拟器两版 → 单版** | **低**——减一个输入维度；代价是失去混合环境的覆盖 |
| ⛔ **"允许混用" → "强制统一"** | **高且部分不可逆**——现场固件升级；**设备已出厂的部分收不回** |
| **明确依赖 User Properties 传 trace** | ⚠️ **等于放弃混用环境**——要么全厂 5.0，要么 trace 断链 |
| **契约（若要把关联信息落进载荷）** | **中**——契约变更需双端同步；但**属于可后补的"加值"** |
| **凭据形态（尚未定）** | **中~高**——取决于形态；同属"设备侧固化" |
| **EMQX 侧配置** | **零**——实测不用改任何配置 |

**④ 触发点**

> 本项**自身没有触发点**（现在就做）。下表登记的是**本项产生的新触发点**。

| 触发 | 回头改什么 |
| --- | --- |
| ⭐ **接入第一个真实设备时** | 把它的**协议版本记进设备档案**（增量 3）——这是"混用可见性"的最小落地 |
| ⭐ **要定凭据形态时** | 它与协议版本同属"连上之前"的约定 ⇒ **必须在设备侧固化之前定** |
| **要引入"设备→平台"这一跳的追踪** | 先定注入点（设备侧 / 平台侧），再决定是否需要 User Properties |
| **增量 3（物模型 / 设备注册）** | 设备档案里加**协议版本**字段 |
| **有人改动 `clean`** | 注意两个版本语义同名不同源 |
| **EMQX 升级或换部署形态** | 重核**授权类型**（别信 `edition` 字段）与 5.0 能力面 |

---

## 9. 订阅端的 QoS 与会话：能力最大化（2026-10-09 定）

> 起因：定"队列 Redis 挂掉时数据去哪"（增量 2 的队列层）时，追到了"**设备 → Broker 这一段有没有保证**"——而那是**增量 1 移交、增量 2 一直没接的那笔**（增量 1 原文："投递保证（QoS 0/1/2、持久会话、重复与幂等）**整体归增量 2**"；增量 2 只接了"幂等"那一半）。
> **本节改写 §2 的前置（QoS）、§4.6 的两条、§4.9 的结论、§11 选定里的 `clean`。**

### 9.1 边界：我们只能控制订阅端

⭐ QoS 的**两端不对称**（EMQX 官方原文）：

> "**When a subscriber specifies a maximum QoS level lower than the publisher's, the broker will downgrade the message QoS to match the subscriber's requested level.**"

```text
订阅端设的 QoS = "我最多能接受多少"（上限，只能降级）
设备设的 QoS   = "我提供多少保证"（真正决定保证在哪一段）
投递 = min(两者)
```

⇒ **订阅端能力最大化的上限 ＝ 设备已经发出来的东西**：能拿到设备愿意给的上限，**不能把设备发的 QoS 0 变得有保证**。

### 9.2 选定

| # | 项 | 值 |
| --- | --- | --- |
| 1 | **订阅请求** | **`{ qos: 1 }`** |
| 2 | **会话** | **`clean: false` + `properties.sessionExpiryInterval > 0`**（持久会话） |
| 3 | ⭐ **`clientId` 固定** | 现状是 `nestjs-server-${pid}` ⇒ **每次重启换一个会话**，前两条全白搭 |
| 4 | **幂等消费** | ✅ 已有（`(子表, ts)`，第 1 项 §3 轴 5） |

**为什么是 1、不是 2** ⭐：

| 设备发 | 请求 1 ⇒ 得到 | 请求 2 能不能更好 |
| --- | --- | --- |
| 0 | 0 | ⛔ 改不了 |
| 1 | 1 | ⛔ **QoS 不能升级** |
| 2 | 1（降级） | ⚠️ 能拿到 2，代价是 **4 次握手 + 吞吐约减半 + 订阅端维护状态**——**而重复对我们无害（幂等已就位），换不到我们还需要的东西** |

⇒ ⭐ **"订阅端能力最大化" ≠ "请求最高 QoS"，而是「请求 1」**——它同时对三种设备都取得"最佳可得"。

### 9.3 两条连带

**① `clientId` 固定 ⇒ 多实例会互踢**

MQTT 要求 `clientId` 唯一，同 clientId 的两条连接会互相踢——当初带 `${pid}` 正是为了多实例安全。

⇒ **固定之后，横向扩要用共享订阅** `$share/<group>/wewant/devices/+/telemetry`。
✅ EMQX 对 3.1.1 也支持 `$share/`（§4.4 实测过）⇒ 路通。**P1 单实例用不上，但要记下。**

**② 持久会话重连会灌一波积压**

订阅端离线一段时间后重连，Broker 把攒住的 QoS 1 消息一次投来 → 一波突发。
⭐ **而 BullMQ 队列正好吸收它**——队列把突发摊平。**两件事天然配合，不用额外做。**

### 9.4 设备混用 QoS 会影响容量

设备侧用 0 / 1 / 2 都可能（我们控制不了）。⚠️ **QoS 2 拉低 Broker 总吞吐**——同一实例的官方基准：**QoS 0 → 60K TPS，QoS 1 → 40K TPS，QoS 2 → 20K TPS**。
⇒ **挂容量触发点**（增量 6 压测时按真实的混用比例重算）。

### 9.5 本节改写的四处

它们原先都以"**用 QoS 0、不依赖 Broker 攒消息**"为前提：

| 原结论 | 改写后 |
| --- | --- |
| §4.6「**流控（Receive Maximum）** ❌ 用不上 \| 用 QoS 0，不涉及在途确认窗口」 | ⚠️ **变得相关**——订阅端成了 QoS 1 的接收者，在途确认窗口存在 |
| §4.6「**Message Expiry Interval** ❌ 用不上 \| QoS 0 直通，无排队消息」 | ⚠️ **变得相关**——持久会话下会有积压消息 |
| §4.9「**我们根本用不上会话保留**——数据靠 BullMQ 缓冲、且用 QoS 0」 | ⛔ **反了**——会话保留正是**第二道兜底**（BullMQ 挂掉时） |
| §11 选定「`clean: true` **保持不变**」 | ⛔ **改为 `clean: false` + Session Expiry > 0** |

⚠️ **代码改动不在本轮**——随增量 2 的实施计划一起做（订阅端三处：`subscribe` 的 `qos`、`connect` 的 `clean` 与 properties、`clientId`）。

---

## 附录：出处

| # | 内容 | 来源 |
| --- | --- | --- |
| 1 | `mqtt@5.16.0` 的 `IClientOptions`：`protocolVersion?`、**只有 `clean`（无 `cleanStart`）**、`properties?`（CONNECT / PUBLISH / SUBSCRIBE / UNSUBSCRIBE 四处）、`autoUseTopicAlias`、`autoAssignTopicAlias`、`resubscribe`、`subscribeBatchSize`、`servers[]`；`serverProperties` getter | 本机 `node_modules/.pnpm/mqtt@5.16.0…/build/lib/client.d.ts`（2026-10-08） |
| 2 | **EMQX 的 MQTT 5.0 特性支持**：Retained（"full support … in compliance with MQTT 5.0"）、Will Delay Interval、**Request/Response（Response Topic + Correlation Data）**、**User Properties**、Topic Alias、Payload Format Indicator & Content Type、Reason Codes、**Maximum Packet Size**；⚠️ **共享订阅对 3.1.1 客户端亦扩展支持**（原文：*"even extends compatibility to MQTT 3.1.1 clients … just by using the `$share/{group}/{topic}` format"*） | `docs.emqx.com/en/emqx/latest/get-started/mqtt-advanced.html`（2026-10-08） |
| 3 | **MQTT 5.0 增强认证（SCRAM / Kerberos）** 条目出现在 EMQX **Enterprise** 文档目录 | 同上（侧边栏） |
| 4 | **本机实测（`mqtt@5.16.0` + `emqx/emqx:6.3.1`，未改 EMQX 配置）**：**P0–P8 共 15 项**（含跨版本矩阵 P6.1–P6.4），见 §4.3。探针 `apps/iot-simulator/scripts/mqtt-protocol-probe.mjs` | 本机（2026-10-08） |
| 5 | **本仓库现状三处均未设 `protocolVersion`** | `apps/iot-simulator/src/device.ts:20`、`apps/nestjs-server/src/modules/iot/telemetry/telemetry-subscriber.service.ts:56`、`apps/nestjs-server/test/iot.e2e-spec.ts:53` |
| 6 | **本项由增量 1 验收复盘提出**，含"不是我们决定用 3.1.1，而是没人决定过"的定性与 backlog 登记要求 | 知识库《增量1-验收复盘（MQTT 设备接入）》「遗留」一节 |
| 7 | **MQTT 5.0 七项新特性及其用途**（Reason Codes / Session Expiry Intervals / Topic Aliases / User Properties / Subscription Options / Request-Response / Shared Subscription）+ 迁移清单（升级 Broker → 升级客户端库 → 处理安全 → 迁移后监控） | `emqx.com/en/blog/introduction-to-mqtt-5`（2026-10-08，标题即《MQTT 5.0: 7 New Features and a Migration Checklist》） |
| 8 | ⭐ **AWS IoT Core 的跨版本通信**：原文 *"AWS IoT Core also supports **cross MQTT version (MQTT 3 and MQTT 5) communication**. An MQTT 3 publisher can send an MQTT 3 message to an MQTT 5 subscriber that will be receiving an MQTT 5 publish message, and vice versa."*；其 **MQTT 5 支持面** = 共享订阅 / Clean Start 与会话过期 / **所有 ACK 带原因码** / 主题别名 / 消息过期 / 其他；⚠️ **"AWS IoT Core supports shared subscriptions for both MQTT 3.1.1 and MQTT 5"**；**Clean Start 会话语义定义**（*"Clean Start controls the beginning of the connecting session and the end of the previous session"* / *"Session Expiry Interval controls the end of the connecting session"*，未指定时默认 0） | `docs.aws.amazon.com/iot/latest/developerguide/mqtt.html`（2026-10-08） |
| 9 | ⛔ **OpenTelemetry 的 messaging 语义约定未覆盖 MQTT**——技术特定约定只有 Kafka / RabbitMQ / RocketMQ / SNS / SQS / Google Cloud Pub/Sub / Azure Service Bus / Azure Event Hubs | `opentelemetry.io/docs/specs/semconv/messaging/`（2026-10-08） |
| 10 | **W3C Trace Context 定义的是 HTTP 头**（`traceparent` / `tracestate`）；对非 HTTP 协议，第 5 节原文：*"While trace context **is defined for HTTP**, the authors acknowledge it is also relevant for other communication protocols. **Extensions of this specification, as well as specifications produced by external organizations**, define the format of trace context serialization and deserialization for other protocols."* | `w3.org/TR/trace-context/`（2026-10-08） |
| 11 | ⭐ **确认本项目 EMQX 的授权类型是 community**：`emqx ctl license info` 显示 **`type: community`**（`customer: Developer` / `deployment: Development` / `expiry: false`）。⚠️ **但 `GET /api/v5/nodes` 的 `edition` 字段报 `Enterprise`** ⇒ **该字段不能用来判断授权类型** | 本机 `emqx/emqx:6.3.1` 容器实测（2026-10-08） |
| 12 | **凭据实测（10 项）**：在一个**独立**临时 EMQX 上配「密码认证器（内置数据库）+ 用户 `dev1/secret123`」后测 3.1.1 × 5.0 × {无凭据 / 正确 / 错误密码 / 不存在用户 / 二进制密码 / 带认证方法属性}。**结论**：基本流程两版一致；差别只在失败原因码（3.1.1 `code 4`/`5` vs 5.0 `code 134`＝**0x86** / `135`＝**0x87**）；**5.0 支持二进制密码**；**带 `authenticationMethod` 而 Broker 无对应认证器 → 被拒（`135`）**；⚠️ **SCRAM 认证器在 community 版可建成并加用户** | `apps/iot-simulator/scripts/mqtt-credential-probe.mjs`（2026-10-08） |

⚠️ **探针位置的说明**：`mqtt` 依赖按 catalog 规则只属于 `apps/iot-simulator`，仓库根没有——Node 从脚本所在目录向上解析依赖，所以该探针**不能**放 `scripts/probe/`。
