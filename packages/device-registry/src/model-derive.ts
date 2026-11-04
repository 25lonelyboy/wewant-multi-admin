import type { MetricColumnTypeValue } from './column-type.js';
import {
  AGGREGATES,
  AGGREGATE_COLUMN_TYPE,
  type Aggregate,
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
  /**
   * `no-column-type`：该档位 × 该聚合在 `AGGREGATE_COLUMN_TYPE` 里没有条目；
   * `invalid-kind`：档位本身不在八档内（只有未经校验的属性才会走到这里）。
   */
  code: 'no-column-type' | 'invalid-kind';
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
    // 运行期可能收到未经校验的档位（如从库里读回的脏行）：查表按可能缺失处理。
    // 在这里抛错与"返回问题"是两种失败形态，调用方没法统一处理。
    const table = AGGREGATE_COLUMN_TYPE[property.kind] as
      Readonly<Partial<Record<Aggregate, MetricColumnTypeValue>>> | undefined;
    if (table === undefined) {
      issues.push({
        path: `properties[${index}].kind`,
        code: 'invalid-kind'
      });
      continue;
    }

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
