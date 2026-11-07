import {
  DS_LEVELS,
  dsSubtableName,
  subtableName,
  type RegistrySnapshot
} from '@multi-admin/device-registry';
import type { TdRow } from '../tdengine/client.js';
import { DS_DATABASE, RAW_DATABASE } from '../schema.js';

/** 只读查询依赖——生产是 `TdSql`，单测注入替身 */
export interface AuditQuery {
  query(sql: string): Promise<TdRow[]>;
}

export interface ExpectedSubtable {
  name: string;
  deviceId: string;
  modelCode: string;
}

/**
 * 期望集来自档案快照：`devices[]` 展开原始子表名（含历史 usage，换型后旧子表仍合法）。
 *
 * ⚠️ 期望集为空时 `auditSubtables` 会拒绝判定——快照没读到时不能把整库判成孤儿。
 */
export function expectedFromSnapshot(
  snapshot: RegistrySnapshot
): ExpectedSubtable[] {
  const byName = new Map<string, ExpectedSubtable>();
  for (const device of snapshot.devices) {
    const name = subtableName(device.modelCode, device.deviceId);
    if (byName.has(name)) continue;
    byName.set(name, {
      name,
      deviceId: device.deviceId,
      modelCode: device.modelCode
    });
  }
  return [...byName.values()];
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
    `SELECT db_name, stable_name, table_name FROM information_schema.ins_tables ` +
      `WHERE db_name IN ('${RAW_DATABASE}', '${DS_DATABASE}')`
  );

  const rawDb = RAW_DATABASE.toLowerCase();
  const dsDb = DS_DATABASE.toLowerCase();
  const existingRaw = new Set<string>();
  const existingDs = new Set<string>();

  for (const row of rows) {
    const db = textCell(row[0]).toLowerCase();
    const stable = textCell(row[1]).toLowerCase();
    const table = textCell(row[2]).toLowerCase();
    // 超表自身的行不算子表
    if (table === '' || table === stable) continue;
    // ⭐ 不看 stable 是否仍在期望模型里：整个模型退场后，它的子表必须仍被报成孤儿
    if (db === rawDb) existingRaw.add(table);
    else if (db === dsDb) existingDs.add(table);
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
