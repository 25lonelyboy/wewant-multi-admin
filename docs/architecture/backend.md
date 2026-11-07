---
status: living
covers:
  - apps/nestjs-server/
  - apps/iot-worker/
last_verified: 2026-11-07
---

# NestJS 后端架构

`apps/nestjs-server` 的模块分层、请求链、API 约定与数据库事实。技术选型决策见 [ADR-004](../decisions/ADR-004-contracts-and-backend-stack.md)，前后端契约见 [contracts.md](contracts.md)，测试与覆盖率流水线见 [build-and-verify.md](../engineering/build-and-verify.md)。

## 模块分层

```text
src/
├── config/          # AppConfigModule（@Global）：Zod 校验 env → AppConfigService 类型安全访问
├── common/          # 横切关注点
│   ├── bootstrap/   # applyAppDefaults：全局前缀 / helmet / 请求体大小限制（json） / ValidationPipe / CORS / Swagger / shutdown 钩子（main.ts 与 e2e 共用）
│   ├── filters/     # AllExceptionsFilter → 统一错误响应格式
│   ├── guards/      # JwtAuthGuard（全局）→ PermissionsGuard（RBAC 权限点）
│   ├── interceptors/# ResponseEnvelopeInterceptor → { code, message, data } 信封
│   ├── decorators/  # @Public() @RequirePermissions() @CurrentUser()
│   ├── errors/      # BizException 业务错误体系（BizCode 枚举定义在 packages/contracts）+ exception-resolver
│   ├── redis/       # RedisModule：ioredis 单例，快速失败，3s 竞速 quit
│   ├── throttler/   # RedisThrottlerGuard/Storage：限流走 Redis 后端（跨实例一致）
│   ├── logging/     # AppLoggerModule：nestjs-pino，dev=pretty / prod=JSON
│   ├── middleware/  # request-id 中间件（X-Request-Id 或自生成 UUID）
│   └── types/       # 共享类型声明
├── database/        # PrismaModule（@Global）：PrismaService 生命周期管理
├── modules/
│   ├── auth/        # 认证域：LocalStrategy + JwtStrategy + TokenService（双令牌轮换）
│   ├── system/      # RBAC 三域 CRUD：user / role / menu（软删除，两张关联表物理维护）
│   ├── iot/         # 设备接入域：MQTT 订阅 + 轻量解析 + 投队列（消费者在 apps/iot-worker，见下）
│   └── health/      # /health 探针（DB + Redis），不受全局前缀约束
└── generated/       # prisma generate 产物（git-ignored）
```

## 请求处理链

`requestId 中间件 → helmet（非生产关 CSP，Swagger UI 依赖内联脚本）→ 请求体解析（路由级 UPLOAD_BODY_LIMIT 优先于全局 BODY_LIMIT）→ CORS（逗号分隔多来源）→ RedisThrottlerGuard → JwtAuthGuard → PermissionsGuard → ValidationPipe(whitelist+transform，自定义 exceptionFactory 展开字段级校验明细) → Controller`，响应经 `ResponseEnvelopeInterceptor` 封装。

守卫先于管道执行（Nest 的固定顺序）：未认证请求携带非法 body 时先被 `JwtAuthGuard` 拦下返回 401，不会走到校验环节的 400。

## 设备接入链路（iot 域）

HTTP 之外的第二条入口，不经全局前缀与守卫链；整条链路跨两个应用：

```text
设备/模拟器 → TCP 1883 → EMQX
    → TelemetrySubscriberService（订阅 wewant/devices/+/telemetry，轻量解析 + 投队列）
    → BullMQ（redis-queue 实例）→ apps/iot-worker 消费者 → TDengine（库 wewant_iot）
```

### 订阅端（`apps/nestjs-server` 的 iot 域）

- 职责是**订阅 + 轻量解析 + 投队列**：解析只取 `localDeviceId`（喂设备在线视图、拦身份不一致），随后把**原始载荷**投进队列——**入队在解析之前**，重投即原样重投；完整解析 / 校验 / 计数在消费者。生产者构造不 ping、不 await 下游。
- 主题与载荷契约定义在 `packages/contracts` 的 iot 段（`telemetryTopic` / `TELEMETRY_TOPIC_FILTER` / `TelemetryPayload`），模拟器、订阅端与消费者消费同一份，不在应用内各自写常量。
- 连接串为 `MQTT_URL`（默认 `mqtt://127.0.0.1:1883`，容器内为 `mqtt://emqx:1883`）；QoS 1、`clean:false` + `sessionExpiryInterval`（`MQTT_SESSION_EXPIRY_SECONDS`），`clientId` 固定（`MQTT_CLIENT_ID`）——固定才能用上持久会话。`MQTT_CLEAN_SESSION=true` 改为**干净起始**（Broker 丢弃同 clientId 的既有会话与其排队报文）：e2e 用它甩掉上一轮遗留的 QoS1 积压，避免旧报文混进本轮计数断言；缺省 `false` 保留生产口径。
- **身份校验**：主题段与载荷 `localDeviceId` 不一致 ⇒ **丢弃 + 计数 + 告警**（主题是将来 ACL 的授权单位，身份却以载荷为准；不拦的话，一个已授权设备可在自己的主题上发别人的编号，数据落进别人的子表）；`JSON.parse` 失败 ⇒ **原样入队**，由消费者计数。
- **报文上限**：单条载荷超过 `IOT_MAX_MESSAGE_BYTES`（默认 256 KiB）时，订阅端在 `toString` / `JSON.parse` **之前**按 `payload.byteLength` 直接拒收并计入 `oversized`——上限保护的是进程内存与 CPU，不只是队列；生产者 `send()` 再按字节兜一道（覆盖所有调用方），补投 `drainSpill()` 同样过闸。返回独立去向 `oversized`——入队与落本地两条路都被覆盖，队列不可达时超限报文也不会绕过校验落进缓冲。⚠️ 它是**去向**不是 `dropped` 的子集：丢弃是「缓冲满 / 落盘失败」，超限是「报文本身不合格」。EMQX 的 `max_packet_size` 保持默认 1 MB 作硬顶，**刻意不调到 256 KiB**——留出 256 KiB–1 MB 这一段，误配置的设备才能被应用侧计数到。超限日志每满 1 秒一条 warn（本秒 / 累计条数），逐条细节降为 debug。
- **队列不可达不阻断启动**：生产者以 `enableOfflineQueue:false` 快速失败，入队失败即**落本地磁盘缓冲**（`IOT_SPILL_DIR`，FIFO、投成功才删）；缓冲体积超 `IOT_SPILL_MAX_BYTES`（默认 256 MiB）⇒ **告警并进入丢弃态**：`overflowed` 一旦置真即锁存，`send()` 在**尝试入队之前**就返回 `dropped`，补投成功也不复位，恢复唯一途径是重启进程。⚠️ 因此溢出后的形态是「继续订阅、新报文全丢」，已落盘的存量仍按序补投——不是「停订阅」。队列 Redis 是独立实例（`QUEUE_REDIS_URL`）——BullMQ 要求 `noeviction`，而该策略是实例级的，业务缓存恰好希望有淘汰。
- **Broker 不可达不阻断启动**：连接失败只记 warn 并交 mqtt.js 自动重连。server 镜像冒烟与 CI 的 `docker-build` / `e2e-web-real` 两条 job 都在没有 EMQX 的情况下启动本应用。
- 日志每秒一行聚合，**按去向分列**——入队 / 落缓冲 / 丢弃 / 超限 / 无法读取编号 / 设备数，命中不一致时再附拦截数。⭐ 去向即计数口径：队列不可达落本地缓冲、缓冲超限或落盘失败而丢弃的报文**都不算"入队"**，否则读数虚高；「无法读取编号」（JSON 解析失败，或 `localDeviceId` 缺失 / 非字符串 / 空串）的报文原样入队，其条数**与去向正交**，并列为独立一列（不是某个去向的括号附注）。聚合行即接入链路的观测证据，逐条打印在百级设备下不可读。

### 消费者（`apps/iot-worker`）

- 独立运行时：**不用 Nest、不开 HTTP**，与 server 并列的第二个进程，可独立启停 / 多实例 / 扩缩；配置 `apps/iot-worker/src/config.ts`（zod）、结构化日志（pino）、优雅停机（SIGINT/SIGTERM → 先落库再 `worker.close()`，末尾 `destroyTd()` 释放连接器持有的全局资源）。它不碰 PG，容器无 migrate / seed。worker 的 env 为 `QUEUE_REDIS_URL` / **`REDIS_URL`（业务缓存，必填，档案快照来源）** / `TDENGINE_URL` / `TDENGINE_TIMEZONE` / `TDENGINE_CONNECTIONS`（2~4，默认 2）/ `INGEST_BATCH_SIZE` / `INGEST_FLUSH_INTERVAL_MS` / `INGEST_CONCURRENCY` / `INGEST_TS_MAX_FUTURE_MS`（默认 86400000，+24 h）/ `INGEST_TS_MAX_PAST_MS`（默认 7776000000，−90 d）/ `DOWNSAMPLE_ENABLED` / `DOWNSAMPLE_LOOKBACK_WINDOWS` / `REGISTRY_POLL_MS`（默认 500）/ `REGISTRY_STALE_ALERT_MS`（默认 60000）。⭐ `INGEST_BATCH_SIZE` 上限 **32767**（单次 `bind` 的行数硬上限 = 2¹⁵−1，探针实测）——超出会在写入时才抛 `bind number out of range`，故配置层启动即挡下、写入层再兜一道。
- ⭐ **冷启动门禁**：`index.ts` 先 `await snapshot.start()`，拉不到快照就退避重试、**不启动消费环与降采样环**。用空快照跑会把全部数据当 `unknown-device` 丢掉，且计数看起来像设备故障；队列积压比静默丢数据好。
- 消费端**无限等待**（`maxRetriesPerRequest:null`，BullMQ 阻塞读命令不能因超时中断）；`INGEST_CONCURRENCY` 同时是"一批最多攒多少条"，攒够 `INGEST_BATCH_SIZE` 或到 `INGEST_FLUSH_INTERVAL_MS` 即 flush。TDengine 写入走一个**连接池**（`TDENGINE_CONNECTIONS` 条，写入按轮转分发）——一条连接挂掉只作废那一条，不全链路停摆。
- **入库成功才 ack**：一批的写入结果统一兑现那批 job 的 ack——**写入失败、或 `getLastAffected()` 合计少于提交行数（"部分成功"）都整批 reject**（`getLastAffected` 不给行级定位，做不到"丢失败那行、ack 其余"；批内先按 `(子表, ts)` 去重，否则同 ts 覆盖会被误报成部分失败）。失败按错误码 / 报文形态分两类（`apps/iot-worker/src/failure.ts`）：**A 类**（连接 / 超时）原样抛回队列、整批重投——重投安全靠幂等（`(子表, ts)` 覆盖使已成功的行不会被重复写），其中**读超时"可能已成功"也必须重试**、不能丢弃；**B 类**（格式 / 权限 / 表结构）重试无意义，抛 BullMQ `UnrecoverableError` **直接进 failed 集合**（＝"待人工看"）并告警带错误码。⭐ `Table does not exist` 走**提级**告警（级别高于其它 B 类）——正常路径（预建 + 不带 `USING`）下它不该出现，一旦出现即建表遗漏或命名逻辑 bug。⭐ **作废连接只在连接级错误**（`failure.connectionLevel`，实测 108 / 104）——超时（`0x80000019` / `105`，"可能已成功"）、连接数上限（`110`）、判不出形态的默认桶都是 A 类却**不证明连接坏了**，不得作废；作废粒度是**失败的那一条**连接（池内其余连接不陪葬），且先把仍未关的连接 `close()` 再置空引用（否则泄漏一条活连接）。⭐ 另有一条**有界兜底**：同一格**连续失败**达阈值（2 次）即作废重连，**成功或作废/重连后都清零**——兜住"连接坏了但报的不是连接级码"的半开连接（单次瞬时错仍不作废）。
- **报文解析顺序**（`consumer.ts` → `detection.ts` / `resolve.ts` / `filter.ts`）：`parseEnvelope` 只做 JSON / 顶层 / 字段存在性校验 → **时间戳边界**（`clockOutOfRange`）→ `resolvePoint` 按**数据自己的 `ts`** 在快照里判定设备 usage 与模型版本区间（半开 `[from, to)`）→ `filterByDeclaration` 按该时刻的声明过滤测点。时间戳边界取闭区间（恰好等于上下界放行）：`ts` 超前 `now + INGEST_TS_MAX_FUTURE_MS` 或落后 `now − INGEST_TS_MAX_PAST_MS` 即整条丢弃，计入独立的 `clockOutOfRange`（与「`ts` 不落在 usage 区间」的 `outOfRangeTs` 是两个原因）；它排在查档之前——越界与设备是否存在无关，先挡可避免把错钟设备计成 `unknown-device`。错钟设备会让每条报文都越界，故按秒打一条 warn（条数与设备数），逐条细节降为 debug。⚠️ 顺序与旧版相反（旧版先按编译期常量检测再查档），因此未知设备与越界 `ts` 都能带上 `localDeviceId` 打日志。测点集合、类型与量程**全部来自物模型声明**，没有全局测点常量：`float`/`double`/`int`/`bigint` 校验数值与 `range`（缺省不校验）、`bool` 收布尔、`enum` 收整数且必须命中 `enumValues`、`string`/`struct` 按 UTF-8 字节数 ≤ `varcharLength` 拒收（不截断），绑定类型取声明档位（`bool` / `int` 已补进写入器的 `ColumnKind`）。**单位逐字比较**（`property.unit ?? ''`）：不符时**整条样本丢弃**（量纲解释整体不可信），不只丢那个测点；过滤后一个测点不剩也丢整条（避免写出只有 `ts` 的空行）。计数分列：`clockOutOfRange` / `unknownDevice` / `outOfRangeTs` / `metricNotInModel` / `metricInvalidValue` / `unitMismatch` / `emptyAfterFilter`。
- **物模型与降采样列**：模型的声明结构、校验与列推导在 `packages/device-registry`（`model-types` / `model-validate` / `model-derive`），由 **server** 消费；worker 只读快照里**预推导好的** `rawColumns` / `dsColumns`（列名 + 绑定类型），不再自己推导——列类型随档位变（`min`/`max` 对 bool 是 `BOOL`），按聚合名硬编码类型不成立。
- 队列名 `iot-telemetry-ingest`、Redis 键前缀 `wewant` 由 contracts 的 iot 段一处定义——两端分属不同应用，名字必须同源。⚠️ BullMQ 用 `:` 作 Redis 键分隔符，队列名含冒号构造即抛，故分隔符用 `-`。
- **降采样环**（本进程内与消费环并列的第二条链路，`apps/iot-worker/src/downsample/`）：**不用 TDengine 流**——本机实测 3.4.2.8 的流会把每个窗口的聚合复制给全部输出子表（选型与依据见 [降采样设计](../tasks/archive/2026-10-07-iot-p1-increment-2/2026-10-12-downsample-design.md)）。改由本进程的 BullMQ Job Scheduler 触发，每次**重算最近 K 个已闭合窗口**（`DOWNSAMPLE_LOOKBACK_WINDOWS`）——只依赖墙上时钟、不记游标，晚到数据落在最近 K 个窗口内即被自愈。三级 `1m`/`1h`/`1d` **平级**、各自一条调度，都从各自模型编码对应的原始超表算（`rawStableName(modelCode)`），互不依赖；`1d` 业务日从 08:00 起（读查询 `INTERVAL(1d, 8h)`，窗口边界算术与之同源）。⭐ **模型与列清单每 tick 从快照取**（不是构造时快照一次）：新模型注册后本进程自己就能参与计算，不必重启。写入到预建的降采样子表（`{模型编码}_{deviceId}_{level}`），幂等键仍是 `(子表, ts)`；其**读侧**连接级读错即丢 reader，非连接级（确定性 SQL / 解析错）**单次不丢、连续两次才丢**——兜住半开连接又不因一次瞬时错白重连；写出侧同理（连接级即作废，同一格连续两次也作废）。⭐ **单写者**：降采样环只有 leader 才持有——follower 每 20 s 尝试 `SET NX PX 180000` 抢锁，leader 每 20 s 续期（Lua 比较 value），续期失败立即关闭环转回 follower；锁放**队列 Redis**（调度本来就在 BullMQ 上）。`DOWNSAMPLE_ENABLED=false` 只跑消费环（排障用）。⭐ 其队列名 `iot-telemetry-downsample` **就地定义在本应用**、不进 contracts——调度注册与消费都在本进程内，没有第二个应用引用它（与跨应用的 `iot-telemetry-ingest` 相对）。
- **健康检查**：进程每 10 s 向队列 Redis 写心跳键 `wewant:worker:hb:<容器主机名>`（TTL 30 s），compose 的 healthcheck 跑 `node dist/healthcheck.js` 读该键。它只反映**事件环停摆**与**队列 Redis 不可达**，不反映消费进度（消费卡住但事件环正常时仍报健康）；⚠️ compose 不会因 unhealthy 自动重启，这是可见信号，并为 K8s 的 liveness 铺路。

### 档案快照（D1）

worker 的档案来源是**业务 Redis 的一份全量快照**（`RegistrySnapshot`），不是编译期常量、也不直连 PG。五个键各司其职：

| 键 | 谁写 | 含义 |
| --- | --- | --- |
| `iot:registry:rev` | 写路径 `INCR`（PG 事务提交之后） | **期望**版本——变更发生了 |
| `iot:registry:built` | 重建器条件写 | **已建**版本——快照里是哪一版 |
| `iot:registry:snapshot` | 重建器条件写 | 载荷（档案 + 模型声明 + 量程，含预推导列清单） |
| `iot:registry:rebuild-lock` | 重建器 `SET NX PX 2000` | 只降低重复劳动 |
| `iot:registry:worker-version:{instanceId}` | worker，TTL 30 s | 实例当前应用的版本，供 A4 验收 |

- **server 重建器**（`apps/nestjs-server/src/modules/iot/registry-snapshot/`）每 500 ms 一轮：键或快照缺失、`rev > built`、或距上次成功满 **60 秒**即重建（60 秒是正确性的一部分——PG 提交后 `INCR` 前崩溃时只有它能补）。**先读 `rev` 再读库**；条件写用 Lua 保证版本不倒退，版本相等时只有 payload 还在才跳过。兜底重建写 `max(rev, built) + 1` 并把 `rev` 抬到同一版本——等版本写入会被条件写拒掉，兜底否则发布不出去。任一列推导失败 ⇒ **整轮失败**，不发布半份快照。
- **worker 客户端**（`apps/iot-worker/src/snapshot/client.ts`）每 `REGISTRY_POLL_MS` 读 `built`，**与本地版本不同**即拉全量并整份替换（Redis 全量重置后版本从 0 重新计数，用「大于」会停在旧快照）；换入时同时建 `byLocalId` / `byModelCode` 索引（`resolvePoint` 不做线性扫）。拉取失败保留旧快照继续跑并累加陈旧秒数，超过 `REGISTRY_STALE_ALERT_MS` 升为 error。
- **口径按数据的时间戳**：一条数据属于哪个模型 / 版本由它自己的 `ts` 决定，与处理时刻无关；区间取半开 `[from, to)`。这同时消除晚到数据、BullMQ 重试与多实例不同步三类不可追溯错误。
- ⚠️ 档案与模型**必须同时替换**——分开刷新必然出现「档案已新、模型还旧」的窗口。

TDengine 库表 / 降采样子表与建库脚本见 [build-and-verify.md](../engineering/build-and-verify.md) 与 `apps/iot-worker/scripts/tdengine-init.ts`；降采样**逐条对账**脚本 `apps/iot-worker/scripts/downsample-verify.ts`（判据②，逐字段比原始聚合与降采样行）见同处。选型与边界见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md)、[ADR-010](../decisions/ADR-010-ingest-buffer-bullmq.md)；注册路径的 DDL 由 server 执行，见下节。

### 交付判据与验收口径（增量 2）

- **判据① 落库可见**：`wewant_iot` 里能 `SELECT` 到设备上报数据。双证据＝TDengine 查询结果 + 订阅端每秒聚合日志（入队 / 落缓冲 / 丢弃 / 无法读取编号 / 设备数）。
- **判据② 降采样**：`p1_1m` **逐条对账**——每个 `(子表, 窗口)` 的 sum/count/min/max 与原始表同子表同窗口的聚合逐字段相等，K 契约区内差异必须为 0；各模型的三条输出表存在且非空（1h / 1d 不做数据级对账，正确性靠与 1m 同一套 `level` / `query` / `rows` 代码路径）。⚠️ 对账脚本按**墙上时钟**取窗口；任一侧计数为 0，脚本**判失败**（「空对账不构成证据」），不会拿 0 组比出 0 差异冒充通过——复算历史段用 `--now <数据最后时间戳>`。
- **判据③ 重投不丢**：强杀消费者后重启，行数与内容一致。断言的是「不丢」；「不重」由 `(子表, ts)` 覆盖语义结构保证、不可观测。⚠️ 恢复时长由 BullMQ 默认 `lockDuration` / `stalledInterval`（各 30 s）决定，约 61 s——是默认值的函数，不是实现里调过的参数。
- ⚠️ **K 是自愈窗口的唯一来源**：环只重算最近 K 个已闭合窗口、不记游标 ⇒ 晚到数据或 worker 停机**超过 K × 窗口**的部分**永久缺失且不报错**（1m 3 分钟 / 1h 3 小时 / 1d 3 天）。排障时先想这条，再去看日志。

## API 约定

- 全局前缀 `api/v1`（`exclude: ['health']`）
- Swagger 仅非生产环境启用，挂载于 `api/docs`（Bearer 认证 scheme）
- 响应统一信封：`{ code: number, message: string, data: T }`
- 校验失败（40001）时 `data.errors` 携带字段级明细 `{ field, message }[]`（field 为点分路径，如 `meta.title`，见 [contracts.md](contracts.md)）；业务错误可携带结构化 `data`（如 iot 注册的 `{ issues }` / `{ reason, tables }`），其余错误 `data: null`
- 业务错误走 `BizException`（携带 `BizCode` 枚举），由 `AllExceptionsFilter` 经 exception-resolver 统一格式化；错误码表与信封扩展规则见 [contracts.md](contracts.md)
- 限流：登录同 IP 5 次/分；账号维度连续失败 5 次锁定 15 分钟（自动解锁，锁定中返回 42301）；refresh-token 10 次/分；全局 60 次/分
- 请求体大小：全局 `BODY_LIMIT`（默认 `1mb`）；`/api/v1/upload` 为上传预留路径（尚无上传端点），单独用 `UPLOAD_BODY_LIMIT`（默认 `10mb`）

## 数据库

Prisma 7 + PostgreSQL，system 五表（User / Role / Menu / UserRole / RoleMenu）三级 RBAC 与 iot 档案四表；软删除只作用于 User / Role / Menu（带 `deletedAt`），两张关联表为物理维护、按查询条件过滤。

- datasource url 由 `prisma.config.ts` 管理（运行期从 env 读取）；产物输出 `src/generated/`
- 连接池经 driver adapter 自管：`DATABASE_POOL_MAX`（默认 20）显式配置；query 事件经纯函数 `resolveQueryLog` 决策日志——超阈值（`PRISMA_SLOW_QUERY_MS`，默认 500ms）warn 级 `Slow query detected`，`PRISMA_QUERY_LOG=true` 时低于阈值查询以 log 级 `Query log` 输出（排障临时开关）
- seed 走 `tsx` 执行 TS 源码（`prisma/seed.ts`）；首次启动由 `ADMIN_INIT_PASSWORD` 环境变量创建超管
- 库名统一 `multi_admin`（测试库 `multi_admin_test`）；e2e 幂等建库 + migrate deploy + seed，见 [build-and-verify.md](../engineering/build-and-verify.md)
- argon2 密码哈希，永不落日志

### iot 档案（设备与物模型）

| 表 | 存什么 | 关键约束 |
| --- | --- | --- |
| `IotDeviceModel` | 模型身份（`code`，已折小写） | 主键 |
| `IotModelVersion` | 一个版本一份不可变的声明快照（`properties` / `services` / `events` 整份 JSON） | `(modelCode, version)` 唯一；状态 `PENDING` / `ACTIVE` / `SUPERSEDED` 在版本上；同一模型至多一个 `ACTIVE`（partial unique index，手写在迁移里）；`effectiveFrom` **非空**、`effectiveTo` 可空 |
| `IotDevice` | 设备档案：自报编号 → 平台 `deviceId` | `localDeviceId` 与 `deviceId` 各自唯一；状态三态 `PENDING` / `ACTIVE` / `RETIRED`（注册失败不落库，没有失败态；`RETIRED` = 注销 / 撤销，档案与数据保留、`deviceId` 永不复用） |
| `IotDeviceModelUsage` | 设备 × 版本 × 起止 | 复合外键指向 `IotModelVersion(modelCode, version)`、`ON DELETE RESTRICT`；`version` **可空**（版本撤销时置空，只作出处、不参与判定）；同一设备至多一条 `toAt IS NULL`（partial unique index，手写在建表迁移里） |

- **当前模型不存字段**，由 `usage.toAt IS NULL` 推出；设备与模型之间没有直接外键，绑定只在 usage 上
- 子表名的唯一来源是 `packages/device-registry` 的 `subtableName()`；期望集按 usage 展开，**含已闭合的历史**——换型号后旧模型的子表仍然合法
- server 侧只读仓储 `src/modules/iot/registry/device-registry.repository.ts`：`findActiveDevice` / `listActiveDevices` 返回当前模型、open usage 的版本号与子表名，`listSubtablesOfRegisteredDevices` 展开审计期望集（**设备过滤纳入 `ACTIVE` + `RETIRED`**）。查档与在用清单只认 `ACTIVE`、不缓存；期望集含退役设备，否则其子表会被永久判成孤儿。注册路径的前置查档走它（`models.service` 的补建按模型筛，保留自己的查询）
- seed 注入 `p1` 模型与版本 1（`ACTIVE`）、100 台 P1 设备及各自的 open usage；模型声明与设备标识是 `prisma/seed.ts` 里的**本地种子 fixture**，create-only 幂等
- worker **不读 PG**：档案与模型来自业务 Redis 的档案快照（见「档案快照（D1）」）。注册 / 发布 / 撤销在 PG 提交之后 `INCR iot:registry:rev`，重建器据此重建；递增失败只记 error，由 60 秒兜底补上

### 注册路径（物模型与设备档案）

- **两个 HTTP 入口**：`POST /api/v1/iot/models`（发布模型声明；新模型建表，已有模型发布新版本）与 `POST /api/v1/iot/devices`（注册设备）。鉴权走全局 JWT——本增量不加权限点（D3 §5 的复查触发点是出现第二个操作者）。两者都支持 `?dryRun=true`：只跑校验与比对、返回将要执行的 DDL，**不写库、不执行**。
- **DDL 归属 server**：语句生成在 `src/modules/iot/schema/ddl.ts`，表名一律取自 `packages/device-registry`（`rawStableName` / `dsStableName` / `dsSubtableName` / `subtableName`，库名与分钟级 KEEP 同处）；一个 `IF NOT EXISTS` 都不用——表/列已存在直接报错阻断注册，幂等由注册流程的前置状态判断承担。
- **模型内演进按列差集**：`DESCRIBE STABLE` 取现有列，声明有、库里没有 ⇒ 加列；声明有、库里已有 ⇒ 视为上次已应用（同一声明重放不会重复 `ALTER`）；声明没有、历史版本也没有的列 ⇒ 409「结构不一致」。改 key 的存储类型 ⇒ 400，不放行。
- **降采样超表逐级判断**：表不存在按当前声明整张建，存在则按**该级自己的现有列**做差集、逐列 `ALTER`——「1m 已加、1h 失败」的混合状态重放只补 1h。模型可从「全无聚合」演进为「有聚合」，那时三张表一张都没有。聚合从无到有后，已注册设备的降采样子表在版本切换之后补建；这一步失败**不回滚发布**，只记 error，缺失由审计报 `missingDs`。
- **TDengine 一次 `ALTER STABLE ADD COLUMN` 只能加一列**（3.4.2.8 实测多列写法语法错误），加列按列展开成多条语句；分钟级新建超表自带 `KEEP 1095`（全案唯一的超表级 KEEP）。
- **排期**：发布可带 `effectiveFrom`（缺省 `now`）。已有模型的版本必须**严格晚于**当前最新版本的生效时刻、且**晚于 `now`**——既不回溯也不补记（两者都会改写历史数据的解释）；模型的**首个版本**不受此限（尚无历史数据可改写）。事务里前驱 → `SUPERSEDED` 且 `effectiveTo = 新版本.effectiveFrom`；`SUPERSEDED` 只表示「已被后续版本排期覆盖」，不代表已失效。注册可带 `fromAt`（缺省 `now`，**允许早于 now** 作补登），校验 `fromAt ≥ 模型最早版本的 effectiveFrom`，不满足 ⇒ 409 并在 `data.earliestEffectiveFrom` 给出最早可生效时刻；`usage.version` 取 `fromAt` 时刻生效的那一版。
- **撤销未生效版本**：`DELETE /api/v1/iot/models/:modelCode/versions/:version`。只允许 `effectiveFrom > now` 且是**最新**版本（删中间版本会在前驱与后继之间留无覆盖空档）；撤销后模型必须仍覆盖全部已建档设备的 `fromAt`，否则 409 并列出受影响设备。同一事务内：置空引用该版本的 usage → 删版本行 → 前驱 `effectiveTo` 回填 `null` 并恢复 `ACTIVE`（否则模型没有 `ACTIVE` 版本，后续注册一律 `model-not-active`）。版本号不复用。
- **`localDeviceId` 是标识符**：**注册入口**先过 contracts 的 `checkLocalDeviceId`——归一化后须匹配 `^[a-z0-9][a-z0-9._:-]*$`、长度 ≤ 64，不合法即 400 `VALIDATION_FAILED`，`data.issues[].code` 为 `empty` / `too-long` / `invalid-char`。它要进 MQTT 主题段与 HTTP 路径，非法编号无法稳定路由。**注销 / 改期只做归一化**：存量档案里可能有规则收紧之前的编号，严格校验会让这些设备永远无法注销、数据继续被接收；查询是参数化 SQL，不拼字符串。
- **设备 `deviceId` 由平台签发**（16 位、首字母 + 字母数字，`^[A-Z][A-Z0-9]{15}$`），接口不接收。它进子表名与 TAGS 标签值；从库里读回时再过一次 `checkDeviceId` 防脏数据。
- **幂等是结果幂等**：同 `localDeviceId` 已 `ACTIVE` 且应有子表齐（有聚合时 1 + 3，无聚合时只有 1）即返回首次结果；文档在、表缺一张报 409「结构不一致」，**不自动补**。同一 `localDeviceId` 已注册在别的模型 ⇒ 409。
- **失败整体回滚**：本次建的表按 `createdTables` 清单**逆序**删除（只删清单里的名字，不按前缀匹配），单张失败重试三次、仍失败记 error 并继续；PG 不落库、没有失败态，`localDeviceId` 不被占用、重试天然可行。`ALTER` 已加上的列不退（TDengine 删不掉列），残留表由审计兜底。
- **连接是懒的**：`TDENGINE_URL`（默认 `ws://root:taosdata@127.0.0.1:6041`）首次用到才建连，时序库不可达不会让 server 起不来；容器内必须显式传服务名。`@tdengine/websocket` 加载时挂的 winston `uncaughtException` 处理器在 `td-client.ts` 模块加载期被摘除；摘除是全进程的，当前 server 没有自有处理器，若将来新增，必须让本摘除先执行。

### 设备生命周期（注销 / 撤销 / 改期 / 复活）

- **注销与撤销共用一个入口** `DELETE /api/v1/iot/devices/:localDeviceId`：事务内以 `SELECT … FOR UPDATE` 锁设备行，`status = RETIRED`、`statusChangedAt = now`，闭合 open usage：`toAt = max(now, usage.fromAt)`——已生效设备取 `now`，未生效设备取 `fromAt`（零长区间 `[fromAt, fromAt)`，一条数据都不覆盖）。不调用 TDengine、不删表、不删行；重复注销返回 200，`toAt` 与 `statusChangedAt` 不变（若仍存在 open usage，按同一公式补闭合以修复不一致态）。提交后 `INCR iot:registry:rev`。
- **不变式**：`status = RETIRED` 的设备没有 open usage；注册、注销、复活三个写路径都维持它。行锁保证注销与复活 / 改期并发时，后到者看到的是已提交状态。
- **改期** `PATCH /api/v1/iot/devices/:localDeviceId`，body `{ fromAt }`：只作用于 `status = ACTIVE` 且恰有一条 open usage 的设备（否则 409 `device-not-scheduled`）；当前 `fromAt > now`（已生效即 409 `device-effective`——该时段的数据已按旧区间解释，改期会制造不可追溯的口径），目标 `fromAt > now`（否则 409 `from-at-not-future`），并按新 `fromAt` 重算 `usage.version`。改期**不动表**；想立即生效走「撤销 + 重新注册」（注册允许 `fromAt` 早于 now）。同一 `fromAt` 幂等、不写库。
- **复活**走 `POST /api/v1/iot/devices`：`RETIRED` + 同 `modelCode` 即复活——沿用原 `deviceId` 与子表名，`status = ACTIVE`、`statusChangedAt = now`、新开 usage；`fromAt`（缺省 now）允许早于 now，但不得早于最后一个**非空** usage 的 `toAt`（被撤销留下的零长 usage 不参与重叠判定），且应有子表须齐全（属性取**所有版本的并集**，物理列是历史并集），缺一张即 `schema-mismatch`、**不自动补**。不同型号仍 409 `registered-to-other-model`；换型本增量不做。
- **消费侧不读状态**：退役设备的 usage 已闭合，`ts ≥ toAt` 由区间判定拒为 `out-of-range-ts`；`ts < toAt` 的晚到历史仍入库（封存历史）。复活前的空档 `[旧 toAt, 新 fromAt)` 同样按 `out-of-range-ts` 丢弃——设备确实退役过，这是正确语义。
- **快照纳入退役设备**（`status IN ('ACTIVE','RETIRED')`）：否则审计期望集随之减少，退役设备的子表会永久进孤儿桶。数据与表按 KEEP 自然过期，**表永久保留**。孤儿（注册失败残留、手工建的、模型整体退场）由 `subtable:cleanup` 回收——**缺省 dry-run**，四条闸（快照存在 / 期望集非空 / `builtAt` ≤ 10 分钟且 `rev == built` / 表创建时间早于 10 分钟）任一不满足即拒绝或跳过，删除顺序原始优先、随后降采样，详见 [build-and-verify.md](../engineering/build-and-verify.md)。新表保护期覆盖「注册先建 TD 表、后提交 PG」的在途窗口，避免把刚建的表当孤儿删掉。
