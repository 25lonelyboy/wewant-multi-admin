import type { SubtableRef } from '@multi-admin/device-registry';

/** 原始库：设备上报的遥测。KEEP 3 年（决策 4 轴 1） */
export const RAW_DATABASE = 'wewant_iot';
/** 降采样库：聚合结果。库级 KEEP 10 年；分钟级再靠**超表级** KEEP 收到 3 年 */
export const DS_DATABASE = 'wewant_iot_ds';

/** 原始超表 */
export const RAW_STABLE = 'telemetry';

/** P1 的三个测点——列名即载荷里的 `metrics[].key` */
export const RAW_METRICS = ['temperature', 'vibration', 'current'] as const;
export type RawMetric = (typeof RAW_METRICS)[number];

/** 降采样三级——**同形**，只有窗口不同（跨级查询与再聚合才成立） */
export const DS_LEVELS = ['1m', '1h', '1d'] as const;
export type DsLevel = (typeof DS_LEVELS)[number];

export const RAW_KEEP_DAYS = 1095;
export const DS_KEEP_DAYS = 3650;
/** 分钟级只留 3 年——全案唯一的**超表级** KEEP（必须小于库级） */
export const DS_MINUTE_KEEP_DAYS = 1095;
/** 每个数据文件的跨度：`KEEP` 到期以它为粒度发生 */
export const DURATION_DAYS = 10;

/** 设备标识宽度：决策 1 §8.2 的 16 位 */
const DEVICE_ID_WIDTH = 16;
/** 单位列宽：原始库与降采样库同宽 */
const UNIT_WIDTH = 16;

export function dsStableName(level: DsLevel): string {
  return `telemetry_${level}`;
}

/** 建库语句——两个库，幂等 */
export function createDatabaseStatements(): string[] {
  return [
    `CREATE DATABASE IF NOT EXISTS ${RAW_DATABASE} PRECISION 'ms' KEEP ${RAW_KEEP_DAYS} DURATION ${DURATION_DAYS}`,
    `CREATE DATABASE IF NOT EXISTS ${DS_DATABASE} PRECISION 'ms' KEEP ${DS_KEEP_DAYS} DURATION ${DURATION_DAYS}`
  ];
}

/** 原始超表：`ts` + 每测点「值 + 单位」；标签只留 `deviceId`（决策 1 §8.7 的 P1 版） */
export function createRawStableStatement(): string {
  const columns = RAW_METRICS.flatMap(metric => [
    `${metric} FLOAT`,
    `${metric}_unit VARCHAR(${UNIT_WIDTH})`
  ]).join(', ');
  return `CREATE STABLE IF NOT EXISTS ${RAW_DATABASE}.${RAW_STABLE} (ts TIMESTAMP, ${columns}) TAGS (deviceId VARCHAR(${DEVICE_ID_WIDTH}))`;
}

/**
 * 子表：**一个采集点一张表**。
 *
 * ⚠️ 表名用折小写形态；**标签值保留原样**——TDengine 标识符不分大小写、标签值分。
 */
export function createSubtableStatement(subtable: SubtableRef): string {
  return `CREATE TABLE IF NOT EXISTS ${RAW_DATABASE}.${subtable.name} USING ${RAW_DATABASE}.${RAW_STABLE} TAGS ('${subtable.deviceId}')`;
}

/** 降采样超表：每测点四个**可再聚合量** + 单位列 */
export function createDsStableStatements(): string[] {
  const columns = [
    ...RAW_METRICS.flatMap(metric => [
      `sum_${metric} DOUBLE`,
      `count_${metric} BIGINT`,
      `min_${metric} FLOAT`,
      `max_${metric} FLOAT`
    ]),
    ...RAW_METRICS.map(metric => `${metric}_unit VARCHAR(${UNIT_WIDTH})`)
  ].join(', ');

  return DS_LEVELS.map(
    level =>
      `CREATE STABLE IF NOT EXISTS ${DS_DATABASE}.${dsStableName(level)} (ts TIMESTAMP, ${columns}) TAGS (deviceId VARCHAR(${DEVICE_ID_WIDTH}))`
  );
}

/** 分钟级超表级 KEEP——重复设同一个值是空操作，可随建库脚本反复执行 */
export function alterDsMinuteKeepStatement(): string {
  return `ALTER STABLE ${DS_DATABASE}.${dsStableName('1m')} KEEP ${DS_MINUTE_KEEP_DAYS}`;
}

export interface StreamSpec {
  name: string;
  level: DsLevel;
  /** `PERIOD` 与 `INTERVAL` 共用的窗口串；日级带 8 小时位移 ⇒ 业务日从早 8 点起 */
  window: string;
}

/**
 * 三条**平级**流：都读原始超表——不是"在上一级输出表上再建流"。
 *
 * 全量写法每次触发都重扫源表，链式会把重扫代价逐级放大（决策 4 §13.4）。
 */
export const DS_STREAMS: readonly StreamSpec[] = [
  { name: 's_1m', level: '1m', window: '1m' },
  { name: 's_1h', level: '1h', window: '1h' },
  { name: 's_1d', level: '1d', window: '1d, 8h' }
];

/**
 * 建流语句。
 *
 * ⚠️ 四个必须照抄的细节，都是本机实测出来的：
 * - ⭐ **内层查询也要 `PARTITION BY tbname`**。流级 `PARTITION BY` 只管**输出路由**（一行进哪张
 *   子表），**不管聚合分组**——内层不写它，窗口聚合会跨全部子表算，每台设备都拿到**全表**的
 *   sum/count（实测：单台真值 202 行 / ~12500，落库却是 20234 / 1254819）。
 * - **流级分区写 `tbname, deviceId`**：只写 `tbname` 时标签表达式无源可用（`AS deviceId` 报
 *   16660「must use expr from partition or rollup list」），不写标签则报「tag name mismatch」。
 * - **计算子句写 `FROM <源表>`，不写 `FROM %%trows`**——后者不回填历史，且补传的数据会把
 *   已算过的窗口**静默写坏**（`v_cnt` 由 3 掉到 1，不报错）。
 * - **不加增量 `WHERE`**——`_tprev_localtime` 是**触发时刻**，拿它比数据的 `ts` 会把
 *   停机期间与补传的数据整段排除。
 */
export function createStreamStatement(spec: StreamSpec): string {
  const selectList = [
    '_wstart AS ts',
    ...RAW_METRICS.flatMap(metric => [
      `SUM(${metric}) AS sum_${metric}`,
      `COUNT(${metric}) AS count_${metric}`,
      `MIN(${metric}) AS min_${metric}`,
      `MAX(${metric}) AS max_${metric}`
    ]),
    // 单位随数据冻结在归档层：窗口内取最后一次上报的单位
    ...RAW_METRICS.map(metric => `LAST(${metric}_unit) AS ${metric}_unit`)
  ].join(',\n            ');

  return [
    `CREATE STREAM ${DS_DATABASE}.${spec.name}`,
    `  PERIOD(${spec.window})`,
    `  FROM ${RAW_DATABASE}.${RAW_STABLE}`,
    `  PARTITION BY tbname, deviceId`,
    `  INTO ${DS_DATABASE}.${dsStableName(spec.level)}`,
    `  TAGS (deviceId VARCHAR(${DEVICE_ID_WIDTH}) AS deviceId)`,
    `  AS SELECT ${selectList}`,
    `     FROM ${RAW_DATABASE}.${RAW_STABLE}`,
    `     PARTITION BY tbname`,
    `     INTERVAL(${spec.window})`
  ].join('\n');
}
