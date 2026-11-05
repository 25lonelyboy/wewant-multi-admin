import { Injectable, Logger } from '@nestjs/common';
import { BizCode, normalizeLocalId } from '@multi-admin/contracts';
import {
  DS_DATABASE,
  DS_LEVELS,
  RAW_DATABASE,
  checkDeviceId,
  checkModelCode,
  dsColumnsOf,
  dsSubtableName,
  subtableName,
  type PropertyDecl,
  type SubtableRef
} from '@multi-admin/device-registry';
import { BizException } from '../../../common/errors/biz.exception.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { TdClientProvider } from '../tdengine/td-client.provider.js';
import type { TdSql } from '../tdengine/td-client.js';
import { createDsSubtables, createRawSubtable } from '../schema/ddl.js';
import { dropCreatedTables, type CreatedTable } from '../schema/execute.js';
import { listExistingTables } from '../schema/td-schema.js';
import {
  DeviceRegistryRepository,
  type DeviceRow
} from '../registry/device-registry.repository.js';
import { DeviceIdIssuer } from './device-id-issuer.js';
import type { RegisterDeviceDto } from './dto/device.dto.js';

export interface RegisterDeviceResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  status: 'ACTIVE';
  /** 本次执行的建表语句；幂等重放时为空 */
  ddl: string[];
}

type VersionRow = {
  version: number;
  status: string;
  properties: unknown;
};

/** 唯一约束/表名冲突的重试上限；碰撞概率极低，上限只是兜底 */
const DEVICE_ID_ATTEMPTS = 5;

interface RegisterConflictDetails {
  modelCode?: string;
  tables?: string[];
  status?: string;
}

/**
 * 设备档案注册：签发平台标识、建子表、落档案。
 *
 * 失败整体回滚：本次建的子表删掉、PG 不落库——`localDeviceId` 不被占用，重试天然可行。
 * 幂等靠**前置检查**（档案 ACTIVE 且应有子表齐），唯一约束只在并发下兜底。
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly td: TdClientProvider,
    private readonly issuer: DeviceIdIssuer,
    private readonly registry: DeviceRegistryRepository
  ) {}

  async register(
    dto: RegisterDeviceDto,
    dryRun: boolean
  ): Promise<RegisterDeviceResult> {
    const localDeviceId = normalizeLocalId(dto.localDeviceId);
    if (localDeviceId === '') {
      throw this.invalid('localDeviceId');
    }
    const modelCodeCheck = checkModelCode(dto.modelCode);
    if (!modelCodeCheck.ok) {
      throw this.invalid('modelCode');
    }
    const modelCode = modelCodeCheck.value;

    const device = await this.registry.findActiveDevice(localDeviceId);
    if (device === null) {
      // 仓储只认 ACTIVE；非 ACTIVE 的档案要单独说清楚，不能当成“不存在”去建表
      const existing = await this.prisma.iotDevice.findFirst({
        where: { localDeviceId },
        select: { status: true }
      });
      if (existing !== null) {
        throw this.conflict('device-not-active', { status: existing.status });
      }
    }
    const model = await this.prisma.iotDeviceModel.findUnique({
      where: { code: modelCode },
      include: { versions: true }
    });
    const active = model?.versions.find(version => version.status === 'ACTIVE');

    if (device !== null) {
      // 先比设备当前模型，再要求请求的模型 ACTIVE：换型号与“模型不存在”是两种错误，
      // 前者更能说明调用方哪里不对
      if (device.modelCode !== modelCode) {
        throw this.conflict('registered-to-other-model', {
          modelCode: device.modelCode
        });
      }
      if (active === undefined) {
        throw this.conflict('model-not-active', { modelCode });
      }
      const td = await this.td.get();
      return this.idempotentResult(td, device, modelCode, active);
    }

    if (active === undefined) {
      throw this.conflict('model-not-active', { modelCode });
    }
    const properties = asProperties(active.properties);
    const td = await this.td.get();

    for (let attempt = 0; attempt < DEVICE_ID_ATTEMPTS; attempt += 1) {
      const deviceId = this.issuer.issue();
      if (!checkDeviceId(deviceId)) continue;

      // 标识已被占用（唯一约束的预判；并发时仍由库兜底）
      const taken = await this.prisma.iotDevice.findUnique({
        where: { deviceId },
        select: { id: true }
      });
      if (taken !== null) continue;

      const ref: SubtableRef = {
        name: subtableName(modelCode, deviceId),
        deviceId,
        modelCode
      };
      const dsNames = this.dsSubtableNames(ref, properties);
      const result = await this.createDevice(
        td,
        dto,
        localDeviceId,
        ref,
        dsNames,
        properties,
        active.version,
        dryRun
      );
      if (result !== null) return result;
      // null：deviceId 撞了唯一约束，换一个再试
    }

    throw this.conflict('duplicate-device');
  }

  /**
   * 已登记设备的重放：模型一致且应有子表齐才返回首次结果。
   *
   * 表缺一张就报「结构不一致」，**不自动补**——那是审计与人工的修复路径（D3 §2.4）。
   */
  private async idempotentResult(
    td: TdSql,
    device: DeviceRow,
    modelCode: string,
    active: VersionRow
  ): Promise<RegisterDeviceResult> {
    if (!checkDeviceId(device.deviceId)) {
      throw new Error(`档案里的 deviceId 格式非法：${device.deviceId}`);
    }

    const properties = asProperties(active.properties);
    const ref: SubtableRef = {
      name: device.subtable,
      deviceId: device.deviceId,
      modelCode
    };
    const dsNames = this.dsSubtableNames(ref, properties);
    const [existingRaw, existingDs] = await Promise.all([
      listExistingTables(td, RAW_DATABASE, [ref.name]),
      listExistingTables(td, DS_DATABASE, dsNames)
    ]);
    const missing = [
      ...(existingRaw.has(ref.name) ? [] : [ref.name]),
      ...dsNames.filter(name => !existingDs.has(name))
    ];
    if (missing.length > 0) {
      throw this.conflict('schema-mismatch', { tables: missing });
    }

    return {
      localDeviceId: device.localDeviceId,
      deviceId: device.deviceId,
      modelCode,
      status: 'ACTIVE',
      ddl: []
    };
  }

  /** 返回 null 表示 deviceId 撞了唯一约束，调用方换一个再试 */
  private async createDevice(
    td: TdSql,
    dto: RegisterDeviceDto,
    localDeviceId: string,
    ref: SubtableRef,
    dsNames: readonly string[],
    properties: readonly PropertyDecl[],
    modelVersion: number,
    dryRun: boolean
  ): Promise<RegisterDeviceResult | null> {
    // 同名子表已在库里（手工建的 / 上次清理失败的残留）⇒ 结构冲突，不覆盖
    const [existingRaw, existingDs] = await Promise.all([
      listExistingTables(td, RAW_DATABASE, [ref.name]),
      listExistingTables(td, DS_DATABASE, dsNames)
    ]);
    const conflicts = [
      ...(existingRaw.has(ref.name) ? [ref.name] : []),
      ...dsNames.filter(name => existingDs.has(name))
    ];
    if (conflicts.length > 0) {
      throw this.conflict('table-exists', { tables: conflicts });
    }

    const ddl = [
      createRawSubtable(ref),
      ...createDsSubtables(ref, properties, new Set())
    ];
    const result: RegisterDeviceResult = {
      localDeviceId,
      deviceId: ref.deviceId,
      modelCode: ref.modelCode,
      status: 'ACTIVE',
      ddl
    };
    if (dryRun) return result;

    const created: CreatedTable[] = [];
    try {
      await td.exec(ddl[0]);
      created.push({ db: RAW_DATABASE, name: ref.name, kind: 'table' });
      for (const [index, statement] of ddl.slice(1).entries()) {
        await td.exec(statement);
        created.push({
          db: DS_DATABASE,
          name: dsNames[index],
          kind: 'table'
        });
      }
      await this.createDeviceRows(dto, localDeviceId, ref, modelVersion);
      return result;
    } catch (error) {
      await dropCreatedTables(td, created, this.logger, {
        modelCode: ref.modelCode,
        localDeviceId
      });
      if (this.isUniqueViolation(error)) {
        const occupied = await this.prisma.iotDevice.findUnique({
          where: { localDeviceId },
          select: { id: true }
        });
        if (occupied !== null) throw this.conflict('duplicate-device');
        return null;
      }
      throw this.translateError(error);
    }
  }

  private async createDeviceRows(
    dto: RegisterDeviceDto,
    localDeviceId: string,
    ref: SubtableRef,
    modelVersion: number
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.iotDevice.create({
        data: {
          localDeviceId,
          deviceId: ref.deviceId,
          protocolVersion: dto.protocolVersion ?? null,
          status: 'ACTIVE',
          statusChangedAt: now
        }
      });
      await tx.iotDeviceModelUsage.create({
        data: {
          deviceId: ref.deviceId,
          modelCode: ref.modelCode,
          version: modelVersion,
          fromAt: now
        }
      });
    });
  }

  private dsSubtableNames(
    ref: SubtableRef,
    properties: readonly PropertyDecl[]
  ): string[] {
    const derived = dsColumnsOf(properties);
    if (!derived.ok) {
      throw new Error(`模型 ${ref.modelCode} 的降采样列推导失败`);
    }
    if (derived.columns.length === 0) return [];
    return DS_LEVELS.map(level => dsSubtableName(ref.name, level));
  }

  private invalid(field: string): BizException {
    return new BizException(BizCode.VALIDATION_FAILED, '设备注册参数非法', {
      issues: [{ path: field, code: 'invalid' }]
    });
  }

  private conflict(
    reason:
      | 'model-not-active'
      | 'schema-mismatch'
      | 'table-exists'
      | 'duplicate-device'
      | 'device-not-active'
      | 'registered-to-other-model',
    details: RegisterConflictDetails = {}
  ): BizException {
    return new BizException(BizCode.CONFLICT, '设备注册冲突', {
      reason,
      ...details
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private translateError(error: unknown): unknown {
    if (
      error instanceof Error &&
      /already exists|already exist/i.test(error.message)
    ) {
      return this.conflict('table-exists');
    }
    return error;
  }
}

function asProperties(value: unknown): PropertyDecl[] {
  return Array.isArray(value) ? (value as PropertyDecl[]) : [];
}
