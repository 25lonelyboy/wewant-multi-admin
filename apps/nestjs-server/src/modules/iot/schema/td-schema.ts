import { RAW_DATABASE, rawStableName } from '@multi-admin/device-registry';
import type { TdSql } from '../tdengine/td-client.js';

/**
 * 注册路径要读的 TDengine 结构事实。
 *
 * 只读 `information_schema` 与 `DESCRIBE`，不猜：表在不在、列叫什么，都以库里为准。
 */

/** `information_schema` 的列恒为字符串；非字符串按缺失处理 */
function textCell(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function quoteList(values: readonly string[]): string {
  return values.map(value => `'${value.toLowerCase()}'`).join(', ');
}

/** 库里已存在的超表名（不带库前缀） */
export async function listExistingStables(
  td: TdSql,
  db: string,
  names: readonly string[]
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await td.query(
    `SELECT stable_name FROM information_schema.ins_stables ` +
      `WHERE db_name = '${db}' AND stable_name IN (${quoteList(names)})`
  );
  return new Set(rows.map(row => textCell(row[0]).toLowerCase()));
}

/** 库里已存在的子表名（不带库前缀） */
export async function listExistingTables(
  td: TdSql,
  db: string,
  names: readonly string[]
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const rows = await td.query(
    `SELECT table_name FROM information_schema.ins_tables ` +
      `WHERE db_name = '${db}' AND table_name IN (${quoteList(names)})`
  );
  const wanted = new Set(names.map(name => name.toLowerCase()));
  return new Set(
    rows
      .map(row => textCell(row[0]).toLowerCase())
      .filter(name => wanted.has(name))
  );
}

export interface ColumnFact {
  type: string;
  length: number | null;
}

export interface RawStableSchema {
  exists: boolean;
  /** 数据列（不含 `ts` 与标签）；键为折小写后的列名 */
  columns: Map<string, ColumnFact>;
}

/** 任意超表的数据列（不含 `ts` 与标签）；调用方负责先确认表存在 */
export async function describeStableColumns(
  td: TdSql,
  db: string,
  name: string
): Promise<Map<string, ColumnFact>> {
  const rows = await td.query(`DESCRIBE ${db}.${name}`);
  const columns = new Map<string, ColumnFact>();
  for (const row of rows) {
    const field = textCell(row[0]).toLowerCase();
    const note = textCell(row[3]).toUpperCase();
    if (field === 'ts' || note === 'TAG') continue;
    const length = Number(row[2]);
    columns.set(field, {
      type: textCell(row[1]).toUpperCase(),
      length: Number.isFinite(length) ? length : null
    });
  }
  return columns;
}

/** 原始超表的结构；表不存在时 `exists=false`，列集为空 */
export async function describeRawStable(
  td: TdSql,
  modelCode: string
): Promise<RawStableSchema> {
  const name = rawStableName(modelCode);
  const stables = await listExistingStables(td, RAW_DATABASE, [name]);
  if (!stables.has(name)) return { exists: false, columns: new Map() };

  return {
    exists: true,
    columns: await describeStableColumns(td, RAW_DATABASE, name)
  };
}

/** `VARCHAR(n)` 期望值与 DESCRIBE 的 type/length 是否一致；其余类型逐字比 */
export function columnMatches(expected: string, actual: ColumnFact): boolean {
  const varchar = /^VARCHAR\((\d+)\)$/i.exec(expected);
  if (varchar !== null) {
    return actual.type === 'VARCHAR' && actual.length === Number(varchar[1]);
  }
  return actual.type === expected.toUpperCase();
}
