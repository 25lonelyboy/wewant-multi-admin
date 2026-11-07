import type { BindKind, PropertyDecl } from '@multi-admin/device-registry';
import type { EnvelopeMetric } from './detection.js';

/** 通过声明的测点——值已按声明收窄，绑定类型来自声明档位 */
export interface AcceptedMetric {
  key: string;
  bindKind: BindKind;
  value: number | bigint | string | boolean;
}

export interface FilterResult {
  accepted: AcceptedMetric[];
  /** 该时刻声明里没有的 key——丢弃但要计数与告警 */
  notInModel: string[];
  /** 类型不符 / 超量程 / 枚举越界 / 超长——丢弃并计数 */
  invalid: string[];
  /** 载荷单位与声明不符 ⇒ **整条样本丢弃**，不是只丢那个测点 */
  unitMismatch: boolean;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function inRange(value: number, range: PropertyDecl['range']): boolean {
  if (range === undefined) return true;
  return value >= range.min && value <= range.max;
}

/**
 * 按声明过滤并定类型。
 *
 * | 档位 | 接受条件 | 绑定 |
 * | --- | --- | --- |
 * | float / double | 有限数，落在 range 内 | float / double |
 * | int / bigint | 有限**整数**，落在 range 内 | int / bigint |
 * | bool | `typeof === 'boolean'` | bool |
 * | enum | 有限整数，且命中 enumValues | int |
 * | string | 字符串，UTF-8 字节数 ≤ varcharLength | varchar |
 * | struct | 对象且非数组，JSON 后字节数 ≤ varcharLength | varchar |
 *
 * ⚠️ 超长**拒收不截断**（列宽定死不可改）。枚举越界按非法丢弃——与「未知测点丢弃」同源，
 * 都是「声明优先」。
 * ⚠️ 单位逐字比较（`property.unit ?? ''`）：不符时整条样本丢弃，由调用方处置。
 * `range` 缺省 ⇒ **不校验**（D1 §2.2 的连带结论）。
 */
export function filterByDeclaration(
  metrics: readonly EnvelopeMetric[],
  properties: readonly PropertyDecl[]
): FilterResult {
  const byKey = new Map(properties.map(property => [property.key, property]));
  const accepted: AcceptedMetric[] = [];
  const notInModel: string[] = [];
  const invalid: string[] = [];
  let unitMismatch = false;

  for (const metric of metrics) {
    const property = byKey.get(metric.key);
    if (property === undefined) {
      notInModel.push(metric.key);
      continue;
    }
    if (metric.unit !== (property.unit ?? '')) {
      unitMismatch = true;
      continue;
    }

    const acceptedMetric = toAccepted(metric, property);
    if (acceptedMetric === null) invalid.push(metric.key);
    else accepted.push(acceptedMetric);
  }

  return { accepted, notInModel, invalid, unitMismatch };
}

function toAccepted(
  metric: EnvelopeMetric,
  property: PropertyDecl
): AcceptedMetric | null {
  const { value } = metric;
  switch (property.kind) {
    case 'float':
    case 'double': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      if (!inRange(value, property.range)) return null;
      return { key: metric.key, bindKind: property.kind, value };
    }
    case 'int':
    case 'bigint': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return null;
      if (!inRange(value, property.range)) return null;
      return { key: metric.key, bindKind: property.kind, value };
    }
    case 'bool': {
      if (typeof value !== 'boolean') return null;
      return { key: metric.key, bindKind: 'bool', value };
    }
    case 'enum': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return null;
      if (
        property.enumValues !== undefined &&
        !property.enumValues.includes(value)
      ) {
        return null;
      }
      return { key: metric.key, bindKind: 'int', value };
    }
    case 'string': {
      if (typeof value !== 'string') return null;
      if (property.varcharLength === undefined) return null;
      if (byteLength(value) > property.varcharLength) return null;
      return { key: metric.key, bindKind: 'varchar', value };
    }
    case 'struct': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
      }
      if (property.varcharLength === undefined) return null;
      const json = JSON.stringify(value);
      if (byteLength(json) > property.varcharLength) return null;
      return { key: metric.key, bindKind: 'varchar', value: json };
    }
    default:
      // 从库里读回的脏档位：按非法处理，不猜
      return null;
  }
}
