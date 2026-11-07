# S6 · 边界与口径落地：设计与实施计划

- **状态**：待执行
- **日期**：2026-11-07
- **前置**：D4 已定（时间戳边界、报文上限、读侧单位）；D5 已定（`RETIRED`、保留数据、同型号复活、改期与撤销、孤儿清理脚本）
- **范围**：D4 的两条未落地项（时间戳边界、报文上限）+ D5 的全部代码面（注销 / 撤销 / 改期 / 复活 / 孤儿清理）
- **不在本计划**：换型号、预约注销、设备查询接口、模型删除、批量注销
- **相关材料**：[D4 决策卡](2026-11-03-d4-decision-card.md)、[D5 决策卡](2026-11-07-d5-decision-card.md)

## 0. 与代码对齐后的七处事实

| # | 事实 | 位置 | 对 S6 的含义 |
| --- | --- | --- | --- |
| 1 | `parseEnvelope` 只校验 `ts` 是有限数，没有任何上下界 | `apps/iot-worker/src/detection.ts:48` | 边界校验加在消费环，与现有计数同处；`ParseFailure` 不新增值，越界单独计数 |
| 2 | 生产者在 `queue.add` 之前不校验字节数，入队与落盘两条路都直接收下 | `apps/nestjs-server/src/modules/iot/telemetry/telemetry-producer.ts:113`、`:136` | 上限校验放在 `send()` 的第一行，两条路一起覆盖 |
| 3 | 订阅端按「去向」计数：`enqueued` / `spilled` / `dropped`，另有正交的 `unreadable` | `telemetry-window.ts:7-22`、`telemetry-subscriber.service.ts:183-196` | 超限要成为一个**去向**，且必须计入 `report()` 的 `active` 求和，否则只收到超限报文的窗口会静默 |
| 4 | 设备状态只有 `PENDING` / `ACTIVE`，枚举注释明写没有退役语义；快照只收 `ACTIVE` | `apps/nestjs-server/prisma/schema.prisma:100-104`、`snapshot.builder.ts:65` | 加 `RETIRED` 后必须同时改快照查询，否则审计天天红（D5 §2.2） |
| 5 | 设备接口只有 `POST`；注册的幂等分支把「存在但不是 ACTIVE」统一报 `device-not-active` | `devices.controller.ts:12-22`、`devices.service.ts:90-100` | 注销 / 改期 / 复活都要新增分支，且错误码要拆开 |
| 6 | 删除原语只服务注册失败清理：按清单逆序 `DROP`、单表重试 3 次、失败留审计；审计脚本无删除路径 | `apps/nestjs-server/src/modules/iot/schema/execute.ts:25-55`、`apps/iot-worker/scripts/subtable-audit.ts` | 孤儿清理脚本自己实现一份（worker 侧、无 Nest 依赖），复刻同样的重试与留证纪律 |
| 7 | `localDeviceId` 只做 `trim + toLowerCase`，没有任何字符约束 | `packages/contracts/src/iot/device-id.ts:22`、`devices/dto/device.dto.ts:12-16` | 它要进 MQTT 主题段、S6 之后还要进 HTTP 路径；标识符校验是本计划的前置项 T0 |

## 1. 形状

```text
packages/contracts
  src/iot/device-id.ts                + checkLocalDeviceId
  src/iot/device-id.spec.ts           + 标识符规则

apps/iot-worker
  src/config.ts                       + 时间戳上下界
  src/consumer.ts                     + 边界校验与 clockOutOfRange 计数
  src/subtables/cleanup.ts            + 孤儿清理（纯函数 + 注入 TdExec）
  scripts/subtable-cleanup.ts         + CLI（dry-run 默认）
  test/consumer.test.ts               + 边界与注销后拒收用例
  test/subtable-cleanup.test.ts       + 顺序 / 闸门用例

apps/nestjs-server
  src/config/env.schema.ts            + IOT_MAX_MESSAGE_BYTES
  src/modules/iot/telemetry/*          + 超限去向与计数
  prisma/schema.prisma                + RETIRED
  prisma/migrations/<ts>_device_retired/migration.sql
  src/modules/iot/registry-snapshot/snapshot.builder.ts   ACTIVE + RETIRED
  src/modules/iot/registry/device-registry.repository.ts  ACTIVE + RETIRED；改名 listSubtablesOfRegisteredDevices
  src/modules/iot/devices/devices.controller.ts           DELETE / PATCH
  src/modules/iot/devices/devices.service.ts              retire / reschedule / revive
  src/modules/iot/devices/dto/device.dto.ts               RescheduleDeviceDto
  test/iot-lifecycle.e2e-spec.ts      新增（真 PG + 真 TD）
```

## 2. 设计

### 2.0 T0 `localDeviceId` 标识符校验（前置）

`localDeviceId` 是要进 MQTT 主题段与 HTTP 路径的标识，平台此前只做 `trim + toLowerCase`。在 `packages/contracts/src/iot/device-id.ts` 增加：

```ts
export const LOCAL_DEVICE_ID_MAX_LENGTH = 64;
export function checkLocalDeviceId(value: string):
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'too-long' | 'invalid-char' };
```

规则（归一化后）：`^[a-z0-9][a-z0-9._:-]*$`，长度 ≤ 64。大写输入先折小写，不拒绝。

- `DevicesService.register` 用它替换现在的空串检查；不合法 ⇒ 400 `VALIDATION_FAILED`，`issues[].code` 带 `empty` / `too-long` / `invalid-char`
- **注销 / 改期只做归一化**，不做字符集校验：存量档案里可能有规则收紧之前的编号，严格校验会让它们永远无法注销、数据继续被接收。查询是参数化 SQL，不拼字符串；路径参数归一化后为空仍 400
- 文档：[contracts.md](../../architecture/contracts.md) 的载荷字段、[backend.md](../../architecture/backend.md) 的注册段各加一句；`checkMetricKey` / `checkModelCode` 的规则不受影响

**验收**：非法字符（含 `/`、`?`、空格）、超长、空串在注册时 400 且不落库；大写编号归一化后正常注册；现有 `sim-0001` 与 e2e 前缀全部通过。

### 2.1 T1 时间戳边界（worker）

`config.ts` 新增两项，缺省即 D4 的 +24 h / −90 d：

```ts
INGEST_TS_MAX_FUTURE_MS: z.coerce.number().int().nonnegative().default(24 * 3_600_000),
INGEST_TS_MAX_PAST_MS: z.coerce.number().int().nonnegative().default(90 * 24 * 3_600_000)
```

`WorkerConfig` 增加 `tsMaxFutureMs` / `tsMaxPastMs`。消费环在 `parseEnvelope` 成功之后、`resolvePoint` 之前判定：

```ts
const now = this.now();
if (
  envelope.ts > now + this.config.tsMaxFutureMs ||
  envelope.ts < now - this.config.tsMaxPastMs
) {
  this.clockOutOfRange += 1;
  this.rejected += 1;
  // 日志带 reason / ts / now 与两个边界——错钟设备的现场只有这一条线索
  return null;
}
```

- **边界取闭区间**：恰好等于 `now + 上界` 或 `now − 下界` 放行，与 D4「超界拒收」一致
- `now` 通过 `ConsumerDeps.now?: () => number` 注入，单测可造固定的时钟
- `stats` 增加 `clockOutOfRange`，日志 `reason` 用 **`clock-out-of-range`**。⚠️ 不要叫 `tsOutOfRange`：既有的 `outOfRangeTs` 是「ts 不落在 usage 区间」，两者差一个词序、语义完全不同，混了排障必读错
- **日志按秒聚合**：错钟设备会让每一条报文都越界，逐条 `warn` 会刷屏——与超限同一纪律，按秒打一条累计（条数与设备数），逐条细节降为 debug
- 顺序在 `resolvePoint` 之前：时钟越界与设备是否存在无关，先挡能避免把错钟设备计成 `unknown-device`

**验收**：单测覆盖「超前 1 ms 拒」「恰好在界内放行」「落后 1 ms 拒」；日志字段含两个边界。

### 2.2 T2 报文上限（server）

`env.schema.ts` 新增 `IOT_MAX_MESSAGE_BYTES`，缺省 `262_144`。`AppConfigService` 暴露 `iotMaxMessageBytes`，订阅端构造生产者时传入。

`TelemetryProducer.send()` 在**尝试入队之前**判定，落盘路径因此一并覆盖：

```ts
const bytes = Buffer.byteLength(raw, 'utf8');
if (bytes > this.options.maxMessageBytes) {
  this.logger.warn(`报文超限（${bytes} > ${this.options.maxMessageBytes} 字节），拒收`);
  return 'oversized';
}
```

- **订阅端在解析之前挡**：`handleMessage` 先按 `payload.byteLength` 判，超限直接计 `oversized` 并返回——上限保护的是进程内存与 CPU，不只是队列
- **补投也过闸**：`drainSpill` 重新入队前按字节再判一次，升级前遗留的超限缓冲行不会绕过
- `TelemetryProducer.send()` 仍按字节判一次（覆盖所有调用方），落盘路径因此一并覆盖
- `SendDisposition` 增加 `'oversized'`——它是**去向**，不是 `dropped` 的子集：丢弃是「缓冲满 / 落盘失败」，超限是「报文本身不合格」
- `TelemetryWindow` / `TelemetryWindowCounter` 增加 `oversized` 与 `recordOversized()`；每秒聚合日志增加「超限 N 条」一列
- **`report()` 的 `active` 求和必须加上 `oversized`**，否则一台只发超限报文的设备会让这一秒完全静默
- 订阅端的 `enqueue()` 增加对应分支；`unreadable` 仍与去向正交
- 按**字节**算，不按 `.length`（中文 JSON 下差近三倍）
- **超限日志限频**：producer 侧每满 1 秒打一条 warn（累计条数），避免一台误配置设备把日志刷爆；逐条细节降为 debug
- EMQX 的 1 MB 保持默认，作为硬顶；应用层 256 KB 是为了让「256 KB – 1 MB」这一段可被我们计数（D4 §3）

**验收**：生产者在超限时既不入队也不落盘、返回 `'oversized'`；恰好等于上限放行；多字节字符按字节拒绝；聚合窗口能读出超限条数。

### 2.3 T3 `RETIRED` 状态与快照纳入

**迁移**：`IotDeviceStatus` 增加 `RETIRED`。SQL 只有一条 `ALTER TYPE "IotDeviceStatus" ADD VALUE 'RETIRED';`——纯增量，不改写已有行，可在非空库上执行。迁移文件不引用新值，避免「同一事务里用刚加的值」的限制。

**快照与期望集**：

- `snapshot.builder.ts` 的设备查询改为 `status: { in: ['ACTIVE', 'RETIRED'] }`
- `DeviceRegistryRepository.listSubtablesOfActiveDevices` 的设备过滤同样改为 `in`，并**改名为 `listSubtablesOfRegisteredDevices`**——过滤扩大后名字里的「Active」已不准确，留着会让下一个读代码的人按名字理解
- `findActiveDevice` / `listActiveDevices` **不动**：它们要的是「在用」，退役设备没有 open usage，本来就查不到
- `schema.prisma` 的 `IotDeviceStatus` 注释改为三态说明，去掉「没有退役语义」

**消费侧不改**：退役设备的 usage 已闭合，`ts ≥ toAt` 由区间判定拒收，`ts < toAt` 的晚到历史仍接受（D5 §2.2）。快照里不带状态，消费不需要读它。

**验收**：注销后不重启 worker，快照仍含该设备；`subtable:audit` 退出 0；同一份快照下，`ts ≥ toAt` 的报文落 `out-of-range-ts`。

### 2.4 T4 注销与撤销入口

`DELETE /api/v1/iot/devices/:localDeviceId`。同一个入口覆盖注销已生效设备与撤销未生效设备，区别只在 `toAt` 的取值。路径参数先过 T0 的 `checkLocalDeviceId`，不合法直接 400。

`DevicesService.retire(rawLocalDeviceId)`：

```text
normalizeLocalId → 404 若设备不存在
事务内：SELECT id FROM "IotDevice" WHERE "localDeviceId" = ? FOR UPDATE
  ├─ 已 RETIRED ⇒ 若有 open usage 则按同一公式补闭合（修复不一致态），
  │                返回状态与最终 toAt；statusChangedAt 不变（幂等）
  ├─ open usage 存在 ⇒ toAt = max(now, usage.fromAt)
  │    ├─ fromAt ≤ now（已生效）⇒ toAt = now
  │    └─ fromAt > now（未生效）⇒ toAt = fromAt，零长区间
  ├─ status = RETIRED、statusChangedAt = now
  └─ 无 open usage（结构不一致）⇒ 只置状态，响应 `effectiveTo: null`
提交后 INCR rev
```

- 行锁用 `tx.$queryRaw` 的 `FOR UPDATE`：注销与复活并发时，后到的一个看到的是已提交的状态
- 重复注销返回 200，`toAt` 与 `statusChangedAt` 都不变
- `PENDING` 设备（正常流程不产生）按无 open usage 处理，只置状态
- 响应：`{ localDeviceId, deviceId, status: 'RETIRED', effectiveTo }`
- 不调用 TDengine，不删表、不删行

**验收**：见 §3。

### 2.5 T5 改期入口

`PATCH /api/v1/iot/devices/:localDeviceId`，body `{ fromAt }`（ISO 8601，必填）。路径参数同样先过 `checkLocalDeviceId`。

`DevicesService.reschedule(rawLocalDeviceId, fromAt)`：

1. 行锁设备；要求 `status = ACTIVE` 且恰有一条 open usage，否则 409 `device-not-scheduled`
2. 当前 `usage.fromAt > now`，否则 409 `device-effective`（已生效的时段不可改）
3. 目标 `fromAt > now`，否则 409 `from-at-not-future`
4. `versionAtOrThrow(versions, 目标)`：仍须落在模型覆盖范围内，返回该时刻的版本；不满足 409
5. 目标与当前相同 ⇒ 幂等返回，不写库
6. 更新 `usage.fromAt` 与 `usage.version`；提交后 INCR rev

- 改期**不动表**：子表在注册时已经建好
- 想立即生效：撤销后重新注册（注册允许 `fromAt` 早于 now，D1 §2.4）

**验收**：改期后按新区间选版本；已生效设备改期 409；目标在过去 409；目标早于模型最早版本 409。

### 2.6 T6 复活（同型号）

`POST /api/v1/iot/devices` 的既有入口，在 `findActiveDevice` 返回 null 后按状态分流：

```text
existing.status = RETIRED 且 modelCode 相同 ⇒ 复活
existing.status = RETIRED 且 modelCode 不同 ⇒ 409 registered-to-other-model
existing.status = PENDING                  ⇒ 409 device-not-active（保持原语义）
```

复活步骤：

1. 解析模型版本；无 ACTIVE 版本 ⇒ 409 `model-not-active`
2. `fromAt`（默认 now，**允许早于 now**，与注册一致）过 `versionAtOrThrow`
3. **不重叠**：新 `fromAt` 不得早于**所有非空 usage 的 `toAt` 最大值**；被撤销留下的零长 usage 不参与判断。若仍存在 open usage（结构不一致）⇒ 409 `schema-mismatch`，不自动闭合
4. 应有子表齐全：属性取**所有版本的并集**（与注册一致），原始子表与降采样子表逐名检查；缺一张 ⇒ 409 `schema-mismatch`，不自动补
5. 事务内：行锁设备、复查 `RETIRED`、`status = ACTIVE`、`statusChangedAt = now`、新开 usage；请求带了 `protocolVersion` 就更新，没带保留原值
6. 提交后 INCR rev；响应与注册同形，`ddl: []`

⚠️ 子表校验用并集而不是「当前 ACTIVE 版本的属性」：退役期间模型可能加过属性，物理列是历史并集（D2 §11.4）。

⚠️ **复活前的空档不补**：`ts` 落在 `[旧 toAt, 新 fromAt)` 的晚到数据按 `out-of-range-ts` 丢弃。设备确实退役过，这是正确语义，不是丢数据；要覆盖这段只能把 `fromAt` 指定到旧 `toAt` 及之后。

**验收**：同型号复活后 `deviceId` 与子表名不变、新 usage 生效；不同型号 409；手工删一张子表后复活 409 且 PG 不留半条。

### 2.7 T7 孤儿清理脚本

**分层**：逻辑放 `apps/iot-worker/src/subtables/cleanup.ts`（纯函数 + 注入查询 / 执行），CLI 放 `scripts/subtable-cleanup.ts`。

```ts
export interface CleanupDeps {
  query: AuditQuery;                       // 复用审计的只读查询
  exec(sql: string): Promise<void>;
}
export async function cleanupOrphans(
  deps: CleanupDeps,
  expected: readonly ExpectedSubtable[],
  options: { apply: boolean; retries?: number }
): Promise<{ report: AuditReport; dropped: string[]; failed: string[] }>
```

**闸门**（闸 2/3 不满足退出 1；快照不存在退出 2，与审计同口径；任一不满足都不删任何东西）：

1. 快照不存在（`readRegistryState` 返回 null）⇒ 退出 2
2. 期望集为空 ⇒ 拒绝判定，退出 1
3. 快照不新鲜：`builtAt` 超过 10 分钟，或 `built` 缺失、`rev ≠ built` ⇒ 拒绝，退出 1——防止拿滞后快照把刚注册的表删掉
4. **新表保护期**：创建时间不足 10 分钟的表不进删除名单（注册是「先建 TD 表 → 提交 PG → INCR」，这段在途窗口快照看不到）；创建时间读不出按新表处理；dry-run 与 `--apply` 都列在 `skippedYoung` 里，保证名单与实删一致

**删除顺序**：`orphanRaw` 全部删完，再删 `orphanDs`。

- 中断时残留为孤儿降采样子表，它不被降采样读取，是惰性的
- 反过来先删降采样，会让降采样读到孤儿原始子表却写不进目标表，**整级重算失败**（D5 §2.3）
- 单表 `DROP TABLE IF EXISTS <db>.<name>`，失败重试 3 次（间隔递增），仍失败记 error 并继续
- 只删名单里的名字，不按前缀匹配

**CLI 参数**：`--apply`（缺省 dry-run）、`--json`、`--list-all`。dry-run 打印四个桶与待删名单后退出 0；`--apply` 结束后重新跑一次审计并打印剩余。

`snapshot/read.ts` 增加 `readRegistryState(redisUrl)`：一次连接读 `snapshot` / `built` / `rev`，返回 `{ snapshot, built, rev }`；`readSnapshotOnce` 保留给审计。

**验收**：dry-run 名单与 `--apply` 实际删除逐名一致；快照缺失 / 空 / 陈旧三种情形均拒绝；删除顺序为原始优先；单表失败时其余继续、退出码非 0。

### 2.8 T8 配置与文档

| 位置 | 改动 |
| --- | --- |
| `.env.example` | `IOT_MAX_MESSAGE_BYTES = 262144`、`INGEST_TS_MAX_FUTURE_MS = 86400000`、`INGEST_TS_MAX_PAST_MS = 7776000000` |
| `docker-compose.yml` | server / worker 的 `environment` 白名单转发上述三个变量，否则 `.env` 里调了容器也收不到 |
| `apps/iot-worker/package.json` | 新增 `subtable:cleanup` 脚本入口 |
| `docs/engineering/build-and-verify.md` | 脚本表加 `subtable:cleanup`（dry-run 默认与三条闸）；e2e 套件清单加 `iot-lifecycle`；审计那句「正式删除归注销流程」改为「孤儿由清理脚本回收」 |
| `docs/architecture/contracts.md` | `localDeviceId` 的字符与长度规则 |
| `docs/architecture/backend.md` | 时间戳边界与计数、报文上限与超限去向、worker env 列表、`RETIRED` 生命周期与三条新路由、快照纳入退役设备、清理脚本、**把「大于本地版本才拉」改为「版本不同即拉」** |
| 任务 README | S6 交付段与验收证据；验证命令加 `iot-lifecycle.e2e-spec.ts` 与 `subtable:cleanup` dry-run |
| `docs/governance/backlog.md` | 关闭「批内同键」并写口径；「子表只增不减」补一句「清理脚本已落地，数据仍按 KEEP 保留」 |
| `docs/governance/iot-stage-map.md` | 闭环保留；S6 交付后更新「注销 ↔ 子表清理」的状态描述 |

### 2.9 T9 测试

| 测试 | 覆盖 |
| --- | --- |
| `packages/contracts` 单测 | `checkLocalDeviceId`：空串 / 超长 / 非法字符 / 大写归一化 |
| `config.test.ts` | 时间戳边界 env **留空 ⇒ 用默认值**（不被 coerce 成 0）；显式 0 仍是合法配置 |
| `consumer.test.ts` | 时间戳上 / 下界、恰好边界、`clockOutOfRange` 计数与日志；注销后（闭合 usage）的报文落 `outOfRangeTs` |
| `telemetry-producer.spec.ts` | 超限不入队不落盘、恰好上限放行、多字节按字节算、日志限频；**补投的超限行不入队** |
| `telemetry-window.spec.ts` / `telemetry-subscriber.service.spec.ts` | `oversized` 列、`active` 求和与聚合日志；**超限报文在解析前被拒、不进在线视图** |
| `iot-registration.e2e-spec.ts` | 非法 `localDeviceId` 400 且不落库 |
| `iot-lifecycle.e2e-spec.ts` | 注销生效 / 幂等、快照仍含设备、`toAt` 与 `max(now, fromAt)`、改期、撤销零长区间、同型号复活、换型 409、缺表 409、未知设备 404、存量非法编号仍可注销 |
| `subtable-cleanup.test.ts` | 闸门三态、原始优先、失败继续、dry-run 不执行；**新表保护期与创建时间读不出时跳过** |
| 清理脚本真 TD 用例 | 造两张孤儿表 → dry-run 名单 → `--apply` 删除 → 重跑归零，验证库名限定与重复执行幂等；`finally` 清掉自己造的表 |
| 既有套件 | server：registration / scheduling / snapshot；worker：单测与 `consumer-snapshot.e2e`（消费环改动），全绿 |

## 3. 顺序与验收

```text
T0 标识符校验（独立；T4 / T5 的路由依赖它）
T1 时间戳边界（独立，不改 schema）
T2 报文上限（独立，不改 schema）
T3 RETIRED + 快照（迁移，其他任务的共同前提）
T4 注销 / 撤销
T5 改期
T6 复活
T7 清理脚本（只依赖 T3 的快照口径）
T8 / T9 文档与验收
```

每个任务完成即跑对应单测；T3 之后跑一次 server 全量 e2e；收口跑 `pnpm check` 与 `doc:lint`。

worker e2e 前先 `docker compose stop worker`（两者消费同一队列，worker 会抢走测试 job），并按任务 README 导出指向宿主的业务 `REDIS_URL`；e2e 用例自造快照。

**S6 完成的判据**：README 的验收证据里能回答四件事——越界 `ts` 有独立计数、超限报文在入队前被拒且可数、注销 / 改期 / 撤销 / 复活四条路径都有真库用例、清理脚本的 dry-run 名单与实删一致。

## 4. 危险动作

| 动作 | 风险 | 闸 |
| --- | --- | --- |
| 给枚举加 `RETIRED` | 非空库上的结构变更 | 只有 `ALTER TYPE ... ADD VALUE`，不改写数据；不跑 `down -v`；测试库与本地库直接 `migrate deploy` |
| e2e 建 / 删 TD 表 | 污染开发库 | 用例用 `e2e-life-` 前缀，`finally` 删自己建的表与行 |
| 清理脚本 `--apply` | 删错表不可恢复 | 默认 dry-run；三条新鲜度闸；只删审计名单；原始优先 |
| 手工构造过期快照 | 脚本误判孤儿 | 闸门直接拒绝，不做「尽力猜」 |

## 5. 不做

- **读接口返回单位**：本增量没有任何时序 / 档案读接口，这一项没有载体。挂到查询接口增量（看板 / 曲线读取立项时），S6 只保证写入侧拒收单位不符与模型里有单位
- 换型号（改挂模型）——触发点见 D5 §4
- 预约注销 / 到期自动退役
- 设备列表与查询接口
- 模型删除、退役设备的数据/表回收
- 降采样读取侧按注册表裁剪（清理脚本只降低概率，不改读法）
- 批量注销

## 6. 本计划做的判断（可否决）

| # | 判断 | 理由 | 否决的代价 |
| --- | --- | --- | --- |
| 1 | 时间戳边界加在 worker 消费环，不加在订阅端 | 计数与丢弃都在消费环；订阅端只做路由 | 订阅端多一次解析，且两处口径要同步 |
| 2 | 恰好等于边界放行 | 与 D4「超界拒收」的字面一致 | 边界日的数据会被误伤 |
| 3 | 超限作为独立去向 `oversized` | 「丢弃」里能区分缓冲满与报文不合格 | 指标混装，排障时读不出原因 |
| 4 | `RETIRED` 进快照，消费不读状态 | 审计与历史 ts 都需要它；闭合区间已足够表达停止接收 | 审计红，或消费多一个判断维度 |
| 5 | `toAt = max(now, fromAt)` | 一个公式同时覆盖注销（now）与撤销（零长） | 两个入口两套边界，易错 |
| 6 | 改期只允许「当前与目标都在未来」 | 已生效时段的数据已按旧区间写入，改期不可追溯 | 需要一套数据层面的补偿 |
| 7 | 复活只认同型号，子表校验用全版本并集 | D5 定了换型不做；物理列是历史并集 | 退役期间模型演进过的设备复活会被误判缺表 |
| 8 | 清理脚本原始优先、带快照新鲜度与 **10 分钟新表保护期** | 中断残留惰性；滞后快照或在途注册会误删刚建的表 | 中断态可能让降采样整级失败 / 误删 |
| 9 | 注销与撤销共用一个 `DELETE` | 语义只差 `toAt` 的取值 | 两个入口、两套幂等 |
| 10 | 行锁用 `SELECT … FOR UPDATE` | 注销 / 复活 / 改期并发时后到者看到已提交状态 | 并发下可能出现两条 open usage |
| 11 | `localDeviceId` 注册收紧为标识符规则；注销 / 改期只归一化 | 它要进 MQTT 主题段与 HTTP 路径；存量非法编号仍必须有停止接收的入口 | 注册不收紧则路由不稳定；注销也严格校验则存量设备无法注销 |

## 7. 与既有决策的接缝

- **D1**：快照查询从 `ACTIVE` 扩到 `ACTIVE + RETIRED`；消费仍按 usage 区间判定，不读设备状态。改期与复活都走写入口的 `INCR rev`，A4 的 2 秒口径不变
- **D2 §11**：复活与改期都不动列集合；退役不改写历史解释
- **D3**：注销不删表，注册失败仍只删本次建的表；复活缺表不自动补
- **D4**：时间戳边界与报文上限按卡执行；告警接收方仍缺位，计数只是可观测的量
- **D5**：本计划是它的代码落地，语义以卡为准

## 8. 已知未解（由本计划带出或保留）

| # | 项 | 状态 |
| --- | --- | --- |
| 1 | 注销后的「封存历史」会让 `out-of-range-ts` 与排期前、换型间隙混装 | 计数已分开 `clockOutOfRange`（时钟）与 `outOfRangeTs`（区间），但区间内三因未拆；告警接收方落地时再拆 |
| 2 | 复活要求子表齐全，模型演进过的退役设备可能因历史漏建而复活失败 | 报 `schema-mismatch` 并列缺表，由人工或后续补建命令处理；审计工具只读，不承担补建 |
| 3 | 清理脚本的新鲜度闸只能降低误删概率 | dry-run + 人工确认是第二道闸 |
| 4 | 降采样仍会读孤儿原始子表 | 清理降低概率；读取侧裁剪另立 |
