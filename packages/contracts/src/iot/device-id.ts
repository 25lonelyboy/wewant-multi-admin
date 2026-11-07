/**
 * 设备侧编号（`localDeviceId`）的 P1 约定。
 *
 * 平台签发的 `deviceId` **不下发设备**，设备只报一个自己稳定的本地编号。模拟器与设备档案
 * （`device-registry` 包）**共用本函数**生成这个编号——一处定义，不靠事后断言对齐。
 */

/** 编号补零宽度：`sim-001` */
export const LOCAL_DEVICE_ID_PAD = 3;

/** 第 `index` 台模拟设备的本地编号（`index` 从 1 起）：`sim-001` … `sim-NNN` */
export function localDeviceIdForIndex(index: number): string {
  return `sim-${String(index).padStart(LOCAL_DEVICE_ID_PAD, '0')}`;
}

/**
 * 本地编号的规范化：去首尾空白 + 统一小写。
 *
 * 只处理**同一台设备前后不一致**（决策 1 §8.3 规则 4）；设备之间编号不同不管——那正是
 * "设备自报编号"这个模型要支持的。主题段与载荷值的比对、档案查表的键，都要先过这一步。
 */
export function normalizeLocalId(value: string): string {
  return value.trim().toLowerCase();
}

/** 本地编号长度上限（归一化后） */
export const LOCAL_DEVICE_ID_MAX_LENGTH = 64;

/** 归一化后的合法形态：小写字母或数字开头，只含小写字母、数字与 `.` `_` `:` `-` */
const LOCAL_DEVICE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;

export type LocalDeviceIdFailure = 'empty' | 'too-long' | 'invalid-char';

export type LocalDeviceIdCheck =
  { ok: true; value: string } | { ok: false; reason: LocalDeviceIdFailure };

/**
 * 本地编号的标识符校验：它要进 MQTT 主题段与 HTTP 路径，不许出现 `/`、`?`、空白等字符。
 *
 * 校验与归一化是同一次调用（同 `device-registry` 的标识符函数）：大写先折小写、
 * 不拒绝；返回的 `value` 才是应当落库与拼 URL 的形态。
 */
export function checkLocalDeviceId(raw: string): LocalDeviceIdCheck {
  const value = normalizeLocalId(raw);
  if (value === '') return { ok: false, reason: 'empty' };
  // 长度先判：超长无论字符集如何都必须缩短，先报它更可操作
  if (value.length > LOCAL_DEVICE_ID_MAX_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  if (!LOCAL_DEVICE_ID_PATTERN.test(value)) {
    return { ok: false, reason: 'invalid-char' };
  }
  return { ok: true, value };
}
