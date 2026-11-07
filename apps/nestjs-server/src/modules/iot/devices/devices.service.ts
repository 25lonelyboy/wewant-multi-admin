import { Injectable, Logger } from '@nestjs/common';
import { BizCode, checkLocalDeviceId } from '@multi-admin/contracts';
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
import { RegistryRevisionService } from '../registry-snapshot/snapshot.revision.js';
import { DeviceIdIssuer } from './device-id-issuer.js';
import type {
  RegisterDeviceDto,
  RescheduleDeviceDto
} from './dto/device.dto.js';

export interface RegisterDeviceResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  status: 'ACTIVE';
  /** 本次执行的建表语句；幂等重放时为空 */
  ddl: string[];
}

export interface RetireDeviceResult {
  localDeviceId: string;
  deviceId: string;
  status: 'RETIRED';
  /** 闭合后的 usage 右边界；无 open usage（结构不一致的 PENDING 设备）时为 null */
  effectiveTo: string | null;
}

export interface RescheduleDeviceResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  fromAt: string;
  version: number | null;
}

/** 行锁读回的设备事实——注销 / 改期 / 复活都以它为准 */
interface LockedDevice {
  id: string;
  localDeviceId: string;
  deviceId: string;
  status: string;
}

interface ExistingDeviceRow {
  id: string;
  localDeviceId: string;
  deviceId: string;
  status: string;
  usages: Array<{ modelCode: string; fromAt: Date; toAt: Date | null }>;
}

type VersionRow = {
  version: number;
  status: string;
  properties: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

/** 唯一约束/表名冲突的重试上限；碰撞概率极低，上限只是兜底 */
const DEVICE_ID_ATTEMPTS = 5;

interface RegisterConflictDetails {
  modelCode?: string;
  tables?: string[];
  status?: string;
  earliestEffectiveFrom?: string;
  latestToAt?: string;
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
    private readonly registry: DeviceRegistryRepository,
    private readonly revision: RegistryRevisionService
  ) {}

  async register(
    dto: RegisterDeviceDto,
    dryRun: boolean
  ): Promise<RegisterDeviceResult> {
    const localDeviceId = this.checkedLocalDeviceId(dto.localDeviceId);
    const modelCodeCheck = checkModelCode(dto.modelCode);
    if (!modelCodeCheck.ok) {
      throw this.invalid('modelCode');
    }
    const modelCode = modelCodeCheck.value;

    const device = await this.registry.findActiveDevice(localDeviceId);
    // 仓储只认 ACTIVE；非 ACTIVE 的档案要单独说清楚，不能当成“不存在”去建表。
    // RETIRED 走同型号复活，其余状态仍报 device-not-active。
    const existing =
      device === null
        ? await this.prisma.iotDevice.findFirst({
            where: { localDeviceId },
            include: { usages: { orderBy: [{ fromAt: 'asc' }] } }
          })
        : null;
    const model = await this.prisma.iotDeviceModel.findUnique({
      where: { code: modelCode },
      include: { versions: { orderBy: { effectiveFrom: 'asc' } } }
    });
    const versions = model?.versions ?? [];
    const active = versions.find(version => version.status === 'ACTIVE');
    const fromAt = dto.fromAt === undefined ? new Date() : new Date(dto.fromAt);

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
      this.versionAtOrThrow(versions, fromAt, modelCode);
      const td = await this.td.get();
      return this.idempotentResult(td, device, modelCode, active);
    }

    if (existing !== null) {
      if (existing.status === 'RETIRED') {
        return this.revive(
          existing,
          dto,
          modelCode,
          versions,
          active,
          fromAt,
          dryRun
        );
      }
      throw this.conflict('device-not-active', { status: existing.status });
    }

    if (active === undefined) {
      throw this.conflict('model-not-active', { modelCode });
    }
    const usageVersion = this.versionAtOrThrow(versions, fromAt, modelCode);
    // 物理列是各版本的并集：降采样表建不建按「曾经有过聚合」判，不按当前版本
    const properties = versions.flatMap(version =>
      asProperties(version.properties)
    );
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
        usageVersion.version,
        fromAt,
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

  /**
   * 同型号复活：沿用原 `deviceId` 与子表名，新开 usage；不建表、不补表。
   *
   * ⚠️ 子表校验用**所有版本的属性并集**（物理列是历史并集，D2 §11.4）——退役期间模型可能
   * 加过属性，按当前 ACTIVE 版本判会误报缺表。
   * ⚠️ 复活前的空档不补：`ts ∈ [旧 toAt, 新 fromAt)` 的晚到数据按 `out-of-range-ts` 丢弃，
   * 这是「设备确实退役过」的正确语义。
   */
  private async revive(
    existing: ExistingDeviceRow,
    dto: RegisterDeviceDto,
    modelCode: string,
    versions: readonly VersionRow[],
    active: VersionRow | undefined,
    fromAt: Date,
    dryRun: boolean
  ): Promise<RegisterDeviceResult> {
    const lastUsage = existing.usages.at(-1);
    if (lastUsage === undefined) {
      throw this.conflict('schema-mismatch');
    }
    // 换型号本增量不支持；先比型号，再要求请求的模型 ACTIVE
    if (lastUsage.modelCode !== modelCode) {
      throw this.conflict('registered-to-other-model', {
        modelCode: lastUsage.modelCode
      });
    }
    if (active === undefined) {
      throw this.conflict('model-not-active', { modelCode });
    }

    const usageVersion = this.versionAtOrThrow(versions, fromAt, modelCode);

    // 不变式：RETIRED 设备没有 open usage。仍存在即结构已被破坏，不自动闭合
    if (existing.usages.some(usage => usage.toAt === null)) {
      throw this.conflict('schema-mismatch');
    }
    // 重叠约束：不得早于最后一个**非空** usage 的 toAt；被撤销留下的零长 usage 不参与
    let latestToAt: Date | null = null;
    for (const usage of existing.usages) {
      if (usage.toAt === null) continue;
      if (usage.toAt.getTime() <= usage.fromAt.getTime()) continue;
      if (latestToAt === null || usage.toAt.getTime() > latestToAt.getTime()) {
        latestToAt = usage.toAt;
      }
    }
    if (latestToAt !== null && fromAt.getTime() < latestToAt.getTime()) {
      throw this.conflict('from-at-overlaps-usage', {
        latestToAt: latestToAt.toISOString()
      });
    }

    const properties = versions.flatMap(version =>
      asProperties(version.properties)
    );
    const ref: SubtableRef = {
      name: subtableName(modelCode, existing.deviceId),
      deviceId: existing.deviceId,
      modelCode
    };
    const dsNames = this.dsSubtableNames(ref, properties);
    const td = await this.td.get();
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

    const result: RegisterDeviceResult = {
      localDeviceId: existing.localDeviceId,
      deviceId: existing.deviceId,
      modelCode,
      status: 'ACTIVE',
      ddl: []
    };
    if (dryRun) return result;

    await this.prisma.$transaction(async tx => {
      // 注销 / 复活并发时，后到的一个看到的是已提交的状态
      const rows = await tx.$queryRaw<LockedDevice[]>`
        SELECT id, "localDeviceId", "deviceId", status
        FROM "IotDevice" WHERE id = ${existing.id} FOR UPDATE
      `;
      const locked = rows[0];
      if (locked === undefined || locked.status !== 'RETIRED') {
        throw this.conflict('device-not-active', {
          status: locked?.status ?? 'missing'
        });
      }
      await tx.iotDevice.update({
        where: { id: existing.id },
        data: {
          status: 'ACTIVE',
          statusChangedAt: new Date(),
          ...(dto.protocolVersion === undefined
            ? {}
            : { protocolVersion: dto.protocolVersion })
        }
      });
      await tx.iotDeviceModelUsage.create({
        data: {
          deviceId: existing.deviceId,
          modelCode,
          version: usageVersion.version,
          fromAt
        }
      });
    });
    await this.revision.bump();
    return result;
  }

  /**
   * 注销与撤销共用：`toAt = max(now, usage.fromAt)`——已生效设备取 `now`，未生效设备取
   * `fromAt`（零长区间，一条数据都不覆盖）。不删表、不删数据；重复调用幂等。
   */
  async retire(rawLocalDeviceId: string): Promise<RetireDeviceResult> {
    const localDeviceId = this.checkedLocalDeviceId(rawLocalDeviceId);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<LockedDevice[]>`
        SELECT id, "localDeviceId", "deviceId", status
        FROM "IotDevice" WHERE "localDeviceId" = ${localDeviceId} FOR UPDATE
      `;
      const device = rows[0];
      if (device === undefined) throw this.notFound(localDeviceId);

      const open = await tx.iotDeviceModelUsage.findMany({
        where: { deviceId: device.deviceId, toAt: null },
        orderBy: { fromAt: 'asc' }
      });

      let effectiveTo: Date | null = null;
      let wrote = false;
      for (const usage of open) {
        // 按同一公式闭合：已生效取 now，未生效取 fromAt（零长）——
        // 也顺带修复「已 RETIRED 却仍有 open usage」的不一致态
        const toAt = new Date(Math.max(now.getTime(), usage.fromAt.getTime()));
        await tx.iotDeviceModelUsage.update({
          where: { id: usage.id },
          data: { toAt }
        });
        effectiveTo = toAt;
        wrote = true;
      }

      if (device.status !== 'RETIRED') {
        await tx.iotDevice.update({
          where: { id: device.id },
          data: { status: 'RETIRED', statusChangedAt: now }
        });
        wrote = true;
      }

      // 幂等重放没有 open usage 可闭合，但仍要返回「最终 toAt」，而不是 null
      if (effectiveTo === null) {
        const closed = await tx.iotDeviceModelUsage.findFirst({
          where: { deviceId: device.deviceId, toAt: { not: null } },
          orderBy: { toAt: 'desc' },
          select: { toAt: true }
        });
        effectiveTo = closed?.toAt ?? null;
      }

      return { device, effectiveTo, wrote };
    });

    if (outcome.wrote) await this.revision.bump();
    return {
      localDeviceId,
      deviceId: outcome.device.deviceId,
      status: 'RETIRED',
      effectiveTo:
        outcome.effectiveTo === null ? null : outcome.effectiveTo.toISOString()
    };
  }

  /**
   * 改期：只允许「当前与目标都在未来」的排期设备。已生效时段的数据已按旧区间写入，
   * 改期不可追溯；要立即生效走「撤销 + 重新注册」。
   */
  async reschedule(
    rawLocalDeviceId: string,
    dto: RescheduleDeviceDto
  ): Promise<RescheduleDeviceResult> {
    const localDeviceId = this.checkedLocalDeviceId(rawLocalDeviceId);
    const target = new Date(dto.fromAt);
    const now = new Date();

    const outcome = await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<LockedDevice[]>`
        SELECT id, "localDeviceId", "deviceId", status
        FROM "IotDevice" WHERE "localDeviceId" = ${localDeviceId} FOR UPDATE
      `;
      const device = rows[0];
      if (device === undefined) throw this.notFound(localDeviceId);

      const open = await tx.iotDeviceModelUsage.findMany({
        where: { deviceId: device.deviceId, toAt: null },
        orderBy: { fromAt: 'asc' }
      });
      const usage = open[0];
      if (
        device.status !== 'ACTIVE' ||
        open.length !== 1 ||
        usage === undefined
      ) {
        throw this.conflict('device-not-scheduled', { status: device.status });
      }
      if (usage.fromAt.getTime() <= now.getTime()) {
        throw this.conflict('device-effective');
      }
      if (target.getTime() <= now.getTime()) {
        throw this.conflict('from-at-not-future');
      }

      const model = await tx.iotDeviceModel.findUnique({
        where: { code: usage.modelCode },
        include: { versions: { orderBy: { effectiveFrom: 'asc' } } }
      });
      const version = this.versionAtOrThrow(
        model?.versions ?? [],
        target,
        usage.modelCode
      );

      const sameFromAt = target.getTime() === usage.fromAt.getTime();
      if (!sameFromAt) {
        await tx.iotDeviceModelUsage.update({
          where: { id: usage.id },
          data: { fromAt: target, version: version.version }
        });
      }
      return {
        device,
        modelCode: usage.modelCode,
        fromAt: sameFromAt ? usage.fromAt : target,
        version: version.version,
        wrote: !sameFromAt
      };
    });

    if (outcome.wrote) await this.revision.bump();
    return {
      localDeviceId,
      deviceId: outcome.device.deviceId,
      modelCode: outcome.modelCode,
      fromAt: outcome.fromAt.toISOString(),
      version: outcome.version
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
    usageVersion: number,
    fromAt: Date,
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
      await this.createDeviceRows(
        dto,
        localDeviceId,
        ref,
        usageVersion,
        fromAt
      );
      // PG 已提交：版本号递增失败只记 error，不影响接口返回（漏掉的由 60 秒兜底补上）
      await this.revision.bump();
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
    usageVersion: number,
    fromAt: Date
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
          version: usageVersion,
          fromAt
        }
      });
    });
  }

  /**
   * `fromAt` 必须落在模型已覆盖的时段内，并返回该时刻生效的版本。
   *
   * ⚠️ **不做回溯**的是模型声明；这里允许 `fromAt` 早于当前（补登），只要不早于最早版本。
   * 版本区间连续（撤销会回填前驱右边界），一旦通过，该设备的时段此后永远有版本覆盖。
   */
  private versionAtOrThrow(
    versions: readonly VersionRow[],
    fromAt: Date,
    modelCode: string
  ): VersionRow {
    const earliest = versions.reduce<Date | null>(
      (min, version) =>
        min === null || version.effectiveFrom < min
          ? version.effectiveFrom
          : min,
      null
    );
    if (earliest === null || fromAt.getTime() < earliest.getTime()) {
      throw this.conflict('from-at-before-model', {
        modelCode,
        ...(earliest === null
          ? {}
          : { earliestEffectiveFrom: earliest.toISOString() })
      });
    }
    const version = versions.find(
      candidate =>
        candidate.effectiveFrom.getTime() <= fromAt.getTime() &&
        (candidate.effectiveTo === null ||
          fromAt.getTime() < candidate.effectiveTo.getTime())
    );
    if (version === undefined) {
      throw this.conflict('from-at-not-covered', {
        modelCode,
        earliestEffectiveFrom: earliest.toISOString()
      });
    }
    return version;
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

  /**
   * 路径参数与请求体里的 `localDeviceId` 都过这一个函数：它要进 MQTT 主题段与 HTTP 路径，
   * 非法编号无法稳定路由，也不能带进 SQL。
   */
  private checkedLocalDeviceId(raw: string): string {
    const checked = checkLocalDeviceId(raw);
    if (!checked.ok) {
      throw new BizException(BizCode.VALIDATION_FAILED, '设备注册参数非法', {
        issues: [{ path: 'localDeviceId', code: checked.reason }]
      });
    }
    return checked.value;
  }

  private conflict(
    reason:
      | 'model-not-active'
      | 'schema-mismatch'
      | 'table-exists'
      | 'duplicate-device'
      | 'device-not-active'
      | 'registered-to-other-model'
      | 'from-at-before-model'
      | 'from-at-not-covered'
      | 'from-at-not-future'
      | 'from-at-overlaps-usage'
      | 'device-not-scheduled'
      | 'device-effective',
    details: RegisterConflictDetails = {}
  ): BizException {
    return new BizException(BizCode.CONFLICT, '设备注册冲突', {
      reason,
      ...details
    });
  }

  private notFound(localDeviceId: string): BizException {
    return new BizException(BizCode.NOT_FOUND, '设备不存在', {
      localDeviceId
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
