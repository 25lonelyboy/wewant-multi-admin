import type { TelemetryMetric } from '@multi-admin/contracts';
import { RAW_METRICS } from './schema.js';

/** 超表的列集合——即"认得"的测点。不在其中的 key 没有列可落 */
const KNOWN_METRICS: ReadonlySet<string> = new Set(RAW_METRICS);

export interface DetectedSample {
  localDeviceId: string;
  /** 设备报的采集点编号；仅多点设备会有 */
  localPointId?: string;
  ts: number;
  /** 只保留**认得的、值合法的**测点 */
  metrics: TelemetryMetric[];
  /** 上报了但不在列集合里的测点 key——**丢弃但要计数与告警** */
  unknownMetricKeys: string[];
}

export type DetectionFailure =
  /** 不是合法 JSON，或顶层不是对象 */
  | 'malformed'
  /** `localDeviceId` 缺失或为空 */
  | 'missing-device'
  /** `ts` 不是有限数字 */
  | 'bad-ts'
  /** 有效测点一个都不剩 */
  | 'no-metrics';

export type DetectionResult =
  | { ok: true; sample: DetectedSample }
  | { ok: false; reason: DetectionFailure };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 结构化判定：格式 / 字段完整性 / 值域 / **测点是否在列集合内**（都不需要外部信息）。
 *
 * ⚠️ **未知测点只丢那一个测点，不丢整条**——决策 1 §6.6 的第 2 层对策是"让它可见 + 治根因"，
 * 不是"用存储买单"；把整条丢掉会把同一条里合法的测点一起赔进去。丢弃的数量与 key 由调用方
 * 计数并告警。
 */
export function detect(raw: string): DetectionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'malformed' };
  }

  const payload = parsed as Record<string, unknown>;

  const localDeviceId = payload.localDeviceId;
  if (typeof localDeviceId !== 'string' || localDeviceId.trim() === '') {
    return { ok: false, reason: 'missing-device' };
  }

  const localPointId = payload.localPointId;
  if (localPointId !== undefined && typeof localPointId !== 'string') {
    return { ok: false, reason: 'malformed' };
  }

  const ts = payload.ts;
  if (!isFiniteNumber(ts)) return { ok: false, reason: 'bad-ts' };

  if (!Array.isArray(payload.metrics))
    return { ok: false, reason: 'no-metrics' };

  const metrics: TelemetryMetric[] = [];
  const unknownMetricKeys: string[] = [];
  for (const item of payload.metrics) {
    if (typeof item !== 'object' || item === null) continue;
    const metric = item as Record<string, unknown>;
    const key = metric.key;
    if (typeof key !== 'string' || key === '') continue;

    if (!KNOWN_METRICS.has(key)) {
      unknownMetricKeys.push(key);
      continue;
    }
    // 值域：NaN / Infinity / 非数字一律不进存储——脏数据会污染后续分析
    if (!isFiniteNumber(metric.value)) continue;

    metrics.push({
      key,
      value: metric.value,
      unit: typeof metric.unit === 'string' ? metric.unit : ''
    });
  }

  if (metrics.length === 0) return { ok: false, reason: 'no-metrics' };

  return {
    ok: true,
    sample: {
      localDeviceId,
      ...(localPointId === undefined ? {} : { localPointId }),
      ts,
      metrics,
      unknownMetricKeys
    }
  };
}
