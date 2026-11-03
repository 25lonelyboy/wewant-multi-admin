# S0.5 · 单设备单子表：实施计划

- **日期**：2026-11-04｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S0.5 与 [D2 决策卡](2026-11-02-d2-decision-card.md)
- **出口**：① 子表名 `{模型编码}_{deviceId}`，超表名 `{模型编码}`；② 载荷无 `localPointId`，档案无采集点层；③ 超表与降采样表的单位列全部移除；④ 审计退出 0、`tdengine:init` 幂等、`consumer.e2e` 全过
- **不依赖任何未决决策**——D1 / D3 / D5 都与它无关

## 1. 形状

| # | 任务 | 性质 |
| --- | --- | --- |
| T1 | 契约与档案层：删采集点 | 类型收缩，无存储变化 |
| T2 | 命名：超表 `{模型编码}`、子表 `{模型编码}_{deviceId}` | 改存储布局 |
| T3 | 删单位列（原始 + 降采样） | 改列集合 |
| T4 | 测试与 e2e 同步 | 跟随前三项 |
| T5 | 文档同步 | 事实源 |
| T6 | 验收 | 全链路取证 |

**三条事实前提**：

- 模拟器**不发** `localPointId`（`apps/iot-simulator/src/telemetry.ts:29` 只构造 `localDeviceId` / `ts` / `metrics`），所以删字段不动模拟器
- 载荷的 `unit` 字段**保留**——它在 S3/S5 用于与模型声明比对；S0.5 只是不再落列
- P1 尚无物模型，用一个占位模型编码 `p1` 衔接 S3；`RAW_METRICS` 三测点常量**本任务不动**（判据 B 留给 S5）

## 2. 设计

### 2.1 T1 契约与档案层

**契约**：`TelemetryPayload` 删 `localPointId?`。

**档案类型**（`packages/device-registry/src/types.ts`）：

```ts
export interface DeviceRecord {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;          // 原 singlePoint + points 由这一项取代
}

export type DeviceLookupFailure = 'unknown-device';   // 原四种缩为一种

export type PointResolution =
  | { ok: true; deviceId: string; modelCode: string; subtable: string }
  | { ok: false; reason: DeviceLookupFailure };

export interface SubtableRef {
  name: string;
  deviceId: string;
  modelCode: string;          // 原 pointKey 由这一项取代
}
```

`resolve()` 返回值里带 `subtable`，让建表、写入、审计三处共用同一个名字来源。

**档案实现**（`registry.ts`）：

```ts
// registry.ts —— 命名的唯一出处，建表、写入、审计三处共用
export function subtableName(modelCode: string, deviceId: string): string {
  return `${modelCode}_${deviceId}`.toLowerCase();
}
```

`resolve()` 简化为：查不到 → `unknown-device`；查到 → 组装 `{ deviceId, modelCode, subtable }`。`MAX_LOCAL_POINT_ID_LENGTH` 随点层一起删除。

**p1.ts**：新增并导出 `P1_MODEL_CODE = 'p1'`；`p1DeviceRecords()` 每台设备返回 `{ localDeviceId, deviceId, modelCode: P1_MODEL_CODE }`。

**下游字段引用**：`detection.ts` 的 `DetectedSample.localPointId` 与 `consumer.ts` 日志里的 `localPointId` 一并删除——契约去掉字段后这两处会编译失败，属于必改项，不是可选清理。

### 2.2 T2 命名

`schema.ts` 的稳定名由常量改为函数：

```ts
export function rawStableName(modelCode: string): string { return modelCode; }
export function dsStableName(modelCode: string, level: DsLevel): string {
  return `${modelCode}_${level}`;
}
```

四个 DDL 构造函数改为接收 `modelCode`：`createRawStableStatement(modelCode)`、`createDsStableStatements(modelCode)`、`alterDsMinuteKeepStatement(modelCode)`；两个子表构造函数从 `SubtableRef` 取 `modelCode`。

⚠️ **超表名的来源有两处，不止 `dsStableName`**：

- `dsStableName` 被 `audit.ts`、`verify.ts`、`tdengine-init.ts` 三处调用，签名加 `modelCode`
- `downsample/query.ts:30` 的 `FROM ${RAW_DATABASE}.${RAW_STABLE}` 是**另一处**——它不经过 `dsStableName`

**降采样链要一路传 `modelCode`**：`buildAggregateSql(modelCode, spec, startMs, endMs)`；`ring.ts` 每 tick 遍历模型编码列表，逐个调用。单模型时循环一次，多模型时每条超表各算一次。`verify.ts` 的读查询与超表存在性检查同理。

⚠️ **建表与计算必须同形**：`tdengine-init` 按模型建表而降采样环不按模型计算，会造成「建了 N 张超表、只算 1 张」。S0.5 只有一个模型，这种不一致不会被暴露，但会留到 S4。

**`consumer.ts`**：查档后直接用 `resolved.subtable`，不再自己拼字符串。

**`registry-cache.ts`**：缓存键从 `localDeviceId + separator + localPointId` 简化为 `localDeviceId`。

**`tdengine-init.ts`**：按 `allSubtables()` 里出现过的 `modelCode` 去重，逐个建超表与降采样超表：

```ts
const subtables = p1DeviceRegistry.allSubtables();
const modelCodes = [...new Set(subtables.map(s => s.modelCode))];
for (const code of modelCodes) {
  await sql.exec(createRawStableStatement(code));
  for (const stmt of createDsStableStatements(code)) await sql.exec(stmt);
  await sql.exec(alterDsMinuteKeepStatement(code));
}
```

**`subtable-audit.ts`**：期望集从 `allSubtables()` 推导出两个集合——原始超表名 = 各 `modelCode`，降采样超表名 = 各 `modelCode × level`；分类逻辑按这两个集合判断，不再比较固定的 `RAW_STABLE`。

**两个脚本的期望集反而不用改**：`downsample-verify.ts:187` 与 `subtable-audit.ts:66` 都经 `allSubtables()` 取名字（`sub.name` / `sub.deviceId`），不碰 `pointKey`——`allSubtables()` 一改它们自动跟上。审计要改的只有上面那条分类逻辑。

### 2.3 T3 删单位列

四处同步，缺一处就会对不上：

| 文件 | 改法 |
| --- | --- |
| `schema.ts` | 原始超表每测点只留值列；降采样每测点只留四聚合 |
| `downsample/query.ts` | 删 `LAST(<metric>_unit)` 与 `units` 数组 |
| `downsample/rows.ts` | 删 `UNIT_OFFSET` 与 `unit` 字段；`DS_CODEC.columns` 去掉单位列 |
| `downsample/verify.ts` | `dsSelectColumns()` 去掉单位列；对账循环不再比单位 |
| `tdengine/writer.ts` | `RAW_CODEC.columns` 去掉 `${metric}_unit`；`PendingRow.metrics[].unit` 可留（不落列） |

⚠️ **列序是隐式契约**：`buildAggregateSql` 的 SELECT 列序 ↔ `parseAggregateRows` 的下标 ↔ `DS_CODEC.columns` 的顺序，三者必须同时改。降采样行从 16 列变 13 列（`ts` + 3×4）。

### 2.4 T4 测试与 e2e

| 文件 | 改什么 |
| --- | --- |
| `registry.spec.ts` | **整组删除**多点用例（multiPoint / missing-point / unknown-point / point-id-too-long），失败原因从四种缩为一种 |
| `registry-cache.test.ts` | 缓存键断言 |
| `detection.test.ts` | 删 `localPointId` 两个用例 |
| `schema.test.ts` | 超表/子表名带模型编码；列数断言 16 → 13 |
| `consumer.e2e.ts` | 子表名改由 `p1DeviceRegistry.resolve('sim-001')` 取 `subtable` |
| `downsample-*.e2e.ts`（4 个） | 超表名与列数 |
| `downsample-rows.test.ts` / `-query.test.ts` / `-verify.test.ts` | 列偏移与列名 |

### 2.5 T5 文档

`contracts.md`（删 `localPointId` 描述）、`backend.md`（子表命名、单位列）、`build-and-verify.md`（对账列清单去掉单位）、`repo-structure.md` 与 `iot-stage-map.md`（两处都写了 `pointKey`）、`AGENTS.md`（若提到子表名）、任务目录 README 的接缝与验收证据。

## 3. 顺序与验收

```text
T1 → T2 → T3 → T4 → T5 → T6
```

每个任务结束时 `pnpm --filter @multi-admin/iot-worker run test` 与相关包的测试必须绿；T4 之后跑 e2e。

| 验收 | 怎么证明 |
| --- | --- |
| 命名生效 | `SHOW <db>.TABLES` 出现 `p1` 与 `p1_<deviceId>`，无 `_001` 后缀 |
| 列集合 | `DESCRIBE wewant_iot.p1` 中无任何 `_unit` 列；降采样表 13 列 |
| 幂等 | `tdengine:init` 连跑两次，表数与名集合一致 |
| 审计 | `subtable:audit` 四桶全空、退出 0 |
| 链路 | `consumer.e2e` 全过；`downsample:verify` 在有流量时通过 |
| 单元 | `pnpm check` 全绿 |

## 4. 危险动作

| 动作 | 影响 | 闸 |
| --- | --- | --- |
| 重建开发库 | 现有 100 + 300 张表名字全变、少一列 | 只在本地开发环境；先 `docker compose down -v` 再 `ops:env-up` |
| 跑 e2e | 与 compose 里的 worker 抢同一队列 | 先 `docker compose stop worker` |

## 5. 不做

- 物模型的真正定义与派生（S3 / S4）
- 把 `RAW_METRICS` 换成模型驱动（S5，判据 B）
- 聚合集按属性声明（S5）
- 结构体（S3 定义、S5 序列化）
- 审计期望集扩成"设备 × 用过的模型"（S2 落地档案历史后才成立）
- 多模型的**端到端验证**：S0.5 只有一个模型，循环分支靠单测用假列表覆盖，端到端不覆盖多模型

## 6. 环境前置

`pnpm ops:env-up`；tdengine 当前已启动（2026-11-04 为实测 VARCHAR 上限启动过）。

## 7. 改动面清单（逐个核对过）

| 文件 | 改什么 |
| --- | --- |
| `packages/contracts/src/iot/telemetry.ts` | 删 `localPointId?` |
| `packages/device-registry/src/types.ts` | `DeviceRecord.modelCode`；`PointResolution` 带 `subtable`；`SubtableRef.modelCode`；失败原因缩为 `unknown-device` |
| `packages/device-registry/src/registry.ts` | `subtableName(modelCode, deviceId)`；`resolve` 简化；删 `MAX_LOCAL_POINT_ID_LENGTH` |
| `packages/device-registry/src/p1.ts` | 导出 `P1_MODEL_CODE`；记录带 `modelCode` |
| `packages/device-registry/src/registry.spec.ts` | 删整组多点用例 |
| `apps/iot-worker/src/schema.ts` | 稳定名函数化；删单位列 |
| `apps/iot-worker/src/detection.ts` | 删 `localPointId` 字段与校验 |
| `apps/iot-worker/src/consumer.ts` | 用 `resolved.subtable`；删日志字段 |
| `apps/iot-worker/src/registry-cache.ts` | 缓存键去掉点维 |
| `apps/iot-worker/src/downsample/query.ts` | 传入 `modelCode`；删单位列 |
| `apps/iot-worker/src/downsample/ring.ts` | 按模型循环 |
| `apps/iot-worker/src/downsample/rows.ts` | 删 `UNIT_OFFSET` 与单位列 |
| `apps/iot-worker/src/downsample/verify.ts` | 传入 `modelCode`；删单位列 |
| `apps/iot-worker/src/tdengine/writer.ts` | 原始行去掉单位列 |
| `apps/iot-worker/src/subtables/audit.ts` | 分类按模型编码集合 |
| `apps/iot-worker/scripts/tdengine-init.ts` | 按模型建超表与降采样超表 |
| `apps/iot-worker/scripts/subtable-audit.ts` | 期望集自动；分类随 `audit.ts` |
| `apps/iot-worker/scripts/downsample-verify.ts` | 期望集自动；调 `verify` 时传 `modelCode` |
| 测试 9 个 | `schema` / `registry-cache` / `detection` / `consumer.e2e` / `downsample-*.test` ×3 / `downsample-*.e2e` ×4 |
| 文档 7 份 | `contracts.md` / `backend.md` / `build-and-verify.md` / `repo-structure.md` / `iot-stage-map.md` / `AGENTS.md` / 任务 README |

**核对过、确认不改**：`apps/iot-simulator`（不发 `localPointId`）、`apps/pure-web`、`apps/nestjs-server` 的订阅端。
