import { createRequire } from 'node:module';
import type * as TdClient from '@tdengine/websocket';
import {
  MAX_BIND_ROWS,
  RAW_DATABASE,
  RAW_METRICS,
  type RawMetric
} from '../schema.js';

// 单次 bind 行数上限由 schema 侧一处定义，配位层（config）与写入层共用（行 2）
export { MAX_BIND_ROWS } from '../schema.js';

const require = createRequire(import.meta.url);
const td = require('@tdengine/websocket') as typeof TdClient;

/**
 * ⚠️ **强制走 STMT1**：把 `minStmt2Version` 抬到任何服务器版本都满足不了。
 *
 * 实测（3.4.2.8.community + `@tdengine/websocket` 3.5.0）：
 * - **STMT2 要求 `USING`/`tbname` 形态**——写死子表名时它 resolve 不出列，报
 *   `clientStmt2.c[4946]stmtGetStbColFields2()` 这种 C 源码路径错误；
 * - 而带 `USING`/`tbname` 的写法**会自动建表**，顶掉「表存在 ⇔ 已注册」这条不变量；
 * - **STMT1 支持写死表名**，子表不存在时报 **`Table does not exist`**——正是要的那道防线。
 *
 * ⚠️ 代价：表名写死在 SQL 里 ⇒ **每个子表一条语句**，"一次 exec 覆盖整批"（N1 实测的 5.5×）
 * 只在 USING 形态下成立，这里拿不到。P1 百级设备无碍，**十万级时重估**。
 */
const FORCE_STMT1_MIN_VERSION = '99.0.0.0';

/** 一个测点在某一行的取值 */
export interface MetricSample {
  value: number;
  unit: string;
}

/** 一行待写数据；`metrics` 里**缺哪个测点就整列不写** ⇒ 按 §4.5 落成 `NONE`、保留旧值 */
export type PendingRow = {
  subtable: string;
  ts: number;
  metrics: Partial<Record<RawMetric, MetricSample>>;
};

/**
 * 列的绑定类型——与 TDengine stmt 的 `setXxx` 一一对应。
 *
 * ⚠️ 名称必须与超级表的**列类型**一致（DOUBLE 用 `double`、BIGINT 用 `bigint`…），
 * 而不是与 JS 值的类型一致：连接器按声明类型编码，选错会写坏或报错。
 */
export type ColumnKind =
  'timestamp' | 'float' | 'double' | 'bigint' | 'varchar';

/** INSERT 的一列：列名、绑定类型、该行的取值 */
export interface WriteColumn {
  name: string;
  kind: ColumnKind;
  value: number | bigint | string | null;
}

/**
 * 行的列描述——把"某一行怎么写"从写入器里抽出来。
 *
 * ⚠️ 原始库与降采样库的行**列不同**（前者是「测点值 + 单位」、后者是「sum/count/min/max + 单位」），
 * 故列描述由调用方以 codec 提供；写入器只负责按 codec 分组、建语句、绑定、exec。
 */
export interface WriteCodec<Row> {
  /** 目标库——INSERT 用它限定，故两种库可共用同一个写入器 */
  database: string;
  /** 该行的目标子表 */
  subtable(row: Row): string;
  /** 列集合标识：同标识的行列结构一致，才可共用一条语句与一次 exec */
  signature(row: Row): string;
  /** INSERT 的列（含 ts）与各列取值；顺序即 VALUES 顺序 */
  columns(row: Row): readonly WriteColumn[];
}

type TdConnection = Awaited<ReturnType<typeof td.sqlConnect>>;
type TdStmt = Awaited<ReturnType<TdConnection['stmtInit']>>;
type TdParams = ReturnType<TdStmt['newStmtParam']>;

/** 建一条连接——生产是连接器的 `sqlConnect`；单测注入替身以制造"连接已废" */
export type WriterConnect = (url: string) => Promise<TdConnection>;

const defaultConnect: WriterConnect = url =>
  td.sqlConnect(
    new td.WSConfig(`${url}/${RAW_DATABASE}`, FORCE_STMT1_MIN_VERSION)
  );

/** 连接池的一格：一条连接及其 stmt / 已 prepare 的语句（`preparedSql` 决定要不要重 prepare） */
interface WriterSlot {
  connection: TdConnection | null;
  stmt: TdStmt | null;
  preparedSql: string | null;
}

/** 组装一条按列名写死的 INSERT（STMT1 不支持 `USING`/`tbname` 形态） */
export function insertSql(
  database: string,
  subtable: string,
  names: readonly string[]
): string {
  const values = names.map(() => '?').join(', ');
  return `INSERT INTO ${database}.${subtable} (${names.join(', ')}) VALUES (${values})`;
}

function bindColumn(
  params: TdParams,
  kind: ColumnKind,
  values: (number | bigint | string | null)[]
): void {
  switch (kind) {
    case 'timestamp':
      params.setTimestamp(values as number[]);
      break;
    case 'float':
      params.setFloat(values);
      break;
    case 'double':
      params.setDouble(values);
      break;
    case 'bigint':
      params.setBigint(values);
      break;
    case 'varchar':
      params.setVarchar(values);
      break;
  }
}

/**
 * 参数绑定写入器——持一个连接池（默认 2 条，可配 2~4，行 1）。
 *
 * ⚠️ **不另造重试**：失败直接抛回调用方（队列重试），数据全程在 Redis。
 * ⚠️ **作废粒度是"失败的那一条"**：`write()` 记下这一次用的是哪一格，`invalidate()` 只作废它，
 * 同一池里其它连接不陪葬（行 5）。
 * ⚠️ **`invalidate()` 必须先关旧连接再置空**——只置空会把一条**还活着的** WebSocket 泄漏掉。
 * ⚠️ **只有连接级错误才该 `invalidate()`**（调用方按 `failure.connectionLevel` 判定）：超时
 * "可能已成功"、连接数上限、判不出形态的默认桶都**不证明连接坏了**，作废它们只是白白重连。
 */
export class TdengineWriter<Row = PendingRow> {
  private readonly slots: WriterSlot[];
  /** 下一次写入用哪一格（轮转） */
  private cursor = 0;
  /** `write()` 失败时记下用的是哪一格，供 `invalidate()` 精确作废；成功或未失败时为空 */
  private failedSlot: WriterSlot | null = null;

  constructor(
    private readonly url: string,
    private readonly codec: WriteCodec<Row> = RAW_CODEC as WriteCodec<Row>,
    connections = 2,
    private readonly connect: WriterConnect = defaultConnect
  ) {
    const count = Math.max(1, Math.trunc(connections));
    this.slots = Array.from({ length: count }, () => ({
      connection: null,
      stmt: null,
      preparedSql: null
    }));
  }

  /** 写入一批；返回 `getLastAffected()` 的合计（核对用） */
  async write(rows: readonly Row[]): Promise<number> {
    const groups = groupRows(rows, this.codec);
    // 单组行数超上限会在 bind 时报 `bind number out of range`——在建连 / bind 之前响亮挡下（行 2）
    for (const group of groups) {
      if (group.rows.length > MAX_BIND_ROWS) {
        throw new Error(
          `单组行数 ${group.rows.length} 超过单次 bind 上限 ${MAX_BIND_ROWS}（INGEST_BATCH_SIZE 应 ≤ ${MAX_BIND_ROWS}）`
        );
      }
    }

    const slot = this.slots[this.cursor] ?? this.slots[0];
    if (slot === undefined) throw new Error('TDengine 连接池为空');
    this.cursor = (this.cursor + 1) % this.slots.length;
    this.failedSlot = null;
    try {
      return await this.writeGroups(slot, groups);
    } catch (error) {
      // 记下失败的是哪一格——调用方按连接级判定决定是否 `invalidate()`，作废只针对它
      this.failedSlot = slot;
      throw error;
    }
  }

  /**
   * 作废**失败的那一条**连接（`write()` 记下的那一格），让下一次写入在它上面重连。
   *
   * ⚠️ 由调用方在**连接级**错误时调用（`failure.connectionLevel`）；非连接级（超时 / 连接数上限 /
   * 默认桶）不得调用，否则会白白丢掉一条好连接并重连。
   */
  invalidate(): void {
    const slot = this.failedSlot;
    this.failedSlot = null;
    if (slot !== null) this.discard(slot);
  }

  async close(): Promise<void> {
    for (const slot of this.slots) {
      const { stmt, connection } = slot;
      slot.stmt = null;
      slot.preparedSql = null;
      slot.connection = null;
      try {
        if (stmt !== null) await stmt.close();
        if (connection !== null) await connection.close();
      } catch {
        // 关闭期错误不影响退出
      }
    }
    this.failedSlot = null;
  }

  private async writeGroups(
    slot: WriterSlot,
    groups: readonly WriteGroup[]
  ): Promise<number> {
    const stmt = await this.requireStmt(slot);

    let affected = 0;
    for (const group of groups) {
      const names = group.columns.map(column => column.name);
      const sql = insertSql(this.codec.database, group.subtable, names);
      if (slot.preparedSql !== sql) {
        await stmt.prepare(sql);
        slot.preparedSql = sql;
      }

      const params = stmt.newStmtParam();
      for (const [index, column] of group.columns.entries()) {
        bindColumn(
          params,
          column.kind,
          group.rows.map(row => row.columns[index]?.value ?? null)
        );
      }
      await stmt.bind(params);
      await stmt.batch();
      await stmt.exec();

      const count = stmt.getLastAffected();
      if (typeof count === 'number') affected += count;
    }
    return affected;
  }

  /**
   * 尽力关闭这一格的连接并置空，让下一次写入重连。
   *
   * ⚠️ 关闭是尽力而为、**不 await**——半开连接的 `close()` 可能挂起，拖住恢复（与读侧 `dropReader` 同一思路）。
   */
  private discard(slot: WriterSlot): void {
    const { stmt, connection } = slot;
    slot.stmt = null;
    slot.preparedSql = null;
    slot.connection = null;
    if (stmt !== null)
      void Promise.resolve(stmt.close()).catch(() => undefined);
    if (connection !== null)
      void Promise.resolve(connection.close()).catch(() => undefined);
  }

  private async requireStmt(slot: WriterSlot): Promise<TdStmt> {
    if (slot.connection === null) {
      slot.connection = await this.connect(this.url);
      slot.stmt = null;
      slot.preparedSql = null;
    }
    if (slot.stmt === null) {
      slot.stmt = await slot.connection.stmtInit();
      slot.preparedSql = null;
    }
    return slot.stmt;
  }
}

interface WriteGroup {
  subtable: string;
  columns: readonly WriteColumn[];
  rows: { columns: readonly WriteColumn[] }[];
}

/** 按 `(子表, 列签名)` 分组——同组才能共用一条语句与一次 exec */
function groupRows<Row>(
  rows: readonly Row[],
  codec: WriteCodec<Row>
): WriteGroup[] {
  const groups = new Map<string, WriteGroup>();
  for (const row of rows) {
    const columns = codec.columns(row);
    const subtable = codec.subtable(row);
    const key = `${subtable}\u0000${codec.signature(row)}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { subtable, columns, rows: [{ columns }] });
    } else {
      existing.rows.push({ columns });
    }
  }
  return [...groups.values()];
}

/**
 * 原始库的列描述。
 *
 * ⚠️ 一行只写它**带了的**测点（列随测点集合变）⇒ 签名取"带了哪些测点"，
 * 缺测点的行落成 `NONE`、保留旧值（§4.5）。
 */
export const RAW_CODEC: WriteCodec<PendingRow> = {
  database: RAW_DATABASE,
  subtable: row => row.subtable,
  signature: row => presentMetrics(row).join('+'),
  columns: row => {
    const columns: WriteColumn[] = [
      { name: 'ts', kind: 'timestamp', value: row.ts }
    ];
    for (const metric of presentMetrics(row)) {
      const sample = row.metrics[metric];
      if (sample === undefined) continue;
      columns.push({ name: metric, kind: 'float', value: sample.value });
      columns.push({
        name: `${metric}_unit`,
        kind: 'varchar',
        value: sample.unit
      });
    }
    return columns;
  }
};

function presentMetrics(row: PendingRow): RawMetric[] {
  return RAW_METRICS.filter(metric => row.metrics[metric] !== undefined);
}
