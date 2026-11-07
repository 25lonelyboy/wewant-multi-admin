import { PrismaPg } from '@prisma/adapter-pg';
import { subtableName } from '@multi-admin/device-registry';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { DeviceRegistryRepository } from '../src/modules/iot/registry/device-registry.repository.js';
import { runSeed } from '../prisma/seed.js';

// 档案读法与两条库级不变量都必须打真库：partial unique index 与复合外键是数据库行为，
// 应用层 mock 不出来。用例只写自己的 e2e-reg-* 设备，afterAll 自行清理（不假设可以清库）。
const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

const PREFIX = 'e2e-reg-';
const ALT_MODEL = 'e2e_reg_alt';
const P1_VERSION = 1;

describe('iot 设备档案 (e2e)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });
  const repository = new DeviceRegistryRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.iotDeviceModel.upsert({
      where: { code: ALT_MODEL },
      create: { code: ALT_MODEL },
      update: {}
    });
    await prisma.iotModelVersion.upsert({
      where: { modelCode_version: { modelCode: ALT_MODEL, version: 1 } },
      create: {
        modelCode: ALT_MODEL,
        version: 1,
        status: 'ACTIVE',
        properties: [],
        services: [],
        events: [],
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z')
      },
      update: {}
    });
  });

  afterAll(async () => {
    await prisma.iotDeviceModelUsage.deleteMany({
      where: { device: { localDeviceId: { startsWith: PREFIX } } }
    });
    await prisma.iotDevice.deleteMany({
      where: { localDeviceId: { startsWith: PREFIX } }
    });
    await prisma.iotModelVersion.deleteMany({
      where: { modelCode: ALT_MODEL }
    });
    await prisma.iotDeviceModel.deleteMany({ where: { code: ALT_MODEL } });
    await prisma.$disconnect();
  });

  it('只认 ACTIVE：PENDING 设备查不到，也不进在用设备清单', async () => {
    await prisma.iotDevice.create({
      data: {
        localDeviceId: 'e2e-reg-pending',
        deviceId: 'E2EREGPENDING0001'
      }
    });
    await prisma.iotDeviceModelUsage.create({
      data: {
        deviceId: 'E2EREGPENDING0001',
        modelCode: 'p1',
        version: P1_VERSION
      }
    });

    expect(await repository.findActiveDevice('e2e-reg-pending')).toBeNull();
    const activeIds = (await repository.listActiveDevices()).map(
      device => device.localDeviceId
    );
    expect(activeIds).not.toContain('e2e-reg-pending');
  });

  it('当前模型由 open usage 推出；期望集同时含新旧两个子表', async () => {
    const device = await prisma.iotDevice.create({
      data: {
        localDeviceId: 'e2e-reg-switch',
        deviceId: 'E2EREGSWITCH00001',
        status: 'ACTIVE'
      }
    });
    await prisma.iotDeviceModelUsage.create({
      data: {
        deviceId: device.deviceId,
        modelCode: 'p1',
        version: P1_VERSION,
        fromAt: new Date(Date.now() - 3_600_000),
        toAt: new Date(Date.now() - 1_800_000)
      }
    });
    await prisma.iotDeviceModelUsage.create({
      data: { deviceId: device.deviceId, modelCode: ALT_MODEL, version: 1 }
    });

    const current = await repository.findActiveDevice('e2e-reg-switch');
    expect(current?.modelCode).toBe(ALT_MODEL);
    // 查档的键先规范化：大写输入也能查到同一台设备
    expect(await repository.findActiveDevice('E2E-REG-SWITCH')).toEqual(
      current
    );

    const names = (await repository.listSubtablesOfActiveDevices())
      .filter(ref => ref.deviceId === device.deviceId)
      .map(ref => ref.name);
    expect(names.sort()).toEqual(
      [
        subtableName('p1', device.deviceId),
        subtableName(ALT_MODEL, device.deviceId)
      ].sort()
    );
  });

  it('命名同源：返回的子表名等于 subtableName(modelCode, deviceId)', async () => {
    const device = await prisma.iotDevice.create({
      data: {
        localDeviceId: 'e2e-reg-name',
        deviceId: 'E2EREGNAME0000001',
        status: 'ACTIVE'
      }
    });
    await prisma.iotDeviceModelUsage.create({
      data: { deviceId: device.deviceId, modelCode: 'p1', version: P1_VERSION }
    });

    const found = await repository.findActiveDevice('e2e-reg-name');
    expect(found?.subtable).toBe(subtableName('p1', device.deviceId));

    const refs = await repository.listSubtablesOfActiveDevices();
    for (const ref of refs.filter(r => r.deviceId === device.deviceId)) {
      expect(ref.name).toBe(subtableName(ref.modelCode, ref.deviceId));
    }
  });

  it('同一设备第二条 open usage 被数据库拒绝', async () => {
    await prisma.iotDevice.create({
      data: {
        localDeviceId: 'e2e-reg-dup',
        deviceId: 'E2EREGDUP0000001',
        status: 'ACTIVE'
      }
    });
    await prisma.iotDeviceModelUsage.create({
      data: {
        deviceId: 'E2EREGDUP0000001',
        modelCode: 'p1',
        version: P1_VERSION
      }
    });

    await expect(
      prisma.iotDeviceModelUsage.create({
        data: {
          deviceId: 'E2EREGDUP0000001',
          modelCode: 'p1',
          version: P1_VERSION
        }
      })
    ).rejects.toThrow(
      /IotDeviceModelUsage_deviceId_open_key|Unique constraint/i
    );
  });

  it('指向不存在版本的 usage 被数据库拒绝', async () => {
    await prisma.iotDevice.create({
      data: {
        localDeviceId: 'e2e-reg-fk',
        deviceId: 'E2EREGFK00000001',
        status: 'ACTIVE'
      }
    });

    await expect(
      prisma.iotDeviceModelUsage.create({
        data: {
          deviceId: 'E2EREGFK00000001',
          modelCode: 'p1',
          version: 999
        }
      })
    ).rejects.toThrow(/foreign key|Foreign key constraint/i);
  });

  it('seed 幂等：连跑两次，iot 四表行数不变', async () => {
    const countAll = async (): Promise<number[]> => [
      await prisma.iotDevice.count(),
      await prisma.iotDeviceModelUsage.count(),
      await prisma.iotModelVersion.count(),
      await prisma.iotDeviceModel.count()
    ];

    const before = await countAll();
    await runSeed(prisma);
    await runSeed(prisma);
    expect(await countAll()).toEqual(before);
  });
});
