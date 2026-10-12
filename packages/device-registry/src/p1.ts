import { localDeviceIdForIndex } from '@multi-admin/contracts';
import { createDeviceRegistry } from './registry.js';
import type { DeviceRecord, DeviceRegistry } from './types.js';

/** P1 的模拟设备台数——与模拟器缺省规模一致 */
export const P1_DEVICE_COUNT = 100;

const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * 首位专用字母表。
 *
 * ⚠️ TDengine 的标识符**不能以数字开头**，而 `deviceId` 是子表名 `{deviceId}_{pointKey}`
 * 的首段 ⇒ 生成侧必须保证首字符是字母。
 */
const DEVICE_ID_LEAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 平台设备标识长度：决策 1 §8.2 定为 16 位全大写 */
const DEVICE_ID_LENGTH = 16;

/**
 * 由序号**确定性**地推出平台标识。
 *
 * ⚠️ 必须是纯函数：映射一旦有数据就冻结（决策 1 §8.5），随机重生成会让旧子表对不上 ⇒ 数据分家。
 */
function deriveDeviceId(index: number): string {
  // 线性同余推进；纯计算、无随机源，跨进程与跨次运行结果一致
  let state = Math.imul(index, 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < DEVICE_ID_LENGTH; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const alphabet = i === 0 ? DEVICE_ID_LEAD_ALPHABET : DEVICE_ID_ALPHABET;
    out += alphabet.charAt(state % alphabet.length);
  }
  return out;
}

/**
 * P1 的设备档案数据。
 *
 * 全部登记为**单点**设备、采集点编号 `001`。增量 3 换成真设备档案后本函数退场，
 * **接口与子表名不动**。⚠️ `localDeviceId` 与模拟器共用契约里的同一个生成函数，
 * 不靠事后断言对齐。
 */
export function p1DeviceRecords(
  count: number = P1_DEVICE_COUNT
): DeviceRecord[] {
  return Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    return {
      localDeviceId: localDeviceIdForIndex(index),
      deviceId: deriveDeviceId(index),
      singlePoint: true,
      points: [{ localPointId: '001', pointKey: '001' }]
    };
  });
}

/** 平台侧唯一的档案实例 */
export const p1DeviceRegistry: DeviceRegistry =
  createDeviceRegistry(p1DeviceRecords());
