import type { TelemetryMetric } from '@multi-admin/contracts';
import { RAW_METRICS, type RawMetric } from './schema.js';

/** 超表的列集合——即"认得"的测点。不在其中的 key 没有列可落 */
const KNOWN_METRICS: ReadonlySet<string> = new Set(RAW_METRICS);

/** 一个测点的合理取值范围（含端点） */
export interface MetricRange {
  min: number;
  max: number;
}

export type MetricRanges = Readonly<Record<RawMetric, MetricRange>>;

/**
 * P1 三个测点的默认量程。
 *
 * ⚠️ **权威来源留到增量 3 的物模型**——这里先用可配常量，`detect()` 的 `ranges` 参数即配置口子。
 * 超量程的值与 NaN / Infinity 一样**不进存储**（脏数据会污染后续分析）。
 */
export const DEFAULT_METRIC_RANGES: MetricRanges = {
  temperature: { min: -50, max: 200 }, // ℃（工业量程）
  vibration: { min: 0, max: 100 }, // mm/s
  current: { min: 0, max: 100 } // A
};

export interface DetectedSample {
  localDeviceId: string;
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
  | {
      ok: false;
      reason: DetectionFailure;
      /**
       * ⭐ 上报了但不认识的测点 key——**全列皆未知时也要带出来**（"告警必须带 key"）。
       * 未知 `key` 是**永久**条件，处置仍是"丢弃 + 告警带 key"，不因 C10 变成重试。
       */
      unknownMetricKeys: string[];
    };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: number, range: MetricRange | undefined): boolean {
  if (range === undefined) return true;
  return value >= range.min && value <= range.max;
}

/**
 * 结构化判定：格式 / 字段完整性 / 值域（含**量程**）/ **测点是否在列集合内**（都不需要外部信息）。
 *
 * ⚠️ **未知测点只丢那一个测点，不丢整条**——决策 1 §6.6 的第 2 层对策是"让它可见 + 治根因"，
 * 不是"用存储买单"；把整条丢掉会把同一条里合法的测点一起赔进去。丢弃的数量与 key 由调用方
 * 计数并告警。
 * ⚠️ **超量程的测点**同样只丢那一个（`ranges` 可配，缺省见 `DEFAULT_METRIC_RANGES`）。
 */
export function detect(
  raw: string,
  ranges: Partial<MetricRanges> = {}
): DetectionResult {
  const bounds: Partial<MetricRanges> = { ...DEFAULT_METRIC_RANGES, ...ranges };
  const fail = (
    reason: DetectionFailure,
    unknownMetricKeys: string[] = []
  ): DetectionResult => ({ ok: false, reason, unknownMetricKeys });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail('malformed');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('malformed');
  }

  const payload = parsed as Record<string, unknown>;

  const localDeviceId = payload.localDeviceId;
  if (typeof localDeviceId !== 'string' || localDeviceId.trim() === '') {
    return fail('missing-device');
  }

  const ts = payload.ts;
  if (!isFiniteNumber(ts)) return fail('bad-ts');

  if (!Array.isArray(payload.metrics)) return fail('no-metrics');

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
    // 量程：超出该测点的合理区间同样丢弃
    if (!inRange(metric.value, bounds[key as RawMetric])) continue;

    metrics.push({
      key,
      value: metric.value,
      unit: typeof metric.unit === 'string' ? metric.unit : ''
    });
  }

  if (metrics.length === 0) return fail('no-metrics', unknownMetricKeys);

  return {
    ok: true,
    sample: {
      localDeviceId,
      ts,
      metrics,
      unknownMetricKeys
    }
  };
}
