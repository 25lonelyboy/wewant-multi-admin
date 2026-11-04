import type { MetricColumnTypeValue } from './column-type.js';

/**
 * 物模型的声明档位（建模者视角），与 `column-type.ts` 的存储档位是两层。
 *
 * `array` 刻意不在这里——传进来即 `invalid-kind`（D2 §2.4 拒绝数组）。
 */
export const PROPERTY_KINDS = [
  'float',
  'double',
  'int',
  'bigint',
  'bool',
  'enum',
  'string',
  'struct'
] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];

/** 子字段只允许标量：不嵌套结构体、不支持数组 */
export type ScalarKind = Exclude<PropertyKind, 'struct'>;

export const AGGREGATES = ['sum', 'count', 'min', 'max'] as const;

export type Aggregate = (typeof AGGREGATES)[number];

/**
 * 聚合 → 列类型的**事实表**，不是"允许与否"的策略表。
 *
 * 某个聚合作用在某档位上得到哪种列，是存储层的事实；表里没有条目，就是**算不出列**。
 * 建模人可选哪些聚合由物模型定义接口（S4）收窄，不在本表表达。
 *
 * 三条取法：`sum` 的整数档位取 `BIGINT`（防 32 位溢出）、`count` 恒为 `BIGINT`、
 * `min` / `max` 与源列同类型。
 *
 * ⚠️ `sum` 的整数档位、以及 `min` / `max` 作用在 `BOOL` 与 `ENUM` 上，都是**推断未实测**；
 * S5 建表前用探针确认。
 */
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

/** 结构体的子字段声明 */
export interface StructField {
  key: string;
  kind: ScalarKind;
}

/** 服务本增量只留结构：参数形状随下行增量补 */
export interface ServiceDecl {
  key: string;
}

/** 事件本增量只留结构：上报通路随后续增量补 */
export interface EventDecl {
  key: string;
}

/** 一个属性的声明 */
export interface PropertyDecl {
  key: string;
  kind: PropertyKind;
  /** 仅数值 / 字符串 / 结构体有意义；`bool` 与 `enum` 带单位即非法 */
  unit?: string;
  /** 仅数值与枚举；闭区间 */
  range?: { min: number; max: number };
  /** 由建模人选择，**必填**；空集表示不产生降采样列 */
  aggregates: readonly Aggregate[];
  /** `kind` 为 string / struct 时必填，字节数 ≤ `MAX_VARCHAR_BYTES` */
  varcharLength?: number;
  /** `kind` 为 enum 时必填 */
  enumValues?: readonly number[];
  /** `kind` 为 struct 时必填 */
  fields?: readonly StructField[];
  /** 分组是模型元数据，**不进列名**（D2 §2.6） */
  group?: string;
}

/** 建模人写的东西：没有版本号、没有状态——那些由注册流程赋 */
export interface ModelDeclaration {
  modelCode: string;
  properties: readonly PropertyDecl[];
  services: readonly ServiceDecl[];
  events: readonly EventDecl[];
}

export type VersionStatus = 'PENDING' | 'ACTIVE' | 'FAILED';

/**
 * 版本快照（D2 §11）：不可变的是**快照**，不是物理列集合。
 *
 * 物理一份、逻辑多版——列在超表里就地演进，每个版本另存一份声明。
 */
export interface ModelVersion extends ModelDeclaration {
  version: number;
  status: VersionStatus;
  /** 起止；ACTIVE 时才有起始 */
  effectiveFrom?: number;
  effectiveTo?: number;
}

export function isVersionStatus(value: unknown): value is VersionStatus {
  return value === 'PENDING' || value === 'ACTIVE' || value === 'FAILED';
}

/** `FAILED` 是终态；`ACTIVE` 仍可转 `FAILED` */
export function isTerminalStatus(status: VersionStatus): boolean {
  return status === 'FAILED';
}
