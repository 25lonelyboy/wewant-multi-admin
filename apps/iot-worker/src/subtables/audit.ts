import type { TdRow } from '../tdengine/client.js';
import {
  DS_DATABASE,
  DS_LEVELS,
  RAW_DATABASE,
  dsStableName,
  dsSubtableName,
  rawStableName
} from '../schema.js';

/** 只读查询依赖——生产是 `TdSql`，单测注入替身 */
export interface AuditQuery {
  query(sql: string): Promise<TdRow[]>;
}

export interface ExpectedSubtable {
  name: string;
  deviceId: string;
  modelCode: string;
}

export interface AuditReport {
  /** 表在、注册表里没有 */
  orphanRaw: string[];
  /** 注册了、表不在 */
  missingRaw: string[];
  orphanDs: string[];
  missingDs: string[];
}

/** 期望的降采样子表名：每台设备按三级展开 */
export function expectedDsNames(
  expected: readonly ExpectedSubtable[]
): string[] {
  return expected.flatMap(sub =>
    DS_LEVELS.map(level => dsSubtableName(sub.name, level))
  );
}

function difference(a: readonly string[], b: ReadonlySet<string>): string[] {
  return a.filter(name => !b.has(name)).sort();
}

/** `information_schema` 的列恒为字符串；非字符串按缺失处理 */
function textCell(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 只读审计「表存在 ⇔ 已注册」。
 *
 * ⚠️ 空期望集必须拒绝判定：注册表加载失败时若照常比，整库都会被判成孤儿。
 */
export async function auditSubtables(
  query: AuditQuery,
  expected: readonly ExpectedSubtable[]
): Promise<AuditReport> {
  if (expected.length === 0) {
    throw new Error(
      '期望集为空：注册表没有读出任何设备，拒绝判定（否则全库都会被判成孤儿）'
    );
  }

  const rows = await query.query(
    `SELECT stable_name, table_name FROM information_schema.ins_tables ` +
      `WHERE db_name IN ('${RAW_DATABASE}', '${DS_DATABASE}')`
  );

  const modelCodes = [...new Set(expected.map(sub => sub.modelCode))];
  const rawStables = new Set(modelCodes.map(rawStableName));
  const dsStables = new Set(
    modelCodes.flatMap(modelCode =>
      DS_LEVELS.map(level => dsStableName(modelCode, level))
    )
  );
  const existingRaw = new Set<string>();
  const existingDs = new Set<string>();

  for (const row of rows) {
    const stable = textCell(row[0]).toLowerCase();
    const table = textCell(row[1]).toLowerCase();
    // 超表自身的行不算子表
    if (table === '' || table === stable) continue;
    if (rawStables.has(stable)) existingRaw.add(table);
    else if (dsStables.has(stable)) existingDs.add(table);
  }

  const wantRaw = new Set(expected.map(sub => sub.name));
  const wantDs = new Set(expectedDsNames(expected));

  return {
    orphanRaw: difference([...existingRaw], wantRaw),
    missingRaw: difference([...wantRaw], existingRaw),
    orphanDs: difference([...existingDs], wantDs),
    missingDs: difference([...wantDs], existingDs)
  };
}
