import { RAW_DATABASE, RAW_METRICS, rawStableName } from '../schema.js';
import { intervalClause, type DsLevelSpec } from './level.js';

/**
 * 构造一级降采样的读查询（设计 §3.3，已实测）。
 *
 * ⭐ **时间边界一律用 epoch 毫秒内联，不写成字符串**：同一范围写成 `'2026-10-12 14:32:00'`
 * 会被按**服务器时区**解释、直接查空（实测 0 行 vs epoch 毫秒 8 行）。毫秒数无歧义。
 * ⭐ **`COUNT(<metric>)` 不是 `COUNT(*)`**：窗口内某测点缺值时，`sum/count` 还原出的均值才是对的。
 * ⭐ SELECT 的列序即行映射的索引口径——改这里须同步 `rows.ts`。
 */
export function buildAggregateSql(
  modelCode: string,
  spec: DsLevelSpec,
  startMs: number,
  endMs: number
): string {
  const aggregates = RAW_METRICS.flatMap(metric => [
    `SUM(${metric}) AS sum_${metric}`,
    `COUNT(${metric}) AS count_${metric}`,
    `MIN(${metric}) AS min_${metric}`,
    `MAX(${metric}) AS max_${metric}`
  ]);

  return [
    `SELECT tbname, _wstart AS ts, ${aggregates.join(', ')}`,
    `FROM ${RAW_DATABASE}.${rawStableName(modelCode)}`,
    `WHERE ts >= ${startMs} AND ts < ${endMs}`,
    `PARTITION BY tbname`,
    intervalClause(spec)
  ].join(' ');
}
