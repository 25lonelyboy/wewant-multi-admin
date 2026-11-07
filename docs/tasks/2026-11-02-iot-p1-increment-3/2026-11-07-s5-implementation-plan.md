# S5 · 消费与降采样接线：设计与实施计划

- **日期**：2026-11-07｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S5 与 [D1 决策卡](2026-11-07-d1-decision-card.md)
- **出口**：注册一台新类型设备（含 BOOL 与枚举测点，可指定生效时刻）后**不重启 worker**，上报能落到新建的原始子表；降采样按该模型声明的列与聚合算出结果；判据 B 成立——测点集合、类型、量程全部来自物模型
- **前置**：D1 已定（2026-11-07）；S4 已交付注册接口与按声明生成的 DDL；S2 已交付四张档案表

## 0. 与代码对齐后的六处事实

开工前把决策卡逐条对本仓代码核了一遍。方向成立，六处按代码修正实现方式：

| # | 事实 | 出处 | 对实现的影响 |
| --- | --- | --- | --- |
| 1 | **消费环先检测后查档** | `consumer.ts:168` 调 `detect(data)`，`consumer.ts:194` 才 `cache.resolve(...)` | 顺序必须倒过来：先解析身份与 `ts`，从快照取声明，再过滤测点。`detect()` 拆成 `parseEnvelope` + `filterByDeclaration` |
| 2 | **检测把值收窄成 `number`** | `detection.ts:33` `value: number` | 八档里 bool / enum / string / struct 都不是 number，类型要放宽并按声明校验 |
| 3 | **降采样列类型随属性档位变** | `model-types.ts:40` `AGGREGATE_COLUMN_TYPE` | `min` / `max` 对 float 是 FLOAT、对 double 是 DOUBLE、对 int 是 INT、对 bool 是 BOOL。`DS_CODEC` 现在按聚合名硬编码（`rows.ts:110`），不成立 |
| 4 | **降采样行按位置解析** | `rows.ts:59` 的 `AGGREGATE_OFFSET` / `AGGREGATE_COLUMNS_PER_METRIC`，与 `query.ts:19` 的 SELECT 列序耦合 | SQL 与解析必须共用同一份列清单，改成参数传入 |
| 5 | **worker 只有队列 Redis** | `config.ts` 仅 `QUEUE_REDIS_URL` | 新增 `REDIS_URL`（业务缓存），与队列实例分开 |
| 6 | **`usage.version` 是复合外键的一员** | `schema.prisma:157` | `SetNull` 在复合外键含必填字段时不成立。改 `Restrict` + 撤销事务里先置空（已回写决策卡 §2.4 约束 8） |

**已实测（2026-11-07，本机 3.4.2.8）**：`MIN` / `MAX` 对 `BOOL` 列、`COUNT` 对 `VARCHAR` 列均可执行，返回类型分别是 `BOOL` / `BOOL` / `BIGINT`。`AGGREGATE_COLUMN_TYPE` 的矩阵成立——降采样不会因为属性是布尔或字符串而在查询层失败。探针用完即删，未留在 TDengine 里。

## 1. 形状

| # | 任务 | 落在 |
| --- | --- | --- |
| T1 | 快照类型进包 + 绑定类型补齐 | `packages/device-registry` / worker `writer.ts` |
| T2 | server 侧快照构建与重建 | `apps/nestjs-server/src/modules/iot/registry-snapshot/` |
| T3 | 写路径挂 rev | `models.service` / `devices.service` |
| T4 | 排期、撤销与迁移 | `prisma/schema.prisma` + 迁移 + `models` / `devices` 的 DTO 与服务 |
| T5 | worker 侧快照客户端 | `apps/iot-worker/src/snapshot/` |
| T6 | 消费环改造 | `consumer.ts` / `detection.ts` / 新增 `resolve.ts` `filter.ts` |
| T7 | 降采样环改造 | `downsample/{query,rows,ring}.ts` |
| T8 | 脚本与审计 | `subtables/audit.ts` / `downsample/verify.ts` |
| T9 | 测试与文档 | `test/` + `docs/` |

**四条边界**：

- 不动 `packages/contracts`：快照类型进 `device-registry`（D1 §2.8）
- 不实现**设备档案**的改期与撤销、注销、换型（D5 / S6）；模型版本的排期与撤销在 T4
- 不做快照分片、Pub/Sub 通知、HTTP 调试接口（D1 §4 触发点）
- 下行命令、事件通路仍不做

## 2. 设计

### 2.1 T1 快照类型与绑定类型

新增 `packages/device-registry/src/snapshot.ts`：

```ts
export type BindKind =
  | 'bool'
  | 'int'
  | 'bigint'
  | 'float'
  | 'double'
  | 'varchar';

export interface SnapshotColumn {
  name: string;
  bindKind: BindKind;
}

/** 降采样列：带上聚合与来源属性，SQL 与绑定都不必再从列名反推 */
export interface SnapshotDsColumn {
  level: DsLevel;
  name: string;
  aggregate: Aggregate;
  property: string;
  bindKind: BindKind;
}

export interface SnapshotVersion {
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  properties: PropertyDecl[];
}

export interface SnapshotModel {
  modelCode: string;
  /** 物理原始列并集，按首次出现顺序 */
  rawColumns: SnapshotColumn[];
  /** 物理降采样列并集 */
  dsColumns: SnapshotDsColumn[];
  versions: SnapshotVersion[];
}

export interface SnapshotDevice {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  fromAt: string;
  toAt: string | null;
}

export interface RegistrySnapshot {
  version: number;
  builtAt: string;
  models: SnapshotModel[];
  devices: SnapshotDevice[];
}

/** 列类型字符串 → 绑定类型；认不出返回 `null`，由调用方判为构建失败 */
export function bindKindOfColumnType(type: string): BindKind | null;
```

`bindKindOfColumnType` 只看前缀：`FLOAT` → `float`、`DOUBLE` → `double`、`INT` → `int`、`BIGINT` → `bigint`、`BOOL` → `bool`、`VARCHAR(` → `varchar`。**列名与类型都来自这里，worker 不再调 `rawColumnOf` / `dsColumnsOf`**。

`packages/device-registry/src/index.ts` 导出新模块。

**包内收尾**（决策卡 §2.8）：`p1.ts` / `p1-model.ts` / `registry.ts`（含 `DeviceRegistry` 接口）与 worker 的 `registry-cache.ts` 在 T6、T7 改完之后删除，包内只剩命名、设备标识、快照类型、列类型、标识符校验、模型声明与推导。

⚠️ 删除前先拆依赖，否则 `pnpm check` 会在三处断掉：

| 依赖方 | 现在用 | 改成 |
| --- | --- | --- |
| `apps/nestjs-server/prisma/seed.ts` | `P1_MODEL` / `p1DeviceRecords` | 把这两个 fixture 搬进 `seed.ts` 本地——它们是**种子数据**，不是运行期档案 |
| `apps/iot-worker/scripts/tdengine-init.ts` | `p1DeviceRegistry.allSubtables()` | 本地写死 P1 三测点与 100 台设备的命名规则（该脚本本来就 dev-only） |
| `apps/iot-worker/scripts/subtable-audit.ts` / `scripts/downsample-verify.ts` | 同上 | 改读业务 Redis 的快照（见 §2.8） |
| worker 的 5 个 e2e / 单测 | `p1DeviceRegistry` | 改用手写的快照 fixture |

worker 侧 `apps/iot-worker/src/tdengine/writer.ts`：

- `ColumnKind` 扩 `'bool' | 'int'`（`writer.ts:50`）
- `bindColumn` 补 `setBoolean` / `setInt` 两个分支——`@tdengine/websocket` 的 `StmtBindParams` 已有这两个方法，不引入依赖

### 2.2 T2 server 侧快照构建与重建

目录 `apps/nestjs-server/src/modules/iot/registry-snapshot/`：

| 文件 | 职责 |
| --- | --- |
| `snapshot.keys.ts` | 五个键名常量，S5 只有它们知道键叫什么 |
| `snapshot.builder.ts` | 读库 + 组装，纯函数式，可单测 |
| `snapshot.rebuilder.ts` | Nest provider：500ms 节拍、锁、条件写、60 秒兜底 |
| `snapshot.revision.ts` | `bump()` / `read()`，供写路径与重建器共用 |

**读取顺序**（`snapshot.builder.ts`）：

```text
① rev = GET iot:registry:rev
② 同一事务（RepeatableRead）：
     devices = iotDevice.findMany({ where: { status: 'ACTIVE' }, include: { usages: true } })
     models  = iotDeviceModel.findMany({ include: { versions: true } })   只留有版本的
```

⚠️ **先读 rev 再读库**。反过来会把「读库期间发生的新变更」标成已建，那一次变更就永久看不到了。

**列并集**：

```text
rawColumns：按版本顺序遍历 properties，key 首次出现即收录
            → rawColumnOf → { name, bindKind }
dsColumns ：按版本顺序遍历 dsColumnsOf(properties)，按 name 去重
            → { level, name, aggregate, property, bindKind }
```

⚠️ 任一 `rawColumnOf` / `dsColumnsOf` 失败（库里的 JSON 坏了）⇒ **整轮构建失败**：不写快照、不推进 `built`、记 error。跳过坏的那一列会让所有设备写入失败，比不发布更糟。

**重建循环**（`snapshot.rebuilder.ts`，每 500ms）：

```text
built = GET iot:registry:built
if snapshot 不存在 or rev > built or 距上次成功重建 ≥ 60s:
    if SET iot:registry:rebuild-lock <id> NX PX 2000:
        try   rebuild(); 用 Lua 条件写
        finally DEL lock（比较 value 再删，防误删他人的锁）
```

条件写用一段 Lua，**不拆成两条命令**：

```lua
local built = tonumber(redis.call('GET', KEYS[1]) or '-1')
if tonumber(ARGV[1]) <= built then return 0 end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[1], ARGV[1])
return 1
```

⚠️ 载荷约 1 MB 作为 `ARGV` 传入是可行的（Redis 单值上限 512 MB），但会独占一个时间片；P1 规模下约几毫秒，超过 10 MB 时按 D1 §4 的触发点改分片。

**60 秒无条件重建**是正确性的一部分，不是优化：`PG commit → INCR` 之间崩溃时 `rev` 不会前进，只有无条件重建能补。

### 2.3 T3 写路径挂 rev

`ModelsService` 的新模型创建、发布新版本、撤销版本，`DevicesService.register`，都在 **PG 事务提交之后**调 `revision.bump()`（即 `INCR iot:registry:rev`）。

⚠️ 模型发布路径里 `bump()` 的位置要精确：S4 的 §2.5 是 ① ALTER → ② 降采样 ALTER → ③ PG 事务切换版本 → ④ 为已有设备补建降采样子表。**放在 ③ 提交之后、④ 之前**。④ 是 DDL，不改变快照内容；等它跑完再 bump 会让新版本在所有设备补建完之前对 worker 不可见。
⚠️ **不能放进事务里**：事务内的 `INCR` 先于提交，重建器可能读到未提交的数据。
⚠️ **`bump()` 失败只记 error，不影响接口返回**：PG 已经提交，让请求失败会误导调用方以为没建成功；漏掉的 rev 由 60 秒兜底补上。

### 2.4 T4 排期、撤销与迁移

本任务把决策卡 §2.4 的写侧落地：三处入参、一处撤销、一次迁移。

**迁移**

```prisma
model IotDeviceModelUsage {
  version      Int?
  modelVersion IotModelVersion? @relation(
    fields: [modelCode, version],
    references: [modelCode, version],
    onDelete: Restrict
  )
}
```

⚠️ **Prisma 是否接受「复合外键里部分字段可空」要先在 scratch 库上验**。不接受则退化为**去掉关系**、`version` 保留为普通可空列 + `@@index([modelCode, version])`，完整性由服务层守（注册时校验版本存在）。两条路都要同步 `test/iot-registry.e2e-spec.ts` 的「指向不存在版本的 usage 被拒」用例。

同一次迁移里收紧 `IotModelVersion.effectiveFrom` 为非空（决策卡 §7 第 6 条）：

```sql
UPDATE "IotModelVersion" SET "effectiveFrom" = "createdAt" WHERE "effectiveFrom" IS NULL;
ALTER TABLE "IotModelVersion" ALTER COLUMN "effectiveFrom" SET NOT NULL;
```

**发布可指定生效时刻**

`POST /api/v1/iot/models` 的 DTO 加可选 `effectiveFrom`，缺省 `now`。

```text
校验：effectiveFrom 严格大于当前最新版本的 effectiveFrom（决策卡约束 1）
事务：前驱 → SUPERSEDED、effectiveTo = 新版本的 effectiveFrom
      新版本 → ACTIVE、effectiveFrom = 传入值
```

⚠️ **不做回溯**：传入值早于最新版本一律 400。回溯会改写历史数据的解释，而这正是整张卡要避免的错误类型。

**注册可指定生效时刻**

`POST /api/v1/iot/devices` 的 DTO 加可选 `fromAt`，缺省 `now`。

```text
校验：fromAt ≥ 模型最早版本的 effectiveFrom
      不满足 → 409，data 带 earliestEffectiveFrom
选取：usage.version = fromAt 时刻生效的那一版
```

⚠️ **允许 `fromAt` 早于 `now`**：设备先装、后登记时，这段时间的晚到数据不该被丢。它与「模型不做回溯」不冲突——回溯改的是**声明**，补登改的是**档案起点**。

**撤销版本**

`DELETE /api/v1/iot/models/:modelCode/versions/:version`。

```text
前置：effectiveFrom > now（只有未来版本可撤）
覆盖检查：撤销后模型是否仍覆盖全部已建档设备的 fromAt；不满足 → 409，data 列出受影响设备
事务：① updateMany usage where { modelCode, version } → { version: null }
      ② delete IotModelVersion
      ③ 前驱（若有）effectiveTo 置 null
```

⚠️ 覆盖检查与删除必须在**同一个 `$transaction`** 里，否则并发注册会钻进来。⚠️ 第 ③ 步不能省：不回填，前驱会停在「被已删版本覆盖」的边界上，之后的时段没有版本覆盖。

**不做独立的改期接口**：修改已发布版本的生效时刻，用「撤销 + 重新发布」替代——版本号会跳，正合决策卡约束 6 的「版本号不复用」。等真有「不想跳号」的运维需求再加。

### 2.5 T5 worker 侧快照客户端

新增 `apps/iot-worker/src/snapshot/client.ts`：

```ts
export class RegistrySnapshotClient {
  /** 首拉，失败退避重试直到成功 */
  async start(): Promise<void>;
  /** 未就绪时抛错——启动门禁已挡住，走到这里是编码错误 */
  current(): RegistrySnapshot;
  async close(): Promise<void>;
}
```

- 每 `REGISTRY_POLL_MS`（默认 500）`GET iot:registry:built`，大于本地 `version` 才 `GET iot:registry:snapshot` 并整份替换
- **拉取 / 解析失败保留旧快照继续跑**，记 error 并累加「已陈旧秒数」；超过 `REGISTRY_STALE_ALERT_MS`（默认 60000）升为 error
- 每轮 `SET iot:registry:worker-version:{instanceId} <version> EX 30`
- `instanceId = hostname-pid`
- 用独立 ioredis 连接业务 Redis（`REDIS_URL`），不与队列连接复用

`config.ts` 新增：`REDIS_URL`（必填）、`REGISTRY_POLL_MS`、`REGISTRY_STALE_ALERT_MS`。

`index.ts` 重排：

```text
config → logger
await snapshot.start()          ← 冷启动门禁
leader 选举循环启动
consumer.start()
ring = 当前是 leader ? new DownsampleRing(config, logger, snapshot) : null
```

⚠️ `start()` 之前不构造 consumer / ring：用空快照跑会把全部数据当 `unknown-device` 丢掉，且计数看起来像设备故障。业务 Redis 挂了、队列还在时，**积压比静默丢数据好**（决策卡 §2.6）。

### 2.6 T6 消费环改造

**`detection.ts` 拆成两层**：

```ts
export interface Envelope {
  localDeviceId: string;
  ts: number;
  metrics: Array<{ key: string; value: unknown }>;
}

export type ParseFailure =
  | 'malformed'
  | 'missing-device'
  | 'bad-ts'
  | 'no-metrics';

export function parseEnvelope(raw: string): Envelope | { reason: ParseFailure };
```

只做 JSON / 顶层 / 字段存在性校验，**不碰测点集合**——集合要等拿到声明才知道。

**新增 `apps/iot-worker/src/resolve.ts`**：

```ts
export type PointResolution =
  | {
      ok: true;
      deviceId: string;
      modelCode: string;
      subtable: string;
      properties: readonly PropertyDecl[];
    }
  | { ok: false; reason: 'unknown-device' | 'out-of-range-ts' };

export function resolvePoint(
  snapshot: RegistrySnapshot,
  localDeviceId: string,
  ts: number
): PointResolution;
```

判定链（决策卡 §2.3）：

1. `normalizeLocalId` → 在设备索引里找 `fromAt ≤ ts < (toAt ?? ∞)` 的那条
2. 用它的 `modelCode` 找模型索引，再在 `versions[]` 里找 `effectiveFrom ≤ ts < (effectiveTo ?? ∞)`
3. 子表名 `subtableName(modelCode, deviceId)`

⚠️ **索引必须在快照换入时建好，不能在查询时线性扫**：一万台设备 × 每秒上百条报文时，逐条扫 `devices` 是 O(N) 的。客户端在整份替换时同时建两个 `Map`：

```ts
interface SnapshotIndex {
  snapshot: RegistrySnapshot;
  byLocalId: Map<string, SnapshotDevice[]>; // 一台设备可能有多条 usage（换型）
  byModelCode: Map<string, SnapshotModel>;
}
```

`resolvePoint` 只读这个索引；`SnapshotDevice[]` 按 `fromAt` 升序，`effectiveTo` 为 `null` 的排在最后。设备数万级、每设备一条 usage 时这是 O(1)；一台设备有多条 usage 时是 O(usage 数)，通常 ≤ 2。

**新增 `apps/iot-worker/src/filter.ts`**：

```ts
export interface AcceptedMetric {
  key: string;
  bindKind: BindKind;
  value: number | bigint | string | boolean;
}

export function filterByDeclaration(
  metrics: readonly { key: string; value: unknown }[],
  properties: readonly PropertyDecl[]
): {
  accepted: AcceptedMetric[];
  notInModel: string[];
  invalid: string[];
};
```

| 档位 | 接受条件 | 绑定 |
| --- | --- | --- |
| `float` / `double` | 有限数，落在 `range` 内 | `float` / `double` |
| `int` / `bigint` | 有限**整数**，落在 `range` 内 | `int` / `bigint` |
| `bool` | `typeof === 'boolean'` | `bool` |
| `enum` | 有限整数，且命中 `enumValues` | `int` |
| `string` | 字符串，UTF-8 字节数 ≤ `varcharLength` | `varchar` |
| `struct` | 对象且非数组，`JSON.stringify` 后字节数 ≤ `varcharLength` | `varchar` |

⚠️ 超长**拒收不截断**（D2 §2.4）。⚠️ 枚举越界按非法丢弃——与「未知测点丢弃」同源，都是「声明优先」。

⚠️ **单位要校验，而且拒的是整行**。D2 §10 的推论 2 写死：「写入侧拒绝与模型声明不符的单位；不符即是错误，不是警告」，收尾段又写「与声明不符即拒绝，不落行」。载荷的 `unit` 是必填字段（`packages/contracts/src/iot/telemetry.ts:71`），今天被检测层原样复制、被写入器完全忽略。S5 按 `property.unit ?? ''` 与载荷逐字比较；不符时**整条样本丢弃**而不是只丢那个测点——单位错意味着这台设备的量纲解释整体不可信。

⚠️ **全部测点被过滤后要丢整条**：`accepted.length === 0` 时 ack 该 job、计数、不构造行。否则 `RAW_CODEC` 会产出一条只有 `ts` 的空行写进子表。今天这个判断由 `detect()` 的 `no-metrics` 承担，拆开之后必须显式补回来。

**`consumer.toRow` 的顺序**：

```text
parseEnvelope → resolvePoint → filterByDeclaration → 构造行
```

⚠️ 与今天相反（今天先 `detect` 再 `cache.resolve`）。倒过来之后，未知设备与未知属性都能带上 `localDeviceId` 打日志。

`PendingRow` 改成：

```ts
interface PendingRow {
  subtable: string;
  ts: number;
  metrics: AcceptedMetric[];
}
```

`RAW_CODEC.columns(row)` 变成 `[{ name: 'ts', kind: 'timestamp' }, ...row.metrics]`，`signature` 用列名拼接。**不再有全局 `RAW_METRICS`**。

**删除**：`registry-cache.ts`、`DEFAULT_METRIC_RANGES`、`RAW_METRICS` / `RawMetric`、`DetectedMetric` / `DetectedSample` / `detect()`。

**计数器**（`consumer.stats`）：

| 计数 | 含义 |
| --- | --- |
| `unknown-device` | 设备不在快照 |
| `out-of-range-ts` | 设备在快照，但 `ts` 不落在任何 usage / 版本区间 |
| `metric-not-in-model` | 按 `(modelCode, key)` 累加，WARN 日志带 key |
| `metric-invalid-value` | 类型不符 / 超量程 / 枚举越界 / 超长 |
| `unit-mismatch` | 载荷单位与声明不符，整条丢弃（D2 §10） |
| `empty-after-filter` | 过滤后一个测点都不剩，整条丢弃 |

### 2.7 T7 降采样环改造

**`query.ts`**：

```ts
export function buildAggregateSql(
  modelCode: string,
  spec: DsLevelSpec,
  startMs: number,
  endMs: number,
  columns: readonly SnapshotDsColumn[]
): string;
```

聚合表达式按 `columns` 的顺序生成：`SUM(<property>) AS <name>`、`COUNT(...)`、`MIN(...)`、`MAX(...)`。**不按聚合名硬编码类型**。

**`rows.ts`**：`parseAggregateRows(rows, level, columns)`，下标由列清单推出；`DS_CODEC.columns(row)` 由行自带的列清单生成，`kind` 取 `bindKind`。

⚠️ `query.ts` 与 `rows.ts` 必须共用同一份列清单——今天它们靠「SELECT 列序 ↔ 按下标解析」隐式耦合，改成显式传入后这个隐式约定要写进注释。

**`ring.ts`**：

- 每 tick 从 `snapshot.current()` 取模型清单与列清单
- 删掉构造时快照 `modelCodes` 的做法与那段注释——本地读不会失败，原顾虑不成立
- 每个模型 × 每级一条 SQL

**选主**（决策卡 §2.7）：

```text
follower：每 PX/3 尝试 SET iot:downsample:leader <id> NX PX <3×tick>
          抢到 ⇔ 构造 DownsampleRing
leader  ：每 PX/3 续期（Lua 比较 value 再 PEXPIRE）
          续期失败 ⇔ 关闭 ring、转回 follower
```

⚠️ 锁放**队列 Redis**（降采样的调度本来就在 BullMQ 上），不放业务 Redis。
⚠️ 只有 leader 才有 ring——这样任何时刻只有一个实例在消费降采样 job、用同一份本地快照，三类不一致一起消失。

### 2.8 T8 脚本与审计

- `src/subtables/audit.ts`：期望集从 `p1DeviceRegistry.allSubtables()` 改为**读业务 Redis 的快照**（`devices[]` 展开原始子表名 + 每模型每级降采样子表名）。这是 README「已知未修」里「整个模型退场时审计静默」的补法
- `src/downsample/verify.ts`：模型清单同样改读快照；无快照时打印原因并以退出码 2 结束
- `scripts/tdengine-init.ts`：保留 P1 写死，注释标明 dev-only（触发点已在 S4 计划中登记）

### 2.9 T9 测试与文档

**单测**：

| 用例 | 断言 |
| --- | --- |
| `bindKindOfColumnType` | 六个类型 + `VARCHAR(64)` 各归各档；未知类型返回 `null` |
| 快照 builder | 两版声明下有属性被删时 `rawColumns` 仍含该列；`dsColumns` 的 `bindKind` 随档位不同 |
| `resolvePoint` | usage 区间 × 版本区间的四种组合；一台设备两条 usage 时按 ts 选对；越界各自返回对应 reason |
| `filterByDeclaration` | 六档的正例与非法例（超量程、非整数、枚举越界、超长）；单位不符整条拒收；过滤后为空时返回空 `accepted` |
| `parseAggregateRows` | 按传入列清单解析；列清单顺序改变时结果不变 |
| leader 选举 | 两实例只有一个抢到；续期失败转 follower |
| 条件写 Lua | 旧版本写入被拒、新版本写入成功 |

**worker e2e**（真 Redis + 真 TDengine）：

| 用例 | 断言 |
| --- | --- |
| 新设备落库 | 写一份只含 `p1` 的快照，投一条报文，子表里查到数据 |
| 不重启切模型 | 快照替换为含新属性与 BOOL 测点的版本，同进程再投一条，新列有值且类型正确 |
| 按 ts 分录 | 快照里 v1 `[t0,t1)`、v2 `[t1,∞)`；`ts<t1` 的晚到报文落 v1 的列，`ts≥t1` 的落 v2 |
| 未知设备 / 越界 ts | 各自计数 +1，不写库 |
| 冷启动 | 业务 Redis 无快照时进程不启动消费者 |
| 降采样跨版本窗口 | 边界窗口的 `count_<属性>` 反映该属性的样本数，`sum/count` 还原的均值正确 |

**server e2e**：

| 用例 | 断言 |
| --- | --- |
| 重建器 | 注册一台设备后 2 秒内 `iot:registry:built` 前进 |
| 兜底重建 | 手工删掉 `built`（模拟 INCR 丢失），60 秒内恢复 |
| 撤销回填 | 发布未来版本后撤销：`usage.version` 置空、版本行消失、前驱 `effectiveTo` 为 `null` |
| 排期与越界 | `test/iot-scheduling.e2e-spec.ts`：发布未来生效的 v2、注册 `fromAt` 在未来、`fromAt` 早于模型最早生效时刻 → 409 且带最早可生效时刻 |
| 空壳撤销被挡 | 模型有排期设备时撤销其唯一版本 → 409 并列出受影响设备 |

**文档**：

- `docs/architecture/backend.md`：worker 的档案来源从「编译期常量」改为「快照 + 本地全量 + 按 ts 判口径」，补五个 Redis 键
- `docs/architecture/repo-structure.md`：`device-registry` 的定位收窄（命名 / 设备标识 / 快照类型），`model-derive` 等的去向
- 任务 README：S5 状态、验收证据、已知未修更新（审计那条划掉）

## 3. 顺序与验收

```text
T1 → T4 → T2 → T3 → T5 → T6 → T7 → T8 → T9
```

T1 最先——类型是其余任务的公共面。T4 早做——它既重生成 Prisma client，又是快照内容的来源（版本区间与 usage），晚做会让前面写过的代码再改一次。

| 验收 | 怎么证明 |
| --- | --- |
| 判据 A | 注册一台新设备与一个新模型，**不重启 worker**，上报能落到新建子表 |
| 判据 B | 测点集合、类型、量程全部来自模型声明；`RAW_METRICS` 与 `DEFAULT_METRIC_RANGES` 从仓库消失 |
| 判据 C 的运行时部分 | 新模型带 BOOL 与枚举测点，值按声明类型写入并能回读 |
| 不重启切版本 | 模型发 v2 后，跨度两侧的报文各按自己的 `ts` 解释 |
| 提前建单 | 模型 v1 明天生效，今天建档、`fromAt` 设为明天 → 成功；明天之前的报文计 `out-of-range-ts` |
| 生效期越界拒绝 | `fromAt` 早于模型最早生效时刻 → 409，`data` 带最早可生效时刻 |
| 撤销回填 | 发布未来生效的 v2 后撤销：`usage.version` 置空、版本行消失、前驱 `effectiveTo` 回到 `null` |
| 空壳撤销被挡 | 模型有排期设备时撤销其唯一版本 → 409，`data` 列出受影响设备 |
| 降采样跟随 | 新属性按声明的聚合集产生列；跨版本窗口的值符合 NULL 语义 |
| 门禁 | `pnpm check`、`pnpm doc:lint`、worker 与 server 的 e2e 全绿 |

## 4. 危险动作

| 动作 | 影响 | 闸 |
| --- | --- | --- |
| 迁移把 `usage.version` 改为可空 | 复合外键行为变化；Prisma 可能拒绝生成 | scratch 库先跑；备好「去关系」的退路 |
| 收紧 `effectiveFrom` 非空 | 库里有 `NULL` 会让迁移失败 | 迁移前 `SELECT count(*) WHERE "effectiveFrom" IS NULL` |
| 撤销版本 | 删版本行 + 置空使用史，不可恢复 | 只在 `effectiveFrom > now` 时允许；覆盖检查与删除同一事务；e2e 用独立模型编码；不做级联删除模型 |
| 发布 `effectiveFrom` 在未来 | 模型处于「有 ACTIVE 但不生效」的状态，是新增的合法态 | 注册侧必须有「`fromAt` 越界」校验兜住，否则设备会建进空档 |
| 删 `RAW_METRICS` / `detect()` | 一次性大改，编译面覆盖整个 worker | 不做兼容层；编译不过正好说明有漏改 |
| 冷启动门禁 | 业务 Redis 不可达时 worker 不消费，队列积压 | 明确的日志与指标；不退化成空快照运行 |
| leader 选举 | 两个 leader 会并发写同一窗口 | 续期失败立即关闭 ring；锁放队列 Redis |
| 快照条件写 | 版本倒退会让 worker 拿旧数据 | 用 Lua 原子比较，不拆成两条命令 |

## 5. 不做

- 设备档案的改期与撤销、注销、换型 → D5 / S6（**模型**版本的排期与撤销在 T4）
- 模型版本的独立改期接口——用撤销 + 重发替代（见 §2.4）
- 快照分片、Pub/Sub 通知、快照 HTTP 调试接口 → D1 §4 触发点
- 下行命令、事件通路、可写属性
- 结构体的字段级列（仍整条序列化存一列）
- `ops:tdengine-init` 的通用化

## 6. 改动面清单

| 文件 | 改什么 |
| --- | --- |
| `packages/device-registry/src/snapshot.ts` | 新增：快照类型与 `bindKindOfColumnType` |
| `packages/device-registry/src/index.ts` | 导出快照模块；随过渡物删除调整导出 |
| `packages/device-registry/src/{p1,p1-model,registry}.ts` | 删除（决策卡 §2.8），`types.ts` 一并收敛 |
| `apps/nestjs-server/prisma/seed.ts` | `P1_MODEL` / `p1DeviceRecords` 搬成本地 fixture |
| `apps/iot-worker/src/tdengine/writer.ts` | `ColumnKind` 扩 `bool` / `int`，补 bind 分支 |
| `apps/nestjs-server/src/modules/iot/registry-snapshot/*` | 新增：键、构建器、重建器、rev |
| `apps/nestjs-server/src/modules/iot/iot.module.ts` | 装配新 provider |
| `apps/nestjs-server/src/modules/iot/models/models.service.ts` | 提交后 `bump()`；发布带 `effectiveFrom`；撤销版本（覆盖检查 + 使用史置空 + 前驱回填） |
| `apps/nestjs-server/src/modules/iot/models/models.controller.ts` | 撤销版本接口 |
| `apps/nestjs-server/src/modules/iot/models/dto/model.dto.ts` | 可选 `effectiveFrom` |
| `apps/nestjs-server/src/modules/iot/devices/dto/device.dto.ts` | 可选 `fromAt` |
| `apps/nestjs-server/src/modules/iot/devices/devices.service.ts` | 提交后 `bump()`；`fromAt` 越界校验与版本选取 |
| `apps/nestjs-server/test/iot-scheduling.e2e-spec.ts` | 新增：排期、越界、撤销回填、覆盖检查 |
| `apps/nestjs-server/prisma/schema.prisma` | `usage.version` 可空；`effectiveFrom` 非空 |
| `apps/nestjs-server/prisma/migrations/<ts>_registry_snapshot/` | 上述迁移 |
| `apps/nestjs-server/test/iot-registry.e2e-spec.ts` | 随可空外键调整 |
| `apps/nestjs-server/test/iot-snapshot.e2e-spec.ts` | 新增：重建器与兜底 |
| `apps/iot-worker/src/config.ts` | 新增 `REDIS_URL` 与两个快照参数 |
| `apps/iot-worker/src/snapshot/client.ts` | 新增：拉取、轮询、观测 |
| `apps/iot-worker/src/index.ts` | 启动门禁与 leader 选举 |
| `apps/iot-worker/src/resolve.ts` | 新增：按 ts 判设备与版本 |
| `apps/iot-worker/src/filter.ts` | 新增：按声明过滤并定类型 |
| `apps/iot-worker/src/detection.ts` | 收缩为 `parseEnvelope` |
| `apps/iot-worker/src/consumer.ts` | 顺序倒置、新计数、列清单 |
| `apps/iot-worker/src/registry-cache.ts` | 删除 |
| `apps/iot-worker/src/schema.ts` | 删 `RAW_METRICS` / `RawMetric` |
| `apps/iot-worker/src/downsample/query.ts` | 按模型列构造 SQL |
| `apps/iot-worker/src/downsample/rows.ts` | 按列清单解析与绑定 |
| `apps/iot-worker/src/downsample/ring.ts` | 读快照、选主 |
| `apps/iot-worker/src/subtables/audit.ts` | 期望集改读快照 |
| `apps/iot-worker/src/downsample/verify.ts` | 模型清单改读快照 |
| `apps/iot-worker/scripts/{tdengine-init,subtable-audit,downsample-verify}.ts` | 拆掉对 `p1DeviceRegistry` 的依赖 |
| `apps/iot-worker/test/*` | 新增与改写；5 个引用 `p1DeviceRegistry` 的用例改用手写快照 fixture |
| `docs/architecture/backend.md` / `repo-structure.md` | 见 §2.9 |
| `docs/tasks/.../README.md` | 状态与证据 |

**核对过、确认不改**：`packages/contracts`（快照不进 contracts）；S4 的 DDL 生成与注册接口的入参；`packages/device-registry` 里 `naming` / `device-id` 两块。

## 7. 本计划做的判断（可否决）

| 判断 | 理由 | 否决的后果 |
| --- | --- | --- |
| 快照**带预推导的列清单**，worker 不调 `rawColumnOf` / `dsColumnsOf` | 让「推导只跑在 server」这条成立；降采样列类型随档位变，硬编码不成立 | worker 得装 `model-derive` 与 `column-type`，`device-registry` 的收窄做不成 |
| 先读 `rev` 再读库 | 反过来会把读库期间的变更标成已建，那次变更永久不可见 | 需要额外的「构建期间是否再次变更」判据，本质是同一件事 |
| `bump()` 失败不影响接口返回 | PG 已提交，返回失败会误导调用方 | 调用方会重试注册，撞幂等或唯一约束 |
| 构建失败时**整轮失败**，不跳过坏列 | 少一列会让所有设备写入失败，比不发布更糟 | 快照会长期缺列，故障更晚才被发现 |
| 枚举越界按非法丢弃 | 与「未知测点丢弃」同源，都是声明优先 | 取值表变成装饰，脏值进入存储 |
| `int` / `bigint` 拒收非整数 | TDengine 对 INT 列的浮点写入行为不确定 | 依赖隐式转换，可能静默截断 |
| 快照**不带** `usage.version` | 它只作出处，不参与判定（决策卡 §2.3） | 快照里多一个必须与 PG 同步、却不被读的字段 |
| 只有 leader 才持有降采样环 | 任何时刻一个写者、一份快照，三类不一致一起消失 | 多实例并行降采样，重叠窗口互相覆盖 |
| 60 秒无条件重建 | 唯一能兜住「commit 后崩溃导致 INCR 丢失」的手段 | 该次变更永久不可见，直到下一次注册 |
| 冷启动时消费环与降采样环一起挡住 | 空模型集合会让降采样环空转且有写入 | 两类故障混在同一次启动里 |
| 快照换入时建索引，`resolvePoint` 不做线性扫 | 万级设备下逐条扫是 O(N)，随设备数线性恶化 | 查档成为消费环唯一瓶颈 |
| 单位不符**整条**拒收，不只丢那个测点 | D2 §10 写的是「不落行」；单位错意味着这台设备的量纲解释整体不可信 | 同一条里合法的测点被赔进去 |
| 过滤后为空则整条丢弃 | 与今天的 `no-metrics` 等价，拆分后必须显式补 | 会写出只有 `ts` 的空行 |
| 快照保留设备**全部**历史 usage，不只 open 的那条 | 换型后的晚到数据要按当时的模型解释（决策卡 §2.3） | 晚到数据落到新模型的子表，列与声明对不上 |
| 不做独立改期接口，用「撤销 + 重发」替代 | 约束 6 已规定版本号不复用，改期本就是「撤未来版 + 发新版」的组合 | 多一个接口、多一组边界（与后继重叠）要维护 |
| `fromAt` 允许早于 `now` | 设备先装后登记时，那段晚到数据不该丢 | 现场补登无解，只能登记"以后"的设备 |
| 覆盖检查与删除在同一个事务里 | 分开做会让并发注册钻进来，撤销后仍有设备落进无覆盖时段 | 需要额外的补偿流程 |
| 撤销用 `DELETE` 而不是状态位 | 版本行删掉后 `usage.version` 置空即可；留一个 `REVOKED` 状态会让"现在生效哪一版"多一个判断维度 | 需要再拆一次枚举，且区间判定要多条排除条件 |

## 8. 与 D5 的接缝

- 设备的 `toAt` 由 D5 的注销流程写入；本增量只读它，不回填
- `usage.version` 置空只发生在**版本撤销**，不发生在设备注销
- 降采样环对已注销设备的历史窗口仍会重算——`K` 窗口内的重算不影响结果，K 之外的盲区已登记
