---
status: living
covers:
  - apps/iot-worker/
last_verified: 2026-11-08
---

# 遥测消费者（iot-worker）

`apps/iot-worker` 是与 HTTP 服务并列的第二个运行时：不用 Nest、不开 HTTP，从 BullMQ 队列取原始报文，按业务 Redis 的档案快照解析 / 过滤 / 攒批后写入 TDengine。可独立启停、多实例、扩缩，不碰 PostgreSQL。

订阅端、注册路径与 HTTP 契约见 [backend.md](backend.md)；主题、载荷与队列名契约见 [contracts.md](contracts.md)；选型与缓冲边界见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md)、[ADR-010](../decisions/ADR-010-ingest-buffer-bullmq.md)。

## 消费环

- 配置 `apps/iot-worker/src/config.ts`（zod）、结构化日志（pino）、优雅停机（SIGINT/SIGTERM → 先落库再 `worker.close()`，末尾 `destroyTd()` 释放连接器持有的全局资源）。
- 不碰 PG，容器无 migrate / seed。
- worker env：`QUEUE_REDIS_URL` / **`REDIS_URL`（业务缓存，必填，档案快照来源）** / `TDENGINE_URL` / `TDENGINE_TIMEZONE` / `TDENGINE_CONNECTIONS`（2~4，默认 2）。
- 批处理 env：`INGEST_BATCH_SIZE` / `INGEST_FLUSH_INTERVAL_MS` / `INGEST_CONCURRENCY` / `INGEST_TS_MAX_FUTURE_MS`（默认 86400000，+24 h）/ `INGEST_TS_MAX_PAST_MS`（默认 7776000000，−90 d）。
- 降采样与快照 env：`DOWNSAMPLE_ENABLED` / `DOWNSAMPLE_LOOKBACK_WINDOWS` / `REGISTRY_POLL_MS`（默认 500）/ `REGISTRY_STALE_ALERT_MS`（默认 60000）。
- ⭐ `INGEST_BATCH_SIZE` 上限 **32767**（单次 `bind` 的行数硬上限 = 2¹⁵−1，探针实测）——超出会在写入时才抛 `bind number out of range`，故配置层启动即挡下、写入层再兜一道。
- ⭐ **冷启动门禁**：`index.ts` 先 `await snapshot.start()`，拉不到快照就退避重试、**不启动消费环与降采样环**。用空快照跑会把全部数据当 `unknown-device` 丢掉，且计数看起来像设备故障；队列积压比静默丢数据好。
- 消费端**无限等待**（`maxRetriesPerRequest:null`，BullMQ 阻塞读命令不能因超时中断）；`INGEST_CONCURRENCY` 同时是"一批最多攒多少条"，攒够 `INGEST_BATCH_SIZE` 或到 `INGEST_FLUSH_INTERVAL_MS` 即 flush。
  TDengine 写入走一个**连接池**（`TDENGINE_CONNECTIONS` 条，写入按轮转分发）——一条连接挂掉只作废那一条，不全链路停摆。
- **入库成功才 ack**：一批的写入结果统一兑现那批 job 的 ack——**写入失败、或 `getLastAffected()` 合计少于提交行数（"部分成功"）都整批 reject**（`getLastAffected` 不给行级定位，做不到"丢失败那行、ack 其余"；批内先按 `(子表, ts)` 去重，否则同 ts 覆盖会被误报成部分失败）。
  失败按错误码 / 报文形态分两类（`apps/iot-worker/src/failure.ts`）：**A 类**（连接 / 超时）原样抛回队列、整批重投——重投安全靠幂等（`(子表, ts)` 覆盖使已成功的行不会被重复写），其中**读超时"可能已成功"也必须重试**、不能丢弃；
  **B 类**（格式 / 权限 / 表结构）重试无意义，抛 BullMQ `UnrecoverableError` **直接进 failed 集合**（＝"待人工看"）并告警带错误码。
  ⭐ `Table does not exist` 走**提级**告警（级别高于其它 B 类）——正常路径（预建 + 不带 `USING`）下它不该出现，一旦出现即建表遗漏或命名逻辑 bug。
  ⭐ **作废连接只在连接级错误**（`failure.connectionLevel`，实测 108 / 104）——超时（`0x80000019` / `105`，"可能已成功"）、连接数上限（`110`）、判不出形态的默认桶都是 A 类却**不证明连接坏了**，不得作废；
  作废粒度是**失败的那一条**连接（池内其余连接不陪葬），且先把仍未关的连接 `close()` 再置空引用（否则泄漏一条活连接）。
  ⭐ 另有一条**有界兜底**：同一格**连续失败**达阈值（2 次）即作废重连，**成功或作废/重连后都清零**——兜住"连接坏了但报的不是连接级码"的半开连接（单次瞬时错仍不作废）。
- **报文解析顺序**（`consumer.ts` → `detection.ts` / `resolve.ts` / `filter.ts`）：
  - `parseEnvelope` 只做 JSON / 顶层 / 字段存在性校验。
  - **时间戳边界**（`clockOutOfRange`）：`ts` 超前 `now + INGEST_TS_MAX_FUTURE_MS` 或落后 `now − INGEST_TS_MAX_PAST_MS` 即整条丢弃，闭区间放行。
  - `resolvePoint` 按**数据自己的 `ts`** 在快照里判定设备 usage 与模型版本区间（半开 `[from, to)`）。
  - `filterByDeclaration` 按该时刻的声明过滤测点。
  - 时间戳边界排在查档之前：越界与设备是否存在无关，先挡可避免把错钟设备计成 `unknown-device`。
  - 错钟设备会让每条报文都越界，故按秒打一条 warn（条数与设备数），逐条细节降为 debug。
  - ⚠️ 先解析身份与 `ts`、再查档：未知设备与越界 `ts` 都能带上 `localDeviceId` 打日志。
  - 测点集合、类型与量程**全部来自物模型声明**，没有全局测点常量。
  - `float` / `double` / `int` / `bigint` 校验数值与 `range`（缺省不校验）；`bool` 收布尔；`enum` 收整数且必须命中 `enumValues`。
  - `string` / `struct` 按 UTF-8 字节数 ≤ `varcharLength` 拒收（不截断）；绑定类型取声明档位（`bool` / `int` 已补进写入器的 `ColumnKind`）。
  - **单位逐字比较**（`property.unit ?? ''`）：不符时**整条样本丢弃**（量纲解释整体不可信），不只丢那个测点；过滤后一个测点不剩也丢整条。
  - 计数分列：整条拒收总数 `rejected`，按原因分列 `clockOutOfRange` / `unknownDevice` / `outOfRangeTs` / `unitMismatch` / `emptyAfterFilter`；测点级 `metricNotInModel` / `metricInvalidValue`；批内去重另计 `duplicateInBatch`。
- **物模型与降采样列**：模型的声明结构、校验与列推导在 `packages/device-registry`（`model-types` / `model-validate` / `model-derive`），由 **server** 消费；
  worker 只读快照里**预推导好的** `rawColumns` / `dsColumns`（列名 + 绑定类型），不再自己推导——列类型随档位变（`min`/`max` 对 bool 是 `BOOL`），按聚合名硬编码类型不成立。
- 队列名 `iot-telemetry-ingest`、Redis 键前缀 `wewant` 由 contracts 的 iot 段一处定义——两端分属不同应用，名字必须同源。⚠️ BullMQ 用 `:` 作 Redis 键分隔符，队列名含冒号构造即抛，故分隔符用 `-`。
- **降采样环**（本进程内与消费环并列的第二条链路，`apps/iot-worker/src/downsample/`）：**不用 TDengine 流**——本机实测 3.4.2.8 的流会把每个窗口的聚合复制给全部输出子表（选型与依据见 [降采样设计](../tasks/archive/2026-10-07-iot-p1-increment-2/2026-10-12-downsample-design.md)）。
  改由本进程的 BullMQ Job Scheduler 触发，每次**重算最近 K 个已闭合窗口**（`DOWNSAMPLE_LOOKBACK_WINDOWS`）——只依赖墙上时钟、不记游标，晚到数据落在最近 K 个窗口内即被自愈。
  三级 `1m`/`1h`/`1d` **平级**、各自一条调度，都从各自模型编码对应的原始超表算（`rawStableName(modelCode)`），互不依赖；`1d` 业务日从 08:00 起（读查询 `INTERVAL(1d, 8h)`，窗口边界算术与之同源）。
  ⭐ **模型与列清单每 tick 从快照取**（不是构造时快照一次）：新模型注册后本进程自己就能参与计算，不必重启。
  写入到预建的降采样子表（`{模型编码}_{deviceId}_{level}`），幂等键仍是 `(子表, ts)`；其**读侧**连接级读错即丢 reader，非连接级（确定性 SQL / 解析错）**单次不丢、连续两次才丢**——兜住半开连接又不因一次瞬时错白重连；写出侧同理（连接级即作废，同一格连续两次也作废）。
  ⭐ **单写者**：降采样环只有 leader 才持有——follower 每 20 s 尝试 `SET NX PX 180000` 抢锁，leader 每 20 s 续期（Lua 比较 value），续期失败立即关闭环转回 follower；锁放**队列 Redis**（调度本来就在 BullMQ 上）。
  `DOWNSAMPLE_ENABLED=false` 只跑消费环（排障用）。⭐ 其队列名 `iot-telemetry-downsample` **就地定义在本应用**、不进 contracts——调度注册与消费都在本进程内，没有第二个应用引用它（与跨应用的 `iot-telemetry-ingest` 相对）。
- **健康检查**：进程每 10 s 向队列 Redis 写心跳键 `wewant:worker:hb:<容器主机名>`（TTL 30 s），compose 的 healthcheck 跑 `node dist/healthcheck.js` 读该键。
  它只反映**事件环停摆**与**队列 Redis 不可达**，不反映消费进度（消费卡住但事件环正常时仍报健康）；⚠️ compose 不会因 unhealthy 自动重启，这是可见信号，并为 K8s 的 liveness 铺路。

## 档案快照

worker 的档案来源是**业务 Redis 的一份全量快照**（`RegistrySnapshot`），不是编译期常量、也不直连 PG。五个键各司其职：

| 键 | 谁写 | 含义 |
| --- | --- | --- |
| `iot:registry:rev` | 写路径 `INCR`（PG 事务提交之后） | **期望**版本——变更发生了 |
| `iot:registry:built` | 重建器条件写 | **已建**版本——快照里是哪一版 |
| `iot:registry:snapshot` | 重建器条件写 | 载荷（档案 + 模型声明 + 量程，含预推导列清单） |
| `iot:registry:rebuild-lock` | 重建器 `SET NX PX 2000` | 只降低重复劳动 |
| `iot:registry:worker-version:{instanceId}` | worker，TTL 30 s | 实例当前应用的版本，供跨实例版本可见性验收 |

- **server 重建器**（`apps/nestjs-server/src/modules/iot/registry-snapshot/`）每 500 ms 一轮：键或快照缺失、`rev > built`、或距上次成功满 **60 秒**即重建（60 秒是正确性的一部分——PG 提交后 `INCR` 前崩溃时只有它能补）。
  **先读 `rev` 再读库**；条件写用 Lua 保证版本不倒退，版本相等时只有 payload 还在才跳过。兜底重建写 `max(rev, built) + 1` 并把 `rev` 抬到同一版本——等版本写入会被条件写拒掉，兜底否则发布不出去。任一列推导失败 ⇒ **整轮失败**，不发布半份快照。
- **worker 客户端**（`apps/iot-worker/src/snapshot/client.ts`）每 `REGISTRY_POLL_MS` 读 `built`，**与本地版本不同**即拉全量并整份替换（Redis 全量重置后版本从 0 重新计数，用「大于」会停在旧快照）；
  换入时同时建 `byLocalId` / `byModelCode` 索引（`resolvePoint` 不做线性扫）。
  拉取失败保留旧快照继续跑并累加陈旧秒数，超过 `REGISTRY_STALE_ALERT_MS` 升为 error。
- **口径按数据的时间戳**：一条数据属于哪个模型 / 版本由它自己的 `ts` 决定，与处理时刻无关；区间取半开 `[from, to)`。这同时消除晚到数据、BullMQ 重试与多实例不同步三类不可追溯错误。
- ⚠️ 档案与模型**必须同时替换**——分开刷新必然出现「档案已新、模型还旧」的窗口。

TDengine 库表 / 降采样子表与建库脚本见 [ops-scripts.md](../operations/ops-scripts.md) 与 `apps/iot-worker/scripts/tdengine-init.ts`。

降采样**逐条对账**脚本 `apps/iot-worker/scripts/downsample-verify.ts`（判据②，逐字段比原始聚合与降采样行）见 [build-and-verify.md](../engineering/build-and-verify.md)。

## 交付判据与验收口径

- **判据① 落库可见**：`wewant_iot` 里能 `SELECT` 到设备上报数据。双证据＝TDengine 查询结果 + 订阅端每秒聚合日志（入队 / 落缓冲 / 丢弃 / 无法读取编号 / 设备数）。
- **判据② 降采样**：`p1_1m` **逐条对账**——每个 `(子表, 窗口)` 的 sum/count/min/max 与原始表同子表同窗口的聚合逐字段相等，K 契约区内差异必须为 0；各模型的三条输出表存在且非空（1h / 1d 不做数据级对账，正确性靠与 1m 同一套 `level` / `query` / `rows` 代码路径）。
  ⚠️ 对账脚本按**墙上时钟**取窗口；任一侧计数为 0，脚本**判失败**（「空对账不构成证据」），不会拿 0 组比出 0 差异冒充通过——复算历史段用 `--now <数据最后时间戳>`。
- **判据③ 重投不丢**：强杀消费者后重启，行数与内容一致。断言的是「不丢」；「不重」由 `(子表, ts)` 覆盖语义结构保证、不可观测。⚠️ 恢复时长由 BullMQ 默认 `lockDuration` / `stalledInterval`（各 30 s）决定，约 61 s——是默认值的函数，不是实现里调过的参数。
- ⚠️ **K 是自愈窗口的唯一来源**：环只重算最近 K 个已闭合窗口、不记游标 ⇒ 晚到数据或 worker 停机**超过 K × 窗口**的部分**永久缺失且不报错**（1m 3 分钟 / 1h 3 小时 / 1d 3 天）。排障时先想这条，再去看日志。
