# S3 · 物模型定义：实施计划

- **日期**：2026-11-04｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S3 与 [D2 决策卡](2026-11-02-d2-decision-card.md) §2.3 / §2.4 / §2.5 / §2.6 / §11
- **出口**：① 模型可定义——属性 / 服务 / 事件的三元组结构，类型、单位、量程、每属性聚合集、结构体子字段；② 模型可校验——结构非法即拒（key、必填字段、长度、重名），给明确错误码；③ 降采样列能由属性列表**算出来**（D2 §6 第 2 条）；④ 拿 P1 三测点走一遍，推导出的列集合与 S0.5 落地的 `p1` 降采样超表一致（§6 第 3 条）
- **前置**：D2 全部已定（含 §11 版本与版本快照），无未决决策

## 1. 形状

| # | 任务 | 落在 |
| --- | --- | --- |
| T1 | 属性档位、聚合 → 列类型表 | `packages/device-registry/src/model-types.ts` |
| T2 | 声明结构、校验器与错误码 | `packages/device-registry/src/model-validate.ts` |
| T3 | 版本快照与状态 | `model-types.ts`（类型）+ 校验（`model-validate.ts`） |
| T4 | 降采样列推导（纯函数） | `packages/device-registry/src/model-derive.ts` |
| T5 | P1 的模型定义（第一份真模型） | `packages/device-registry/src/p1-model.ts` |
| T6 | 单测与文档 | `src/model-*.spec.ts` + `docs/architecture/` |

**五条边界**：

- **S3 不落库**：模型与版本快照在这里只是类型和纯函数。持久化归 S2（档案表）与 S4（注册写入），建表归 S5
- **S3 不建表**：`model-derive` 只产出"列清单"（列名 + 列类型），DDL 由 S5 生成
- **S3 不限制"能选哪些聚合"**：每个属性选哪几类聚合由建模人在定义时决定；**可选项的合法范围在 S4 的物模型定义接口里收窄**。S3 只回答"这个组合能不能算出列类型"（见 §2.4）
- **service / event 只留结构**：声明即报告"已定义未实现"，不做通路、不做参数形状
- **文件平铺在 `src/`**：`device-registry` 的测试脚本是 `node --import tsx --test src/*.spec.ts`，只匹配一层。不为此改 glob

## 2. 设计

### 2.1 T1 属性档位与聚合 → 列类型

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

**聚合 → 列类型表**：这张表不是"允许与否"的策略，是**事实**——某个聚合作用在某档位上，结果是哪种列类型。表里没有条目，就是算不出列。

```ts
export const AGGREGATE_COLUMN_TYPE: Record<
  PropertyKind,
  Readonly<Partial<Record<Aggregate, MetricColumnTypeValue>>>
> = {
  float: { sum: 'DOUBLE', count: 'BIGINT', min: 'FLOAT', max: 'FLOAT' },
  double: { sum: 'DOUBLE', count: 'BIGINT', min: 'DOUBLE', max: 'DOUBLE' },
  int: { sum: 'BIGINT', count: 'BIGINT', min: 'INT', max: 'INT' },
  bigint: { sum: 'BIGINT', count: 'BIGINT', min: 'BIGINT', max: 'BIGINT' },
  bool: { count: 'BIGINT', min: 'BOOL', max: 'BOOL' },
  enum: { count: 'BIGINT', min: 'INT', max: 'INT' },
  string: { count: 'BIGINT' },
  struct: { count: 'BIGINT' }
};
```

三条取法：

- `sum` 的整数档位取 `BIGINT`——SUM 一个 `INT` 列可能溢出 32 位
- `count` 恒为 `BIGINT`，所有档位都有
- `min` / `max` 与源列同类型

`array` 不在 `PropertyKind` 里，传进来即 `invalid-kind`——这是 D2 §6 第 1 条要的拒绝码。

**聚合集必填**：`aggregates` 不写就编译不过。不采用"缺省为空"——空集与"忘了写"在运行时不可区分，而后者会静默地让该属性没有降采样。要空就显式写 `[]`（D2 §2.5：空集不产生降采样列）。

### 2.2 T2 声明结构与校验

```ts
/** 子字段只允许标量：不嵌套结构体、不支持数组 */
export interface StructField {
  key: string;
  kind: Exclude<PropertyKind, 'struct'>;
}

/** 服务 / 事件本增量只留结构：参数形状随下行增量补 */
export interface ServiceDecl {
  key: string;
}
export interface EventDecl {
  key: string;
}

export interface PropertyDecl {
  key: string;
  kind: PropertyKind;
  /** 仅数值 / 字符串 / 结构体有意义；bool 与 enum 带单位即非法 */
  unit?: string;
  /** 仅数值与枚举；闭区间 */
  range?: { min: number; max: number };
  /** 由建模人选择；空集不产生降采样列 */
  aggregates: readonly Aggregate[];
  /** kind 为 string / struct 时必填，字节数 ≤ MAX_VARCHAR_BYTES */
  varcharLength?: number;
  /** kind 为 enum 时必填 */
  enumValues?: readonly number[];
  /** kind 为 struct 时必填 */
  fields?: readonly StructField[];
  /** 分组是模型元数据，**不进列名**（D2 §2.6） */
  group?: string;
}
```

**声明与版本两级**（D2 §11：不可变的是快照）。建模人写的是**声明**，版本号与状态由注册流程赋：

```ts
export interface ModelDeclaration {
  modelCode: string;
  properties: readonly PropertyDecl[];
  services: readonly ServiceDecl[];
  events: readonly EventDecl[];
}

export type VersionStatus = 'PENDING' | 'ACTIVE' | 'FAILED';

export interface ModelVersion extends ModelDeclaration {
  version: number;
  status: VersionStatus;
  /** 起止；ACTIVE 时才有起始 */
  effectiveFrom?: number;
  effectiveTo?: number;
}
```

**校验返回完整问题列表，不首错即停**——S4 的注册接口要一次把所有问题回给建模人：

```ts
export type ModelIssueCode =
  | 'invalid-model-code' // 用 S1 的 checkModelCode
  | 'invalid-key' // 属性 / 服务 / 事件的 key，复用 S1 的 checkMetricKey
  | 'duplicate-key' // 归一化后重复：属性 × 属性、属性 × 服务 × 事件
  | 'invalid-kind' // 不在八档内，含 array
  | 'missing-field' // 该档位缺配套字段（enumValues / varcharLength / fields）
  | 'unexpected-field' // 该档位不该有的字段（如 bool 带 unit、string 带 range）
  | 'invalid-varchar-length'
  | 'invalid-range'
  | 'invalid-enum-values'
  | 'invalid-struct-field'; // 子字段档位非法 / 重名 / 嵌套

/** 警告与错误分开：警告不阻断注册 */
export type ModelWarning = 'service-not-implemented';

export type ModelIssue = { path: string; code: ModelIssueCode };

export type ModelValidation =
  | { ok: true; declaration: ModelDeclaration; warnings: ModelWarning[] }
  | { ok: false; issues: ModelIssue[] };

/** 成功时返回**归一化后的**声明，不是入参本身 */
export function validateModel(declaration: ModelDeclaration): ModelValidation;
```

**归一化做什么**（成功分支）：

- `modelCode` 与所有 `key` 折小写——`checkModelCode` / `checkMetricKey` 内部已经是这个形态，校验器把它写回结果
- `aggregates` 去重并按 `sum` / `count` / `min` / `max` 的固定顺序排列
- 其余字段原样

S4 拿到的就是可直接落库的形态，不必自己再处理一次大小写——两道归一化迟早会漂，而漂出来的列名 `sum_P1_Temp` 与 `sum_p1_temp` 在编解码和审计里是两个名字。

几点：

- **`duplicate-key` 是 S1 留下的那一条**：S1 只能做单键规则，"撞大小写"要集合上下文，落在这里
- **属性 / 服务 / 事件的 key 共享一套命名空间**：同一个模型里 `power` 不能既是属性又是服务
- **子字段 key 复用 `checkMetricKey`**：一套规则比两套少出错。子字段不进列名，58 字符的限制对它是宽松的
- **`enumValues` 的规则**：非空、元素为整数、互不相同。取值表只影响校验与展示，不改存储列类型（仍是 `INT`）
- **校验不看聚合的合法性**：那属于 S4 的接口层（见 §2.4）

### 2.3 T3 版本与状态

按 D2 §11：

- 版本号从 **1** 起，单调递增，不复用
- 一个版本一旦 `ACTIVE`，其 `properties` 不再改；要改就出新版本
- 状态迁移由谁触发归 S4；S3 只提供 `isVersionStatus(value)` 与终态判定——`FAILED` 是终态，`ACTIVE` 可转 `FAILED`

### 2.4 T4 降采样列推导

```ts
export interface DerivedColumn {
  name: string;
  type: MetricColumnTypeValue;
}

export type DerivationIssue = {
  /** 属性下标定位，形如 `properties[2].aggregates`——S4 要回显到表单上 */
  path: string;
  code: 'no-column-type'; // 该档位 × 该聚合在 AGGREGATE_COLUMN_TYPE 里没有条目
};

export type DerivationResult =
  | { ok: true; columns: DerivedColumn[] }
  | { ok: false; issues: DerivationIssue[] };

/** 按属性声明顺序 × 聚合的固定顺序（sum, count, min, max）展开 */
export function dsColumnsOf(
  properties: readonly PropertyDecl[]
): DerivationResult;
```

- **列序必须确定**：属性按声明顺序、聚合按 `AGGREGATES` 的固定顺序。DDL、行编解码、对账三处都读这一个函数，列序才不会漂
- 聚合列为空集的属性**不产生列**
- **任一属性声明的聚合在类型表里没有条目，整个推导失败**并指出路径——不跳过、不降级。跳过等于悄悄少一列，而 `count` 之外少一列会让整级聚合对不上

⚠️ 这条是"能选哪些聚合"的**事实边界**：S3 不拒绝这种声明，但也算不出它的列。S4 的物模型定义接口要在保存前把可选项收窄到 `AGGREGATE_COLUMN_TYPE` 有条目的集合，否则会遇到"注册成功、建表时算不出列"。S4 计划里必须写上这一条。

⚠️ `sum` 的整数档位取 `BIGINT`、以及 `min` / `max` 作用在 `BOOL` 与 `ENUM` 上是否被 TDengine 支持，都是**推断，未实测**。S5 建表前用三条探针确认：

```sql
SELECT SUM(int_col) FROM ...;   -- 返回类型是否为 BIGINT
SELECT MIN(bool_col) FROM ...;  -- TDengine 是否支持
SELECT MAX(int_col)  FROM ...;  -- 枚举落 INT，验证同一族
```

**与现有 `p1` 的对照**（D2 §6 第 3 条）：三个 `float` 属性、各声明四个聚合，推导结果就是 `sum_* DOUBLE` / `count_* BIGINT` / `min_* FLOAT` / `max_* FLOAT` ×3，与 S0.5 落地的降采样超表一致。

### 2.5 T5 P1 的模型

第一份真模型，也是 S5 的输入：

```ts
export const P1_MODEL: ModelDeclaration = {
  modelCode: P1_MODEL_CODE, // 'p1'，由 p1.ts 提供
  properties: [
    { key: 'temperature', kind: 'float', unit: '°C', range: { min: -50, max: 200 }, aggregates: ALL_FOUR },
    { key: 'vibration', kind: 'float', unit: 'mm/s', range: { min: 0, max: 100 }, aggregates: ALL_FOUR },
    { key: 'current', kind: 'float', unit: 'A', range: { min: 0, max: 100 }, aggregates: ALL_FOUR }
  ],
  services: [],
  events: []
};
```

量程与 `DEFAULT_METRIC_RANGES` 同值。**不 import 它**——那份常量在 `apps/iot-worker`，方向反了；两处在 S5 合成一处（worker 从模型取量程），届时 worker 的那份常量退场。

模型必须能通过自己的校验器，这条写进单测——否则"P1 模型"和"校验规则"会各说各话。

### 2.6 T6 单测与文档

| 文件 | 覆盖 |
| --- | --- |
| `src/model-types.spec.ts` | 类型表的每一格；`array` 不在八档内；每个档位的列类型映射 |
| `src/model-validate.spec.ts` | 每个错误码至少一例；返回的声明已折小写、聚合已去重排序；`P1_MODEL` 通过且无 warning；声明服务 / 事件只出 warning；大小写归一后重名被拒 |
| `src/model-derive.spec.ts` | 列序确定；空聚合集不产列；`sum` 配 `bool` 推导失败并指出路径；P1 三属性推出 12 列，列名以字面量断言 |

文档：`docs/architecture/contracts.md` 补一句"模型定义与校验在 device-registry"；`backend.md` 的 iot 段补模型与降采样列的推导关系；任务 README 记录状态与证据。

## 3. 顺序与验收

```text
T1 → T2 → T3 → T4 → T5 → T6
```

| 验收 | 怎么证明（对得上哪条出口） |
| --- | --- |
| 结构非法被拒 | 每个 `ModelIssueCode` 有单测；`array` 档位、超长 VARCHAR、bool 带单位、缺 `fields`、归一后重名各一例 |
| 归一化生效 | `validateModel` 的 ok 分支里 `P1_Temp` 是 `p1_temp`；`['max','sum','max']` 归一为 `['sum','max']` |
| 列集合算得出来 | `dsColumnsOf(P1_MODEL.properties)` 产出 12 列；测试以**字面量**断言列名与类型，顺序一致 |
| 算不出就响亮失败 | `sum` 配 `bool` 的推导返回 `no-column-type` 并指出属性路径 |
| 服务 / 事件留位 | 声明后校验通过，`warnings` 含 `service-not-implemented` |
| P1 自洽 | `P1_MODEL` 过自己的校验器，且推导成功 |
| 门禁 | `pnpm --filter @multi-admin/device-registry run test`、`pnpm check`、`pnpm doc:lint` 全绿 |

## 4. 危险动作

无。S3 不改存储、不建表、不碰运行中的链路；最坏情况是加错了类型定义，改回来即可。

## 5. 不做

- **聚合可选项的合法范围校验** → S4 的物模型定义接口（建模人在这里选，接口层收窄）
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
| `packages/device-registry/src/model-types.ts` | 新增：八档、聚合、`AGGREGATE_COLUMN_TYPE`、声明与版本类型、状态 |
| `packages/device-registry/src/model-validate.ts` | 新增：`validateModel`、`ModelIssueCode`、`ModelWarning` |
| `packages/device-registry/src/model-derive.ts` | 新增：`dsColumnsOf` 与 `DerivationIssue` |
| `packages/device-registry/src/p1-model.ts` | 新增：`P1_MODEL` |
| `packages/device-registry/src/index.ts` | 导出四个新模块 |
| `packages/device-registry/src/model-*.spec.ts` | 新增三个测试文件 |
| `docs/architecture/contracts.md` | 模型归属一句话 |
| `docs/architecture/backend.md` | 模型 ↔ 降采样列的推导关系 |
| `docs/tasks/.../README.md` | 状态与证据 |

**核对过、确认不改**：`apps/iot-worker`（列集合仍由 `RAW_METRICS` 决定，S5 才换）、`apps/iot-simulator`、`apps/nestjs-server`、`packages/contracts`。

## 7. 本计划做的五处判断（可否决）

| 判断 | 理由 | 否决的后果 |
| --- | --- | --- |
| S3 不落 PG | S2 定表、S4 写入；S3 先把形状与校验钉死，避免三处并行改 | S3 变大，且会与 S2 抢表设计 |
| `AGGREGATE_COLUMN_TYPE` 当事实表而非策略表 | 聚合由建模人选、范围由接口层收窄；S3 只回答"能不能算出列" | 改成策略表 = 把 S4 的职责提前，与你的分工相反 |
| 聚合集必填、不用"缺省空" | 空集与忘写运行时不可分；忘写会让该属性静默地没有降采样 | 改成缺省空，需在快照里额外记"是否显式声明" |
| 校验器顺带做归一化 | 两道归一化迟早会漂；`sum_P1_Temp` 与 `sum_p1_temp` 在编解码与审计里是两个名字 | 调用方各自归一化，S4 的每个入口都要记得 |
| 模型代码留在 `device-registry` | 与 S1 的词汇同包，S4 直接用；不轻易新建 workspace | 包定位继续变宽，迟早要拆 |
