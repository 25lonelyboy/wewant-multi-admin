# S1 · 契约与类型系统：实施计划

- **日期**：2026-11-04｜上承 [范围定稿](2026-11-01-scope-and-task-map.md) S1 与 [D2 决策卡](2026-11-02-d2-decision-card.md) §1 / §2.3 / §2.4 / §2.6
- **出口**：① 载荷能表达数值 / 布尔 / 字符串 / 结构体；② 类型档位与长度上限成为可引用的常量，供 S3 声明、S5 建表；③ 属性 key 与模型编码的校验有唯一实现，非法输入给明确原因码；④ 主题通道留出 `service` / `event`；⑤ 模拟器可造带布尔与枚举测点的设备
- **前置**：D2 ✅、D4 ✅ —— 本任务不依赖任何未决决策

## 1. 形状

| # | 任务 | 落在 | 性质 |
| --- | --- | --- | --- |
| T1 | 载荷值联合类型、通道扩三位 | `packages/contracts` | 纯类型与常量 |
| T2 | 类型档位表与长度上限 | `packages/device-registry` | 常量 |
| T3 | 标识符校验（属性 key / 模型编码） | `packages/device-registry` | 纯函数 + 原因码 |
| T4 | 模拟器布尔 / 枚举 profile | `apps/iot-simulator` | 出口证据 |
| T5 | 单测（复用 device-registry 既有通道） | `packages/device-registry` | 加用例 |
| T6 | 文档与 `last_verified` | `docs` | 事实源 |

**包归属的判据**：`packages/contracts` 的边界由 [contracts.md](../../architecture/contracts.md) 定死——「只放纯类型与常量值，**不放运行期逻辑、校验规则**」。所以：

- **留在 contracts**：`MetricValue`（载荷里值长什么样）、`IotChannel`（主题通道常量）——两者都是线上形状，且都是纯类型 / 常量
- **进 device-registry**：类型档位表（列在库里是什么类型）、标识符校验（进 DDL 的名字合不合法）——两者都是存储侧词汇，与 `subtableName` 同一族判定，放在一起才不会出现「规则在这里、用法在那里」的缝

**三条边界**：

- S1 只定义**能表达什么**与**什么形状合法**，不定义模型——`PropertyKind`（建模者视角的八档）、单位、量程、聚合集矩阵、版本语义全归 S3
- **没有任何运行时接线**：`RAW_METRICS` 仍是列集合的唯一来源，判据 B 要等 S5 把它换掉
- 布尔 / 枚举测点走通链路只到队列；落库要等 S5 给出对应类型的列

## 2. 设计

### 2.1 T1 载荷值联合类型与通道

`packages/contracts/src/iot/telemetry.ts`：

```ts
/** 上行测点的值——类型由物模型声明，载荷只保证"能表达" */
export type MetricValue = number | boolean | string | Record<string, unknown>;

export interface TelemetryMetric {
  key: string;
  value: MetricValue; // 原 number
  unit: string;
}

export const IotChannel = {
  TELEMETRY: 'telemetry',
  SERVICE: 'service',
  EVENT: 'event'
} as const;
```

- 枚举**不进联合**：D2 §2.4 定为 `INT` + 取值表，线上值就是数字
- 结构体在载荷里是对象，存储是 `VARCHAR(N)` 的 JSON；深度校验（子字段、长度、拒绝数组）在 S3 / S5，本任务只保证类型上可表达
- **不加** `serviceTopic()` / `eventTopic()`：本增量没有第二个生产者，加出来就是死代码；S3 定义三元组结构时再补
- `localDeviceIdFromTopic()` **保持只认 telemetry**——订阅端只订遥测，放宽解析等于悄悄扩大订阅面

**下游窄化（必改项，不是可选清理）**：`MetricValue` 是联合，而 `PendingRow.metrics[].value` 是 `number`（写入器按 `FLOAT` 绑定）。`detection.ts` 用窄类型收口，让 `consumer.ts` 与写入器继续按数值编译：

```ts
export interface DetectedMetric extends TelemetryMetric {
  value: number;
}
```

`detect()` 的判定逻辑一行不改——S1 阶段检测仍只放行数值（列仍是 `FLOAT`）。放宽要到 S5 由模型声明类型时。

### 2.2 T2 类型档位表

新增 `packages/device-registry/src/column-type.ts`：

```ts
/** 存储列类型档位（D2 §2.4）；长度与精度由模型在定义时给出，不在这里写死 */
export const MetricColumnType = {
  FLOAT: 'FLOAT',
  DOUBLE: 'DOUBLE',
  INT: 'INT',
  BIGINT: 'BIGINT',
  BOOL: 'BOOL',
  VARCHAR: 'VARCHAR'
} as const;

export type MetricColumnTypeValue =
  (typeof MetricColumnType)[keyof typeof MetricColumnType];

/** `VARCHAR(N)` 的 N 上限，字节。本机 3.4.2.8 实测（D2 §2.4） */
export const MAX_VARCHAR_BYTES = 65517;
```

**建模者视角的八档 → 存储六档**写进 `contracts.md` 与 D2 的引用处，不在代码里建表——那八档是 S3 的声明类型，S1 只给存储侧的词汇：

| 声明 | 列类型 | 线上值 |
| --- | --- | --- |
| 浮点 / 双精度 | `FLOAT` / `DOUBLE` | number |
| 整数 / 长整数 | `INT` / `BIGINT` | number |
| 枚举 | `INT` + 取值表 | number |
| 布尔 | `BOOL` | boolean |
| 字符串 | `VARCHAR(N)` | string |
| 结构体 | `VARCHAR(N)`（JSON） | object |

### 2.3 T3 标识符规则

新增 `packages/device-registry/src/identifier.ts`。属性 key 与模型编码是同一族规则（都是**进 DDL 的标识符**），放一处：

```ts
export const MAX_METRIC_KEY_LENGTH = 58;
export const MAX_MODEL_CODE_LENGTH = 172;
export const RESERVED_METRIC_KEYS: readonly string[] = ['ts', 'deviceId'];

export type IdentifierFailure = 'empty' | 'charset' | 'too-long' | 'reserved';

export type IdentifierCheck =
  | { ok: true; value: string } // 已归一化为小写
  | { ok: false; reason: IdentifierFailure };

export function checkMetricKey(raw: string): IdentifierCheck;
export function checkModelCode(raw: string): IdentifierCheck;
```

| 规则 | 属性 key | 模型编码 | 依据 |
| --- | --- | --- | --- |
| 归一化 | trim + 折小写 | 同 | D2 §2.6 |
| 字符集 | `^[a-z][a-z0-9_]*$` | 同 | D2 §1 / §2.6 |
| 长度上限 | 58 | 172 | D2 §2.6（列名 64 − `count_`；表名 192 − `_{deviceId}` 与 `_{level}`） |
| 保留词 | `ts` / `deviceId` | 无 | D2 §2.6 |
| 唯一性 | 模型内、大小写归一后 | 全平台 | **不在本函数**，需集合上下文，归 S3 |

两个决定：

- **校验与归一化合成一次调用**，返回 `{ ok, value }` 而不是 `isValid(raw)`——否则调用方要先记得归一化，忘了就是"大写 key 被当成非法"或"大写 key 混进档案"两种错
- **模型编码一并纳入**：backlog 已登记缺口「模型编码未经校验直接拼进 DDL」，要求在 S3 / S4 让注册输入接管之前挡下。它和 key 是同一族规则，分开写会变成两套字符集判定

### 2.4 T4 模拟器

`packages/device-registry` 与 `apps/iot-simulator` 之间**没有依赖**（AGENTS.md 明写：平台侧标识不下发，由依赖边界保证）。模拟器只负责"报得出来"，不读档案。

`buildMetrics(random, extra?)` 在三测点之后追加一个测点，由环境变量选择：

| `SIM_EXTRA_METRIC` | 追加测点 | 用途 |
| --- | --- | --- |
| 缺省 / `none` | 无 | 现有 100 台链路一字不变 |
| `boolean` | `{ key: 'power_state', unit: '', value: true }` | 布尔测点 |
| `enum` | `{ key: 'run_mode', unit: '', value: 2 }` | 枚举测点——线上是数字，存储类型归 S3 声明 |

`index.ts` 读环境变量并透传到 `startDevice` → `buildPayload`。

**worker 不改白名单**：新 key 走已有的 `unknownMetricKeys` 通道——`consumer.ts` 会计数并打印 key，S1 的出口证据直接由它承载。S5 让模型接管后，同一条报文变成"按模型认可"。

### 2.5 T5 单测

复用 `packages/device-registry` 已有的测试通道（`node --import tsx --test src/*.spec.ts`，测试与源码同目录，`@types/node` / `tsx` 已在 devDependencies）——**不新增任何依赖，不动 lockfile**。contracts 不建测试通道：`MetricValue` 是类型、`IotChannel` 是常量，没有运行期分支可测，typecheck 即覆盖。

| 文件 | 覆盖 |
| --- | --- |
| `src/identifier.spec.ts` | key 长度 58 / 59 边界、保留词、大写归一化、非法首字符、空串；模型编码 172 / 173 边界 |
| `src/column-type.spec.ts` | 六档常量、`MAX_VARCHAR_BYTES` |

### 2.6 T6 文档与门禁

| 文件 | 改什么 |
| --- | --- |
| `docs/architecture/contracts.md` | 值联合、通道扩位、类型档位表（含八档 → 六档映射）；**刷 `last_verified`**——它的 `covers` 含 `packages/contracts/` |
| `docs/architecture/repo-structure.md` | device-registry 的定位从「设备档案」扩到「档案 + 物模型词汇」；**刷 `last_verified`**——它的 `covers` 是整个 `apps/` 与 `packages/` |
| `docs/architecture/backend.md` | **刷 `last_verified`**——`covers` 含 `apps/iot-worker/`，而本任务改了 `detection.ts`（仅类型窄化，正文口径不变） |
| [AGENTS.md](../../../AGENTS.md) | device-registry 行同步新定位 |
| `docs/governance/backlog.md` | 登记「已知 key 收到非数值时静默丢弃」，触发点写 S5 |
| 任务 README | 过程文件索引、S1 状态与验收证据 |

⚠️ 三篇活文档的 `last_verified` 都要刷，判据是**改到的路径**而不是"改没改行为"：`contracts.md` 覆盖 `packages/contracts/` 与 `apps/iot-worker/src/`，`backend.md` 覆盖 `apps/iot-worker/`，`repo-structure.md` 覆盖整个 `apps/` 与 `packages/`。

## 3. 顺序与验收

```text
T1 → T2 → T3 → T4 → T5 → T6
```

| 验收 | 怎么证明 |
| --- | --- |
| 契约可表达 | `TelemetryMetric.value` 是联合类型；布尔 / 枚举 / 对象在类型层合法 |
| 档位可引用 | 六档常量与 `MAX_VARCHAR_BYTES` 有单测 |
| 规则可判 | 58 通过、59 拒（`too-long`）；`ts` 拒（`reserved`）；`P1` 归一为 `p1` 后通过；模型编码 172 通过、173 拒 |
| **规则前瞻推演**（D2 §6 第 1、3 条） | 拿 `temperature` / `vibration` / `current` + `power_state`（布尔）+ `config_snapshot`（结构体）逐个过 `checkMetricKey` 全通过；`p1` 与一个 172 字符的模型编码通过、173 拒；按规则**纸面推导**出的列集合与现有 `p1` 超表一致 |
| 链路可见 | `SIM_DEVICE_COUNT=1 SIM_EXTRA_METRIC=boolean pnpm dev:sim` → worker 日志出现 `power_state`，`unknownMetrics` 增长 |
| 不回归 | `pnpm --filter @multi-admin/iot-worker run test`、`consumer.e2e` 全过 |
| 门禁 | `pnpm check` 全绿；`pnpm doc:lint` 全绿 |

## 4. 危险动作

| 动作 | 影响 | 闸 |
| --- | --- | --- |
| 改 `TelemetryMetric.value` | 所有消费方的编译面 | 改完先 `pnpm --filter @multi-admin/contracts run build`，再 typecheck 下游——`dist/*.d.ts` 不重建时下游读的是旧形状（S0.5 已踩过一次） |
| 起模拟器造数 | 会往真实队列投报文 | 验 profile 时 `SIM_DEVICE_COUNT=1`，验完停进程 |
| 跑 worker e2e | 与 compose 里的 worker 抢同一队列 | 先 `docker compose stop worker` |

## 5. 不做

- 物模型本体：`PropertyKind`、单位、量程、聚合集矩阵、版本不可变 → S3
- 模型驱动列集合与检测白名单 → S5（判据 B）
- 读侧单位、报文上限、时间戳边界 → S6
- `service` / `event` 的主题构造器与订阅面 → S3 及后续增量
- 按模型类型逐点校验值（含超长拒收）→ S5
- 「已知 key 收到非数值」的计数 → S5（S1 的出口走的是新 key 的 `unknownMetricKeys`，不依赖它；`detection.ts` 在 S5 整体重写，现在改一次等于改两次）
- contracts 的测试通道 → 不建（无运行期逻辑）
- 数组类型（D2 §2.4 拒绝）
- 唯一性校验（同模型内 key 重复）→ S3，需集合上下文

## 6. 改动面清单

| 文件 | 改什么 |
| --- | --- |
| `packages/contracts/src/iot/telemetry.ts` | `MetricValue` 联合类型；`value` 改联合；`IotChannel` 扩两通道 |
| `packages/device-registry/src/column-type.ts` | 新增：六档常量、`MAX_VARCHAR_BYTES` |
| `packages/device-registry/src/identifier.ts` | 新增：`checkMetricKey` / `checkModelCode` 与三组常量 |
| `packages/device-registry/src/index.ts` | 导出两个新文件 |
| `packages/device-registry/src/identifier.spec.ts` / `column-type.spec.ts` | 新增测试 |
| `apps/iot-worker/src/detection.ts` | `DetectedMetric` 窄化，判定逻辑不变 |
| `apps/iot-simulator/src/telemetry.ts` | `buildMetrics` 追加测点 |
| `apps/iot-simulator/src/device.ts` / `src/index.ts` | 环境变量透传 |
| `apps/iot-simulator/README.md` | `SIM_EXTRA_METRIC` 与环境变量表 |
| `docs/architecture/contracts.md` | 值联合、通道、类型档位表；刷 `last_verified` |
| `docs/architecture/repo-structure.md` | device-registry 定位；刷 `last_verified` |
| `AGENTS.md` | device-registry 行 |
| `docs/governance/backlog.md` | 登记非数值静默丢弃 |
| `docs/tasks/.../README.md` | 索引、状态与证据 |

**核对过、确认不改**：`packages/contracts/package.json`（不新增依赖与测试脚本）、`apps/nestjs-server` 订阅端（只取 `localDeviceId` / `ts` / `metrics` 原文，不碰 `value` 类型）、`apps/pure-web`。
