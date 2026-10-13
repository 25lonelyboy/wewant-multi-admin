---
status: living
covers:
  - apps/nestjs-server/
  - apps/iot-worker/
last_verified: 2026-10-13
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
- 连接串为 `MQTT_URL`（默认 `mqtt://127.0.0.1:1883`，容器内为 `mqtt://emqx:1883`）；QoS 1、`clean:false` + `sessionExpiryInterval`（`MQTT_SESSION_EXPIRY_SECONDS`），`clientId` 固定（`MQTT_CLIENT_ID`）——固定才能用上持久会话。
- **身份校验**：主题段与载荷 `localDeviceId` 不一致 ⇒ **丢弃 + 计数 + 告警**（主题是将来 ACL 的授权单位，身份却以载荷为准；不拦的话，一个已授权设备可在自己的主题上发别人的编号，数据落进别人的子表）；`JSON.parse` 失败 ⇒ **原样入队**，由消费者计数。
- **队列不可达不阻断启动**：生产者以 `enableOfflineQueue:false` 快速失败，入队失败即**落本地磁盘缓冲**（`IOT_SPILL_DIR`，FIFO、投成功才删）；缓冲体积超 `IOT_SPILL_MAX_BYTES` ⇒ **停订阅 + 告警**（不自动恢复，需人工处置）。队列 Redis 是独立实例（`QUEUE_REDIS_URL`）——BullMQ 要求 `noeviction`，而该策略是实例级的，业务缓存恰好希望有淘汰。
- **Broker 不可达不阻断启动**：连接失败只记 warn 并交 mqtt.js 自动重连。server 镜像冒烟与 CI 的 `docker-build` / `e2e-web-real` 两条 job 都在没有 EMQX 的情况下启动本应用。
- 日志每秒一行聚合（入队条数 / 设备数，命中不一致时附拦截数）——聚合行即接入链路的观测证据，逐条打印在百级设备下不可读。

### 消费者（`apps/iot-worker`）

- 独立运行时：**不用 Nest、不开 HTTP**，与 server 并列的第二个进程，可独立启停 / 多实例 / 扩缩；配置 `apps/iot-worker/src/config.ts`（zod）、结构化日志（pino）、优雅停机（SIGINT/SIGTERM → 先落库再 `worker.close()`）。它不碰 PG，容器无 migrate / seed。worker 的 env 为 `QUEUE_REDIS_URL` / `TDENGINE_URL` / `TDENGINE_TIMEZONE` / `INGEST_BATCH_SIZE` / `INGEST_FLUSH_INTERVAL_MS` / `INGEST_CONCURRENCY` / `DOWNSAMPLE_ENABLED` / `DOWNSAMPLE_LOOKBACK_WINDOWS`。
- 消费端**无限等待**（`maxRetriesPerRequest:null`，BullMQ 阻塞读命令不能因超时中断）；`INGEST_CONCURRENCY` 同时是"一批最多攒多少条"，攒够 `INGEST_BATCH_SIZE` 或到 `INGEST_FLUSH_INTERVAL_MS` 即 flush。
- **入库成功才 ack**：一批的写入结果统一兑现那批 job 的 ack——**写入失败、或 `getLastAffected()` 合计少于提交行数（"部分成功"）都整批 reject**（`getLastAffected` 不给行级定位，做不到"丢失败那行、ack 其余"；批内先按 `(子表, ts)` 去重，否则同 ts 覆盖会被误报成部分失败）。失败按错误码 / 报文形态分两类（`apps/iot-worker/src/failure.ts`）：**A 类**（连接 / 超时）原样抛回队列、整批重投——重投安全靠幂等（`(子表, ts)` 覆盖使已成功的行不会被重复写），其中**读超时"可能已成功"也必须重试**、不能丢弃；**B 类**（格式 / 权限 / 表结构）重试无意义，抛 BullMQ `UnrecoverableError` **直接进 failed 集合**（＝"待人工看"）并告警带错误码。⭐ `Table does not exist` 走**提级**告警（级别高于其它 B 类）——正常路径（预建 + 不带 `USING`）下它不该出现，一旦出现即建表遗漏或命名逻辑 bug。
- 设备档案查表经 `packages/device-registry`；**未知测点只丢该测点**并计数 + 告警（不丢整条，避免把同一条里合法测点一起赔进去）。
- 队列名 `iot-telemetry-ingest`、Redis 键前缀 `wewant` 由 contracts 的 iot 段一处定义——两端分属不同应用，名字必须同源。⚠️ BullMQ 用 `:` 作 Redis 键分隔符，队列名含冒号构造即抛，故分隔符用 `-`。
- **降采样环**（本进程内与消费环并列的第二条链路，`apps/iot-worker/src/downsample/`）：**不用 TDengine 流**——本机实测 3.4.2.8 的流会把每个窗口的聚合复制给全部输出子表（选型与依据见 [降采样设计](../tasks/2026-10-07-iot-p1-increment-2/2026-10-12-downsample-design.md)）。改由本进程的 BullMQ Job Scheduler 触发，每次**重算最近 K 个已闭合窗口**（`DOWNSAMPLE_LOOKBACK_WINDOWS`）——只依赖墙上时钟、不记游标，晚到数据落在最近 K 个窗口内即被自愈。三级 `1m`/`1h`/`1d` **平级**、各自一条调度、都从原始超表算，互不依赖；`1d` 业务日从 08:00 起（读查询 `INTERVAL(1d, 8h)`，窗口边界算术与之同源）。写到预建的降采样子表（`{deviceId}_{pointKey}_{level}`），幂等键仍是 `(子表, ts)`。`DOWNSAMPLE_ENABLED=false` 只跑消费环（排障用）。⭐ 其队列名 `iot-telemetry-downsample` **就地定义在本应用**、不进 contracts——调度注册与消费都在本进程内，没有第二个应用引用它（与跨应用的 `iot-telemetry-ingest` 相对）。

TDengine 库表 / 降采样子表与建库脚本见 [build-and-verify.md](../engineering/build-and-verify.md) 与 `apps/iot-worker/scripts/tdengine-init.ts`。选型与边界见 [ADR-009](../decisions/ADR-009-iot-platform-p1-stack.md)、[ADR-010](../decisions/ADR-010-ingest-buffer-bullmq.md)；设备注册与物模型属物模型增量。

## API 约定

- 全局前缀 `api/v1`（`exclude: ['health']`）
- Swagger 仅非生产环境启用，挂载于 `api/docs`（Bearer 认证 scheme）
- 响应统一信封：`{ code: number, message: string, data: T }`
- 校验失败（40001）时 `data.errors` 携带字段级明细 `{ field, message }[]`（field 为点分路径，如 `meta.title`，见 [contracts.md](contracts.md)）；其余错误 `data: null`
- 业务错误走 `BizException`（携带 `BizCode` 枚举），由 `AllExceptionsFilter` 经 exception-resolver 统一格式化；错误码表与信封扩展规则见 [contracts.md](contracts.md)
- 限流：登录同 IP 5 次/分；账号维度连续失败 5 次锁定 15 分钟（自动解锁，锁定中返回 42301）；refresh-token 10 次/分；全局 60 次/分
- 请求体大小：全局 `BODY_LIMIT`（默认 `1mb`）；`/api/v1/upload` 为上传预留路径（尚无上传端点），单独用 `UPLOAD_BODY_LIMIT`（默认 `10mb`）

## 数据库

Prisma 7 + PostgreSQL，五表（User / Role / Menu / UserRole / RoleMenu）三级 RBAC；软删除只作用于 User / Role / Menu（带 `deletedAt`），两张关联表为物理维护、按查询条件过滤。

- datasource url 由 `prisma.config.ts` 管理（运行期从 env 读取）；产物输出 `src/generated/`
- 连接池经 driver adapter 自管：`DATABASE_POOL_MAX`（默认 20）显式配置；query 事件经纯函数 `resolveQueryLog` 决策日志——超阈值（`PRISMA_SLOW_QUERY_MS`，默认 500ms）warn 级 `Slow query detected`，`PRISMA_QUERY_LOG=true` 时低于阈值查询以 log 级 `Query log` 输出（排障临时开关）
- seed 走 `tsx` 执行 TS 源码（`prisma/seed.ts`）；首次启动由 `ADMIN_INIT_PASSWORD` 环境变量创建超管
- 库名统一 `multi_admin`（测试库 `multi_admin_test`）；e2e 幂等建库 + migrate deploy + seed，见 [build-and-verify.md](../engineering/build-and-verify.md)
- argon2 密码哈希，永不落日志
