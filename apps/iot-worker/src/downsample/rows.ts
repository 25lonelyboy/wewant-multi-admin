import {
  dsSubtableName,
  type BindKind,
  type DsLevel,
  type SnapshotDsColumn
} from '@multi-admin/device-registry';
import { DS_DATABASE } from '../schema.js';
import type { TdRow } from '../tdengine/client.js';
import type { WriteCodec, WriteColumn } from '../tdengine/writer.js';

/** 一列降采样结果的值——类型由列清单里的 `bindKind` 决定 */
export type DsValue = number | bigint | boolean | string | null;

/** 原始查询的一段窗口聚合，已解析成写入器可消费的形态 */
export interface DsAggregateRow {
  /** 归属级别——决定写入的目标超表/子表名 */
  level: DsLevel;
  /** 原始库子表名（折小写） */
  tbname: string;
  /** 窗口起始（epoch 毫秒，来自 `_wstart`） */
  ts: number;
  /** 本级要写出的降采样列；SQL 与绑定共用这一份清单 */
  columns: readonly SnapshotDsColumn[];
  /** 列名 → 值（已按 `bindKind` 收窄） */
  metrics: Readonly<Record<string, DsValue>>;
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

/** BOOL 列在不同驱动 / 版本下可能是布尔、0/1 或 'true' / 'false' */
function toBoolOrNull(value: unknown): boolean | null {
  if (isNull(value)) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function parseValue(value: unknown, bindKind: BindKind): DsValue {
  switch (bindKind) {
    case 'bigint':
      return toBigInt(value);
    case 'bool':
      return toBoolOrNull(value);
    case 'int':
    case 'float':
    case 'double':
      return toNumberOrNull(value);
    case 'varchar':
      return isNull(value) ? null : String(value);
  }
}

function toEpochMs(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  const num = Number(value);
  if (!Number.isFinite(num))
    throw new Error(`窗口 ts 不可解析：${String(value)}`);
  return num;
}

/** `tbname`(0)、`ts`(1) 之后是聚合列 */
const AGGREGATE_OFFSET = 2;

/**
 * 把读查询的行按**调用方传入的列清单**解析。
 *
 * ⚠️ 今天与 `buildAggregateSql` 靠「SELECT 列序 ↔ 按下标解析」显式耦合：两处必须传同一份
 * `columns` 且顺序一致。列清单顺序改变时结果按名字仍然不变（`metrics` 按列名存）。
 */
export function parseAggregateRows(
  rows: readonly TdRow[],
  level: DsLevel,
  columns: readonly SnapshotDsColumn[]
): DsAggregateRow[] {
  return rows.map(row => {
    const metrics: Record<string, DsValue> = {};
    for (const [index, column] of columns.entries()) {
      metrics[column.name] = parseValue(
        row[AGGREGATE_OFFSET + index],
        column.bindKind
      );
    }
    return {
      level,
      tbname: toTbname(row[0]),
      ts: toEpochMs(row[1]),
      columns,
      metrics
    };
  });
}

/** `tbname` 恒为字符串（子表名）；非字符串按缺失处理，落成不可解析的子表名由写入端响亮失败 */
function toTbname(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 降采样库的列描述：目标列与绑定类型**由行自带的列清单**生成，不再按 P1 测点硬编码。
 *
 * ⭐ 目标子表名由行内的 `level` 推出 ⇒ 三级**共用一个列描述**、一个写入器。
 */
export const DS_CODEC: WriteCodec<DsAggregateRow> = {
  database: DS_DATABASE,
  subtable: row => dsSubtableName(row.tbname, row.level),
  signature: row =>
    `${row.level}:${row.columns.map(column => column.name).join('+')}`,
  columns: row => {
    const columns: WriteColumn[] = [
      { name: 'ts', kind: 'timestamp', value: row.ts }
    ];
    for (const column of row.columns) {
      columns.push({
        name: column.name,
        kind: column.bindKind,
        value: row.metrics[column.name] ?? null
      });
    }
    return columns;
  }
};
