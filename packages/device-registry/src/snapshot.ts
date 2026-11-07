import type { Aggregate, PropertyDecl } from './model-types.js';
import type { DsLevel } from './naming.js';

/**
 * 写入时的绑定类型——与 TDengine stmt 的 `setXxx` 一一对应。
 *
 * ⚠️ 名称必须与超级表的**列类型**一致（DOUBLE 用 `double`、BIGINT 用 `bigint`…），
 * 而不是与 JS 值的类型一致：连接器按声明类型编码，选错会写坏或报错。
 */
export type BindKind =
  'bool' | 'int' | 'bigint' | 'float' | 'double' | 'varchar';

/** 物理原始列：列名与绑定类型都由 server 推导，worker 只读 */
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

/**
 * 一份全量：档案 + 模型声明 + 量程。
 *
 * ⚠️ 档案与模型必须**同时**替换。分开刷新必然出现「档案已新、模型还旧」的窗口——
 * 正是 D1 要消除的那类错配。`rawColumns` / `dsColumns` 是所有版本的**物理列并集**，
 * 不是某一版本的声明：列只增不减，按当前版本绑定会在减过属性的模型上少绑列。
 */
export interface RegistrySnapshot {
  version: number;
  builtAt: string;
  models: SnapshotModel[];
  devices: SnapshotDevice[];
}

/**
 * 列类型字符串 → 绑定类型。
 *
 * 只看前缀：`FLOAT` → `float`、`DOUBLE` → `double`、`INT` → `int`、`BIGINT` → `bigint`、
 * `BOOL` → `bool`、`VARCHAR(` → `varchar`。认不出返回 `null`，由调用方判为构建失败
 * ——静默跳过坏列会让所有设备写入失败，比不发布更糟。
 */
export function bindKindOfColumnType(type: string): BindKind | null {
  const normalized = type.trim().toUpperCase();
  if (normalized === 'FLOAT') return 'float';
  if (normalized === 'DOUBLE') return 'double';
  if (normalized === 'INT') return 'int';
  if (normalized === 'BIGINT') return 'bigint';
  if (normalized === 'BOOL' || normalized === 'BOOLEAN') return 'bool';
  if (normalized.startsWith('VARCHAR(')) return 'varchar';
  return null;
}
