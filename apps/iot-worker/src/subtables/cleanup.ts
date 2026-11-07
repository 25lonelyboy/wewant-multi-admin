import { DS_DATABASE, RAW_DATABASE } from '../schema.js';
import {
  auditSubtables,
  type AuditQuery,
  type AuditReport,
  type ExpectedSubtable
} from './audit.js';

/** 清理逻辑只依赖只读查询与执行两条缝，单测可注入替身 */
export interface CleanupDeps {
  query: AuditQuery;
  exec(sql: string): Promise<void>;
}

export interface CleanupOptions {
  /** 缺省 dry-run：只算名单，不执行任何删除 */
  apply: boolean;
  /** 单表删除的重试次数（含首次），缺省 3 */
  retries?: number;
  /** 重试间隔基数（毫秒），按次数递增；单测可置 0 */
  retryDelayMs?: number;
}

export interface CleanupResult {
  /** 审计四桶——dry-run 的待删名单即 `orphanRaw` + `orphanDs` */
  report: AuditReport;
  /** **实际**删掉的表名（dry-run 恒为空） */
  dropped: string[];
  /** 重试后仍失败的表名 */
  failed: string[];
}

/** 快照新鲜度上限：超过即拒绝清理，防止拿滞后快照把刚注册的表删掉 */
export const SNAPSHOT_MAX_AGE_MS = 10 * 60_000;

const DEFAULT_RETRIES = 3;

export type StalenessReason =
  | 'built-missing'
  | 'rev-missing'
  | 'rev-mismatch'
  | 'built-at-invalid'
  | 'stale';

export type FreshnessCheck =
  { ok: true } | { ok: false; reason: StalenessReason };

/**
 * 闸 3：快照必须新鲜且与期望版本一致。
 *
 * `rev ≠ built` 说明有变更还没进快照——刚注册的设备子表在库、不在期望集里，
 * 照这份快照清理会把它当孤儿删掉。
 */
export function checkSnapshotFreshness(
  built: number | null,
  rev: number | null,
  builtAt: string,
  now: number = Date.now()
): FreshnessCheck {
  if (built === null) return { ok: false, reason: 'built-missing' };
  if (rev === null) return { ok: false, reason: 'rev-missing' };
  if (built !== rev) return { ok: false, reason: 'rev-mismatch' };
  const at = Date.parse(builtAt);
  if (Number.isNaN(at)) return { ok: false, reason: 'built-at-invalid' };
  if (now - at > SNAPSHOT_MAX_AGE_MS) return { ok: false, reason: 'stale' };
  return { ok: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 回收孤儿子表。
 *
 * **删除顺序：原始优先、降采样随后。** 中断时残留为孤儿降采样子表——它不被降采样读取，
 * 是惰性的；反过来先删降采样，会让降采样读到孤儿原始子表却写不进目标表，**整级重算失败**。
 *
 * **只删审计名单里的名字**：不按前缀匹配、不做"看起来像我们建的"推断。
 * 单表失败按次数重试，仍失败记入 `failed` 并继续下一张；残留由下一次审计重新认领。
 */
export async function cleanupOrphans(
  deps: CleanupDeps,
  expected: readonly ExpectedSubtable[],
  options: CleanupOptions
): Promise<CleanupResult> {
  // 闸 2 在 audit 里：期望集为空即拒绝判定，否则整库都会被判成孤儿
  const report = await auditSubtables(deps.query, expected);
  if (!options.apply) {
    return { report, dropped: [], failed: [] };
  }

  const retries = Math.max(1, options.retries ?? DEFAULT_RETRIES);
  const retryDelayMs = options.retryDelayMs ?? 100;
  const dropped: string[] = [];
  const failed: string[] = [];

  const targets: Array<{ db: string; names: readonly string[] }> = [
    { db: RAW_DATABASE, names: report.orphanRaw },
    { db: DS_DATABASE, names: report.orphanDs }
  ];

  for (const { db, names } of targets) {
    for (const name of names) {
      let removed = false;
      for (let attempt = 0; attempt < retries; attempt += 1) {
        if (attempt > 0 && retryDelayMs > 0) {
          await sleep(retryDelayMs * attempt);
        }
        try {
          await deps.exec(`DROP TABLE IF EXISTS ${db}.${name}`);
          removed = true;
          break;
        } catch {
          // 交给下一次尝试；仍失败由调用方报出
        }
      }
      if (removed) dropped.push(name);
      else failed.push(name);
    }
  }

  return { report, dropped, failed };
}
