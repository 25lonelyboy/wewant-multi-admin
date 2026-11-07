import { normalizeLocalId } from '@multi-admin/contracts';
import {
  AGGREGATES,
  DS_LEVELS,
  bindKindOfColumnType,
  dsColumnsOf,
  rawColumnOf,
  type Aggregate,
  type PropertyDecl,
  type RegistrySnapshot,
  type SnapshotColumn,
  type SnapshotDsColumn,
  type SnapshotModel,
  type SnapshotVersion
} from '@multi-admin/device-registry';
import type { PrismaClient } from '../../../generated/prisma/client.js';

/** 快照构建失败：库里的 JSON 坏了或列类型认不出。整轮失败，不发布半份快照。 */
export class SnapshotBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotBuildError';
  }
}

type SnapshotReader = Pick<PrismaClient, '$transaction'>;

/**
 * `properties` 列存的是整份声明 JSON。**不是数组就是坏数据，整轮构建失败**。
 *
 * ⚠️ 不回落成空数组：一个损坏的版本会悄悄变成「零属性」，该模型的设备随后把所有测点判成
 * `not-in-model` 丢掉——静默丢数据，且计数看起来像现场问题，而不是库里的数据坏了。
 */
function asProperties(
  value: unknown,
  modelCode: string,
  version: number
): PropertyDecl[] {
  if (!Array.isArray(value)) {
    const actual = value === null ? 'null' : typeof value;
    throw new SnapshotBuildError(
      `模型 ${modelCode} 版本 ${version} 的 properties 不是数组（实际 ${actual}）`
    );
  }
  return value as PropertyDecl[];
}

/**
 * 读库并组装一份全量快照。
 *
 * ⚠️ **先读 `rev` 再读库**（由调用方传入已在读库前取到的版本号）。反过来会把「读库期间发生
 * 的新变更」标成已建，那一次变更就永久看不到了。
 * ⚠️ 任一列推导失败 ⇒ **整轮构建失败**：不写快照、不推进 `built`。跳过坏的那一列会让所有
 * 设备写入失败，比不发布更糟。
 */
export async function buildRegistrySnapshot(
  prisma: SnapshotReader,
  version: number,
  builtAt: Date = new Date()
): Promise<RegistrySnapshot> {
  // 同一事务里读档案与模型：快照必须同时替换，分开读会出现「档案已新、模型还旧」的窗口
  const { devices, models } = await prisma.$transaction(
    async tx => {
      const devices = await tx.iotDevice.findMany({
        // 退役设备的表必须仍在审计期望集里（D5 §2.2），快照因此纳入 ACTIVE + RETIRED；
        // 消费侧不读状态——退役设备的 usage 已闭合，`ts ≥ toAt` 由区间判定拒收
        where: { status: { in: ['ACTIVE', 'RETIRED'] } },
        include: { usages: true }
      });
      const models = await tx.iotDeviceModel.findMany({
        include: {
          versions: { orderBy: [{ effectiveFrom: 'asc' }, { version: 'asc' }] }
        }
      });
      return { devices, models };
    },
    { isolationLevel: 'RepeatableRead' }
  );

  return {
    version,
    builtAt: builtAt.toISOString(),
    models: models
      .filter(model => model.versions.length > 0)
      .map(model => toSnapshotModel(model.code, model.versions)),
    devices: devices.flatMap(device =>
      device.usages.map(usage => ({
        localDeviceId: normalizeLocalId(device.localDeviceId),
        deviceId: device.deviceId,
        modelCode: usage.modelCode,
        fromAt: usage.fromAt.toISOString(),
        toAt: usage.toAt === null ? null : usage.toAt.toISOString()
      }))
    )
  };
}

type VersionRow = {
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  properties: unknown;
};

function toSnapshotModel(
  modelCode: string,
  versions: readonly VersionRow[]
): SnapshotModel {
  const rawByName = new Map<string, SnapshotColumn>();
  // 降采样列在三级各有一份物理列；按 (level, name) 去重
  const dsByKey = new Map<string, SnapshotDsColumn>();

  for (const version of versions) {
    const properties = asProperties(
      version.properties,
      modelCode,
      version.version
    );
    for (const property of properties) {
      if (!rawByName.has(property.key)) {
        rawByName.set(property.key, toRawColumn(property, modelCode));
      }
    }

    const derived = dsColumnsOf(properties);
    if (!derived.ok) {
      const detail = derived.issues
        .map(issue => `${issue.path}: ${issue.code}`)
        .join(', ');
      throw new SnapshotBuildError(
        `模型 ${modelCode} 的降采样列推导失败：${detail}`
      );
    }
    for (const column of derived.columns) {
      const bindKind = bindKindOfColumnType(column.type);
      if (bindKind === null) {
        throw new SnapshotBuildError(
          `模型 ${modelCode} 的降采样列 ${column.name} 类型无法识别：${column.type}`
        );
      }
      const parsed = parseDerivedName(column.name);
      if (parsed === null) {
        throw new SnapshotBuildError(
          `模型 ${modelCode} 的降采样列名无法解析：${column.name}`
        );
      }
      for (const level of DS_LEVELS) {
        const key = `${level}\u0000${column.name}`;
        if (dsByKey.has(key)) continue;
        dsByKey.set(key, {
          level,
          name: column.name,
          aggregate: parsed.aggregate,
          property: parsed.property,
          bindKind
        });
      }
    }
  }

  return {
    modelCode,
    rawColumns: [...rawByName.values()],
    dsColumns: [...dsByKey.values()],
    versions: versions.map((version): SnapshotVersion => ({
      version: version.version,
      effectiveFrom: version.effectiveFrom.toISOString(),
      effectiveTo:
        version.effectiveTo === null ? null : version.effectiveTo.toISOString(),
      properties: asProperties(version.properties, modelCode, version.version)
    }))
  };
}

function toRawColumn(
  property: PropertyDecl,
  modelCode: string
): SnapshotColumn {
  const column = rawColumnOf(property);
  if (!column.ok) {
    const detail = column.issues
      .map(issue => `${issue.path}: ${issue.code}`)
      .join(', ');
    throw new SnapshotBuildError(
      `模型 ${modelCode} 的属性 ${property.key} 无法推导原始列：${detail}`
    );
  }
  const bindKind = bindKindOfColumnType(column.column.type);
  if (bindKind === null) {
    throw new SnapshotBuildError(
      `模型 ${modelCode} 的属性 ${property.key} 列类型无法识别：${column.column.type}`
    );
  }
  return { name: column.column.name, bindKind };
}

/** `sum_<property>` / `count_<property>` / … → 聚合与来源属性 */
function parseDerivedName(
  name: string
): { aggregate: Aggregate; property: string } | null {
  for (const aggregate of AGGREGATES) {
    const prefix = `${aggregate}_`;
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return { aggregate, property: name.slice(prefix.length) };
    }
  }
  return null;
}
