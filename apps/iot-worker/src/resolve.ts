import { normalizeLocalId } from '@multi-admin/contracts';
import { subtableName, type PropertyDecl } from '@multi-admin/device-registry';
import type { SnapshotIndex } from './snapshot/client.js';

export type PointResolution =
  | {
      ok: true;
      deviceId: string;
      modelCode: string;
      subtable: string;
      properties: readonly PropertyDecl[];
    }
  | { ok: false; reason: 'unknown-device' | 'out-of-range-ts' };

/**
 * 按 `localDeviceId + ts` 判定设备、型号与该时刻的声明。
 *
 * 口径是**数据自己的时间戳**，不是处理时刻：晚到数据、BullMQ 重试、多实例不同步都不改变
 * 它属于哪个版本。区间取半开 `[from, to)`。
 *
 * ⚠️ 只读换入快照时建好的索引，不做线性扫——万级设备下逐条扫是 O(N)，会随设备数线性恶化。
 */
export function resolvePoint(
  index: SnapshotIndex,
  localDeviceId: string,
  ts: number
): PointResolution {
  const usages = index.byLocalId.get(normalizeLocalId(localDeviceId));
  if (usages === undefined) return { ok: false, reason: 'unknown-device' };

  const usage = usages.find(
    candidate =>
      Date.parse(candidate.fromAt) <= ts &&
      (candidate.toAt === null || ts < Date.parse(candidate.toAt))
  );
  // 设备在快照里，但 ts 不落在任何 usage 区间（换型前后、排期生效前）
  if (usage === undefined) return { ok: false, reason: 'out-of-range-ts' };

  const model = index.byModelCode.get(usage.modelCode);
  if (model === undefined) return { ok: false, reason: 'out-of-range-ts' };

  const version = model.versions.find(
    candidate =>
      Date.parse(candidate.effectiveFrom) <= ts &&
      (candidate.effectiveTo === null || ts < Date.parse(candidate.effectiveTo))
  );
  if (version === undefined) return { ok: false, reason: 'out-of-range-ts' };

  return {
    ok: true,
    deviceId: usage.deviceId,
    modelCode: usage.modelCode,
    subtable: subtableName(usage.modelCode, usage.deviceId),
    properties: version.properties
  };
}
