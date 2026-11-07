import {
  bindKindOfColumnType,
  type PropertyDecl
} from '@multi-admin/device-registry';
import {
  SnapshotBuildError,
  buildRegistrySnapshot
} from './snapshot.builder.js';

type Row = Record<string, unknown>;

/**
 * 只实现 `$transaction` 的读侧替身：`buildRegistrySnapshot` 的可测面就是「读两张表 → 组装」。
 * 事务隔离级别在真库上验证，这里只喂数据。
 */
function readerOf(devices: Row[], models: Row[]) {
  const tx = {
    iotDevice: { findMany: () => Promise.resolve(devices) },
    iotDeviceModel: { findMany: () => Promise.resolve(models) }
  };
  return {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)
  } as never;
}

const temperature: PropertyDecl = {
  key: 'temperature',
  kind: 'float',
  unit: '°C',
  range: { min: -50, max: 200 },
  aggregates: ['sum', 'count', 'min', 'max']
};
const vibration: PropertyDecl = {
  key: 'vibration',
  kind: 'float',
  unit: 'mm/s',
  aggregates: ['sum', 'count', 'min', 'max']
};
const door: PropertyDecl = {
  key: 'door',
  kind: 'bool',
  aggregates: ['count', 'min', 'max']
};

function modelRow(versions: unknown[]): Row {
  return { code: 'm1', versions };
}

const version = (
  n: number,
  effectiveFrom: string,
  effectiveTo: string | null,
  properties: PropertyDecl[]
): Row => ({
  version: n,
  effectiveFrom: new Date(effectiveFrom),
  effectiveTo: effectiveTo === null ? null : new Date(effectiveTo),
  properties
});

void test('物理列取所有版本的并集：v2 删掉 vibration 后 rawColumns 仍含它', async () => {
  const snapshot = await buildRegistrySnapshot(
    readerOf(
      [],
      [
        modelRow([
          version(1, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', [
            temperature,
            vibration
          ]),
          version(2, '2026-02-01T00:00:00.000Z', null, [temperature, door])
        ])
      ]
    ),
    7
  );

  const model = snapshot.models[0];
  expect(model?.modelCode).toBe('m1');
  expect(model?.rawColumns.map(column => column.name)).toEqual([
    'temperature',
    'vibration',
    'door'
  ]);
  // 绑定类型来自声明档位，不是一律 float
  expect(
    model?.rawColumns.find(column => column.name === 'door')?.bindKind
  ).toBe('bool');
});

void test('dsColumns 带聚合一列一份、绑定类型随档位变，且三级各有一份', async () => {
  const snapshot = await buildRegistrySnapshot(
    readerOf(
      [],
      [
        modelRow([
          version(1, '2026-01-01T00:00:00.000Z', null, [temperature, door])
        ])
      ]
    ),
    1
  );

  const columns = snapshot.models[0]?.dsColumns ?? [];
  const find = (level: string, name: string) =>
    columns.find(column => column.level === level && column.name === name);

  expect(find('1m', 'sum_temperature')?.bindKind).toBe('double');
  expect(find('1m', 'count_temperature')?.bindKind).toBe('bigint');
  expect(find('1m', 'min_temperature')?.bindKind).toBe('float');
  // BOOL 的 min / max 落 BOOL，不是 FLOAT——按聚合名硬编码类型不成立
  expect(find('1m', 'min_door')?.bindKind).toBe('bool');
  expect(find('1m', 'count_door')?.bindKind).toBe('bigint');
  expect(find('1d', 'min_door')?.bindKind).toBe('bool');

  // 从列名能还原聚合与来源属性，SQL 与绑定都不必再反推
  expect(find('1m', 'min_door')?.aggregate).toBe('min');
  expect(find('1m', 'min_door')?.property).toBe('door');
});

void test('设备 usage 全部进快照（含历史），localDeviceId 已规范化', async () => {
  const snapshot = await buildRegistrySnapshot(
    readerOf(
      [
        {
          localDeviceId: 'DEV-1',
          deviceId: 'ABCDEFGHIJKLMNOP',
          usages: [
            {
              modelCode: 'm1',
              fromAt: new Date('2026-01-01T00:00:00.000Z'),
              toAt: new Date('2026-02-01T00:00:00.000Z')
            },
            {
              modelCode: 'm1',
              fromAt: new Date('2026-02-01T00:00:00.000Z'),
              toAt: null
            }
          ]
        }
      ],
      [modelRow([version(1, '2026-01-01T00:00:00.000Z', null, [temperature])])]
    ),
    3
  );

  expect(snapshot.version).toBe(3);
  expect(snapshot.devices).toEqual([
    {
      localDeviceId: 'dev-1',
      deviceId: 'ABCDEFGHIJKLMNOP',
      modelCode: 'm1',
      fromAt: '2026-01-01T00:00:00.000Z',
      toAt: '2026-02-01T00:00:00.000Z'
    },
    {
      localDeviceId: 'dev-1',
      deviceId: 'ABCDEFGHIJKLMNOP',
      modelCode: 'm1',
      fromAt: '2026-02-01T00:00:00.000Z',
      toAt: null
    }
  ]);
});

void test('没有版本的模型不进快照（空壳模型没有可执行声明）', async () => {
  const snapshot = await buildRegistrySnapshot(
    readerOf([], [{ code: 'empty', versions: [] }]),
    1
  );
  expect(snapshot.models).toEqual([]);
});

void test('⭐ 任一列推导失败 ⇒ 整轮构建失败，不发布半份快照', async () => {
  const broken: PropertyDecl = {
    key: 'label',
    kind: 'string',
    aggregates: ['count']
    // 缺 varcharLength：校验器会拒，但库里的脏 JSON 可能就是这个形状
  };
  await expect(
    buildRegistrySnapshot(
      readerOf(
        [],
        [modelRow([version(1, '2026-01-01T00:00:00.000Z', null, [broken])])]
      ),
      1
    )
  ).rejects.toBeInstanceOf(SnapshotBuildError);
});

void test('bindKindOfColumnType：VARCHAR(N) 归 varchar，未知类型为 null', () => {
  expect(bindKindOfColumnType('VARCHAR(64)')).toBe('varchar');
  expect(bindKindOfColumnType('BOWTIE')).toBeNull();
});
