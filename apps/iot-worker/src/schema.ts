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

/**
 * 降采样子表：每采集点每级一张，命名 `{deviceId}_{pointKey}_{level}`（折小写形态）。
 *
 * ⚠️ **级别必须进表名**：三张超表同库，而 TDengine 的子表名**库内唯一**——同名子表只能挂在
 * 一张超表下，否则第二张报 `Table already exists in other stables`。
 *
 * ⚠️ 表名与标签值的写法同 `createSubtableStatement`：表名折小写，**标签值保留原样**。
 */
export function createDsSubtableStatements(subtable: SubtableRef): string[] {
  return DS_LEVELS.map(
    level =>
      `CREATE TABLE IF NOT EXISTS ${DS_DATABASE}.${subtable.name}_${level} USING ${DS_DATABASE}.${dsStableName(level)} TAGS ('${subtable.deviceId}')`
  );
}
