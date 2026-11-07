import { localDeviceIdForIndex } from '@multi-admin/contracts';
import type {
  PropertyDecl,
  RegistrySnapshot
} from '@multi-admin/device-registry';
import { Redis } from 'ioredis';
import { buildIndex, type SnapshotSource } from '../src/snapshot/client.js';

/**
 * worker e2e 的快照夹具——**不是**运行期档案，只给真 Redis / 真 TDengine 的接线用例
 * 提供一份确定性的「100 台 P1 设备 + p1 模型」。
 *
 * ⚠️ 设备标识必须与种子/建表脚本的确定性映射同源，否则算出的子表名对不上已有表。
 */
export const P1_MODEL_CODE = 'p1';
export const P1_DEVICE_COUNT = 100;

const DEVICE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEVICE_ID_LEAD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEVICE_ID_LENGTH = 16;

export function p1DeviceId(index: number): string {
  let state = Math.imul(index, 2654435761) >>> 0;
  let out = '';
  for (let i = 0; i < DEVICE_ID_LENGTH; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const alphabet = i === 0 ? DEVICE_ID_LEAD_ALPHABET : DEVICE_ID_ALPHABET;
    out += alphabet.charAt(state % alphabet.length);
  }
  return out;
}

/** 与模拟器共用的设备编号（契约里的同一个生成函数） */
export function p1LocalDeviceId(index: number): string {
  return localDeviceIdForIndex(index);
}

export const P1_PROPERTIES: PropertyDecl[] = [
  {
    key: 'temperature',
    kind: 'float',
    unit: '°C',
    range: { min: -50, max: 200 },
    aggregates: ['sum', 'count', 'min', 'max']
  },
  {
    key: 'vibration',
    kind: 'float',
    unit: 'mm/s',
    range: { min: 0, max: 100 },
    aggregates: ['sum', 'count', 'min', 'max']
  },
  {
    key: 'current',
    kind: 'float',
    unit: 'A',
    range: { min: 0, max: 100 },
    aggregates: ['sum', 'count', 'min', 'max']
  }
];

function dsColumns(): RegistrySnapshot['models'][number]['dsColumns'] {
  return P1_PROPERTIES.flatMap(property =>
    (['sum', 'count', 'min', 'max'] as const).flatMap(aggregate =>
      (['1m', '1h', '1d'] as const).map(level => ({
        level,
        name: `${aggregate}_${property.key}`,
        aggregate,
        property: property.key,
        bindKind:
          aggregate === 'count'
            ? 'bigint'
            : aggregate === 'sum'
              ? 'double'
              : 'float'
      }))
    )
  );
}

/** 一份含 100 台 P1 设备的快照；`version` 可指定以便测试版本推进 */
export function p1Snapshot(version = 1): RegistrySnapshot {
  return {
    version,
    builtAt: '2020-01-01T00:00:00.000Z',
    models: [
      {
        modelCode: P1_MODEL_CODE,
        rawColumns: P1_PROPERTIES.map(property => ({
          name: property.key,
          bindKind: 'float' as const
        })),
        dsColumns: dsColumns(),
        versions: [
          {
            version: 1,
            effectiveFrom: '2020-01-01T00:00:00.000Z',
            effectiveTo: null,
            properties: P1_PROPERTIES
          }
        ]
      }
    ],
    devices: Array.from({ length: P1_DEVICE_COUNT }, (_, i) => ({
      localDeviceId: p1LocalDeviceId(i + 1),
      deviceId: p1DeviceId(i + 1),
      modelCode: P1_MODEL_CODE,
      fromAt: '2020-01-01T00:00:00.000Z',
      toAt: null
    }))
  };
}

/** 进程内消费环/降采样环用的索引 */
export function p1SnapshotSource(version = 1): SnapshotSource {
  const index = buildIndex(p1Snapshot(version));
  return { currentIndex: () => index };
}

/** 业务 Redis 的连接 + 快照写入；返回连接供用例收尾时关闭 */
export async function writeSnapshot(
  redisUrl: string,
  snapshot: RegistrySnapshot = p1Snapshot()
): Promise<Redis> {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });
  await redis.set('iot:registry:snapshot', JSON.stringify(snapshot));
  await redis.set('iot:registry:built', String(snapshot.version));
  return redis;
}

export async function clearSnapshot(redis: Redis): Promise<void> {
  await redis.del('iot:registry:snapshot', 'iot:registry:built').catch(() => 0);
  await redis.quit().catch(() => redis.disconnect());
}
