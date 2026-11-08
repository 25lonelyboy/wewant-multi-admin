---
status: living
covers:
  - apps/nestjs-server/
last_verified: 2026-11-08
---

# NestJS 后端架构

`apps/nestjs-server` 的模块分层、请求链、API 约定与数据库事实。

技术选型决策见 [ADR-004](../decisions/ADR-004-contracts-and-backend-stack.md)，前后端契约见 [contracts.md](contracts.md)，测试与覆盖率流水线见 [build-and-verify.md](../engineering/build-and-verify.md)。

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

请求链：`requestId 中间件 → helmet → 请求体解析 → CORS → RedisThrottlerGuard` → `JwtAuthGuard → PermissionsGuard → ValidationPipe → Controller`。

响应经 `ResponseEnvelopeInterceptor` 封装。其余细节：

- helmet 非生产关 CSP（Swagger UI 依赖内联脚本）。
- 请求体解析：路由级 `UPLOAD_BODY_LIMIT` 优先于全局 `BODY_LIMIT`；CORS 支持逗号分隔多来源。
- `ValidationPipe` 使用 `whitelist + transform`，自定义 `exceptionFactory` 展开字段级校验明细。

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
- 连接串为 `MQTT_URL`（默认 `mqtt://127.0.0.1:1883`，容器内为 `mqtt://emqx:1883`）；QoS 1、`clean:false` + `sessionExpiryInterval`（`MQTT_SESSION_EXPIRY_SECONDS`），`clientId` 固定（`MQTT_CLIENT_ID`）——固定才能用上持久会话。
  `MQTT_CLEAN_SESSION=true` 改为**干净起始**（Broker 丢弃同 clientId 的既有会话与其排队报文）：e2e 用它甩掉上一轮遗留的 QoS1 积压，避免旧报文混进本轮计数断言；缺省 `false` 保留生产口径。
- **身份校验**：主题段与载荷 `localDeviceId` 不一致 ⇒ **丢弃 + 计数 + 告警**（主题是将来 ACL 的授权单位，身份却以载荷为准；不拦的话，一个已授权设备可在自己的主题上发别人的编号，数据落进别人的子表）；`JSON.parse` 失败 ⇒ **原样入队**，由消费者计数。
- **报文上限**：单条载荷超过 `IOT_MAX_MESSAGE_BYTES`（默认 256 KiB）时，订阅端在 `toString` / `JSON.parse` **之前**按 `payload.byteLength` 直接拒收并计入 `oversized`——上限保护的是进程内存与 CPU，不只是队列；
  生产者 `send()` 再按字节兜一道（覆盖所有调用方），补投 `drainSpill()` 同样过闸。
  返回独立去向 `oversized`——入队与落本地两条路都被覆盖，队列不可达时超限报文也不会绕过校验落进缓冲。⚠️ 它是**去向**不是 `dropped` 的子集：丢弃是「缓冲满 / 落盘失败」，超限是「报文本身不合格」。
  EMQX 的 `max_packet_size` 保持默认 1 MB 作硬顶，**刻意不调到 256 KiB**——留出 256 KiB–1 MB 这一段，误配置的设备才能被应用侧计数到。超限日志每满 1 秒一条 warn（本秒 / 累计条数），逐条细节降为 debug。
- **队列不可达不阻断启动**：生产者以 `enableOfflineQueue:false` 快速失败，入队失败即**落本地磁盘缓冲**（`IOT_SPILL_DIR`，FIFO、投成功才删）；
  缓冲体积超 `IOT_SPILL_MAX_BYTES`（默认 256 MiB）⇒ **告警并进入丢弃态**：`overflowed` 一旦置真即锁存，`send()` 在**尝试入队之前**就返回 `dropped`，补投成功也不复位，恢复唯一途径是重启进程。
  ⚠️ 因此溢出后的形态是「**停止订阅、完全断流**」：`onSpillOverflow` 置 `subscriptionStopped` 并 `unsubscribe`，重连后也不再订阅；已落盘的存量继续按序补投。
  队列 Redis 是独立实例（`QUEUE_REDIS_URL`）——BullMQ 要求 `noeviction`，而该策略是实例级的，业务缓存恰好希望有淘汰。
- **Broker 不可达不阻断启动**：连接失败只记 warn 并交 mqtt.js 自动重连。server 镜像冒烟与 CI 的 `docker-build` / `e2e-web-real` 两条 job 都在没有 EMQX 的情况下启动本应用。
- 日志每秒一行聚合，**按去向分列**——入队 / 落缓冲 / 丢弃 / 超限 / 无法读取编号 / 设备数，命中不一致时再附拦截数。
  ⭐ 去向即计数口径：队列不可达落本地缓冲、缓冲超限或落盘失败而丢弃的报文**都不算"入队"**，否则读数虚高；「无法读取编号」（JSON 解析失败，或 `localDeviceId` 缺失 / 非字符串 / 空串）的报文原样入队，其条数**与去向正交**，并列为独立一列（不是某个去向的括号附注）。
  聚合行即接入链路的观测证据，逐条打印在百级设备下不可读。

消费端（`apps/iot-worker`）的消费环、档案快照、降采样环与交付判据见 [iot-worker.md](iot-worker.md)。

## API 约定

- 全局前缀 `api/v1`（`exclude: ['health']`）
- Swagger 仅非生产环境启用，挂载于 `api/docs`（Bearer 认证 scheme）
- 响应统一信封：`{ code: number, message: string, data: T }`
- 校验失败（40001）时 `data.errors` 携带字段级明细 `{ field, message }[]`（field 为点分路径，如 `meta.title`，见 [contracts.md](contracts.md)）。
- 业务错误可携带结构化 `data`（如 iot 注册的 `{ issues }` / `{ reason, tables }`），其余错误 `data: null`
- 业务错误走 `BizException`（携带 `BizCode` 枚举），由 `AllExceptionsFilter` 经 exception-resolver 统一格式化；错误码表与信封扩展规则见 [contracts.md](contracts.md)
- 限流：登录同 IP 5 次/分；账号维度连续失败 5 次锁定 15 分钟（自动解锁，锁定中返回 42301）；refresh-token 10 次/分；全局 60 次/分
- 请求体大小：全局 `BODY_LIMIT`（默认 `1mb`）；`/api/v1/upload` 为上传预留路径（尚无上传端点），单独用 `UPLOAD_BODY_LIMIT`（默认 `10mb`）

## 数据库

Prisma 7 + PostgreSQL，system 五表（User / Role / Menu / UserRole / RoleMenu）三级 RBAC 与 iot 档案四表；软删除只作用于 User / Role / Menu（带 `deletedAt`），两张关联表为物理维护、按查询条件过滤。

- datasource url 由 `prisma.config.ts` 管理（运行期从 env 读取）；产物输出 `src/generated/`
- 连接池经 driver adapter 自管：`DATABASE_POOL_MAX`（默认 20）显式配置；
  query 事件经纯函数 `resolveQueryLog` 决策日志——超阈值（`PRISMA_SLOW_QUERY_MS`，默认 500ms）warn 级 `Slow query detected`，`PRISMA_QUERY_LOG=true` 时低于阈值查询以 log 级 `Query log` 输出（排障临时开关）
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
- server 侧只读仓储 `src/modules/iot/registry/device-registry.repository.ts`：`findActiveDevice` / `listActiveDevices` 返回当前模型、open usage 的版本号与子表名，
  `listSubtablesOfRegisteredDevices` 展开审计期望集（**设备过滤纳入 `ACTIVE` + `RETIRED`**）。
  查档与在用清单只认 `ACTIVE`、不缓存；期望集含退役设备，否则其子表会被永久判成孤儿。注册路径的前置查档走它（`models.service` 的补建按模型筛，保留自己的查询）
- seed 注入 `p1` 模型与版本 1（`ACTIVE`）、100 台 P1 设备及各自的 open usage；模型声明与设备标识是 `prisma/seed.ts` 里的**本地种子 fixture**，create-only 幂等
- worker **不读 PG**：档案与模型来自业务 Redis 的档案快照（见 [iot-worker.md](iot-worker.md) 的「档案快照」）。注册 / 发布 / 撤销在 PG 提交之后 `INCR iot:registry:rev`，重建器据此重建；递增失败只记 error，由 60 秒兜底补上

### 注册路径（物模型与设备档案）

- **两个 HTTP 入口**：`POST /api/v1/iot/models`（发布模型声明；新模型建表，已有模型发布新版本）与 `POST /api/v1/iot/devices`（注册设备）。鉴权走全局 JWT——本阶段不加权限点（复查触发点是出现第二个操作者）。两者都支持 `?dryRun=true`：只跑校验与比对、返回将要执行的 DDL，**不写库、不执行**。
- **DDL 归属 server**：语句生成在 `src/modules/iot/schema/ddl.ts`，表名一律取自 `packages/device-registry`（`rawStableName` / `dsStableName` / `dsSubtableName` / `subtableName`，库名与分钟级 KEEP 同处）；
  一个 `IF NOT EXISTS` 都不用——表/列已存在直接报错阻断注册，幂等由注册流程的前置状态判断承担。
- **模型内演进按列差集**：`DESCRIBE STABLE` 取现有列，声明有、库里没有 ⇒ 加列；声明有、库里已有 ⇒ 视为上次已应用（同一声明重放不会重复 `ALTER`）；声明没有、历史版本也没有的列 ⇒ 409「结构不一致」。改 key 的存储类型 ⇒ 400，不放行。
- **降采样超表逐级判断**：表不存在按当前声明整张建，存在则按**该级自己的现有列**做差集、逐列 `ALTER`——「1m 已加、1h 失败」的混合状态重放只补 1h。模型可从「全无聚合」演进为「有聚合」，那时三张表一张都没有。聚合从无到有后，已注册设备的降采样子表在版本切换之后补建；这一步失败**不回滚发布**，只记 error，缺失由审计报 `missingDs`。
- **TDengine 一次 `ALTER STABLE ADD COLUMN` 只能加一列**（3.4.2.8 实测多列写法语法错误），加列按列展开成多条语句；分钟级新建超表自带 `KEEP 1095`（全案唯一的超表级 KEEP）。
- **排期**：发布可带 `effectiveFrom`（缺省 `now`）。已有模型的版本必须**严格晚于**当前最新版本的生效时刻、且**晚于 `now`**——既不回溯也不补记（两者都会改写历史数据的解释）；模型的**首个版本**不受此限（尚无历史数据可改写）。
  事务里前驱 → `SUPERSEDED` 且 `effectiveTo = 新版本.effectiveFrom`；`SUPERSEDED` 只表示「已被后续版本排期覆盖」，不代表已失效。
  注册可带 `fromAt`（缺省 `now`，**允许早于 now** 作补登），校验 `fromAt ≥ 模型最早版本的 effectiveFrom`，不满足 ⇒ 409 并在 `data.earliestEffectiveFrom` 给出最早可生效时刻；`usage.version` 取 `fromAt` 时刻生效的那一版。
- **撤销未生效版本**：`DELETE /api/v1/iot/models/:modelCode/versions/:version`。只允许 `effectiveFrom > now` 且是**最新**版本（删中间版本会在前驱与后继之间留无覆盖空档）；撤销后模型必须仍覆盖全部已建档设备的 `fromAt`，否则 409 并列出受影响设备。
  同一事务内：置空引用该版本的 usage → 删版本行 → 前驱 `effectiveTo` 回填 `null` 并恢复 `ACTIVE`（否则模型没有 `ACTIVE` 版本，后续注册一律 `model-not-active`）。版本号不复用。
- **`localDeviceId` 是标识符**：**注册入口**先过 contracts 的 `checkLocalDeviceId`——归一化后须匹配 `^[a-z0-9][a-z0-9._:-]*$`、长度 ≤ 64，不合法即 400 `VALIDATION_FAILED`，
  `data.issues[].code` 为 `empty` / `too-long` / `invalid-char`。
  它要进 MQTT 主题段与 HTTP 路径，非法编号无法稳定路由。**注销 / 改期只做归一化**：存量档案里可能有规则收紧之前的编号，严格校验会让这些设备永远无法注销、数据继续被接收；查询是参数化 SQL，不拼字符串。
- **设备 `deviceId` 由平台签发**（16 位、首字母 + 字母数字，`^[A-Z][A-Z0-9]{15}$`），接口不接收。它进子表名与 TAGS 标签值；从库里读回时再过一次 `checkDeviceId` 防脏数据。
- **幂等是结果幂等**：同 `localDeviceId` 已 `ACTIVE` 且应有子表齐（有聚合时 1 + 3，无聚合时只有 1）即返回首次结果；文档在、表缺一张报 409「结构不一致」，**不自动补**。同一 `localDeviceId` 已注册在别的模型 ⇒ 409。
- **失败整体回滚**：本次建的表按 `createdTables` 清单**逆序**删除（只删清单里的名字，不按前缀匹配），单张失败重试三次、仍失败记 error 并继续；PG 不落库、没有失败态，`localDeviceId` 不被占用、重试天然可行。`ALTER` 已加上的列不退（TDengine 删不掉列），残留表由审计兜底。
- **连接是懒的**：`TDENGINE_URL`（默认 `ws://root:taosdata@127.0.0.1:6041`）首次用到才建连，时序库不可达不会让 server 起不来；容器内必须显式传服务名。
  `@tdengine/websocket` 加载时挂的 winston `uncaughtException` 处理器在 `td-client.ts` 模块加载期被摘除；摘除是全进程的，当前 server 没有自有处理器，若将来新增，必须让本摘除先执行。

### 设备生命周期（注销 / 撤销 / 改期 / 复活）

- **注销与撤销共用一个入口** `DELETE /api/v1/iot/devices/:localDeviceId`：事务内以 `SELECT … FOR UPDATE` 锁设备行，`status = RETIRED`、`statusChangedAt = now`，
  闭合 open usage：`toAt = max(now, usage.fromAt)`——已生效设备取 `now`，未生效设备取 `fromAt`（零长区间 `[fromAt, fromAt)`，一条数据都不覆盖）。
  不调用 TDengine、不删表、不删行；重复注销返回 200，`toAt` 与 `statusChangedAt` 不变（若仍存在 open usage，按同一公式补闭合以修复不一致态）。提交后 `INCR iot:registry:rev`。
- **不变式**：`status = RETIRED` 的设备没有 open usage；注册、注销、复活三个写路径都维持它。行锁保证注销与复活 / 改期并发时，后到者看到的是已提交状态。
- **改期** `PATCH /api/v1/iot/devices/:localDeviceId`，body `{ fromAt }`：只作用于 `status = ACTIVE` 且恰有一条 open usage 的设备（否则 409 `device-not-scheduled`）；
  当前 `fromAt > now`（已生效即 409 `device-effective`——该时段的数据已按旧区间解释，改期会制造不可追溯的口径），目标 `fromAt > now`（否则 409 `from-at-not-future`），并按新 `fromAt` 重算 `usage.version`。
  改期**不动表**；想立即生效走「撤销 + 重新注册」（注册允许 `fromAt` 早于 now）。同一 `fromAt` 幂等、不写库。
- **复活**走 `POST /api/v1/iot/devices`：`RETIRED` + 同 `modelCode` 即复活——沿用原 `deviceId` 与子表名，`status = ACTIVE`、`statusChangedAt = now`、新开 usage；
  `fromAt`（缺省 now）允许早于 now，但不得早于最后一个**非空** usage 的 `toAt`（被撤销留下的零长 usage 不参与重叠判定），且应有子表须齐全（属性取**所有版本的并集**，物理列是历史并集），缺一张即 `schema-mismatch`、**不自动补**。
  不同型号仍 409 `registered-to-other-model`；换型本增量不做。
- **消费侧不读状态**：退役设备的 usage 已闭合，`ts ≥ toAt` 由区间判定拒为 `out-of-range-ts`；`ts < toAt` 的晚到历史仍入库（封存历史）。复活前的空档 `[旧 toAt, 新 fromAt)` 同样按 `out-of-range-ts` 丢弃——设备确实退役过，这是正确语义。
- **快照纳入退役设备**（`status IN ('ACTIVE','RETIRED')`）：否则审计期望集随之减少，退役设备的子表会永久进孤儿桶。数据与表按 KEEP 自然过期，**表永久保留**。
  孤儿（注册失败残留、手工建的、模型整体退场）由 `subtable:cleanup` 回收——**缺省 dry-run**，四条闸（快照存在 / 期望集非空 / `builtAt` ≤ 10 分钟且 `rev == built` / 表创建时间早于 10 分钟）任一不满足即拒绝或跳过，删除顺序原始优先、随后降采样，
  详见 [build-and-verify.md](../engineering/build-and-verify.md)。
  新表保护期覆盖「注册先建 TD 表、后提交 PG」的在途窗口，避免把刚建的表当孤儿删掉。
