import type { TelemetryMetric, TelemetryPayload } from '@multi-admin/contracts';

/** 模拟测点规格：基准值与抖动幅度（±spread），用于生成合理区间内的假数据 */
const METRIC_SPECS = [
  { key: 'temperature', unit: '°C', base: 62, spread: 6 },
  { key: 'vibration', unit: 'mm/s', base: 1.8, spread: 0.9 },
  { key: 'current', unit: 'A', base: 4.3, spread: 1.1 }
] as const;

/**
 * 生成一组测点。`random` 可注入（返回 [0,1)），测试据此取得确定性输出。
 */
export function buildMetrics(
  random: () => number = Math.random
): TelemetryMetric[] {
  return METRIC_SPECS.map(spec => ({
    key: spec.key,
    unit: spec.unit,
    value: Number((spec.base + (random() - 0.5) * 2 * spec.spread).toFixed(2))
  }));
}

/** 生成一台设备的一次上行报文 */
export function buildPayload(
  deviceId: string,
  ts: number = Date.now(),
  random: () => number = Math.random
): TelemetryPayload {
  return { deviceId, ts, metrics: buildMetrics(random) };
}
