/**
 * 进 DDL 的标识符规则：属性 key（列名）与模型编码（超表名）。
 *
 * 两者都是**一旦有数据就改不动**的名字，校验必须在它们进入档案之前发生。规则见 D2 §1 / §2.6。
 *
 * ⚠️ 校验与归一化是**同一次调用**：返回 `{ ok, value }`，`value` 已折小写。分成
 * `isValid(raw)` 会让调用方忘记先归一化，从而把"大写 key 被判非法"或"大写 key 混进档案"
 * 两种错都放进来。
 */

/** 属性 key 长度上限：列名 64 减去最长的聚合前缀 `count_`（D2 §2.6 实测） */
export const MAX_METRIC_KEY_LENGTH = 58;

/** 模型编码长度上限：表名 192 预留 `_{deviceId}` 17 字符与降采样级后缀 3 字符（D2 §1） */
export const MAX_MODEL_CODE_LENGTH = 172;

/**
 * 必须禁用的 key——撞上超表自带的列。
 *
 * ⚠️ 存**归一化后**的形态：比对发生在折小写之后，写驼峰 `deviceId` 等于没禁
 * （TDengine 标识符不分大小写，`deviceid` 与 `deviceId` 是同一列）。
 */
export const RESERVED_METRIC_KEYS: readonly string[] = ['ts', 'deviceid'];

export type IdentifierFailure =
  /** 空串，或全是空白 */
  | 'empty'
  /** 小写字母开头，只含小写字母、数字、下划线 */
  | 'charset'
  /** 超长 */
  | 'too-long'
  /** 撞保留词 */
  | 'reserved';

export type IdentifierCheck =
  { ok: true; value: string } | { ok: false; reason: IdentifierFailure };

/** 归一化后的合法形态：小写字母开头，只含小写字母、数字、下划线 */
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

const RESERVED: ReadonlySet<string> = new Set(RESERVED_METRIC_KEYS);

function check(
  raw: string,
  maxLength: number,
  reserved: ReadonlySet<string> | null
): IdentifierCheck {
  const value = raw.trim().toLowerCase();
  if (value === '') return { ok: false, reason: 'empty' };
  // 长度先判：超长无论字符集如何都必须缩短，先报它更可操作
  if (value.length > maxLength) return { ok: false, reason: 'too-long' };
  if (!IDENTIFIER_PATTERN.test(value)) return { ok: false, reason: 'charset' };
  if (reserved !== null && reserved.has(value)) {
    return { ok: false, reason: 'reserved' };
  }
  return { ok: true, value };
}

/** 属性 key：D2 §2.6 的字符集、长度与保留词 */
export function checkMetricKey(raw: string): IdentifierCheck {
  return check(raw, MAX_METRIC_KEY_LENGTH, RESERVED);
}

/**
 * 模型编码：字符集与长度同 key，无保留词。
 *
 * 唯一性（全平台不重复）不在本函数——需要集合上下文，归注册流程。
 */
export function checkModelCode(raw: string): IdentifierCheck {
  return check(raw, MAX_MODEL_CODE_LENGTH, null);
}
