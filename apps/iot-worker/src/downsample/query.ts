import {
  rawStableName,
  type SnapshotDsColumn
} from '@multi-admin/device-registry';
import { RAW_DATABASE } from '../schema.js';
import { intervalClause, type DsLevelSpec } from './level.js';

/**
 * 构造一级降采样的读查询（设计 §3.3，已实测）。
 *
 * ⭐ **时间边界一律用 epoch 毫秒内联，不写成字符串**：同一范围写成 `'2026-10-12 14:32:00'`
 * 会被按**服务器时区**解释、直接查空（实测 0 行 vs epoch 毫秒 8 行）。毫秒数无歧义。
 * ⭐ **`COUNT(<property>)` 不是 `COUNT(*)`**：窗口内某测点缺值时，`sum/count` 还原出的均值才是对的。
 * ⭐ SELECT 的列序即 `parseAggregateRows` 的下标口径——两处**共用调用方传入的同一份列清单**，
 * 改列序不必两边各改一次，但必须传同一份。
 * ⭐ 聚合表达式按列清单生成，**不按聚合名硬编码类型**：`min` / `max` 对 float 是 FLOAT、
 * 对 bool 是 BOOL，列类型随属性档位变。
 */
export function buildAggregateSql(
  modelCode: string,
  spec: DsLevelSpec,
  startMs: number,
  endMs: number,
  columns: readonly SnapshotDsColumn[]
): string {
  const aggregates = columns.map(
    column =>
      `${column.aggregate.toUpperCase()}(${column.property}) AS ${column.name}`
  );

  return [
    `SELECT tbname, _wstart AS ts, ${aggregates.join(', ')}`,
    `FROM ${RAW_DATABASE}.${rawStableName(modelCode)}`,
    `WHERE ts >= ${startMs} AND ts < ${endMs}`,
    `PARTITION BY tbname`,
    intervalClause(spec)
  ].join(' ');
}
