import { normalizeLocalId } from '@multi-admin/contracts';
import type { DeviceRecord, DeviceRegistry, SubtableRef } from './types.js';

/**
 * `localPointId` 的长度上限。
 *
 * 它落在档案表的键列上 ⇒ **超长必须拒绝，不能截断**——截断会让两个不同的长编号撞成同一个键。
 */
export const MAX_LOCAL_POINT_ID_LENGTH = 64;

/**
 * 子表名：`{deviceId}_{pointKey}`。
 *
 * ⚠️ TDengine 的标识符**不分大小写、存储时折成小写** ⇒ 这里直接给折小写后的形态，
 * 建表脚本与写入端才拿到同一个字符串。**标签值不折**，设备标识仍以原样入标签。
 */
export function subtableName(deviceId: string, pointKey: string): string {
  return `${deviceId}_${pointKey}`.toLowerCase();
}

/** 由档案数据构造查档接口 */
export function createDeviceRegistry(
  records: readonly DeviceRecord[]
): DeviceRegistry {
  const byLocalDeviceId = new Map<string, DeviceRecord>();
  for (const record of records) {
    const key = normalizeLocalId(record.localDeviceId);
    if (byLocalDeviceId.has(key)) {
      throw new Error(`设备档案里 localDeviceId 重复：${record.localDeviceId}`);
    }
    byLocalDeviceId.set(key, record);
  }

  return {
    hasDevice(localDeviceId: string): boolean {
      return byLocalDeviceId.has(normalizeLocalId(localDeviceId));
    },

    resolve(localDeviceId, localPointId) {
      const record = byLocalDeviceId.get(normalizeLocalId(localDeviceId));
      if (!record) return { ok: false, reason: 'unknown-device' };

      if (localPointId === undefined) {
        // 缺省只对**登记为单点**的设备生效：多点设备漏 pointId 时若也走缺省，
        // 第 3 路的数据会被静默写进第 1 路的子表。
        if (!record.singlePoint) return { ok: false, reason: 'missing-point' };
        const only = record.points[0];
        if (only === undefined) return { ok: false, reason: 'missing-point' };
        return { ok: true, deviceId: record.deviceId, pointKey: only.pointKey };
      }

      const raw = localPointId.trim();
      if (raw === '') return { ok: false, reason: 'missing-point' };
      if (raw.length > MAX_LOCAL_POINT_ID_LENGTH) {
        return { ok: false, reason: 'point-id-too-long' };
      }

      const wanted = normalizeLocalId(raw);
      const point = record.points.find(
        candidate => normalizeLocalId(candidate.localPointId) === wanted
      );
      if (!point) return { ok: false, reason: 'unknown-point' };
      return { ok: true, deviceId: record.deviceId, pointKey: point.pointKey };
    },

    allSubtables(): SubtableRef[] {
      return records.flatMap(record =>
        record.points.map(point => ({
          name: subtableName(record.deviceId, point.pointKey),
          deviceId: record.deviceId,
          pointKey: point.pointKey
        }))
      );
    }
  };
}
