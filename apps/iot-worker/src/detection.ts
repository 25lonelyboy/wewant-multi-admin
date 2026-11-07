/** 报文集里的一行测点——值未收窄，是否可用要等拿到声明才知道 */
export interface EnvelopeMetric {
  key: string;
  value: unknown;
  /** 设备上报的单位；与声明逐字比较，不落列 */
  unit: string;
}

export interface Envelope {
  localDeviceId: string;
  ts: number;
  metrics: EnvelopeMetric[];
}

export type ParseFailure =
  'malformed' | 'missing-device' | 'bad-ts' | 'no-metrics';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 只做 JSON / 顶层 / 字段存在性校验，**不碰测点集合**——集合要等拿到该 `ts` 的声明才知道。
 *
 * ⚠️ 与旧的 `detect()` 相反：旧版先按编译期常量过滤测点再查档；S5 改成先解析身份与 `ts`、
 * 从快照取声明，再按声明过滤。未知设备与越界 `ts` 因此都能带 `localDeviceId` 打日志。
 */
export function parseEnvelope(
  raw: string
): Envelope | { reason: ParseFailure } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reason: 'malformed' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { reason: 'malformed' };
  }

  const payload = parsed as Record<string, unknown>;

  const localDeviceId = payload.localDeviceId;
  if (typeof localDeviceId !== 'string' || localDeviceId.trim() === '') {
    return { reason: 'missing-device' };
  }

  const ts = payload.ts;
  if (!isFiniteNumber(ts)) return { reason: 'bad-ts' };

  if (!Array.isArray(payload.metrics)) return { reason: 'no-metrics' };

  const metrics: EnvelopeMetric[] = [];
  for (const item of payload.metrics) {
    if (typeof item !== 'object' || item === null) continue;
    const metric = item as Record<string, unknown>;
    const key = metric.key;
    if (typeof key !== 'string' || key === '') continue;
    metrics.push({
      key,
      value: metric.value,
      unit: typeof metric.unit === 'string' ? metric.unit : ''
    });
  }

  if (metrics.length === 0) return { reason: 'no-metrics' };
  return { localDeviceId, ts, metrics };
}
