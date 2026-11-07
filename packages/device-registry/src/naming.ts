/**
 * TDengine 库内表名的唯一出处。
 *
 * 建表端（server 注册路径）与对账端（worker 审计 / 降采样）共用这些函数：名字一旦分裂，
 * 改一处不会报错，只会把表建到别处去。
 */

/** 原始库：设备上报的遥测。KEEP 3 年（决策 4 轴 1） */
export const RAW_DATABASE = 'wewant_iot';
/** 降采样库：聚合结果。库级 KEEP 10 年；分钟级再靠**超表级** KEEP 收到 3 年 */
export const DS_DATABASE = 'wewant_iot_ds';
/** 分钟级只留 3 年——全案唯一的**超表级** KEEP（必须小于库级） */
export const DS_MINUTE_KEEP_DAYS = 1095;

/** 降采样三级——**同形**，只有窗口不同（跨级查询与再聚合才成立） */
export const DS_LEVELS = ['1m', '1h', '1d'] as const;
export type DsLevel = (typeof DS_LEVELS)[number];

/**
 * 原始超表名：即模型编码，折小写。
 *
 * ⚠️ **折小写必须与 `subtableName` 一致**：TDengine 存标识符时折小写，而审计拿
 * `information_schema` 里的小写名去比这些函数算出的期望名——一边折一边不折就会整片误报。
 */
export function rawStableName(modelCode: string): string {
  return modelCode.toLowerCase();
}

/**
 * 子表名：`{模型编码}_{deviceId}`。
 *
 * ⚠️ TDengine 的标识符**不分大小写、存储时折成小写** ⇒ 这里直接给折小写后的形态，
 * 建表脚本与写入端才拿到同一个字符串。**标签值不折**，设备标识仍以原样入标签。
 */
export function subtableName(modelCode: string, deviceId: string): string {
  return `${modelCode}_${deviceId}`.toLowerCase();
}

/** 降采样超表名：`{模型编码}_{级别}`，折小写（同 `rawStableName`） */
export function dsStableName(modelCode: string, level: DsLevel): string {
  return `${modelCode}_${level}`.toLowerCase();
}

/** 降采样子表名的级别后缀——命名约定的唯一出处（建表端与对账报告共用，勿各处重打） */
export function dsLevelSuffix(level: DsLevel): string {
  return `_${level}`;
}

/**
 * 降采样子表名：`{name}_{level}`（`name` 即原始库的子表名，折小写）。
 *
 * ⚠️ **级别必须进名**：三张超表同库，而 TDengine 的子表名**库内唯一**——同名子表只能挂一张
 * 超表，否则报 `Table already exists in other stables`。建表端与写入端复用本函数，命名只此一处。
 */
export function dsSubtableName(name: string, level: DsLevel): string {
  return `${name}${dsLevelSuffix(level)}`;
}
