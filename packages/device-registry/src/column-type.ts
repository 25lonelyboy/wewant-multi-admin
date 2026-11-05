import type { PropertyDecl } from './model-types.js';

/**
 * 存储列类型档位（D2 §2.4）。
 *
 * 长度与精度由**物模型在定义时声明**，不在这里写死：`FLOAT` / `DOUBLE` 按量程与有效位数选，
 * `VARCHAR(N)` 的 N 由模型给。枚举落 `INT` + 取值表；结构体落 `VARCHAR(N)` 的 JSON。
 */
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

/**
 * `VARCHAR(N)` 的 N 上限，字节——本机 3.4.2.8 实测（D2 §2.4）。
 *
 * ⚠️ 超长只能**拒收**，不能截断：列宽一旦定死不可改，截断会把"装不下"变成"静默丢字符"。
 */
export const MAX_VARCHAR_BYTES = 65517;

export interface ColumnIssue {
  /** 相对属性自身，形如 `kind` / `varcharLength`——调用方按属性下标拼成完整路径 */
  path: string;
  code: 'invalid-kind' | 'missing-varchar-length';
}

export type ColumnResult =
  | { ok: true; column: { name: string; type: string } }
  | { ok: false; issues: ColumnIssue[] };

/**
 * 原始超表的一列：声明档位 → 列名与列类型。
 *
 * ⭐ 与 `AGGREGATE_COLUMN_TYPE` 同处：两张表都在回答"什么档位落什么列"，分开就会各自漂。
 * 枚举落 `INT` + 取值表，结构体序列化后落 `VARCHAR(N)`（范围定稿 §3）。
 *
 * ⚠️ `string` / `struct` 缺 `varcharLength` 时**不回落默认值**——列宽一旦定死不可改，
 * 替建模人拍一个"够用的默认值"等于把这个决定悄悄做掉。校验器已把该字段列为必填，
 * 这里只是不替它兜底。
 */
export function rawColumnOf(property: PropertyDecl): ColumnResult {
  const column = (type: string): ColumnResult => ({
    ok: true,
    column: { name: property.key, type }
  });

  switch (property.kind) {
    case 'float':
      return column(MetricColumnType.FLOAT);
    case 'double':
      return column(MetricColumnType.DOUBLE);
    case 'int':
      return column(MetricColumnType.INT);
    case 'bigint':
      return column(MetricColumnType.BIGINT);
    case 'bool':
      return column(MetricColumnType.BOOL);
    case 'enum':
      return column(MetricColumnType.INT);
    case 'string':
    case 'struct': {
      if (property.varcharLength === undefined) {
        return {
          ok: false,
          issues: [{ path: 'varcharLength', code: 'missing-varchar-length' }]
        };
      }
      return column(`${MetricColumnType.VARCHAR}(${property.varcharLength})`);
    }
    default:
      // 从库里读回的脏行可能带八档之外的 kind：查表按可能缺失处理，不抛错
      return {
        ok: false,
        issues: [{ path: 'kind', code: 'invalid-kind' }]
      };
  }
}
