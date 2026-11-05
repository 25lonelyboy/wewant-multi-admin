---
status: living
covers:
  - apps/nestjs-server/
  - apps/iot-worker/
last_verified: 2026-11-05
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
- **队列不可达不阻断启动**：生产者以 `enableOfflineQueue:false` 快速失败，入队失败即**落本地磁盘缓冲**（`IOT_SPILL_DIR`，FIFO、投成功才删）；缓冲体积超 `IOT_SPILL_MAX_BYTES`（默认 256 MiB）⇒ **告警并进入丢弃态**：`overflowed` 一旦置真即锁存，`send()` 在**尝试入队之前**就返回 `dropped`，补投成功也不复位，恢复唯一途径是重启进程。⚠️ 因此溢出后的形态是「继续订阅、新报文全丢」，已落盘的存量仍按序补投——不是「停订阅」。队列 Redis 是独立实例（`QUEUE_REDIS_URL`）——BullMQ 要求 `noeviction`，而该策略是实例级的，业务缓存恰好希望有淘汰。
- **Broker 不可达不阻断启动**：连接失败只记 warn 并交 mqtt.js 自动重连。server 镜像冒烟与 CI 的 `docker-build` / `e2e-web-real` 两条 job 都在没有 EMQX 的情况下启动本应用。
- 日志每秒一行聚合，**按去向分列**——入队 / 落缓冲 / 丢弃 / 无法读取编号 / 设备数，命中不一致时再附拦截数。⭐ 去向即计数口径：队列不可达落本地缓冲、缓冲超限或落盘失败而丢弃的报文**都不算"入队"**，否则读数虚高；「无法读取编号」（JSON 解析失败，或 `localDeviceId` 缺失 / 非字符串 / 空串）的报文原样入队，其条数**与去向正交**，并列为独立一列（不是某个去向的括号附注）。聚合行即接入链路的观测证据，逐条打印在百级设备下不可读。

### 消费者（`apps/iot-worker`）

- 独立运行时：**不用 Nest、不开 HTTP**，与 server 并列的第二个进程，可独立启停 / 多实例 / 扩缩；配置 `apps/iot-worker/src/config.ts`（zod）、结构化日志（pino）、优雅停机（SIGINT/SIGTERM → 先落库再 `worker.close()`，末尾 `destroyTd()` 释放连接器持有的全局资源）。它不碰 PG，容器无 migrate / seed。worker 的 env 为 `QUEUE_REDIS_URL` / `TDENGINE_URL` / `TDENGINE_TIMEZONE` / `TDENGINE_CONNECTIONS`（2~4，默认 2）/ `INGEST_BATCH_SIZE` / `INGEST_FLUSH_INTERVAL_MS` / `INGEST_CONCURRENCY` / `DOWNSAMPLE_ENABLED` / `DOWNSAMPLE_LOOKBACK_WINDOWS`。⭐ `INGEST_BATCH_SIZE` 上限 **32767**（单次 `bind` 的行数硬上限 = 2¹⁵−1，探针实测）——超出会在写入时才抛 `bind number out of range`，故配置层启动即挡下、写入层再兜一道。
- 消费端**无限等待**（`maxRetriesPerRequest:null`，BullMQ 阻塞读命令不能因超时中断）；`INGEST_CONCURRENCY` 同时是"一批最多攒多少条"，攒够 `INGEST_BATCH_SIZE` 或到 `INGEST_FLUSH_INTERVAL_MS` 即 flush。TDengine 写入走一个**连接池**（`TDENGINE_CONNECTIONS` 条，写入按轮转分发）——一条连接挂掉只作废那一条，不全链路停摆。
- **入库成功才 ack**：一批的写入结果统一兑现那批 job 的 ack——**写入失败、或 `getLastAffected()` 合计少于提交行数（"部分成功"）都整批 reject**（`getLastAffected` 不给行级定位，做不到"丢失败那行、ack 其余"；批内先按 `(子表, ts)` 去重，否则同 ts 覆盖会被误报成部分失败）。失败按错误码 / 报文形态分两类（`apps/iot-worker/src/failure.ts`）：**A 类**（连接 / 超时）原样抛回队列、整批重投——重投安全靠幂等（`(子表, ts)` 覆盖使已成功的行不会被重复写），其中**读超时"可能已成功"也必须重试**、不能丢弃；**B 类**（格式 / 权限 / 表结构）重试无意义，抛 BullMQ `UnrecoverableError` **直接进 failed 集合**（＝"待人工看"）并告警带错误码。⭐ `Table does not exist` 走**提级**告警（级别高于其它 B 类）——正常路径（预建 + 不带 `USING`）下它不该出现，一旦出现即建表遗漏或命名逻辑 bug。⭐ **作废连接只在连接级错误**（`failure.connectionLevel`，实测 108 / 104）——超时（`0x80000019` / `105`，"可能已成功"）、连接数上限（`110`）、判不出形态的默认桶都是 A 类却**不证明连接坏了**，不得作废；作废粒度是**失败的那一条**连接（池内其余连接不陪葬），且先把仍未关的连接 `close()` 再置空引用（否则泄漏一条活连接）。⭐ 另有一条**有界兜底**：同一格**连续失败**达阈值（2 次）即作废重连，**成功或作废/重连后都清零**——兜住"连接坏了但报的不是连接级码"的半开连接（单次瞬时错仍不作废）。
- 设备档案查表经 `packages/device-registry`；**未知测点只丢该测点**并计数 + 告警（不丢整条，避免把同一条里合法测点一起赔进去）；数值**超量程**（`apps/iot-worker/src/detection.ts` 的 `DEFAULT_METRIC_RANGES`，可按测点覆盖、权威来源留到增量 3 物模型）同样只丢该测点。⭐ **全列皆未知**时失败结果带 `unknownMetricKeys`——告警必须带上报的 `key`。
- **物模型与降采样列**：模型的声明结构、校验与列推导都在 `packages/device-registry`（`model-types` / `model-validate` / `model-derive`）。降采样列由属性声明算出——属性按声明顺序、聚合按 `sum` / `count` / `min` / `max` 的固定顺序展开；某个组合算不出列类型时**整个推导失败**，不跳过。⚠️ 尚未接线：列集合当前仍由 `RAW_METRICS` 决定，S5 才换成模型驱动。
- 队列名 `iot-telemetry-ingest`、Redis 键前缀 `wewant` 由 contracts 的 iot 段一处定义——两端分属不同应用，名字必须同源。⚠️ BullMQ 用 `:` 作 Redis 键分隔符，队列名含冒号构造即抛，故分隔符用 `-`。
- **降采样环**（本进程内与消费环并列的第二条链路，`apps/iot-worker/src/downsample/`）：**不用 TDengine 流**——本机实测 3.4.2.8 的流会把每个窗口的聚合复制给全部输出子表（选型与依据见 [降采样设计](../tasks/archive/2026-10-07-iot-p1-increment-2/2026-10-12-downsample-design.md)）。改由本进程的 BullMQ Job Scheduler 触发，每次**重算最近 K 个已闭合窗口**（`DOWNSAMPLE_LOOKBACK_WINDOWS`）——只依赖墙上时钟、不记游标，晚到数据落在最近 K 个窗口内即被自愈。三级 `1m`/`1h`/`1d` **平级**、各自一条调度，都从各自模型编码对应的原始超表算（`rawStableName(modelCode)`），互不依赖；`1d` 业务日从 08:00 起（读查询 `INTERVAL(1d, 8h)`，窗口边界算术与之同源）。⭐ **建表与计算同形**：建库脚本与降采样环都按档案里出现过的模型编码逐个处理。写到预建的降采样子表（`{模型编码}_{deviceId}_{level}`），幂等键仍是 `(子表, ts)`；其**读侧**连接级读错即丢 reader，非连接级（确定性 SQL / 解析错）**单次不丢、连续两次才丢**——兜住半开连接又不因一次瞬时错白重连；写出侧同理（连接级即作废，同一格连续两次也作废）。`DOWNSAMPLE_ENABLED=false` 只跑消费环（排障用）。⭐ 其队列名 `iot-telemetry-downsample` **就地定义在本应用**、不进 contracts——调度注册与消费都在本进程内，没有第二个应用引用它（与跨应用的 `iot-telemetry-ingest` 相对）。
- **健康检查**：进程每 10 s 向队列 Redis 写心跳键 `wewant:worker:hb:<容器主机名>`（TTL 30 s），compose 的 healthcheck 跑 `node dist/healthcheck.js` 读该键。它只反映**事件环停摆**与**队列 Redis 不可达**，不反映消费进度（消费卡住但事件环正常时仍报健康）；⚠️ compose 不会因 unhealthy 自动重启，这是可见信号，并为 K8s 的 liveness 铺路。

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
| `IotModelVersion` | 一个版本一份不可变的声明快照（`properties` / `services` / `events` 整份 JSON） | `(modelCode, version)` 唯一；状态 `PENDING` / `ACTIVE` / `SUPERSEDED` 在版本上；同一模型至多一个 `ACTIVE`（partial unique index，手写在迁移里） |
| `IotDevice` | 设备档案：自报编号 → 平台 `deviceId` | `localDeviceId` 与 `deviceId` 各自唯一；状态只有 `PENDING` / `ACTIVE`（注册失败不落库，没有失败态） |
| `IotDeviceModelUsage` | 设备 × 版本 × 起止 | 复合外键指向 `IotModelVersion(modelCode, version)`；同一设备至多一条 `toAt IS NULL`（partial unique index，手写在建表迁移里） |

- **当前模型不存字段**，由 `usage.toAt IS NULL` 推出；设备与模型之间没有直接外键，绑定只在 usage 上
- 子表名的唯一来源是 `packages/device-registry` 的 `subtableName()`；期望集按 usage 展开，**含已闭合的历史**——换型号后旧模型的子表仍然合法
- server 侧只读仓储 `src/modules/iot/registry/device-registry.repository.ts`：`findActiveDevice` / `listActiveDevices` / `listSubtablesOfActiveDevices`，只认 `ACTIVE` 设备、不缓存
- seed 注入 `p1` 模型与版本 1（`ACTIVE`）、100 台 P1 设备及各自的 open usage；设备标识取自 `p1DeviceRecords()`，create-only 幂等
- worker 仍不读 PG（档案承载与读取形态归 D1 / S5）；注册写入路径见下节

### 注册路径（物模型与设备档案）

- **两个 HTTP 入口**：`POST /api/v1/iot/models`（发布模型声明；新模型建表，已有模型发布新版本）与 `POST /api/v1/iot/devices`（注册设备）。鉴权走全局 JWT——本增量不加权限点（D3 §5 的复查触发点是出现第二个操作者）。两者都支持 `?dryRun=true`：只跑校验与比对、返回将要执行的 DDL，**不写库、不执行**。
- **DDL 归属 server**：语句生成在 `src/modules/iot/schema/ddl.ts`，表名一律取自 `packages/device-registry`（`rawStableName` / `dsStableName` / `dsSubtableName` / `subtableName`，库名与分钟级 KEEP 同处）；一个 `IF NOT EXISTS` 都不用——表/列已存在直接报错阻断注册，幂等由注册流程的前置状态判断承担。
- **模型内演进按列差集**：`DESCRIBE STABLE` 取现有列，声明有、库里没有 ⇒ 加列；声明有、库里已有 ⇒ 视为上次已应用（同一声明重放不会重复 `ALTER`）；声明没有、历史版本也没有的列 ⇒ 409「结构不一致」。改 key 的存储类型 ⇒ 400，不放行。
- **降采样超表逐级判断**：表不存在按当前声明整张建，存在则按**该级自己的现有列**做差集、逐列 `ALTER`——「1m 已加、1h 失败」的混合状态重放只补 1h。模型可从「全无聚合」演进为「有聚合」，那时三张表一张都没有。聚合从无到有后，已注册设备的降采样子表在版本切换之后补建；这一步失败**不回滚发布**，只记 error，缺失由审计报 `missingDs`。
- **TDengine 一次 `ALTER STABLE ADD COLUMN` 只能加一列**（3.4.2.8 实测多列写法语法错误），加列按列展开成多条语句；分钟级新建超表自带 `KEEP 1095`（全案唯一的超表级 KEEP）。
- **设备 `deviceId` 由平台签发**（16 位、首字母 + 字母数字，`^[A-Z][A-Z0-9]{15}$`），接口不接收。它进子表名与 TAGS 标签值；从库里读回时再过一次 `checkDeviceId` 防脏数据。
- **幂等是结果幂等**：同 `localDeviceId` 已 `ACTIVE` 且应有子表齐（有聚合时 1 + 3，无聚合时只有 1）即返回首次结果；文档在、表缺一张报 409「结构不一致」，**不自动补**。同一 `localDeviceId` 已注册在别的模型 ⇒ 409。
- **失败整体回滚**：本次建的表按 `createdTables` 清单**逆序**删除（只删清单里的名字，不按前缀匹配），单张失败重试三次、仍失败记 error 并继续；PG 不落库、没有失败态，`localDeviceId` 不被占用、重试天然可行。`ALTER` 已加上的列不退（TDengine 删不掉列），残留表由审计兜底。
- **连接是懒的**：`TDENGINE_URL`（默认 `ws://root:taosdata@127.0.0.1:6041`）首次用到才建连，时序库不可达不会让 server 起不来；容器内必须显式传服务名。`@tdengine/websocket` 加载时挂的 winston `uncaughtException` 处理器在 `td-client.ts` 模块加载期被摘除（先于任何自有处理器注册）。
