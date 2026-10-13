import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWriteError } from '../src/failure.js';
import { RAW_DATABASE } from '../src/schema.js';
import {
  RAW_CODEC,
  TdengineWriter,
  insertSql,
  MAX_BIND_ROWS,
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

/** stmt 替身：`exec` 可注入行为，`getLastAffected` 返回给定行数 */
function fakeStmt(
  options: { exec?: () => Promise<void>; affected?: number } = {}
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
    getLastAffected: () => options.affected ?? 1,
    close: () => Promise.resolve()
  };
}

/** 一条待写行 */
function row(ts: number): {
  subtable: string;
  ts: number;
  metrics: { temperature: { value: number; unit: string } };
} {
  return {
    subtable: 'aweawq05e8pf53wh_001',
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
