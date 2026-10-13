import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWriteError } from '../src/failure.js';
import { RAW_DATABASE } from '../src/schema.js';
import {
  RAW_CODEC,
  TdengineWriter,
  insertSql,
  MAX_BIND_ROWS,
  MAX_CONNECTIONS,
  type WriterConnect
} from '../src/tdengine/writer.js';

void test('insertSql：库限定 + 列名写死 + 占位符', () => {
  const sql = insertSql(RAW_DATABASE, 'aweawq05e8pf53wh_001', [
    'ts',
    'temperature',
    'temperature_unit'
  ]);
  assert.equal(
    sql,
    `INSERT INTO ${RAW_DATABASE}.aweawq05e8pf53wh_001 (ts, temperature, temperature_unit) VALUES (?, ?, ?)`
  );
  // STMT1 形态：不带 USING/tbname（那会静默建表，顶掉「表存在 ⇔ 已注册」）
  assert.doesNotMatch(sql, /USING|tbname/i);
});

void test('原始列描述：只写该行带了的测点，列类型随超级表', () => {
  const columns = RAW_CODEC.columns({
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1_791_818_580_000,
    metrics: { temperature: { value: 62.4, unit: '°C' } }
  });

  assert.deepEqual(
    columns.map(column => [column.name, column.kind]),
    [
      ['ts', 'timestamp'],
      ['temperature', 'float'],
      ['temperature_unit', 'varchar']
    ]
  );
});

void test('原始列描述：多测点列随之增多，签名按测点集合区分', () => {
  const row = {
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1_791_818_580_000,
    metrics: {
      temperature: { value: 62.4, unit: '°C' },
      current: { value: 4.31, unit: 'A' }
    }
  };
  assert.equal(RAW_CODEC.columns(row).length, 5); // ts + 2×(值+单位)
  assert.equal(RAW_CODEC.signature(row), 'temperature+current');
  // 只带一个测点的行与带两个测点的行分属不同签名 ⇒ 各自一条语句
  assert.equal(
    RAW_CODEC.signature({
      ...row,
      metrics: { temperature: { value: 1, unit: '°C' } }
    }),
    'temperature'
  );
});

void test('原始列描述：库名与子表名取自行', () => {
  const row = {
    subtable: 'aweawq05e8pf53wh_001',
    ts: 1,
    metrics: { temperature: { value: 1, unit: '°C' } }
  };
  assert.equal(RAW_CODEC.database, RAW_DATABASE);
  assert.equal(RAW_CODEC.subtable(row), 'aweawq05e8pf53wh_001');
});

// ---- 写入器（连接池 / 作废粒度 / 上限兜底）----

/** 一个连接器风格的错误（带数字 `code`，与实测抛出的对象同形） */
function codedError(name: string, code: number, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return Object.assign(error, { code });
}

/** stmt 替身：`exec` 可注入行为，`getLastAffected` 返回给定值（或按调用次序算） */
function fakeStmt(
  options: {
    exec?: () => Promise<void>;
    affected?: number | (() => number);
  } = {}
): unknown {
  return {
    prepare: () => Promise.resolve(),
    newStmtParam: () => ({
      setTimestamp: () => undefined,
      setFloat: () => undefined,
      setDouble: () => undefined,
      setBigint: () => undefined,
      setVarchar: () => undefined
    }),
    bind: () => Promise.resolve(),
    batch: () => Promise.resolve(),
    exec: options.exec ?? (() => Promise.resolve()),
    getLastAffected: () =>
      typeof options.affected === 'function'
        ? options.affected()
        : (options.affected ?? 1),
    close: () => Promise.resolve()
  };
}

/** 一条待写行 */
function row(
  ts: number,
  subtable = 'aweawq05e8pf53wh_001'
): {
  subtable: string;
  ts: number;
  metrics: { temperature: { value: number; unit: string } };
} {
  return {
    subtable,
    ts,
    metrics: { temperature: { value: 1, unit: '°C' } }
  };
}

void test('单次 bind 上限常量为 32767（行 2）', () => {
  assert.equal(MAX_BIND_ROWS, 32767);
});

void test('⭐ 多连接：一条失败被**单独**作废，写路径不被拖垮（行 1 + 行 5）', async () => {
  const slotError = codedError(
    'TaosResultError',
    108,
    'Invalid websocket connection'
  );
  let connects = 0;
  const closedSlots: number[] = [];
  const connect: WriterConnect = () => {
    const index = connects;
    connects += 1;
    // 槽 0 的连接首次写入失败；槽 1 正常
    return Promise.resolve({
      stmtInit: () =>
        Promise.resolve(
          fakeStmt(index === 0 ? { exec: () => Promise.reject(slotError) } : {})
        ),
      close: () => {
        closedSlots.push(index);
        return Promise.resolve();
      }
    } as never);
  };
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 2, connect);

  await assert.rejects(writer.write([row(1)]));
  assert.equal(classifyWriteError(slotError).connectionLevel, true);
  writer.invalidate();
  assert.deepEqual(closedSlots, [0], '只关闭失败的那条连接，不牵连槽 1');

  // 第二次写入落到槽 1，成功 ⇒ 单条连接挂掉没有让整条写路径停摆
  assert.equal(await writer.write([row(2)]), 1);
  assert.equal(connects, 2);
  await writer.close();
});

void test('⭐ 超时（105）不作废连接：连接是好的，不重连（行 5）', async () => {
  const timeout = codedError(
    'TDWebSocketClientError',
    105,
    'websocket query timeout'
  );
  let connects = 0;
  let closes = 0;
  const connect: WriterConnect = () => {
    connects += 1;
    return Promise.resolve({
      stmtInit: () =>
        Promise.resolve(fakeStmt({ exec: () => Promise.reject(timeout) })),
      close: () => {
        closes += 1;
        return Promise.resolve();
      }
    } as never);
  };
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 2, connect);

  await assert.rejects(writer.write([row(1)]));
  const failure = classifyWriteError(timeout);
  assert.equal(failure.connectionLevel, false);
  if (failure.connectionLevel) writer.invalidate(); // 调用方的门控：不作废
  assert.equal(closes, 0, '超时不得关闭连接');
  assert.equal(connects, 1, '超时不得触发重连');
  await writer.close();
});

void test('⭐ 作废会 close 掉旧连接（只置空引用会泄漏一条活连接）', async () => {
  const dead = codedError(
    'TaosResultError',
    108,
    'Invalid websocket connection'
  );
  let closes = 0;
  const connect: WriterConnect = () =>
    Promise.resolve({
      stmtInit: () =>
        Promise.resolve(fakeStmt({ exec: () => Promise.reject(dead) })),
      close: () => {
        closes += 1;
        return Promise.resolve();
      }
    } as never);
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 1, connect);

  await assert.rejects(writer.write([row(1)]));
  writer.invalidate();
  assert.equal(closes, 1, 'invalidate() 必须 close 旧连接，而不是只置空引用');
  await writer.close();
});

void test('⭐ 单组行数超 32767 ⇒ 响亮失败，不发出 bind（行 2 兜底）', async () => {
  let connects = 0;
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 1, () => {
    connects += 1;
    return Promise.reject(new Error('不该连接'));
  });
  const rows = Array.from({ length: MAX_BIND_ROWS + 1 }, (_, i) => row(i));
  await assert.rejects(writer.write(rows), /32767/);
  assert.equal(connects, 0, '应在建连 / bind 之前就挡下');
  await writer.close();
});

void test('⭐ 同一槽连续失败达上限 ⇒ 作废它重连（半开连接也能自愈）', async () => {
  // 槽 0 的连接"坏了但不报连接级码"（9730）；第二次落到它时按上限作废，之后重连恢复正常
  const deadish = codedError('TaosResultError', 9730, 'Invalid column name');
  let connects = 0;
  const closed: number[] = [];
  const connect: WriterConnect = () => {
    const index = connects;
    connects += 1;
    const dead = index === 0;
    return Promise.resolve({
      stmtInit: () =>
        Promise.resolve(
          fakeStmt(dead ? { exec: () => Promise.reject(deadish) } : {})
        ),
      close: () => {
        closed.push(index);
        return Promise.resolve();
      }
    } as never);
  };
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 2, connect);

  await assert.rejects(writer.write([row(1)])); // 槽 0 失败 #1（非连接级，调用方不作废）
  assert.equal(await writer.write([row(2)]), 1); // 槽 1 成功
  await assert.rejects(writer.write([row(3)])); // 槽 0 失败 #2 ⇒ 达上限 ⇒ 作废
  assert.deepEqual(closed, [0], '连续失败达上限即作废该槽（不靠错误码）');
  assert.equal(await writer.write([row(4)]), 1); // 槽 1 仍好
  // 再落到槽 0 ⇒ 因已作废而重连（connect #2，这次是好连接）
  assert.equal(await writer.write([row(5)]), 1);
  assert.equal(connects, 3, '作废后下一次落到该槽时重连');
  await writer.close();
});

void test('⭐ 作废/重连后计数清零：重连后的单次失败不作废（否则每次必作废）', async () => {
  // 同一格连续失败：第 2 次达上限作废重连；第 3 次（重连后首次）**不应**再作废
  let connects = 0;
  const closed: number[] = [];
  const connect: WriterConnect = () => {
    const index = connects;
    connects += 1;
    return Promise.resolve({
      stmtInit: () =>
        Promise.resolve(
          fakeStmt({
            exec: () =>
              Promise.reject(
                codedError('TDWebSocketClientError', 105, 'timeout')
              )
          })
        ),
      close: () => {
        closed.push(index);
        return Promise.resolve();
      }
    } as never);
  };
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 1, connect);

  await assert.rejects(writer.write([row(1)])); // 连续失败 #1
  await assert.rejects(writer.write([row(2)])); // 连续失败 #2 ⇒ 达上限 ⇒ 作废
  assert.deepEqual(closed, [0], '第 2 次连续失败才作废');
  await assert.rejects(writer.write([row(3)])); // 重连后首次失败 ⇒ 计数从 0 起 ⇒ **不**作废
  assert.deepEqual(closed, [0], '重连后计数清零，单次失败不再作废');
  await assert.rejects(writer.write([row(4)])); // 重连后第 2 次连续失败 ⇒ 再次作废
  assert.deepEqual(closed, [0, 1], '再次连中两次才作废');
  await writer.close();
});

void test('⭐ 交替成功 ⇒ 连续失败计数重置，好连接不被作废', async () => {
  const timeout = codedError('TDWebSocketClientError', 105, 'timeout');
  let connects = 0;
  let closes = 0;
  let n = 0;
  const connect: WriterConnect = () => {
    connects += 1;
    return Promise.resolve({
      stmtInit: () =>
        Promise.resolve(
          fakeStmt({
            // 奇数调用失败、偶数调用成功 ⇒ 失败不连续，计数应被成功重置
            exec: () => {
              n += 1;
              return n % 2 === 1 ? Promise.reject(timeout) : Promise.resolve();
            }
          })
        ),
      close: () => {
        closes += 1;
        return Promise.resolve();
      }
    } as never);
  };
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 1, connect);

  await assert.rejects(writer.write([row(1)])); // 失败 #1
  assert.equal(await writer.write([row(2)]), 1); // 成功 ⇒ 重置
  await assert.rejects(writer.write([row(3)])); // 失败 #1（重置后）
  assert.equal(await writer.write([row(4)]), 1); // 成功 ⇒ 重置
  assert.equal(closes, 0, '失败从不连续 ⇒ 好连接从不被作废');
  assert.equal(connects, 1, '一直复用同一条连接');
  await writer.close();
});

void test('连接数超出范围 ⇒ 构造即失败（有界，不静默建 N 格）', () => {
  assert.throws(() => new TdengineWriter('ws://x', RAW_CODEC, 0));
  assert.throws(
    () => new TdengineWriter('ws://x', RAW_CODEC, MAX_CONNECTIONS + 1)
  );
  assert.throws(() => new TdengineWriter('ws://x', RAW_CODEC, 2.5));
  // 边界内可建
  assert.ok(new TdengineWriter('ws://x', RAW_CODEC, MAX_CONNECTIONS));
});

void test('多组写入返回各组 getLastAffected 之和（F1 部分成功不变式的算术）', async () => {
  // 两个子表 ⇒ 两组；组的 affected 依次为 1、2 ⇒ 合计 3
  const affects = [1, 2];
  let i = 0;
  const connect: WriterConnect = () =>
    Promise.resolve({
      stmtInit: () =>
        Promise.resolve(fakeStmt({ affected: () => affects[i++] ?? 0 })),
      close: () => Promise.resolve()
    } as never);
  const writer = new TdengineWriter('ws://x', RAW_CODEC, 1, connect);
  const rows = [
    row(1, 'aweawq05e8pf53wh_001'),
    row(2, 'zzzzzzzzzzzzzzzz_001'),
    row(3, 'zzzzzzzzzzzzzzzz_001')
  ];
  assert.equal(await writer.write(rows), 3, '两组 affected 应相加');
  await writer.close();
});
