import type { TelemetryMetric, TelemetryPayload } from '@multi-admin/contracts';

/** 模拟测点规格：基准值与抖动幅度（±spread），用于生成合理区间内的假数据 */
const METRIC_SPECS = [
  { key: 'temperature', unit: '°C', base: 62, spread: 6 },
  { key: 'vibration', unit: 'mm/s', base: 1.8, spread: 0.9 },
  { key: 'current', unit: 'A', base: 4.3, spread: 1.1 }
] as const;

/**
 * 追加测点：造"三测点之外"的设备，用于验证链路对布尔 / 枚举的可见性。
 *
 * ⚠️ 这两个 key 不在原始超表的列集合里，**落不了库**——物模型接管列集合（S5）之前，
 * 它们的作用是"能发出来、且被 worker 计数"，不是"能存下来"。
 * 枚举的线上值就是数字（落 `INT` + 取值表），所以 `run_mode` 与三个测点在类型上同形。
 */
export type ExtraMetric = 'none' | 'boolean' | 'enum';

const EXTRA_METRICS: Record<Exclude<ExtraMetric, 'none'>, TelemetryMetric> = {
  boolean: { key: 'power_state', unit: '', value: true },
  enum: { key: 'run_mode', unit: '', value: 2 }
};

/**
 * 生成一组测点。`random` 可注入（返回 [0,1)），测试据此取得确定性输出；
 * `extra` 决定是否在三个基础测点之后追加一个布尔 / 枚举测点，缺省不追加。
 */
export function buildMetrics(
  random: () => number = Math.random,
  extra: ExtraMetric = 'none'
): TelemetryMetric[] {
  const metrics: TelemetryMetric[] = METRIC_SPECS.map(spec => ({
    key: spec.key,
    unit: spec.unit,
    value: Number((spec.base + (random() - 0.5) * 2 * spec.spread).toFixed(2))
  }));

  if (extra !== 'none') metrics.push({ ...EXTRA_METRICS[extra] });

  return metrics;
}

/** 生成一台设备的一次上行报文 */
export function buildPayload(
  localDeviceId: string,
  ts: number = Date.now(),
  random: () => number = Math.random,
  extra: ExtraMetric = 'none'
): TelemetryPayload {
  return { localDeviceId, ts, metrics: buildMetrics(random, extra) };
}
