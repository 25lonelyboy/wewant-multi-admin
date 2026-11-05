import {
  DS_DATABASE,
  DS_LEVELS,
  DS_MINUTE_KEEP_DAYS,
  RAW_DATABASE,
  dsColumnsOf,
  dsStableName,
  dsSubtableName,
  rawColumnOf,
  rawStableName,
  type DerivedColumn,
  type ModelDeclaration,
  type PropertyDecl,
  type SubtableRef
} from '@multi-admin/device-registry';

/**
 * 注册路径的 DDL **生成**层：只产出语句，不执行。
 *
 * ⚠️ 一个 `IF NOT EXISTS` 都不用：D3 §2.5 要求「表已存在、列已存在直接报错、阻断注册」。
 * `IF NOT EXISTS` 会把冲突变成静默成功；幂等由注册流程的前置状态判断承担，不由 DDL 兜底。
 *
 * ⚠️ TDengine 3.4 的 `ALTER STABLE ... ADD COLUMN` **一次只能加一列**（实测多列写法语法错误），
 * 因此加列一律按列展开成多条语句。
 */

const DEVICE_ID_TAG_TYPE = 'VARCHAR(16)';
const TIMESTAMP_COLUMN = 'ts TIMESTAMP';

/** 属性 → 原始超表列定义；校验过的声明不会走到失败分支 */
function rawColumnDefs(properties: readonly PropertyDecl[]): string[] {
  return properties.map(property => {
    const result = rawColumnOf(property);
    if (!result.ok) {
      const codes = result.issues.map(issue => issue.code).join(', ');
      throw new Error(`属性 ${property.key} 无法生成原始列：${codes}`);
    }
    return `${result.column.name} ${result.column.type}`;
  });
}

/**
 * 当前声明对应的降采样列；无聚合时返回 `null`。
 *
 * 这是「无聚合模型不建降采样表」的**唯一**判断点——建表、演进、补子表三处都走它。
 */
function dsColumnDefs(
  properties: readonly PropertyDecl[]
): DerivedColumn[] | null {
  const result = dsColumnsOf(properties);
  if (!result.ok) {
    const detail = result.issues
      .map(issue => `${issue.path}: ${issue.code}`)
      .join(', ');
    throw new Error(`降采样列推导失败：${detail}`);
  }
  return result.columns.length === 0 ? null : result.columns;
}

function columnList(columns: readonly DerivedColumn[]): string {
  return [TIMESTAMP_COLUMN, ...columns.map(c => `${c.name} ${c.type}`)].join(
    ', '
  );
}

function rawStableRef(modelCode: string): string {
  return `${RAW_DATABASE}.${rawStableName(modelCode)}`;
}

function dsStableRef(
  modelCode: string,
  level: (typeof DS_LEVELS)[number]
): string {
  return `${DS_DATABASE}.${dsStableName(modelCode, level)}`;
}

/** 新模型：一张原始超表 */
export function createRawStable(decl: ModelDeclaration): string {
  return (
    `CREATE STABLE ${rawStableRef(decl.modelCode)} ` +
    `(${[TIMESTAMP_COLUMN, ...rawColumnDefs(decl.properties)].join(', ')}) ` +
    `TAGS (deviceId ${DEVICE_ID_TAG_TYPE})`
  );
}

/** 新模型：三张降采样超表；无聚合声明时为空 */
export function createDsStables(decl: ModelDeclaration): string[] {
  const columns = dsColumnDefs(decl.properties);
  if (columns === null) return [];

  return DS_LEVELS.map(level => {
    // 分钟级是全案唯一的超表级 KEEP：新建超表必须自带，否则会沿用库级 10 年
    const keep = level === '1m' ? ` KEEP ${DS_MINUTE_KEEP_DAYS}` : '';
    return (
      `CREATE STABLE ${dsStableRef(decl.modelCode, level)} ` +
      `(${columnList(columns)}) TAGS (deviceId ${DEVICE_ID_TAG_TYPE})${keep}`
    );
  });
}

/** 模型内演进：原始超表逐列 ADD COLUMN */
export function alterRawStable(
  decl: ModelDeclaration,
  added: readonly PropertyDecl[]
): string[] {
  return rawColumnDefs(added).map(
    column =>
      `ALTER STABLE ${rawStableRef(decl.modelCode)} ADD COLUMN ${column}`
  );
}

/**
 * 模型内演进：降采样超表**按表在不在**决定建还是加列。
 *
 * 模型可以从「全无聚合」演进为「有聚合」，那时三张表一张都没有——统一走 ALTER 会报错，
 * 统一走 CREATE 会撞已存在。`existing` 是当前库里已有的降采样超表名（不带库前缀）。
 */
export function alterDsStables(
  decl: ModelDeclaration,
  added: readonly PropertyDecl[],
  existing: ReadonlySet<string>
): string[] {
  const columns = dsColumnDefs(decl.properties);
  if (columns === null) return [];

  const addedColumns = dsColumnDefs(added) ?? [];

  const statements: string[] = [];
  for (const level of DS_LEVELS) {
    const name = dsStableName(decl.modelCode, level);
    if (existing.has(name)) {
      for (const column of addedColumns) {
        statements.push(
          `ALTER STABLE ${dsStableRef(decl.modelCode, level)} ADD COLUMN ${column.name} ${column.type}`
        );
      }
    } else {
      const keep = level === '1m' ? ` KEEP ${DS_MINUTE_KEEP_DAYS}` : '';
      statements.push(
        `CREATE STABLE ${dsStableRef(decl.modelCode, level)} ` +
          `(${columnList(columns)}) TAGS (deviceId ${DEVICE_ID_TAG_TYPE})${keep}`
      );
    }
  }
  return statements;
}

/** 新设备：一张原始子表，挂模型对应的原始超表 */
export function createRawSubtable(ref: SubtableRef): string {
  return (
    `CREATE TABLE ${RAW_DATABASE}.${ref.name} ` +
    `USING ${rawStableRef(ref.modelCode)} TAGS ('${ref.deviceId}')`
  );
}

/**
 * 新设备：三张降采样子表，**只建缺的**，已有的一律不动。
 *
 * `properties` 用于判断该模型有没有聚合——无聚合模型一张降采样子表都不建。
 * `existing` 是当前库里已有的降采样子表名（不带库前缀）。
 */
export function createDsSubtables(
  ref: SubtableRef,
  properties: readonly PropertyDecl[],
  existing: ReadonlySet<string>
): string[] {
  if (dsColumnDefs(properties) === null) return [];

  return DS_LEVELS.flatMap(level => {
    const name = dsSubtableName(ref.name, level);
    if (existing.has(name)) return [];
    return [
      `CREATE TABLE ${DS_DATABASE}.${name} ` +
        `USING ${dsStableRef(ref.modelCode, level)} TAGS ('${ref.deviceId}')`
    ];
  });
}
