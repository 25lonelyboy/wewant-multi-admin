// TDengine WebSocket 连接器（@tdengine/websocket）STMT 写入形态探针。
//
// 回答增量 2 决策卡第 2 项里"直接决定实现形态"的那几条：
//   A 一次 exec 能不能跨多个子表（高基数下的批形态）
//   B 跨子表的两种写法：setTableName() 还是 tbname 作绑定参数
//   C 子表不存在时：USING 语法会不会自动建表（"预建当防线"的前提）
//   D 单次 bind/exec 的行数上限
//   E 出错时是抛异常还是返回错误码
//   F setTimestamp() 收不收 epoch 毫秒数字
//
// 放在 apps/nestjs-server/scripts/ 下（而不是 scripts/probe/）——消费者将来在本应用内，
// `@tdengine/websocket` 按 catalog 规则只属于本应用；Node 从脚本所在目录向上解析依赖。
//
// 前提：127.0.0.1:6041 上有一个可连的 TDengine（taosAdapter）。
//       `bash scripts/probe/tdengine-container.sh --no-probe` 可以起一个临时的。
//
// 用法：node apps/nestjs-server/scripts/tdengine-stmt-probe.mjs
//       TD_DSN=ws://user:pass@host:6041 node apps/nestjs-server/scripts/tdengine-stmt-probe.mjs
//
// 探针会建一个自己的库 probe_stmt，并反复重建其中的超表；不要指向有数据的实例。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sqlConnect, destroy, WSConfig } = require('@tdengine/websocket');

const DSN = process.env.TD_DSN ?? 'ws://root:taosdata@127.0.0.1:6041';
const DB = 'probe_stmt';
const STB = 'meters';
const COLS = 'current float, voltage int, phase float';
const INSERT_BY_NAME = `INSERT INTO ? USING ${DB}.${STB} (location, groupId) TAGS (?, ?) VALUES (?, ?, ?, ?)`;

const results = [];
const json = v =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
const brief = e => {
  const m = e?.message ?? String(e);
  return m.length > 200 ? `${m.slice(0, 200)}…` : m;
};
const show = (name, verdict, detail) => {
  results.push({ name, verdict });
  console.log(
    `\n### ${name}\n  -> ${verdict}${detail === undefined ? '' : `\n  ${json(detail)}`}`
  );
};

const conn = () => sqlConnect(new WSConfig(`${DSN}/${DB}`));
const rootConn = () => sqlConnect(new WSConfig(DSN));

async function query(sql, text) {
  const result = await sql.exec(text);
  return result.getData() ?? [];
}

/** 重建超表（清掉上一轮的子表与数据）。 */
async function reset() {
  const sql = await rootConn();
  try {
    await sql.exec(`DROP STABLE IF EXISTS ${DB}.${STB}`);
    await sql.exec(
      `CREATE STABLE ${DB}.${STB} (ts timestamp, ${COLS}) TAGS (location varchar(64), groupId int)`
    );
  } finally {
    await sql.close();
  }
}

async function layout(sql) {
  const bySub = await query(
    sql,
    `SELECT tbname, COUNT(*) FROM ${DB}.${STB} GROUP BY tbname`
  );
  const total = await query(sql, `SELECT COUNT(*) FROM ${DB}.${STB}`);
  return { 子表: bySub.map(r => `${r[0]}=${r[1]}`), 总行数: total[0]?.[0] };
}

/** 往一个 stmt 句柄里绑定一批行（不 exec）。 */
async function bindRows(stmt, rows, withAllCols = true) {
  const base = Date.now() - rows * 1000;
  const ts = Array.from({ length: rows }, (_, j) => base + j * 1000);
  const params = stmt.newStmtParam();
  params.setTimestamp(ts);
  params.setFloat(ts.map(() => 1.1));
  if (withAllCols) {
    params.setInt(ts.map(() => 200));
    params.setFloat(ts.map(() => 0.2));
  }
  await stmt.bind(params);
  await stmt.batch();
}

async function main() {
  const boot = await rootConn();
  try {
    console.log(
      `client @tdengine/websocket，server version: ${await boot.version()}`
    );
    await boot.exec(`DROP DATABASE IF EXISTS ${DB}`);
    await boot.exec(`CREATE DATABASE ${DB} KEEP 3650 DURATION 10 BUFFER 16`);
  } finally {
    await boot.close();
  }

  // ── A · 一次 exec 跨多个子表 ──────────────────────────────────────
  {
    const SUBS = 100;
    const ROWS = 5;
    await reset();
    let oneExecMs = null;
    let oneExecAffected = null;
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      try {
        await stmt.prepare(INSERT_BY_NAME);
        const started = Date.now();
        for (let i = 0; i < SUBS; i++) {
          await stmt.setTableName(`a_${i}`);
          const tags = stmt.newStmtParam();
          tags.setVarchar([`loc_${i}`]);
          tags.setInt([i]);
          await stmt.setTags(tags);
          await bindRows(stmt, ROWS);
        }
        await stmt.exec(); // ← 100 个子表，只 exec 一次
        oneExecMs = Date.now() - started;
        oneExecAffected = stmt.getLastAffected();
      } finally {
        await stmt.close();
        await sql.close();
      }
      const lay = await (async () => {
        const sql2 = await conn();
        try {
          return await layout(sql2);
        } finally {
          await sql2.close();
        }
      })();
      show(`A1 一次 exec 跨 ${SUBS} 子表 × ${ROWS} 行`, '可用', {
        耗时ms: oneExecMs,
        getLastAffected: oneExecAffected,
        落库: { 子表数: lay.子表.length, 总行数: lay.总行数 }
      });
    } catch (e) {
      show(`A1 一次 exec 跨 ${SUBS} 子表`, '失败', { error: brief(e) });
    }

    await reset();
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      let perExecMs;
      try {
        await stmt.prepare(INSERT_BY_NAME);
        const started = Date.now();
        for (let i = 0; i < SUBS; i++) {
          await stmt.setTableName(`a_${i}`);
          const tags = stmt.newStmtParam();
          tags.setVarchar([`loc_${i}`]);
          tags.setInt([i]);
          await stmt.setTags(tags);
          await bindRows(stmt, ROWS);
          await stmt.exec(); // ← 每个子表 exec 一次
        }
        perExecMs = Date.now() - started;
      } finally {
        await stmt.close();
        await sql.close();
      }
      show(`A2 同样数据，逐子表 exec（${SUBS} 次）`, '可用', {
        耗时ms: perExecMs,
        相对一次exec的倍数: oneExecMs
          ? +(perExecMs / oneExecMs).toFixed(1)
          : null
      });
    } catch (e) {
      show('A2 逐子表 exec', '失败', { error: brief(e) });
    }
  }

  // ── B · 两种跨子表写法 ───────────────────────────────────────────
  {
    await reset();
    // B1 · setTableName()
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      try {
        await stmt.prepare(INSERT_BY_NAME);
        await stmt.setTableName('b_by_name');
        const tags = stmt.newStmtParam();
        tags.setVarchar(['by_name']);
        tags.setInt([1]);
        await stmt.setTags(tags);
        const params = stmt.newStmtParam();
        params.setTimestamp([Date.now()]);
        params.setFloat([1]);
        params.setInt([2]);
        params.setFloat([3]);
        await stmt.bind(params);
        await stmt.batch();
        await stmt.exec();
        show('B1 setTableName() 指定子表', '可用', {
          getLastAffected: stmt.getLastAffected()
        });
      } finally {
        await stmt.close();
        await sql.close();
      }
    } catch (e) {
      show('B1 setTableName() 指定子表', '失败', { error: brief(e) });
    }
    // B2 · tbname 作普通绑定参数
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      try {
        await stmt.prepare(
          `INSERT INTO ${DB}.${STB} (tbname, location, groupId, ts, current, voltage, phase) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        const params = stmt.newStmtParam();
        params.setVarchar(['b_by_param']);
        params.setVarchar(['by_param']);
        params.setInt([2]);
        params.setTimestamp([Date.now()]);
        params.setFloat([1]);
        params.setInt([2]);
        params.setFloat([3]);
        await stmt.bind(params);
        await stmt.batch();
        await stmt.exec();
        show('B2 tbname 作普通绑定参数', '可用', {
          getLastAffected: stmt.getLastAffected()
        });
      } finally {
        await stmt.close();
        await sql.close();
      }
    } catch (e) {
      show('B2 tbname 作普通绑定参数', '失败', { error: brief(e) });
    }
  }

  // ── C · 子表不存在时的两种后果（"预建当防线"的前提）──────────────
  {
    await reset();
    // C1 · 带 USING
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      try {
        await stmt.prepare(INSERT_BY_NAME);
        await stmt.setTableName('c_using_brand_new');
        const tags = stmt.newStmtParam();
        tags.setVarchar(['new']);
        tags.setInt([9]);
        await stmt.setTags(tags);
        const params = stmt.newStmtParam();
        params.setTimestamp([Date.now()]);
        params.setFloat([9.9]);
        params.setInt([99]);
        params.setFloat([0.9]);
        await stmt.bind(params);
        await stmt.batch();
        await stmt.exec();
        const lay = await layout(sql);
        show('C1 USING 语法 + 全新子表名', '不报错', {
          getLastAffected: stmt.getLastAffected(),
          落库: lay
        });
      } finally {
        await stmt.close();
        await sql.close();
      }
    } catch (e) {
      show('C1 USING 语法 + 全新子表名', '报错', { error: brief(e) });
    }
    // C2 · 不带 USING，直接写具体子表名
    try {
      const sql = await conn();
      const stmt = await sql.stmtInit();
      try {
        await stmt.prepare(
          `INSERT INTO ${DB}.${STB}_absent (ts, current, voltage, phase) VALUES (?, ?, ?, ?)`
        );
        const params = stmt.newStmtParam();
        params.setTimestamp([Date.now()]);
        params.setFloat([1]);
        params.setInt([2]);
        params.setFloat([3]);
        await stmt.bind(params);
        await stmt.batch();
        await stmt.exec();
        show('C2 不带 USING + 子表不存在', '不报错（可疑）', {
          getLastAffected: stmt.getLastAffected()
        });
      } finally {
        await stmt.close();
        await sql.close();
      }
    } catch (e) {
      show('C2 不带 USING + 子表不存在', '报错', { error: brief(e) });
    }
  }

  // ── D · 单次 bind/exec 的行数上限 ────────────────────────────────
  for (const rows of [30000, 32767, 32768]) {
    await reset();
    const sql = await conn();
    const stmt = await sql.stmtInit();
    try {
      await stmt.prepare(INSERT_BY_NAME);
      await stmt.setTableName(`d_${rows}`);
      const tags = stmt.newStmtParam();
      tags.setVarchar(['cap']);
      tags.setInt([1]);
      await stmt.setTags(tags);
      const started = Date.now();
      await bindRows(stmt, rows);
      await stmt.exec();
      show(`D 单次 bind/exec ${rows} 行`, '成功', {
        耗时ms: Date.now() - started,
        getLastAffected: stmt.getLastAffected()
      });
    } catch (e) {
      show(`D 单次 bind/exec ${rows} 行`, '失败', { error: brief(e) });
    } finally {
      await stmt.close();
      await sql.close();
    }
  }

  // ── E · 出错时抛异常还是返回错误码 ───────────────────────────────
  {
    try {
      const sql = await conn();
      try {
        await sql.exec(`INSERT INTO ${DB}.${STB} (no_such_column) VALUES (1)`);
        show('E1 exec 遇 SQL 错', '未抛异常（可疑）');
      } finally {
        await sql.close();
      }
    } catch (e) {
      show('E1 exec 遇 SQL 错', '抛异常', {
        name: e?.constructor?.name,
        code: e?.code,
        message: brief(e)
      });
    }
  }

  console.log('\n\n================ 汇总 ================');
  for (const r of results) console.log(`${r.verdict}\t${r.name}`);

  try {
    destroy();
  } catch {
    /* 关闭期错误不影响结论 */
  }
  process.exit(0);
}

main().catch(e => {
  console.error('探针整体失败:', e);
  process.exit(1);
});
