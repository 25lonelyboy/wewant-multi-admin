import { normalizeLocalId } from '@multi-admin/contracts';
import type { DeviceRecord, DeviceRegistry, SubtableRef } from './types.js';

/**
 * 子表名：`{模型编码}_{deviceId}`。
 *
 * ⚠️ TDengine 的标识符**不分大小写、存储时折成小写** ⇒ 这里直接给折小写后的形态，
 * 建表脚本与写入端才拿到同一个字符串。**标签值不折**，设备标识仍以原样入标签。
 */
export function subtableName(modelCode: string, deviceId: string): string {
  return `${modelCode}_${deviceId}`.toLowerCase();
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

    resolve(localDeviceId) {
      const record = byLocalDeviceId.get(normalizeLocalId(localDeviceId));
      if (!record) return { ok: false, reason: 'unknown-device' };
      return {
        ok: true,
        deviceId: record.deviceId,
        modelCode: record.modelCode,
        subtable: subtableName(record.modelCode, record.deviceId)
      };
    },

    allSubtables(): SubtableRef[] {
      return records.map(record => ({
        name: subtableName(record.modelCode, record.deviceId),
        deviceId: record.deviceId,
        modelCode: record.modelCode
      }));
    }
  };
}
