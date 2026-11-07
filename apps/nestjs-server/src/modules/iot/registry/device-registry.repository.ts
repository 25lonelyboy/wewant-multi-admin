import { Inject, Injectable } from '@nestjs/common';
import { normalizeLocalId } from '@multi-admin/contracts';
import { subtableName, type SubtableRef } from '@multi-admin/device-registry';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';

/** 一台在用设备及其当前模型 */
export interface DeviceRow {
  localDeviceId: string;
  deviceId: string;
  /** 当前模型编码 */
  modelCode: string;
  /** 当前 open usage 指向的版本号；版本撤销后被置空 */
  version: number | null;
  /** 当前模型对应的子表名 */
  subtable: string;
}

/**
 * 设备档案的只读仓储。
 *
 * 只认 `ACTIVE` 设备；「当前模型」由 `usage.toAt IS NULL` 推出来，不存冗余字段。
 * 缓存与 `DeviceRegistry` 的实现形态归 D1，这里只做 server 侧的直连读取。
 */
@Injectable()
export class DeviceRegistryRepository {
  // 显式 token：构造参数保留 PrismaClient 形态，测试可直接 new 一个传 PrismaClient
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /** 查档：只认 ACTIVE，返回当前模型对应的子表 */
  async findActiveDevice(localDeviceId: string): Promise<DeviceRow | null> {
    const device = await this.prisma.iotDevice.findFirst({
      where: {
        localDeviceId: normalizeLocalId(localDeviceId),
        status: 'ACTIVE',
        usages: { some: { toAt: null } }
      },
      include: {
        usages: {
          where: { toAt: null },
          select: { modelCode: true, version: true }
        }
      }
    });
    if (!device) return null;
    // partial unique index 保证一台设备至多一条 open usage
    const [usage] = device.usages;
    if (!usage) return null;
    return {
      localDeviceId: device.localDeviceId,
      deviceId: device.deviceId,
      modelCode: usage.modelCode,
      version: usage.version,
      subtable: subtableName(usage.modelCode, device.deviceId)
    };
  }

  /** 全部在用设备——注册路径与验收用 */
  async listActiveDevices(): Promise<DeviceRow[]> {
    const devices = await this.prisma.iotDevice.findMany({
      where: { status: 'ACTIVE', usages: { some: { toAt: null } } },
      include: {
        usages: {
          where: { toAt: null },
          select: { modelCode: true, version: true }
        }
      },
      orderBy: { localDeviceId: 'asc' }
    });
    return devices.flatMap(device => {
      const [usage] = device.usages;
      if (!usage) return [];
      return [
        {
          localDeviceId: device.localDeviceId,
          deviceId: device.deviceId,
          modelCode: usage.modelCode,
          version: usage.version,
          subtable: subtableName(usage.modelCode, device.deviceId)
        }
      ];
    });
  }

  /**
   * 审计与建表脚本用的期望集：**设备 × 用过的模型**，含历史。
   *
   * 过滤纳入 `RETIRED`——退役设备的子表仍在期望集里，否则审计会把它们永久判成孤儿
   * （D5 §2.2）。"Registered" 修饰的是**设备**，不是子表——换型号后旧模型的子表仍然合法。
   */
  async listSubtablesOfRegisteredDevices(): Promise<SubtableRef[]> {
    const usages = await this.prisma.iotDeviceModelUsage.findMany({
      where: { device: { status: { in: ['ACTIVE', 'RETIRED'] } } },
      select: { modelCode: true, device: { select: { deviceId: true } } },
      orderBy: [{ deviceId: 'asc' }, { fromAt: 'asc' }]
    });
    const byName = new Map<string, SubtableRef>();
    for (const usage of usages) {
      const name = subtableName(usage.modelCode, usage.device.deviceId);
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          deviceId: usage.device.deviceId,
          modelCode: usage.modelCode
        });
      }
    }
    return [...byName.values()];
  }
}
