import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnrecoverableError } from 'bullmq';
import {
  classifyWriteError,
  isConnectionLevel,
  UnrecoverableWriteError
} from '../src/failure.js';

/** 造一个连接器风格的错误：带数字 `code` 与 `name`（与实测抛出的对象同形） */
function codedError(name: string, code: number, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

void test('A 类 · 连接建立失败（码 104）⇒ 可重试，不提级', () => {
  const c = classifyWriteError(
    codedError('TDWebSocketClientError', 104, 'connection creation failed')
  );
  assert.equal(c.kind, 'retryable');
  assert.equal(c.code, 104);
  assert.equal(c.elevated, false);
  assert.equal(c.basis, 'code');
});

void test('A 类 · 连接已关（码 108）⇒ 可重试', () => {
  const c = classifyWriteError(
    codedError('TaosResultError', 108, 'Invalid websocket connection')
  );
  assert.equal(c.kind, 'retryable');
});

void test('A 类 · 读超时（码 105）⇒ 可重试——可能已成功，不能丢弃', () => {
  const c = classifyWriteError(
    codedError('TDWebSocketClientError', 105, 'websocket query timeout')
  );
  assert.equal(c.kind, 'retryable');
});

void test('B 类 · 绑定越界（码 566）⇒ 重试无意义，不提级', () => {
  const c = classifyWriteError(
    codedError(
      'WebSocketInterfaceError',
      566,
      'bind number out of range or not match'
    )
  );
  assert.equal(c.kind, 'unrecoverable');
  assert.equal(c.code, 566);
  assert.equal(c.elevated, false);
});

void test('B 类 · 非法列名（码 9730）⇒ 重试无意义', () => {
  const c = classifyWriteError(
    codedError('TaosResultError', 9730, 'Invalid column name: no_such_col')
  );
  assert.equal(c.kind, 'unrecoverable');
});

void test('⭐ 提级 · Table does not exist（码 9731）⇒ B 类且提级', () => {
  const c = classifyWriteError(
    codedError('WebSocketInterfaceError', 9731, 'Table does not exist')
  );
  assert.equal(c.kind, 'unrecoverable');
  assert.equal(c.code, 9731);
  assert.equal(c.elevated, true);
});

void test('⭐ 提级 · 不带错误码的 C 源码路径 ⇒ B 类且提级（按报文形态）', () => {
  // 决策 2 §10 N4 的形态：STMT2 写死表名时子表列解析失败，报文是 C 源码路径，无 code
  const error = new Error(
    '../../../../../source/taos-community/source/client/src/clientStmt2.c[4946]stmtGetStbColFields2():'
  );
  const c = classifyWriteError(error);
  assert.equal(c.kind, 'unrecoverable');
  assert.equal(c.code, undefined);
  assert.equal(c.elevated, true);
  assert.equal(c.basis, 'message');
});

void test('判不出形态 ⇒ 默认可重试（C10：宁可重投也不丢）', () => {
  const c = classifyWriteError(new Error('something unexpected'));
  assert.equal(c.kind, 'retryable');
  assert.equal(c.basis, 'default');
});

void test('UnrecoverableWriteError 是 BullMQ 认的 UnrecoverableError，且可再次分类', () => {
  const original = codedError(
    'WebSocketInterfaceError',
    9731,
    'Table does not exist'
  );
  const failure = classifyWriteError(original);
  const wrapped = new UnrecoverableWriteError(failure, original);
  assert.ok(wrapped instanceof UnrecoverableError);
  assert.equal(classifyWriteError(wrapped).elevated, true);
  assert.match(wrapped.message, /Table does not exist/);
  assert.match(wrapped.message, /code=9731/);
});

// ---- 行 5：连接级判定（比 A 类更窄，实测决定）----
// 实测（3.4.2.8 + @tdengine/websocket 3.5.0）：作废后仍健康与否决定归类。
// 108（连接已关）实测 DEAD；9731 / 566 / 65535 / 9730 之后连接仍 HEALTHY。

void test('⭐ 连接级 · 连接已关（108）⇒ 连接已废，须作废', () => {
  const error = codedError(
    'TaosResultError',
    108,
    'Invalid websocket connection'
  );
  assert.equal(classifyWriteError(error).connectionLevel, true);
  assert.equal(isConnectionLevel(error), true);
});

void test('连接级 · 连接建立失败（104）⇒ 无可用的连接', () => {
  assert.equal(
    isConnectionLevel(
      codedError(
        'TDWebSocketClientError',
        104,
        'connection creation failed, dsn:{…}'
      )
    ),
    true
  );
});

void test('⭐ 连接级 · 读超时（105）是 A 类但**不是**连接级——连接是好的', () => {
  const c = classifyWriteError(
    codedError('TDWebSocketClientError', 105, 'websocket query timeout')
  );
  assert.equal(c.kind, 'retryable');
  assert.equal(
    c.connectionLevel,
    false,
    '超时"可能已成功"，但连接没坏，不该作废'
  );
});

void test('连接级 · 连接数上限（110）不是连接级', () => {
  assert.equal(
    isConnectionLevel(
      codedError(
        'TDWebSocketClientError',
        110,
        'websocket connect arrived limited'
      )
    ),
    false
  );
});

void test('连接级 · 数据 / 结构类（9731 / 566 / 9730 / 65535）都不是连接级', () => {
  for (const [name, code] of [
    ['WebSocketInterfaceError', 9731],
    ['WebSocketInterfaceError', 566],
    ['TaosResultError', 9730],
    ['WebSocketInterfaceError', 65535]
  ] as const) {
    assert.equal(
      isConnectionLevel(codedError(name, code, 'x')),
      false,
      `码 ${code} 不该判为连接级`
    );
  }
});

void test('连接级 · 判不出形态的默认桶不证明连接坏了 ⇒ 不是连接级', () => {
  assert.equal(isConnectionLevel(new Error('something unexpected')), false);
});

void test('连接级 · 不带码时按报文形态命中（Failed to reconnect）', () => {
  assert.equal(
    isConnectionLevel(
      new Error('Failed to reconnect to any available address')
    ),
    true
  );
});
