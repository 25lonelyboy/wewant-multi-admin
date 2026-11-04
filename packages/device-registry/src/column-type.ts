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
