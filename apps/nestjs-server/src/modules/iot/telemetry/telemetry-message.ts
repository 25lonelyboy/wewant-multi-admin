import type { TelemetryMetric, TelemetryPayload } from '@multi-admin/contracts';

/** 解析后的上行样本 */
export interface TelemetrySample {
  deviceId: string;
  ts: number;
  metrics: TelemetryMetric[];
}

function isMetric(value: unknown): value is TelemetryMetric {
  if (typeof value !== 'object' || value === null) return false;
  const metric = value as Partial<TelemetryMetric>;
  return (
    typeof metric.key === 'string' &&
    metric.key !== '' &&
    typeof metric.value === 'number' &&
    Number.isFinite(metric.value) &&
    typeof metric.unit === 'string'
  );
}

/**
 * 解析设备上行报文。结构不符返回 null 而非抛错：设备数据是系统边界上的输入，
 * 单条坏报文不应中断整条订阅链路（调用方只做计数与 debug 记录）。
 */
export function parseTelemetry(raw: string): TelemetrySample | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const payload = parsed as Partial<TelemetryPayload>;
  if (typeof payload.deviceId !== 'string' || payload.deviceId === '')
    return null;
  if (typeof payload.ts !== 'number' || !Number.isFinite(payload.ts))
    return null;
  if (!Array.isArray(payload.metrics)) return null;

  const metrics = payload.metrics.filter(isMetric);
  if (metrics.length === 0) return null;

  return { deviceId: payload.deviceId, ts: payload.ts, metrics };
}
