import { UnrecoverableError } from 'bullmq';

/**
 * 写入失败的两分类：**A 类（可重试）**与 **B 类（重试无意义）**。
 *
 * 判据以**本机实测**（`@tdengine/websocket` 3.5.0 → TDengine 3.4.2.8）为准：
 *
 * | 情形 | 抛出的对象 | `code` | `message` |
 * | --- | --- | --- | --- |
 * | 连不上（`sqlConnect`） | `TDWebSocketClientError` | 104 | connection creation failed |
 * | 连接已关后写入 | `TaosResultError` | 108 | Invalid websocket connection |
 * | 子表不存在（STMT1，**本实现路径**） | `WebSocketInterfaceError` | 9731 | Table does not exist |
 * | 子表不存在（STMT2，非本实现路径） | `TaosResultError` | 555 | `clientStmt2.c[…]` C 源码路径 |
 * | 绑定行数越界 | `WebSocketInterfaceError` | 566 | bind number out of range or not match |
 * | 列数不匹配 | `WebSocketInterfaceError` | 65535 | stmt column count not match |
 * | 非法列名 | `TaosResultError` | 9730 | Invalid column name |
 *
 * ⚠️ **带码的按码判定，不带码的按报文形态判定**——上层包装（如 `Error.cause`）或 C 源码路径
 * 的裸 `Error` 都可能没有数字 `code`，只靠码会漏判。
 * ⚠️ 判不出形态时**默认按 A 类（可重试）**：重投在 `(子表, ts)` 幂等下是安全的，而把"可能
 * 没写进去"当成成功会丢数据（贯穿约束 C10）。
 */

export type FailureKind = 'retryable' | 'unrecoverable';

/** 归类依据——供日志与测试断言，不参与业务判断 */
export type FailureBasis = 'code' | 'message' | 'default';

export interface WriteFailure {
  kind: FailureKind;
  /** 连接器 / 服务端的错误码；不带码时为 `undefined` */
  code: number | undefined;
  /**
   * ⭐ **提级告警**：子表不可解析——预建遗漏或命名逻辑 bug，两者都是"平台侧自己错了"，
   * 告警级别须高于其它 B 类。
   */
  elevated: boolean;
  basis: FailureBasis;
}

/** A 类：连接 / 超时 / 资源——瞬时故障，重试可能自愈 */
const RETRYABLE_CODES: ReadonlySet<number> = new Set([
  104, // ERR_WEBSOCKET_CONNECTION_FAIL 连接建立失败（实测）
  105, // ERR_WEBSOCKET_QUERY_TIMEOUT 请求超时——可能已成功，**必须重试**（决策 2 §4.5）
  108, // ERR_CONNECTION_CLOSED 连接已关闭（实测 "Invalid websocket connection"）
  110, // ERR_WEBSOCKET_CONNECTION_ARRIVED_LIMIT 连接数到上限
  // 服务端连接 / 资源类（决策 2 §4.5 的官方错误码表；本机未复现，保留以覆盖其它服务端版本）
  0x8000000b,
  0x80000018,
  0x80000019,
  0x80000020,
  0x80000021,
  0x80000022,
  0x80000309,
  0x80000102,
  0x80000126
]);

/** B 类：格式 / 权限 / 表结构——重试多少次都一样 */
const UNRECOVERABLE_CODES: ReadonlySet<number> = new Set([
  100, // ERR_INVALID_PARAMS 非法参数
  106, // ERR_INVALID_AUTHENTICATION 认证失败
  107, // ERR_UNSUPPORTED_TDENGINE_TYPE 不支持的类型
  109, // ERR_INVALID_FETCH_MESSAGE_DATA 结果数据不合法
  555, // STMT2 写死表名时子表列解析失败（实测，报文为 C 源码路径）
  566, // bind 行数越界 / 列不匹配（实测）
  9730, // Invalid column name（实测）
  9731, // Table does not exist（实测）
  65535, // stmt column count not match（实测）
  // 服务端（决策 2 §4.5）
  0x80000127,
  0x80000618,
  0x80000303,
  0x8000030b,
  0x80000364,
  0x80000365
]);

/** 提级：子表不可解析。9731 = 本实现（STMT1）路径实测；0x80000618 = 官方错误码表口径 */
const TABLE_MISSING_CODES: ReadonlySet<number> = new Set([9731, 0x80000618]);

/**
 * 提级判定也可走报文——覆盖 §10 N4 的"不带错误码"形态，以及服务端版本换了码值时
 * 仍能按语义命中。
 */
const TABLE_MISSING_PATTERNS: readonly RegExp[] = [
  /Table does not exist/i,
  // STMT2 路径的 C 源码路径报文（实测 `clientStmt2.c[4946]stmtGetStbColFields2()`）——
  // 同一条件：子表不存在 ⇒ 列解析失败
  /clientStmt2\.c\[\d+\]/
];

/**
 * 报文形态兜底（错误没有已知码时用）。顺序：先 B 后 A——B 的报文通常更具体
 * （"Invalid column name" 同时含不了"connection"），把具体形态排在前面能减少歧义。
 */
const UNRECOVERABLE_PATTERNS: readonly RegExp[] = [
  /invalid column/i,
  /column count/i,
  /bind number out of range/i,
  /not match/i,
  /permission denied|no privilege|not authorized|authentication/i
];

const RETRYABLE_PATTERNS: readonly RegExp[] = [
  /connection (creation )?fail/i,
  /invalid websocket connection/i,
  /connection closed/i,
  /failed to (re)?connect/i,
  /timeout|timed out/i,
  /too many (session|connection)/i,
  /out of memory/i
];

function errorCode(error: unknown): number | undefined {
  if (error !== null && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'number') return code;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matches(message: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(message));
}

/**
 * 把一次写入失败归成 A / B 两类。带码走码，不带码走报文形态，都判不出则默认 A 类。
 */
export function classifyWriteError(error: unknown): WriteFailure {
  // 已经分类过的错误（B 类 fail-fast 时抛出的包装）直接取回原判定
  if (error instanceof UnrecoverableWriteError) return error.failure;

  const code = errorCode(error);
  const message = errorMessage(error);

  // ⭐ 提级判定先于普通 B 类：子表不可解析是"平台侧自己错了"，级别更高
  if (
    (code !== undefined && TABLE_MISSING_CODES.has(code)) ||
    matches(message, TABLE_MISSING_PATTERNS)
  ) {
    const byCode = code !== undefined && TABLE_MISSING_CODES.has(code);
    return {
      kind: 'unrecoverable',
      code,
      elevated: true,
      basis: byCode ? 'code' : 'message'
    };
  }

  if (code !== undefined && UNRECOVERABLE_CODES.has(code)) {
    return { kind: 'unrecoverable', code, elevated: false, basis: 'code' };
  }
  if (code !== undefined && RETRYABLE_CODES.has(code)) {
    return { kind: 'retryable', code, elevated: false, basis: 'code' };
  }

  if (matches(message, UNRECOVERABLE_PATTERNS)) {
    return { kind: 'unrecoverable', code, elevated: false, basis: 'message' };
  }
  if (matches(message, RETRYABLE_PATTERNS)) {
    return { kind: 'retryable', code, elevated: false, basis: 'message' };
  }

  // 判不出形态：宁可重投也不丢（C10）
  return { kind: 'retryable', code, elevated: false, basis: 'default' };
}

/**
 * B 类失败的队列侧载体：继承 BullMQ 的 `UnrecoverableError` ⇒ 处理器抛它时**不重试**，
 * 直接进 failed 集合（＝"待人工看"）。
 *
 * ⚠️ 它同时**保留原始错误**（`cause`）并**携带分类**（`failure`），否则 `worker.on('failed')`
 * 拿到的只是一个包装，看不到错误码、也判不出是否提级。
 */
export class UnrecoverableWriteError extends UnrecoverableError {
  constructor(
    readonly failure: WriteFailure,
    override readonly cause: unknown
  ) {
    const code = failure.code === undefined ? '' : ` [code=${failure.code}]`;
    super(`${errorMessage(cause)}${code}`);
  }
}
