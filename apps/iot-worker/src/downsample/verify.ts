import {
  DS_LEVELS,
  dsLevelSuffix,
  dsStableName,
  dsSubtableName,
  type DsLevel
} from '@multi-admin/device-registry';
import { DS_DATABASE, RAW_METRICS, type RawMetric } from '../schema.js';
import type { TdRow } from '../tdengine/client.js';
import type { DsLevelSpec } from './level.js';
import { levelSpec } from './level.js';
import { buildAggregateSql } from './query.js';
import {
  parseAggregateRows,
  type DsAggregateRow,
  type DsMetricAggregate
} from './rows.js';
import { closedWindowRange, type WindowSpec } from './window.js';

/**
 * 降采样**逐条对账**（判据②改写，设计 §9）。
 *
 * 对每个 `(子表, 窗口)`，把「原始超表按同子表同窗口聚合」与「降采样表那一行」逐字段比。
 * 与降采样环**共用同一套窗口算术**（`window.ts`）与同一套读形状（`query.ts` 的聚合读复用于原始侧）——
 * 对账脚本若自己另算边界，日级业务日（`INTERVAL(1d, 8h)`）或任何对齐边缘上就会与环"算一段、比另一段"，
 * 报出的是脚本自己的错位、不是数据的错。
 */

/** 浮点列（sum/min/max）比较容差：相对值 + 绝对值下限 */
const REL_TOLERANCE = 1e-9;
const ABS_TOLERANCE = 1e-9;

/** 一条差异。字段名与降采样表的列名一致；整行缺失/多出时 `field` 为 `<row>` */
export interface VerifyMismatch {
  level: DsLevel;
  /** 原始库子表名（多出的降采样行按其名去掉级别后缀还原） */
  subtable: string;
  /** 窗口起始（epoch 毫秒） */
  ts: number;
  field: string;
  expected: string;
  actual: string;
  kind: 'field' | 'missing-row' | 'extra-row';
}

/** 对账用的一行——原始侧与降采样侧解析成同一形态后按键比对 */
interface VerifiedRow {
  /** 比对键：`<降采样子表名>@<窗口ts>`（同一子表在范围内可有多个窗口） */
  key: string;
  /** 原始库子表名（报告用） */
  rawName: string;
  ts: number;
  deviceId: string | null;
  metrics: Record<RawMetric, DsMetricAggregate>;
}

/** 已校验的窗口范围 */
export interface CheckRange {
  startMs: number;
  endMs: number;
  /** 实际比对的窗口数 N */
  windows: number;
  /** 从"最新已闭合窗口"往回跳过的窗口数 S */
  skip: number;
  /** 环每轮重算的窗口数 K */
  lookback: number;
  /**
   * 环的 **K 契约区**左边界（最近 K 个已闭合窗口的起点，epoch 毫秒）。
   * `ts >= contractStartMs` 的差异落在环保证维护的窗口内 ⇒ **真缺陷**；
   * 小于它的差异（仅在 N > K 时可能出现）可能是晚到数据造成的**良性陈旧**，不据此判失败（设计 §9）。
   */
  contractStartMs: number;
  /** 范围内每个窗口是否都被环最近一轮覆盖（S ≥ 1 且 S+N ≤ K） */
  guaranteed: boolean;
}

export interface CheckRangeOptions {
  lookback: number;
  /** 比对窗口数 N，缺省 `lookback - 1` */
  windows?: number;
  /** 跳过的最新窗口数 S，缺省 1 */
  skip?: number;
}

/**
 * 选取要逐条对账的窗口范围，锚定**墙上时钟** `nowMs`。
 *
 * ⭐ **默认跳过最新那个已闭合窗口（S = 1）、比对 N = K-1 个窗口**。环按固定周期触发，
 * 最新已闭合窗口在它闭合到下一位环 tick 之间**可能尚未被重算**——把它算作差异就是拿环的触发抖动
 * 当数据缺陷，够多的假警报会让脚本被无视。`S ≥ 1` 且 `S + N ≤ K` 时，范围内每个窗口都保证被环
 * **最近一轮**覆盖（前提：环每窗口至少 tick 一次）⇒ 此时的差异是**真缺陷**；范围外的差异则可能是
 * 晚到数据造成的**良性陈旧**（环只在最近 K 个窗口内自愈，§3.2），脚本不据此判失败。
 *
 * ⚠️ 锚定 `nowMs` 而非"降采样表里最新的那行"：环的契约是"最近 K 个**已闭合**窗口"，锚到墙上时钟
 * 才能把"环落后了（契约窗口缺行）"照出来；锚到表里最新行会在环停摆时把范围缩到零、假装通过。
 */
export function checkedWindowRange(
  nowMs: number,
  spec: WindowSpec,
  options: CheckRangeOptions
): CheckRange {
  const windows = options.windows ?? options.lookback - 1;
  const skip = options.skip ?? 1;
  // ⭐ 边界只有一个来源：复用环的 `closedWindowRange`（它内部用 lastClosedBoundary 做 floor/offset/时区），
  // 只在结果上按整数个窗口左右收端，绝不自己再算边界。
  const full = closedWindowRange(nowMs, spec, skip + windows);
  const endMs = full.endMs - skip * spec.windowMs;
  const startMs = full.startMs;
  // K 契约区 = 最近 K 个已闭合窗口（环每轮重算的那一段），右边界即 full.endMs
  const contractStartMs = full.endMs - options.lookback * spec.windowMs;
  return {
    startMs,
    endMs,
    windows,
    skip,
    lookback: options.lookback,
    contractStartMs,
    guaranteed: skip >= 1 && skip + windows <= options.lookback
  };
}

/**
 * 降采样读 SELECT 的列名，**一处定义**：`tbname`、`ts`、每测点 `sum/count/min/max`、`deviceId`。
 *
 * ⭐ 前两段的**列序刻意与 `query.ts` 的 `buildAggregateSql` 对齐**，于是两侧可共用
 * `parseAggregateRows`；`DS_DEVICE_ID_INDEX` 由本函数推导，`buildDsReadSql` 也用它拼 SELECT——
 * 三者绑在同一条列表上，改列序即同步（并有单测把与 `buildAggregateSql` 的对齐钉死，漂移即失败）。
 */
export function dsSelectColumns(): string[] {
  const aggregates = RAW_METRICS.flatMap(metric => [
    `sum_${metric}`,
    `count_${metric}`,
    `min_${metric}`,
    `max_${metric}`
  ]);
  return ['tbname', 'ts', ...aggregates, 'deviceId'];
}

/** `deviceId` 在降采样读结果里的列下标——由 `dsSelectColumns` 推导，改列序即随之改变 */
export const DS_DEVICE_ID_INDEX = dsSelectColumns().indexOf('deviceId');

/**
 * 把差异按窗口是否落在**环的 K 契约区**内分开。
 *
 * ⭐ 契约区内（`ts >= contractStartMs`）的差异是**真缺陷**；区外的（仅当 `--windows > K` 时才可能
 * 出现）可能是晚到数据造成的**良性陈旧**，调用方只作提示、**不据此判失败**（设计 §9）。
 */
export interface MismatchPartition {
  failures: VerifyMismatch[];
  informational: VerifyMismatch[];
}

export function partitionMismatches(
  range: CheckRange,
  mismatches: readonly VerifyMismatch[]
): MismatchPartition {
  const failures: VerifyMismatch[] = [];
  const informational: VerifyMismatch[] = [];
  for (const mismatch of mismatches) {
    if (mismatch.ts >= range.contractStartMs) failures.push(mismatch);
    else informational.push(mismatch);
  }
  return { failures, informational };
}

/**
 * 降采样表的读查询。
 *
 * ⚠️ 不复用 `query.ts` 的 `buildAggregateSql`：它写死原始库与 `_wstart`，
 * 是给**原始侧**用的；这里读降采样侧，来源表不同。列序约定见 `dsSelectColumns`。
 */
export function buildDsReadSql(
  modelCode: string,
  spec: DsLevelSpec,
  startMs: number,
  endMs: number
): string {
  return [
    `SELECT ${dsSelectColumns().join(', ')}`,
    `FROM ${DS_DATABASE}.${dsStableName(modelCode, spec.level)}`,
    `WHERE ts >= ${startMs} AND ts < ${endMs}`
  ].join(' ');
}

function nullSafeString(value: unknown): string | null {
  if (value === null || value === undefined || value === 'NULL') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint')
    return String(value);
  return null; // 非预期类型按缺失处理（不把对象 stringify 成 '[object Object]'）
}

/** 还原降采样子表名对应的原始库子表名（`dsSubtableName` 的逆，仅用于报告可读） */
function stripLevel(dsName: string, level: DsLevel): string {
  const suffix = dsLevelSuffix(level);
  return dsName.endsWith(suffix) ? dsName.slice(0, -suffix.length) : dsName;
}

function verifiedKey(dsName: string, ts: number): string {
  return `${dsName}@${ts}`;
}

/** 原始侧：解析出的聚合行 → 对账行（键取它**应当**落进的降采样子表名） */
export function expectedRows(
  aggregateRows: readonly DsAggregateRow[],
  level: DsLevel
): VerifiedRow[] {
  return aggregateRows.map(row => ({
    key: verifiedKey(dsSubtableName(row.tbname, level), row.ts),
    rawName: row.tbname,
    ts: row.ts,
    deviceId: null, // 原始聚合读不含标签；期望标签由调用方按注册表另配
    metrics: row.metrics
  }));
}

/** 降采样侧：读结果 → 对账行（含 deviceId 标签列） */
export function parseDsRows(
  rows: readonly TdRow[],
  level: DsLevel
): VerifiedRow[] {
  const parsed = parseAggregateRows(rows, level);
  return parsed.map((row, index) => ({
    key: verifiedKey(row.tbname, row.ts),
    rawName: stripLevel(row.tbname, level),
    ts: row.ts,
    deviceId: nullSafeString(rows[index]?.[DS_DEVICE_ID_INDEX]),
    metrics: row.metrics
  }));
}

function fmt(value: string | number | bigint | null): string {
  return value === null ? 'NULL' : String(value);
}

function nullSafeEqual(a: string | null, b: string | null): boolean {
  return a === b;
}

/**
 * 浮点列比较。
 *
 * ⭐ 两侧的 `sum`（DOUBLE）/`min`·`max`（FLOAT）由**同一引擎**对**同一批原始行**聚合，
 * 经同一连接器取回，理论上逐位相等 ⇒ 容差只需覆盖表示层，取 `1e-9`（相对 + 绝对下限）。
 * 一个 FLOAT 的最小表示误差约 `1.2e-7` 相对 ⇒ **比本容差大百倍**，任何真实篡改（改值、串窗、
 * 取错窗口的行）都远在容差之上、必被报出；而 `count`（BIGINT）精确比较、不容差。
 */
function floatEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  const diff = Math.abs(a - b);
  if (diff <= ABS_TOLERANCE) return true;
  return diff <= REL_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * 逐字段比对两侧对账行。期望标签由 `deviceIdFor` 按原始子表名给出（取自注册表）——
 * 降采样行的 `deviceId` 标签必须与之相等。
 */
export function compareAggregates(
  level: DsLevel,
  expected: readonly VerifiedRow[],
  actual: readonly VerifiedRow[],
  deviceIdFor: (rawName: string) => string | null = () => null
): VerifyMismatch[] {
  const expectedByKey = new Map(expected.map(row => [row.key, row]));
  const actualByKey = new Map(actual.map(row => [row.key, row]));
  const mismatches: VerifyMismatch[] = [];

  const keys = new Set([...expectedByKey.keys(), ...actualByKey.keys()]);
  for (const key of keys) {
    const exp = expectedByKey.get(key);
    const act = actualByKey.get(key);

    if (exp !== undefined && act === undefined) {
      mismatches.push({
        level,
        subtable: exp.rawName,
        ts: exp.ts,
        field: '<row>',
        expected: '原始有聚合',
        actual: '降采样缺行',
        kind: 'missing-row'
      });
      continue;
    }
    if (act !== undefined && exp === undefined) {
      mismatches.push({
        level,
        subtable: act.rawName,
        ts: act.ts,
        field: '<row>',
        expected: '无对应原始聚合',
        actual: '降采样多行',
        kind: 'extra-row'
      });
      continue;
    }
    if (exp === undefined || act === undefined) continue;

    const base = { level, subtable: exp.rawName, ts: exp.ts };
    const push = (
      field: string,
      expectedValue: string,
      actualValue: string
    ): void => {
      mismatches.push({
        ...base,
        field,
        expected: expectedValue,
        actual: actualValue,
        kind: 'field'
      });
    };

    // 标签：期望值取自注册表（建表端写死的那个），实际值取自降采样行
    const expectedDeviceId = deviceIdFor(exp.rawName);
    if (!nullSafeEqual(expectedDeviceId, act.deviceId)) {
      push('deviceId', fmt(expectedDeviceId), fmt(act.deviceId));
    }

    for (const metric of RAW_METRICS) {
      const e = exp.metrics[metric];
      const a = act.metrics[metric];
      // count 精确（BIGINT）
      if (e.count !== a.count) {
        push(`count_${metric}`, e.count.toString(), a.count.toString());
      }
      if (!floatEqual(e.sum, a.sum)) {
        push(`sum_${metric}`, fmt(e.sum), fmt(a.sum));
      }
      if (!floatEqual(e.min, a.min)) {
        push(`min_${metric}`, fmt(e.min), fmt(a.min));
      }
      if (!floatEqual(e.max, a.max)) {
        push(`max_${metric}`, fmt(e.max), fmt(a.max));
      }
    }
  }

  return mismatches;
}

/** 单级对账结果 */
export interface LevelVerifyResult {
  modelCode: string;
  level: DsLevel;
  range: CheckRange;
  /** 范围内原始侧聚合出的 `(子表, 窗口)` 数 */
  expectedCount: number;
  /** 范围内降采样侧读到的行数 */
  actualCount: number;
  mismatches: VerifyMismatch[];
}

/**
 * 两侧计数为 0 的护栏。
 *
 * 流量停了时脚本会拿 0 组比 0 组、结论仍是"差异 0 处 · 对账通过"——0 组不是证据。
 * 这里只提供判据，不提供 `--allow-empty` 开关：要观察空库就别跑这个脚本。
 */
export function emptySideFailures(
  result: Pick<LevelVerifyResult, 'level' | 'expectedCount' | 'actualCount'>
): string[] {
  const failures: string[] = [];
  if (result.expectedCount === 0) {
    failures.push(
      `[${result.level}] 原始侧 0 个 (子表,窗口)：空对账不构成证据——按数据最后时间戳用 --now 取窗口，或先起流量`
    );
  }
  if (result.actualCount === 0) {
    failures.push(`[${result.level}] 降采样侧 0 行：空对账不构成证据——同上`);
  }
  return failures;
}

/** 只读查询依赖——生产是 `TdSql`，单测注入替身以隔离 TDengine */
export interface VerifyQuery {
  query(sql: string): Promise<TdRow[]>;
}

interface PassResult {
  expected: VerifiedRow[];
  actual: VerifiedRow[];
  mismatches: VerifyMismatch[];
}

/** 读两侧一次并比对——原始聚合（复用 `buildAggregateSql`）与降采样行 */
async function readAndCompare(
  query: VerifyQuery,
  modelCode: string,
  spec: DsLevelSpec,
  level: DsLevel,
  range: CheckRange,
  deviceIdFor: (rawName: string) => string | null
): Promise<PassResult> {
  const rawAggregates = parseAggregateRows(
    await query.query(
      buildAggregateSql(modelCode, spec, range.startMs, range.endMs)
    ),
    level
  );
  const dsRows = parseDsRows(
    await query.query(
      buildDsReadSql(modelCode, spec, range.startMs, range.endMs)
    ),
    level
  );
  const expected = expectedRows(rawAggregates, level);
  return {
    expected,
    actual: dsRows,
    mismatches: compareAggregates(level, expected, dsRows, deviceIdFor)
  };
}

/**
 * 对单级做一次逐条对账。
 *
 * ⭐ **一致性边界**：原始侧与降采样侧是**两条独立语句**，可能跨一次写入（原始行在两次读之间到达，
 * 或环在两次读之间重算）——此时「原始看到新数据、降采样还是旧行」会造出一条**并非缺陷**的差异。
 * 一旦首轮发现差异，就**重读两侧、重比一遍**，只有重读后**仍存**的差异才报。只重读降采样侧不够
 * ——陈旧的一侧可能是**期望值（原始聚合）**本身，故两侧都要重取到同一逻辑点。
 *
 * ⚠️ 前提取胜于"管道静止"：活数据持续到达时仍可能瞬时报出晚到数据造成的差异，但它在环下一轮重算
 * + 下次对账即消失。真缺陷（改值、串窗、缺行/多行）在重读后稳定复现。设计 §9 曾提出用**单条 join**
 * 消除这条缝，但本机实测该 join 不受支持（`9828 Not supported join since 'Join requires valid time
 * series input and primary timestamp equal condition'`），故采用"重读两侧"这条等价做法。
 */
export async function verifyLevel(
  query: VerifyQuery,
  modelCode: string,
  level: DsLevel,
  nowMs: number,
  options: CheckRangeOptions,
  deviceIdFor: (rawName: string) => string | null = () => null
): Promise<LevelVerifyResult> {
  const spec = levelSpec(level);
  const range = checkedWindowRange(nowMs, spec, options);

  let pass = await readAndCompare(
    query,
    modelCode,
    spec,
    level,
    range,
    deviceIdFor
  );
  if (pass.mismatches.length > 0) {
    // 有差异 ⇒ 排除"两条语句之间发生了一次写入"这类假警报：重读两侧再比，只留仍存的差异
    pass = await readAndCompare(
      query,
      modelCode,
      spec,
      level,
      range,
      deviceIdFor
    );
  }

  return {
    modelCode,
    level,
    range,
    expectedCount: pass.expected.length,
    actualCount: pass.actual.length,
    mismatches: pass.mismatches
  };
}

/** 输出表存在性检查结果 */
export interface TableIssue {
  modelCode: string;
  level: DsLevel;
  kind: 'missing' | 'empty';
  message: string;
}

/**
 * 各模型的输出表**都存在且非空**（判据②的另一半）。
 *
 * ⚠️ 用 `LIMIT 1` 取一行判空，不用 `COUNT(*)`——后者要扫全表；`COUNT(DISTINCT …)` 在 TDengine 里
 * **不可信**（实测真值 1 却返回 100，C11），本脚本任何位置都不用它。
 */
export async function checkTablesNonEmpty(
  query: VerifyQuery,
  modelCodes: readonly string[]
): Promise<TableIssue[]> {
  const issues: TableIssue[] = [];
  for (const modelCode of modelCodes) {
    for (const level of DS_LEVELS) {
      const table = `${DS_DATABASE}.${dsStableName(modelCode, level)}`;
      try {
        const rows = await query.query(`SELECT ts FROM ${table} LIMIT 1`);
        if (rows.length === 0) {
          issues.push({
            modelCode,
            level,
            kind: 'empty',
            message: `输出表 ${table} 存在但为空`
          });
        }
      } catch (error) {
        issues.push({
          modelCode,
          level,
          kind: 'missing',
          message: `输出表 ${table} 不存在或不可读：${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    }
  }
  return issues;
}
