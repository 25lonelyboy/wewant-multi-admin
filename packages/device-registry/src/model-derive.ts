import type { MetricColumnTypeValue } from './column-type.js';
import {
  AGGREGATES,
  AGGREGATE_COLUMN_TYPE,
  type PropertyDecl
} from './model-types.js';

/** 一列降采样列 */
export interface DerivedColumn {
  name: string;
  type: MetricColumnTypeValue;
}

export interface DerivationIssue {
  /** 属性下标定位，形如 `properties[2].aggregates`——S4 要回显到表单上 */
  path: string;
  /** 该档位 × 该聚合在 `AGGREGATE_COLUMN_TYPE` 里没有条目 */
  code: 'no-column-type';
}

export type DerivationResult =
  | { ok: true; columns: DerivedColumn[] }
  | { ok: false; issues: DerivationIssue[] };

/**
 * 由属性声明推导降采样列（D2 §6 第 2 条）。
 *
 * ⭐ **列序必须确定**：属性按声明顺序、聚合按 `AGGREGATES` 的固定顺序。DDL、行编解码、
 * 对账三处都读这一个函数，列序才不会漂。
 *
 * ⚠️ 任一属性的聚合算不出列类型即**整体失败**并指出路径——不跳过、不降级。跳过等于悄悄
 * 少一列，而降采样会整级对不上。
 */
export function dsColumnsOf(
  properties: readonly PropertyDecl[]
): DerivationResult {
  const columns: DerivedColumn[] = [];
  const issues: DerivationIssue[] = [];

  for (const [index, property] of properties.entries()) {
    const table = AGGREGATE_COLUMN_TYPE[property.kind];
    for (const aggregate of AGGREGATES) {
      if (!property.aggregates.includes(aggregate)) continue;

      const type = table[aggregate];
      if (type === undefined) {
        issues.push({
          path: `properties[${index}].aggregates`,
          code: 'no-column-type'
        });
        continue;
      }
      columns.push({ name: `${aggregate}_${property.key}`, type });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, columns };
}
