import {
  DS_DATABASE,
  DS_LEVELS,
  DS_MINUTE_KEEP_DAYS,
  RAW_DATABASE,
  dsStableName,
  dsSubtableName,
  rawStableName,
  type SubtableRef
} from '@multi-admin/device-registry';

// 库名与分钟级 KEEP 的唯一出处在 device-registry；此处转发，供 worker 内部与建表脚本沿用。
export { DS_DATABASE, DS_MINUTE_KEEP_DAYS, RAW_DATABASE };

/**
 * 单次 `bind` 的行数上限 = 2¹⁵−1（本机探针实测：32767 行成功、32768 行报
 * `bind number out of range or not match`，与列数无关）。`INGEST_BATCH_SIZE` 超出它会在
 * 写入时才炸——故配置层据此在启动时挡下，写入层再兜一道。
 */
export const MAX_BIND_ROWS = 32767;

export const RAW_KEEP_DAYS = 1095;
export const DS_KEEP_DAYS = 3650;
/** 每个数据文件的跨度：`KEEP` 到期以它为粒度发生 */
export const DURATION_DAYS = 10;

/** 设备标识宽度：决策 1 §8.2 的 16 位 */
const DEVICE_ID_WIDTH = 16;

/** 建库语句——两个库，幂等 */
export function createDatabaseStatements(): string[] {
  return [
    `CREATE DATABASE IF NOT EXISTS ${RAW_DATABASE} PRECISION 'ms' KEEP ${RAW_KEEP_DAYS} DURATION ${DURATION_DAYS}`,
    `CREATE DATABASE IF NOT EXISTS ${DS_DATABASE} PRECISION 'ms' KEEP ${DS_KEEP_DAYS} DURATION ${DURATION_DAYS}`
  ];
}

/**
 * 原始超表（一台设备对应模型一张）：`ts` + 每测点值列；标签只留 `deviceId`。
 *
 * ⚠️ 仅供 **dev-only** 建表脚本（`scripts/tdengine-init.ts`）使用；运行期档案来自快照。
 */
export function createRawStableStatement(
  modelCode: string,
  metrics: readonly string[]
): string {
  const columns = metrics.map(metric => `${metric} FLOAT`).join(', ');
  return `CREATE STABLE IF NOT EXISTS ${RAW_DATABASE}.${rawStableName(modelCode)} (ts TIMESTAMP, ${columns}) TAGS (deviceId VARCHAR(${DEVICE_ID_WIDTH}))`;
}

/**
 * 子表：**一台设备一张表**，挂在它模型编码对应的原始超表下。
 *
 * ⚠️ 表名用折小写形态；**标签值保留原样**——TDengine 标识符不分大小写、标签值分。
 */
export function createSubtableStatement(subtable: SubtableRef): string {
  return `CREATE TABLE IF NOT EXISTS ${RAW_DATABASE}.${subtable.name} USING ${RAW_DATABASE}.${rawStableName(subtable.modelCode)} TAGS ('${subtable.deviceId}')`;
}

/** 降采样超表：每测点四个**可再聚合量**（dev-only 脚本用） */
export function createDsStableStatements(
  modelCode: string,
  metrics: readonly string[]
): string[] {
  const columns = metrics
    .flatMap(metric => [
      `sum_${metric} DOUBLE`,
      `count_${metric} BIGINT`,
      `min_${metric} FLOAT`,
      `max_${metric} FLOAT`
    ])
    .join(', ');

  return DS_LEVELS.map(
    level =>
      `CREATE STABLE IF NOT EXISTS ${DS_DATABASE}.${dsStableName(modelCode, level)} (ts TIMESTAMP, ${columns}) TAGS (deviceId VARCHAR(${DEVICE_ID_WIDTH}))`
  );
}

/** 分钟级超表级 KEEP——重复设同一个值是空操作，可随建库脚本反复执行 */
export function alterDsMinuteKeepStatement(modelCode: string): string {
  return `ALTER STABLE ${DS_DATABASE}.${dsStableName(modelCode, '1m')} KEEP ${DS_MINUTE_KEEP_DAYS}`;
}

/**
 * 降采样子表：每设备每级一张，表名见 `dsSubtableName`。
 *
 * ⚠️ 表名与标签值的写法同 `createSubtableStatement`：表名折小写，**标签值保留原样**。
 */
export function createDsSubtableStatements(subtable: SubtableRef): string[] {
  return DS_LEVELS.map(
    level =>
      `CREATE TABLE IF NOT EXISTS ${DS_DATABASE}.${dsSubtableName(subtable.name, level)} USING ${DS_DATABASE}.${dsStableName(subtable.modelCode, level)} TAGS ('${subtable.deviceId}')`
  );
}
