import { createRequire } from 'node:module';
import type * as TdClient from '@tdengine/websocket';
import { RAW_DATABASE, RAW_METRICS, type RawMetric } from '../schema.js';

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

type TdConnection = Awaited<ReturnType<typeof td.sqlConnect>>;
type TdStmt = Awaited<ReturnType<TdConnection['stmtInit']>>;

/** 该行带了哪些测点——同签名的行才能共用一条语句 */
function insertSql(subtable: string, present: readonly string[]): string {
  const columns = [
    'ts',
    ...present.flatMap(metric => [`${metric}`, `${metric}_unit`])
  ];
  const values = columns.map(() => '?').join(', ');
  return `INSERT INTO ${RAW_DATABASE}.${subtable} (${columns.join(', ')}) VALUES (${values})`;
}

/**
 * 参数绑定写入器。
 *
 * ⚠️ **不另造重试**：失败直接抛回调用方（队列重试），数据全程在 Redis。
 * ⚠️ 一次非法绑定会把连接拖废 ⇒ 出错即作废重连，且告诉调用方"连接已废"与"这批失败"是两件事。
 */
export class TdengineWriter {
  private connection: TdConnection | null = null;
  private stmt: TdStmt | null = null;
  private preparedSql: string | null = null;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.connection = await td.sqlConnect(
      new td.WSConfig(`${this.url}/${RAW_DATABASE}`, FORCE_STMT1_MIN_VERSION)
    );
    this.stmt = null;
    this.preparedSql = null;
  }

  /** 写入一批；返回 `getLastAffected()` 的合计（核对用） */
  async write(rows: readonly PendingRow[]): Promise<number> {
    const stmt = await this.requireStmt();
    const groups = groupRows(rows);

    let affected = 0;
    for (const group of groups) {
      const sql = insertSql(group.subtable, group.present);
      if (this.preparedSql !== sql) {
        await stmt.prepare(sql);
        this.preparedSql = sql;
      }

      const params = stmt.newStmtParam();
      params.setTimestamp(group.rows.map(row => row.ts));
      for (const metric of group.present) {
        params.setFloat(group.rows.map(row => row.metrics[metric]?.value ?? 0));
        params.setVarchar(
          group.rows.map(row => row.metrics[metric]?.unit ?? '')
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

  /** 作废连接：下一次写入会重连。用于"连接已废"的分支 */
  invalidate(): void {
    this.connection = null;
    this.stmt = null;
    this.preparedSql = null;
  }

  async close(): Promise<void> {
    const stmt = this.stmt;
    const connection = this.connection;
    this.invalidate();
    try {
      if (stmt !== null) await stmt.close();
      if (connection !== null) await connection.close();
    } catch {
      // 关闭期错误不影响退出
    }
  }

  private async requireStmt(): Promise<TdStmt> {
    if (this.connection === null) await this.connect();
    const connection = this.connection;
    if (connection === null) throw new Error('TDengine 连接不可用');
    if (this.stmt === null) {
      this.stmt = await connection.stmtInit();
      this.preparedSql = null;
    }
    return this.stmt;
  }
}

interface WriteGroup {
  subtable: string;
  present: readonly RawMetric[];
  rows: PendingRow[];
}

/** 按 `(子表, 带了哪些测点)` 分组——同组才能共用一条语句与一次 exec */
function groupRows(rows: readonly PendingRow[]): WriteGroup[] {
  const groups = new Map<string, WriteGroup>();
  for (const row of rows) {
    const present = RAW_METRICS.filter(
      metric => row.metrics[metric] !== undefined
    );
    if (present.length === 0) continue;

    const key = `${row.subtable}\u0000${present.join('+')}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, { subtable: row.subtable, present, rows: [row] });
    } else {
      existing.rows.push(row);
    }
  }
  return [...groups.values()];
}
