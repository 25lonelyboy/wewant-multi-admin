import {
  DS_DATABASE,
  RAW_METRICS,
  dsSubtableName,
  type DsLevel,
  type RawMetric
} from '../schema.js';
import type { TdRow } from '../tdengine/client.js';
import type { WriteCodec, WriteColumn } from '../tdengine/writer.js';

/** 一个测点在某窗口内的可再聚合量 */
export interface DsMetricAggregate {
  /** `SUM`；窗口内该测点缺值时为空 */
  sum: number | null;
  /** `COUNT`；窗口内该测点缺值时为 0 */
  count: bigint;
  /** `MIN`；缺值为空 */
  min: number | null;
  /** `MAX`；缺值为空 */
  max: number | null;
  /** 窗口内最后一次上报的单位（`LAST`）；缺值为空 */
  unit: string | null;
}

/** 原始查询的一段窗口聚合，已解析成写入器可消费的形态 */
export interface DsAggregateRow {
  /** 归属级别——决定写入的目标超表/子表名 */
  level: DsLevel;
  /** 原始库子表名（折小写） */
  tbname: string;
  /** 窗口起始（epoch 毫秒，来自 `_wstart`） */
  ts: number;
  metrics: Record<RawMetric, DsMetricAggregate>;
}

/**
 * ⚠️ 连接器把 SQL 的 `NULL` 渲染成**字符串 `'NULL'`**（实测），不是 JS `null`；
 * 两种都认，否则缺值会被当成一个名叫 `"NULL"` 的数值带进存储。
 */
function isNull(value: unknown): boolean {
  return value === null || value === undefined || value === 'NULL';
}

function toNumberOrNull(value: unknown): number | null {
  if (isNull(value)) return null;
  const num = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBigInt(value: unknown): bigint {
  if (isNull(value)) return 0n;
  if (typeof value === 'bigint') return value;
  return BigInt(value as number);
}

function toStringOrNull(value: unknown): string | null {
  return isNull(value) ? null : String(value);
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  const num = Number(value);
  if (!Number.isFinite(num))
    throw new Error(`窗口 ts 不可解析：${String(value)}`);
  return num;
}

/** 聚合列在 SELECT 里的起始下标：`tbname`(0)、`ts`(1) 之后 */
const AGGREGATE_OFFSET = 2;
/** 每测点占 4 列（sum/count/min/max） */
const AGGREGATE_COLUMNS_PER_METRIC = 4;
/** 单位列起始下标：全部聚合列之后 */
const UNIT_OFFSET =
  AGGREGATE_OFFSET + RAW_METRICS.length * AGGREGATE_COLUMNS_PER_METRIC;

/**
 * 把读查询的行按**固定列序**解析（列序见 `buildAggregateSql`，两处须同步）。
 */
export function parseAggregateRows(
  rows: readonly TdRow[],
  level: DsLevel
): DsAggregateRow[] {
  return rows.map(row => {
    const metrics = {} as Record<RawMetric, DsMetricAggregate>;
    RAW_METRICS.forEach((metric, index) => {
      const base = AGGREGATE_OFFSET + index * AGGREGATE_COLUMNS_PER_METRIC;
      metrics[metric] = {
        sum: toNumberOrNull(row[base]),
        count: toBigInt(row[base + 1]),
        min: toNumberOrNull(row[base + 2]),
        max: toNumberOrNull(row[base + 3]),
        unit: toStringOrNull(row[UNIT_OFFSET + index])
      };
    });
    return {
      level,
      tbname: toTbname(row[0]),
      ts: toEpochMs(row[1]),
      metrics
    };
  });
}

/** `tbname` 恒为字符串（子表名）；非字符串按缺失处理，落成不可解析的子表名由写入端响亮失败 */
function toTbname(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 降采样库的列描述：每测点 `sum/count/min/max` + 单位列，共 16 列（§14.1）。
 *
 * ⚠️ **列类型按超级表定义**（sum=DOUBLE / count=BIGINT / min·max=FLOAT / unit=VARCHAR），
 * 不是按 JS 值类型——连接器按声明类型编码。
 * ⭐ 目标子表名由行内的 `level` 推出 ⇒ 三级**共用一个列描述**、一个写入器。
 */
export const DS_CODEC: WriteCodec<DsAggregateRow> = {
  database: DS_DATABASE,
  subtable: row => dsSubtableName(row.tbname, row.level),
  signature: row => row.level,
  columns: row => {
    const columns: WriteColumn[] = [
      { name: 'ts', kind: 'timestamp', value: row.ts }
    ];
    for (const metric of RAW_METRICS) {
      const aggregate = row.metrics[metric];
      columns.push({
        name: `sum_${metric}`,
        kind: 'double',
        value: aggregate.sum
      });
      columns.push({
        name: `count_${metric}`,
        kind: 'bigint',
        value: aggregate.count
      });
      columns.push({
        name: `min_${metric}`,
        kind: 'float',
        value: aggregate.min
      });
      columns.push({
        name: `max_${metric}`,
        kind: 'float',
        value: aggregate.max
      });
    }
    for (const metric of RAW_METRICS) {
      columns.push({
        name: `${metric}_unit`,
        kind: 'varchar',
        value: row.metrics[metric].unit
      });
    }
    return columns;
  }
};
