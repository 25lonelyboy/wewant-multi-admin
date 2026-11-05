import { Injectable, Logger } from '@nestjs/common';
import { BizCode } from '@multi-admin/contracts';
import {
  DS_DATABASE,
  DS_LEVELS,
  RAW_DATABASE,
  checkDeviceId,
  dsColumnsOf,
  dsStableName,
  dsSubtableName,
  rawColumnOf,
  rawStableName,
  subtableName,
  validateModel,
  type DsLevel,
  type ModelDeclaration,
  type ModelWarning,
  type PropertyDecl,
  type SubtableRef
} from '@multi-admin/device-registry';
import { BizException } from '../../../common/errors/biz.exception.js';
import { PrismaService } from '../../../database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { TdClientProvider } from '../tdengine/td-client.provider.js';
import type { TdSql } from '../tdengine/td-client.js';
import {
  alterDsStables,
  alterRawStable,
  createDsStables,
  createDsSubtables,
  createRawStable,
  type DsStableState
} from '../schema/ddl.js';
import { dropCreatedTables, type CreatedTable } from '../schema/execute.js';
import {
  columnMatches,
  describeRawStable,
  describeStableColumns,
  listExistingStables,
  listExistingTables
} from '../schema/td-schema.js';
import type { ModelDeclarationDto } from './dto/model.dto.js';

export interface PublishModelResult {
  modelCode: string;
  version: number;
  status: 'ACTIVE';
  warnings: ModelWarning[];
  ddl: string[];
}

type VersionRow = {
  version: number;
  status: string;
  properties: unknown;
};

/** 注册接口的 400 细节：档位变了与声明校验问题同形，但码不在 `ModelIssueCode` 里 */
interface KindChangeIssue {
  path: string;
  code: 'kind-changed';
}

/**
 * 物模型注册：新模型建表，已有模型发布新版本。
 *
 * 两条状态机各管各的——模型可以先于设备存在。失败一律整体回滚：本次建的表删掉、PG 不落库，
 * 没有 FAILED 行（D3 §2.5）。
 */
@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly td: TdClientProvider
  ) {}

  async publish(
    dto: ModelDeclarationDto,
    dryRun: boolean
  ): Promise<PublishModelResult> {
    const validation = validateModel(dto as unknown as ModelDeclaration);
    if (!validation.ok) {
      throw new BizException(BizCode.VALIDATION_FAILED, '物模型声明校验失败', {
        issues: validation.issues
      });
    }
    const decl = validation.declaration;

    // S3 的校验器不判“某档位能否用某个聚合”，这里用推导结果收窄：算不出列就是 400
    const dsColumns = dsColumnsOf(decl.properties);
    if (!dsColumns.ok) {
      throw new BizException(BizCode.VALIDATION_FAILED, '属性聚合不可用', {
        issues: dsColumns.issues
      });
    }

    const model = await this.prisma.iotDeviceModel.findUnique({
      where: { code: decl.modelCode },
      include: { versions: true }
    });

    const td = await this.td.get();
    return model === null
      ? this.publishNewModel(td, decl, validation.warnings, dryRun)
      : this.publishNewVersion(
          td,
          decl,
          validation.warnings,
          model.versions,
          dryRun
        );
  }

  private async publishNewModel(
    td: TdSql,
    decl: ModelDeclaration,
    warnings: ModelWarning[],
    dryRun: boolean
  ): Promise<PublishModelResult> {
    const rawName = rawStableName(decl.modelCode);
    const dsNames = this.dsStableNamesOf(decl);
    const dsDdl = createDsStables(decl);

    // 同名表若已在库里（手工建的 / 上次清理失败残留），不覆盖：注册流程不做修复
    const existingRaw = await listExistingStables(td, RAW_DATABASE, [rawName]);
    const existingDs = await listExistingStables(td, DS_DATABASE, dsNames);
    const conflicts = [
      ...(existingRaw.has(rawName) ? [rawName] : []),
      ...dsNames.filter(name => existingDs.has(name))
    ];
    if (conflicts.length > 0) {
      throw this.conflict('table-exists', conflicts);
    }

    const ddl = [createRawStable(decl), ...dsDdl];
    const version = 1;
    if (dryRun) {
      return {
        modelCode: decl.modelCode,
        version,
        status: 'ACTIVE',
        warnings,
        ddl
      };
    }

    const created: CreatedTable[] = [];
    try {
      await td.exec(ddl[0]);
      created.push({ db: RAW_DATABASE, name: rawName, kind: 'stable' });
      for (const [index, statement] of dsDdl.entries()) {
        await td.exec(statement);
        created.push({ db: DS_DATABASE, name: dsNames[index], kind: 'stable' });
      }
      await this.createModelRows(decl, version);
    } catch (error) {
      await dropCreatedTables(td, created, this.logger, {
        modelCode: decl.modelCode
      });
      throw this.translateError(error);
    }

    return {
      modelCode: decl.modelCode,
      version,
      status: 'ACTIVE',
      warnings,
      ddl
    };
  }

  private async publishNewVersion(
    td: TdSql,
    decl: ModelDeclaration,
    warnings: ModelWarning[],
    versions: readonly VersionRow[],
    dryRun: boolean
  ): Promise<PublishModelResult> {
    const active = versions.find(version => version.status === 'ACTIVE');
    const rawName = rawStableName(decl.modelCode);
    if (active === undefined) {
      // 「模型行在、ACTIVE 版本不在」是结构不一致，注册流程不自动修
      throw this.conflict('schema-mismatch', [rawName]);
    }

    const history = this.historicalProperties(versions);
    const issues = this.kindChanges(decl, history);
    if (issues.length > 0) {
      throw new BizException(
        BizCode.VALIDATION_FAILED,
        '属性的存储类型不可修改',
        { issues }
      );
    }

    const schema = await describeRawStable(td, decl.modelCode);
    if (!schema.exists) {
      throw this.conflict('schema-mismatch', [rawName]);
    }

    const declaredKeys = new Set(decl.properties.map(property => property.key));
    const added: PropertyDecl[] = [];
    const mismatched: string[] = [];
    for (const property of decl.properties) {
      const actual = schema.columns.get(property.key);
      if (actual === undefined) {
        added.push(property);
        continue;
      }
      const expected = rawColumnOf(property);
      if (!expected.ok || !columnMatches(expected.column.type, actual)) {
        mismatched.push(`${rawName}.${property.key}`);
      }
    }
    // 声明里没有、历史版本里也没有的列：别人动的，不猜它的来历
    for (const key of schema.columns.keys()) {
      if (!declaredKeys.has(key) && !history.has(key)) {
        mismatched.push(`${rawName}.${key}`);
      }
    }
    if (mismatched.length > 0) {
      throw this.conflict('schema-mismatch', mismatched);
    }

    const dsNames = this.dsStableNamesOf(decl);
    const existingDs = await listExistingStables(td, DS_DATABASE, dsNames);
    // 每级按自己的现有列做差集：1m 已加、1h 失败时，重放只补 1h
    const dsStates = new Map<DsLevel, DsStableState>();
    if (dsNames.length > 0) {
      for (const level of DS_LEVELS) {
        const name = dsStableName(decl.modelCode, level);
        const exists = existingDs.has(name);
        dsStates.set(level, {
          exists,
          columns: exists
            ? new Set(
                (await describeStableColumns(td, DS_DATABASE, name)).keys()
              )
            : new Set()
        });
      }
    }
    const rawDdl = alterRawStable(decl, added);
    const dsDdl = alterDsStables(decl, dsStates);
    const createdDsNames = dsNames.filter(name => !existingDs.has(name));

    const nextVersion =
      Math.max(...versions.map(version => version.version)) + 1;
    const ddl = [...rawDdl, ...dsDdl];
    if (dryRun) {
      return {
        modelCode: decl.modelCode,
        version: nextVersion,
        status: 'ACTIVE',
        warnings,
        ddl
      };
    }

    const created: CreatedTable[] = [];
    try {
      for (const statement of rawDdl) {
        await td.exec(statement);
      }
      let createdIndex = 0;
      for (const statement of dsDdl) {
        await td.exec(statement);
        if (statement.startsWith('CREATE STABLE')) {
          created.push({
            db: DS_DATABASE,
            name: createdDsNames[createdIndex],
            kind: 'stable'
          });
          createdIndex += 1;
        }
      }
      await this.switchVersion(decl, active.version, nextVersion);
    } catch (error) {
      await dropCreatedTables(td, created, this.logger, {
        modelCode: decl.modelCode
      });
      throw this.translateError(error);
    }

    await this.backfillDsSubtables(td, decl);
    return {
      modelCode: decl.modelCode,
      version: nextVersion,
      status: 'ACTIVE',
      warnings,
      ddl
    };
  }

  /**
   * 版本切换之后的收尾：为该模型下已注册设备补建缺的降采样子表。
   *
   * ⚠️ 失败**不回滚版本切换**：模型发布是模型自己的事；缺的子表由审计报 `missingDs`，
   * 补建本身可重复执行。这里只记 error，不把异常抛回注册请求。
   */
  private async backfillDsSubtables(
    td: TdSql,
    decl: ModelDeclaration
  ): Promise<void> {
    if (this.dsStableNamesOf(decl).length === 0) return;
    try {
      const usages = await this.prisma.iotDeviceModelUsage.findMany({
        where: {
          modelCode: decl.modelCode,
          toAt: null,
          device: { status: 'ACTIVE' }
        },
        select: { deviceId: true }
      });
      if (usages.length === 0) return;

      const refs: SubtableRef[] = [];
      for (const usage of usages) {
        // deviceId 进表名与 TAGS；从库里读回的值必须兜住，脏数据跳过该设备而非中断补建
        if (!checkDeviceId(usage.deviceId)) {
          this.logger.error(
            `补建降采样子表跳过：档案 deviceId 格式非法（modelCode=${decl.modelCode}，deviceId=${usage.deviceId}）`
          );
          continue;
        }
        refs.push({
          name: subtableName(decl.modelCode, usage.deviceId),
          deviceId: usage.deviceId,
          modelCode: decl.modelCode
        });
      }
      if (refs.length === 0) return;
      const wanted = refs.flatMap(ref =>
        DS_LEVELS.map(level => dsSubtableName(ref.name, level))
      );
      const existing = await listExistingTables(td, DS_DATABASE, wanted);

      for (const ref of refs) {
        for (const statement of createDsSubtables(
          ref,
          decl.properties,
          existing
        )) {
          try {
            await td.exec(statement);
          } catch (error) {
            this.logger.error(
              `补建降采样子表失败（modelCode=${decl.modelCode}，deviceId=${ref.deviceId}）：${errorMessage(error)}`
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `补建降采样子表未能执行（modelCode=${decl.modelCode}）：${errorMessage(error)}`
      );
    }
  }

  private async createModelRows(
    decl: ModelDeclaration,
    version: number
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.iotDeviceModel.create({ data: { code: decl.modelCode } });
      await tx.iotModelVersion.create({
        data: {
          modelCode: decl.modelCode,
          version,
          status: 'ACTIVE',
          properties: toJson(decl.properties),
          services: toJson(decl.services),
          events: toJson(decl.events),
          effectiveFrom: now,
          statusChangedAt: now
        }
      });
    });
  }

  private async switchVersion(
    decl: ModelDeclaration,
    fromVersion: number,
    toVersion: number
  ): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.iotModelVersion.update({
        where: {
          modelCode_version: { modelCode: decl.modelCode, version: fromVersion }
        },
        data: { status: 'SUPERSEDED', effectiveTo: now, statusChangedAt: now }
      });
      await tx.iotModelVersion.create({
        data: {
          modelCode: decl.modelCode,
          version: toVersion,
          status: 'ACTIVE',
          properties: toJson(decl.properties),
          services: toJson(decl.services),
          events: toJson(decl.events),
          effectiveFrom: now,
          statusChangedAt: now
        }
      });
    });
  }

  /** 所有版本里出现过的属性，键 → 首次出现的声明（用于识别“历史遗留列”与档位变化） */
  private historicalProperties(
    versions: readonly VersionRow[]
  ): Map<string, PropertyDecl> {
    const byKey = new Map<string, PropertyDecl>();
    for (const version of versions) {
      for (const property of asProperties(version.properties)) {
        const key = property.key.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, property);
      }
    }
    return byKey;
  }

  /** 同一个 key 的存储类型变了 ⇒ 不是“加列”，是换模型 */
  private kindChanges(
    decl: ModelDeclaration,
    history: ReadonlyMap<string, PropertyDecl>
  ): KindChangeIssue[] {
    const issues: KindChangeIssue[] = [];
    for (const [index, property] of decl.properties.entries()) {
      const before = history.get(property.key);
      if (before === undefined) continue;
      const oldColumn = rawColumnOf(before);
      const newColumn = rawColumnOf(property);
      if (
        !oldColumn.ok ||
        !newColumn.ok ||
        oldColumn.column.type !== newColumn.column.type
      ) {
        issues.push({
          path: `properties[${index}].kind`,
          code: 'kind-changed'
        });
      }
    }
    return issues;
  }

  private dsStableNamesOf(decl: ModelDeclaration): string[] {
    const columns = dsColumnsOf(decl.properties);
    if (!columns.ok || columns.columns.length === 0) return [];
    return DS_LEVELS.map(level => dsStableName(decl.modelCode, level));
  }

  private conflict(
    reason: 'version-conflict' | 'table-exists' | 'schema-mismatch',
    tables?: string[]
  ): BizException {
    return new BizException(
      BizCode.CONFLICT,
      '物模型注册冲突',
      tables === undefined ? { reason } : { reason, tables }
    );
  }

  /** 并发撞唯一约束 → 409；TDengine 的“已存在”是阻塞注册的结构冲突 */
  private translateError(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return this.conflict('version-conflict');
    }
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

/** Prisma 的 Json 入参不接受 readonly 数组，按值复制一份 */
function toJson(value: unknown): object {
  return structuredClone(value) as object;
}
