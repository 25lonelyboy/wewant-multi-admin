# S3 · 物模型定义：实施计划

- **日期**：2026-11-04｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S3 与 [D2 决策卡](2026-11-02-d2-decision-card.md) §2.3 / §2.4 / §2.5 / §2.6 / §11
- **出口**：① 模型可定义——属性 / 服务 / 事件的三元组结构，类型、单位、量程、每属性聚合集、结构体子字段；② 模型可校验——非法定义被拒且给明确错误码（含非法聚合组合）；③ 降采样列能由属性列表**算出来**（D2 §6 第 2 条）；④ 拿 P1 三测点走一遍，推导出的列集合与现有 `p1` 超表一致（§6 第 3 条）
- **前置**：D2 全部已定（含 §11 版本与版本快照），无未决决策

## 1. 形状

| # | 任务 | 落在 |
| --- | --- | --- |
| T1 | 属性档位、聚合矩阵、列类型映射 | `packages/device-registry/src/model-types.ts` |
| T2 | 模型结构、校验器与错误码 | `packages/device-registry/src/model-validate.ts` |
| T3 | 版本快照与状态 | `model-types.ts`（类型）+ 校验（`model-validate.ts`） |
| T4 | 降采样列推导（纯函数） | `packages/device-registry/src/model-derive.ts` |
| T5 | P1 的模型定义（第一份真模型） | `packages/device-registry/src/p1-model.ts` |
| T6 | 单测与文档 | `src/model-*.spec.ts` + `docs/architecture/` |

**四条边界**：

- **S3 不落库**：模型与版本快照在这里只是类型和平纯函数。持久化归 S2（档案表）与 S4（注册写入），建表归 S5
- **S3 不建表**：`model-derive` 只产出"列清单"（列名 + 列类型），DDL 由 S5 生成
- **service / event 只留结构**：声明即报告"已定义未实现"，不做通路、不做参数形状
- **文件平铺在 `src/`**：`device-registry` 的测试脚本是 `node --import tsx --test src/*.spec.ts`，只匹配一层。不为此改 glob

## 2. 设计

### 2.1 T1 属性档位与聚合矩阵

八个**声明档位**（建模者视角），与 S1 的六个**存储档位**是两层：

```ts
export type PropertyKind =
  | 'float'
  | 'double'
  | 'int'
  | 'bigint'
  | 'bool'
  | 'enum'
  | 'string'
  | 'struct';

export type Aggregate = 'sum' | 'count' | 'min' | 'max';
export const AGGREGATES = ['sum', 'count', 'min', 'max'] as const;
```

映射到存储列（D2 §2.4）：

| 声明档位 | 列类型 | 线上值 | 配套字段 |
| --- | --- | --- | --- |
| `float` / `double` | `FLOAT` / `DOUBLE` | number | `range` 可选 |
| `int` / `bigint` | `INT` / `BIGINT` | number | `range` 可选 |
| `bool` | `BOOL` | boolean | — |
| `enum` | `INT` + 取值表 | number | `enumValues` 必填 |
| `string` | `VARCHAR(N)` | string | `varcharLength` 必填 |
| `struct` | `VARCHAR(N)`（JSON） | object | `varcharLength` + `fields` 必填 |

**类型 × 聚合允许矩阵**（D2 §2.5）——唯一的真值来源，校验与推导都读它：

```ts
export const AGGREGATE_MATRIX: Record<PropertyKind, readonly Aggregate[]> = {
  float: ['sum', 'count', 'min', 'max'],
  double: ['sum', 'count', 'min', 'max'],
  int: ['sum', 'count', 'min', 'max'],
  bigint: ['sum', 'count', 'min', 'max'],
  bool: ['count', 'min', 'max'],
  enum: ['count', 'min', 'max'],
  string: ['count'],
  struct: ['count']
};
```

`array` 不在 `PropertyKind` 里——传进来即 `invalid-kind`，这就是 D2 §6 第 1 条要的"明确拒绝码"。

**聚合集缺省为空**：声明里不写就是 `[]`，该属性不产生降采样列、也不进降采样 SQL（D2 §2.5）。空集是安全缺省——忘了声明的后果是"没有降采样"，不是"多出一列没人算的值"。

### 2.2 T2 模型结构与校验

```ts
export interface PropertyDecl {
  key: string;
  kind: PropertyKind;
  /** 仅数值 / 字符串 / 结构体有意义；bool 与 enum 带单位即非法 */
  unit?: string;
  /** 仅数值与枚举；闭区间 */
  range?: { min: number; max: number };
  /** 可为空；空集不产生降采样列 */
  aggregates: readonly Aggregate[];
  /** kind 为 string / struct 时必填，≤ MAX_VARCHAR_BYTES */
  varcharLength?: number;
  /** kind 为 enum 时必填 */
  enumValues?: readonly number[];
  /** kind 为 struct 时必填；子字段只允许标量，不允许嵌套结构与数组 */
  fields?: readonly StructField[];
  /** 分组是模型元数据，**不进列名**（D2 §2.6） */
  group?: string;
}

export interface ThingModel {
  modelCode: string;
  version: number;
  /** 属性 / 服务 / 事件的 key 在同一模型内共享一套命名空间 */
  properties: readonly PropertyDecl[];
  services: readonly ServiceDecl[];
  events: readonly EventDecl[];
}
```

**校验返回问题列表，不是首错即停**——S4 的注册接口要一次把所有问题回给建模人：

```ts
export type ModelIssueCode =
  | 'invalid-model-code' // 用 S1 的 checkModelCode
  | 'invalid-property-key' // 用 S1 的 checkMetricKey
  | 'duplicate-key' // 归一化后重复：属性 × 属性、属性 × 服务 × 事件
  | 'invalid-kind' // 不在八档内，含 array
  | 'missing-field' // 该档位缺配套字段（enumValues / varcharLength / fields）
  | 'unexpected-field' // 该档位不该有的字段（如 bool 带 unit、string 带 range）
  | 'invalid-aggregate' // 不在 AGGREGATE_MATRIX 允许集内
  | 'invalid-varchar-length'
  | 'invalid-range'
  | 'invalid-enum-values'
  | 'invalid-struct-field'; // 子字段档位非法 / 重名 / 嵌套

export type ModelIssue = { path: string; code: ModelIssueCode };

export type ModelValidation =
  | { ok: true; model: ThingModel; warnings: ModelIssueCode[] }
  | { ok: false; issues: ModelIssue[] };
```

几点：

- **`duplicate-key` 是 S1 留下的那一条**：S1 只能做单键规则，"撞大小写"要集合上下文，落在这里
- **`warnings` 装 `'service-not-implemented'`**：声明了服务或事件不拒绝，但要报告"已定义未实现"（范围定稿 S3 出口）
- **子字段的 key 复用 `checkMetricKey`**：一套规则比两套少出错。子字段不进列名，58 字符的限制对它是宽松的
- **属性 key 与列名的对应是 1:1**，所以 `dsColumnsOf` 可以直接拿 key 拼聚合列名

### 2.3 T3 版本与状态

按 D2 §11：**物理一份、逻辑多版**。

```ts
export type VersionStatus = 'PENDING' | 'ACTIVE' | 'FAILED';

export interface ModelVersion {
  modelCode: string;
  version: number;
  status: VersionStatus;
  /** 该版本声明的属性集——快照，不可变 */
  properties: readonly PropertyDecl[];
  /** 起止；ACTIVE 时才有起始 */
  effectiveFrom?: number;
  effectiveTo?: number;
}
```

- 版本号从 **1** 起，单调递增，不复用
- **不可变的是快照**：一个版本一旦 `ACTIVE`，其 `properties` 不再改；要改就出新版本
- 状态迁移只定义集合与含义，迁移由谁触发归 S4；S3 只提供 `isVersionStatus(value)` 与"终态"的判定（`ACTIVE` 不是终态，可转 `FAILED`；`FAILED` 是终态）

### 2.4 T4 降采样列推导

```ts
export interface DerivedColumn {
  name: string;
  type: MetricColumnTypeValue;
}

/** 按属性声明顺序 × 聚合的固定顺序（sum, count, min, max）展开 */
export function dsColumnsOf(
  properties: readonly PropertyDecl[]
): DerivedColumn[];
```

- **列序必须确定**：属性按声明顺序、聚合按 `AGGREGATES` 的固定顺序。DDL、行编解码、对账三处都读这一个函数，列序才不会漂
- 聚合列为空集的属性**不产生列**（D2 §2.5）
- 聚合列的存储类型：

| 聚合 | 列类型 |
| --- | --- |
| `sum` | 数值档位取 `DOUBLE`；整数档位取 `BIGINT` |
| `count` | `BIGINT` |
| `min` / `max` | 与源列同类型 |

⚠️ `sum` 的整数档位取 `BIGINT` 是**推断**，不是实测：SUM 一个 `INT` 列可能溢出 32 位。S5 建表前用一条 `SELECT SUM(<int 列>)` 确认返回类型，不成立就改这张表。

**与现有 `p1` 的对照**（D2 §6 第 3 条）：三个 `float` 属性、各声明四个聚合，推导结果就是 `ts + 12 列 + deviceId 标签`，与 S0.5 落地的降采样超表一致。

### 2.5 T5 P1 的模型

第一份真模型，也是 S5 的输入：

```ts
export const P1_MODEL: ThingModel = {
  modelCode: P1_MODEL_CODE, // 'p1'，由 p1.ts 提供
  version: 1,
  properties: [
    { key: 'temperature', kind: 'float', unit: '°C', range: { min: -50, max: 200 }, aggregates: ALL_FOUR },
    { key: 'vibration', kind: 'float', unit: 'mm/s', range: { min: 0, max: 100 }, aggregates: ALL_FOUR },
    { key: 'current', kind: 'float', unit: 'A', range: { min: 0, max: 100 }, aggregates: ALL_FOUR }
  ],
  services: [],
  events: []
};
```

量程与 `DEFAULT_METRIC_RANGES` 同值。**不 import 它**——`DEFAULT_METRIC_RANGES` 在 `apps/iot-worker`，方向反了；两处在 S5 合成一处（worker 从模型取量程），届时 worker 的那份常量退场。

模型必须能通过自己的校验器，这条写进单测——否则"P1 模型"和"校验规则"会各说各话。

### 2.6 T6 单测与文档

| 文件 | 覆盖 |
| --- | --- |
| `src/model-types.spec.ts` | 矩阵每一格（含 `sum` 配 `bool` 被拒）、列类型映射、`array` 不在八档内 |
| `src/model-validate.spec.ts` | 每个错误码至少一例；`p1` 模型通过；服务 / 事件只出 warning；大小写归一后重名被拒 |
| `src/model-derive.spec.ts` | 列序确定；空聚合集不产列；P1 三属性推出 12 列且与 S0.5 的 DS 列名逐字一致 |

文档：`docs/architecture/contracts.md` 补一句"模型定义与校验在 device-registry"；`backend.md` 的 iot 段补模型与降采样列的推导关系；任务 README 记录状态与证据。

## 3. 顺序与验收

```text
T1 → T2 → T3 → T4 → T5 → T6
```

| 验收 | 怎么证明（对得上哪条出口） |
| --- | --- |
| 非法定义被拒 | 每个 `ModelIssueCode` 有单测；`sum` 配 `bool`、`array` 档位、超长 VARCHAR、bool 带单位、归一后重名各一例 |
| 列集合算得出来 | `dsColumnsOf(P1_MODEL.properties)` 产出 12 列；测试以**字面量**断言这 12 个列名（`sum_temperature` … `max_current`，顺序一致）——不跨包 import worker 的建表函数，两边的对照由 S5 接线时再做（D2 §6 第 2、3 条） |
| 服务 / 事件留位 | 声明后校验通过，`warnings` 含 `service-not-implemented` |
| P1 自洽 | `P1_MODEL` 过自己的校验器 |
| 门禁 | `pnpm --filter @multi-admin/device-registry run test`、`pnpm check`、`pnpm doc:lint` 全绿 |

## 4. 危险动作

无。S3 不改存储、不建表、不碰运行中的链路；最坏情况是加错了类型定义，改回来即可。

## 5. 不做

- 落 PG / 建表 / 注册接口 → S2、S4
- 把 `RAW_METRICS` 与 `DS_CODEC` 换成模型驱动 → S5（判据 B）
- 结构体序列化与子字段校验的实现 → S5
- 单位与量程的写入侧比对 → S5 / S6
- 版本迁移与历史回填 → P1 之后
- service / event 的参数形状与通路 → 下行增量
- 拆新包：模型代码暂住 `device-registry`。**触发点**——S4 需要它而 `device-registry` 又不宜再长，或模型文件超过 4 个时，拆成 `packages/thing-model`

## 6. 改动面清单

| 文件 | 改什么 |
| --- | --- |
| `packages/device-registry/src/model-types.ts` | 新增：八档、聚合、矩阵、声明类型、`ModelVersion`、`VersionStatus` |
| `packages/device-registry/src/model-validate.ts` | 新增：`validateModel` 与 `ModelIssueCode` |
| `packages/device-registry/src/model-derive.ts` | 新增：`dsColumnsOf` |
| `packages/device-registry/src/p1-model.ts` | 新增：P1 模型常量 |
| `packages/device-registry/src/index.ts` | 导出三个新模块 |
| `packages/device-registry/src/model-*.spec.ts` | 新增三个测试文件 |
| `docs/architecture/contracts.md` | 模型归属一句话 |
| `docs/architecture/backend.md` | 模型 ↔ 降采样列的推导关系 |
| `docs/tasks/.../README.md` | 状态与证据 |

**核对过、确认不改**：`apps/iot-worker`（列集合仍由 `RAW_METRICS` 决定，S5 才换）、`apps/iot-simulator`、`apps/nestjs-server`、`packages/contracts`。

## 7. 本计划做的四处判断（可否决）

| 判断 | 理由 | 否决的后果 |
| --- | --- | --- |
| S3 不落 PG | S2 定表、S4 写入；S3 先把形状与校验钉死，避免三处并行改 | S3 变大，且会与 S2 抢表设计 |
| 聚合集缺省空 | 空集只损失降采样，不产生没人算的列 | 改为必填或默认四聚合，需同步改建模体验 |
| `sum` 的整数档位取 `BIGINT` | 防 32 位溢出；未经实测 | 若 TDengine 返回别的类型，S5 建表前要改这张表 |
| 模型代码留在 `device-registry` | 与 S1 的词汇同包，S4 直接用；不轻易新建 workspace | 包定位继续变宽，迟早要拆 |
