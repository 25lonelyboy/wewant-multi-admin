// TDengine「形态②」探针——增量 2 决策 2 §10 N2 遗留的两项关键行为。
//
// 背景：写入器选定的是「**不带 `USING`、写死子表名**」的 STMT1（决策 2 §9）——它保住了
//   「表存在 ⇔ 已注册」这条防线与缺子表的干净报错，代价是**每个子表一条语句**、
//   拿不到 §10 N1 实测的 5.5×。N2 形态②——`INSERT INTO <stb> (tbname, tag…, ts, …) VALUES (?,…)`
//   且 **`tbname` 作普通绑定参数**——有可能兼得，但两项行为未取到干净样本：
//     ① 子表**不存在**时：**报错**，还是**静默建表**？（静默建表会顶掉「表存在 ⇔ 已注册」）
//     ② 一次 `exec` 能否**覆盖多个子表**？（5.5× 的来源）
//
// 本探针只做测量、不改写入器。两条 STMT 路径都测，因为 §10 的 N4/N8/N9 已证明同一形态在两条
// 路径上表现不同：
//   - **STMT2**（连接器默认）——既有 `tdengine-stmt-probe.mjs` 走的路径；
//   - **STMT1**（写入器强制，`minStmt2Version` 抬到任何服务端版本都满足不了）——现实现走的路径。
//
// 放在 apps/nestjs-server/scripts/（同 `tdengine-stmt-probe.mjs`）——`@tdengine/websocket` 按
// catalog 规则只属于本应用，Node 从脚本所在目录向上解析依赖。
//
// 前提：127.0.0.1:6041 上有可连的 TDengine（taosAdapter）。
// 用法：node apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs
//       TD_DSN=ws://user:pass@host:6041 node apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs
//
// ⚠️ 它建**自己的临时库** `probe_stmt_tb`，跑完**整库删掉**（leave no trace）；同时快照
//   `wewant_iot` / `wewant_iot_ds` 的建表指纹，用于验证真实库未被波及。不要指向有数据的实例。

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sqlConnect, destroy, WSConfig } = require('@tdengine/websocket');

const DSN = process.env.TD_DSN ?? 'ws://root:taosdata@127.0.0.1:6041';
const DB = 'probe_stmt_tb';
const STB = 'meters';
const COLS = 'current float, voltage int, phase float';
const TAGS = 'location varchar(64), groupId int';
/** 真实库（只做前后指纹比对，绝不写入） */
const REAL_DBS = ['wewant_iot', 'wewant_iot_ds'];

/** 形态②（带 tags）：`tbname` 与 tags 都作普通列/绑定参数——决策 2 §10 N2 的 Java 示例形态 */
const SQL_WITH_TAGS = `INSERT INTO ${DB}.${STB} (tbname, location, groupId, ts, current, voltage, phase) VALUES (?, ?, ?, ?, ?, ?, ?)`;
/** 形态②（省略 tags）：子表已存在、标签已定时的理想形态（§6 轴 1 说省略 tags 可提速） */
const SQL_NO_TAGS = `INSERT INTO ${DB}.${STB} (tbname, ts, current, voltage, phase) VALUES (?, ?, ?, ?, ?)`;

/** 强制 STMT1：抬到任何服务端版本都满足不了 ⇒ 连接器不走 STMT2（与写入器 `writer.ts` 同一手法） */
const FORCE_STMT1_MIN_VERSION = '99.0.0.0';
const MODES = [
  { name: 'STMT2-default', minStmt2Version: undefined },
  { name: 'STMT1-forced', minStmt2Version: FORCE_STMT1_MIN_VERSION }
];

const results = [];
const json = v =>
  JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? `${x}n` : x));
const brief = e => {
  const m = e?.message ?? String(e);
  return m.length > 240 ? `${m.slice(0, 240)}…` : m;
};
const record = (name, verdict, detail) => {
  results.push({ name, verdict, mode: detail?.mode });
  console.log(
    `\n### ${name}\n  -> ${verdict}${detail === undefined ? '' : `\n  ${json(detail)}`}`
  );
};

/** 把一个抛出的对象拆成可核对的字段：构造器名 / code / message / code 属性是否存在 */
const describeError = e => ({
  constructor: e?.constructor?.name ?? typeof e,
  code: e?.code,
  codePresent: e !== null && e !== undefined && 'code' in Object(e),
  message: brief(e)
});

/** 连接一个库；`db === null` 时不带库名（用于建库 / 查 information_schema） */
function connTo(db, mode) {
  const url = db ? `${DSN}/${db}` : DSN;
  return sqlConnect(
    mode?.minStmt2Version
      ? new WSConfig(url, mode.minStmt2Version)
      : new WSConfig(url)
  );
}

async function query(sql, text) {
  const result = await sql.exec(text);
  return result.getData() ?? [];
}

/** 重建超表（清掉上一轮的子表与数据） */
async function reset() {
  const sql = await connTo(null);
  try {
    await sql.exec(`DROP STABLE IF EXISTS ${DB}.${STB}`);
    await sql.exec(
      `CREATE STABLE ${DB}.${STB} (ts timestamp, ${COLS}) TAGS (${TAGS})`
    );
  } finally {
    await sql.close();
  }
}

/** 当前库里挂在本超表下的子表名（落库状态） */
async function subtables() {
  const sql = await connTo(null);
  try {
    const rows = await query(
      sql,
      `SELECT table_name FROM information_schema.ins_tables WHERE db_name='${DB}'`
    );
    return rows.map(r => r[0]).sort();
  } finally {
    await sql.close();
  }
}

/** 真实库的建表指纹：`库: {超表: 子表数}`；只读，用于前后比对 */
async function realFingerprint() {
  const sql = await connTo(null);
  try {
    const out = {};
    for (const db of REAL_DBS) {
      const rows = await query(
        sql,
        `SELECT stable_name, COUNT(*) FROM information_schema.ins_tables WHERE db_name='${db}' GROUP BY stable_name`
      );
      out[db] = Object.fromEntries(rows.map(r => [r[0], r[1]]));
    }
    return out;
  } finally {
    await sql.close();
  }
}

const lastAffected = stmt => {
  try {
    return stmt.getLastAffected();
  } catch (e) {
    return `getLastAffected 抛错: ${brief(e)}`;
  }
};

/** Q1 用例：子表不存在时写一行，看是报错还是静默建表 */
async function caseMissingSubtable({ name, mode, sqlText, bind }) {
  await reset();
  const before = await subtables();
  const sql = await connTo(DB, mode);
  const stmt = await sql.stmtInit();
  let outcome;
  let step = 'stmtInit';
  try {
    step = 'prepare';
    await stmt.prepare(sqlText);
    step = 'bind';
    const params = stmt.newStmtParam();
    bind(params);
    await stmt.bind(params);
    step = 'batch';
    await stmt.batch();
    step = 'exec';
    await stmt.exec();
    outcome = { 抛出: false, getLastAffected: lastAffected(stmt) };
  } catch (e) {
    outcome = { 抛出: true, 抛出于: step, ...describeError(e) };
  } finally {
    try {
      await stmt.close();
    } catch {
      /* 关闭期错误不影响结论 */
    }
    try {
      await sql.close();
    } catch {
      /* 同上 */
    }
  }
  const after = await subtables();
  record(name, outcome.抛出 ? '报错' : '不报错', {
    mode: mode.name,
    语句: sqlText,
    结果: outcome,
    子表数前: before.length,
    子表数后: after.length,
    新建的子表: after.filter(s => !before.includes(s))
  });
}

/** Q2 用例：一次 exec 覆盖多个子表（tbname 作绑定参数，100 子表 × 5 行 = 500 行） */
async function caseMultiSubtableOneExec({ name, mode, sqlText, withTags }) {
  const SUBS = 100;
  const ROWS = 5;
  await reset();
  const admin = await connTo(null);
  try {
    for (let i = 0; i < SUBS; i++) {
      await admin.exec(
        `CREATE TABLE IF NOT EXISTS ${DB}.q2_${i} USING ${DB}.${STB} TAGS ('loc_${i}', ${i})`
      );
    }
  } finally {
    await admin.close();
  }

  const sql = await connTo(DB, mode);
  const stmt = await sql.stmtInit();
  const base = Date.now();
  const n = SUBS * ROWS;
  const tbname = Array.from({ length: n }, (_, j) => `q2_${j % SUBS}`);
  const ts = Array.from({ length: n }, (_, j) => base + j);
  const current = Array.from({ length: n }, (_, j) => 1.1 + (j % SUBS));
  const voltage = Array.from({ length: n }, (_, j) => 200 + (j % SUBS));
  const phase = Array.from({ length: n }, (_, j) => 0.2 + (j % SUBS));
  const location = Array.from({ length: n }, (_, j) => `loc_${j % SUBS}`);
  const groupId = Array.from({ length: n }, (_, j) => j % SUBS);

  let outcome;
  let step = 'stmtInit';
  const started = Date.now();
  try {
    step = 'prepare';
    await stmt.prepare(sqlText);
    step = 'bind';
    const params = stmt.newStmtParam();
    params.setVarchar(tbname); // ← tbname 作普通绑定参数，500 行里跨 100 个子表
    if (withTags) {
      params.setVarchar(location);
      params.setInt(groupId);
    }
    params.setTimestamp(ts);
    params.setFloat(current);
    params.setInt(voltage);
    params.setFloat(phase);
    await stmt.bind(params);
    step = 'batch';
    await stmt.batch();
    step = 'exec';
    await stmt.exec();
    outcome = {
      抛出: false,
      getLastAffected: lastAffected(stmt),
      耗时ms: Date.now() - started
    };
  } catch (e) {
    outcome = { 抛出: true, 抛出于: step, ...describeError(e) };
  } finally {
    try {
      await stmt.close();
    } catch {
      /* 关闭期错误不影响结论 */
    }
    try {
      await sql.close();
    } catch {
      /* 同上 */
    }
  }

  const checker = await connTo(DB, null);
  let landed;
  try {
    const rows = await query(checker, `SELECT COUNT(*) FROM ${DB}.${STB}`);
    landed = { 总行数: rows[0]?.[0] };
  } finally {
    await checker.close();
  }
  record(name, outcome.抛出 ? '报错' : '不报错', {
    mode: mode.name,
    子表数: SUBS,
    行数: n,
    语句: sqlText,
    结果: outcome,
    落库: landed
  });
}

/** Q2 对照：同样 500 行、逐子表 exec（100 次），与「一次 exec」比倍数（复刻 N1 的口径） */
async function caseMultiSubtablePerExec({ name, mode, sqlText, withTags }) {
  const SUBS = 100;
  const ROWS = 5;
  await reset();
  const admin = await connTo(null);
  try {
    for (let i = 0; i < SUBS; i++) {
      await admin.exec(
        `CREATE TABLE IF NOT EXISTS ${DB}.q2p_${i} USING ${DB}.${STB} TAGS ('loc_${i}', ${i})`
      );
    }
  } finally {
    await admin.close();
  }

  const sql = await connTo(DB, mode);
  const stmt = await sql.stmtInit();
  const base = Date.now();
  let outcome;
  let step = 'stmtInit';
  const started = Date.now();
  try {
    step = 'prepare';
    await stmt.prepare(sqlText);
    for (let i = 0; i < SUBS; i++) {
      step = `bind/exec #${i}`;
      const params = stmt.newStmtParam();
      params.setVarchar(Array.from({ length: ROWS }, () => `q2p_${i}`));
      if (withTags) {
        params.setVarchar(Array.from({ length: ROWS }, () => `loc_${i}`));
        params.setInt(Array.from({ length: ROWS }, () => i));
      }
      params.setTimestamp(
        Array.from({ length: ROWS }, (_, j) => base + i * ROWS + j)
      );
      params.setFloat(Array.from({ length: ROWS }, () => 1.1 + i));
      params.setInt(Array.from({ length: ROWS }, () => 200 + i));
      params.setFloat(Array.from({ length: ROWS }, () => 0.2 + i));
      await stmt.bind(params);
      await stmt.batch();
      await stmt.exec();
    }
    outcome = { 抛出: false, 耗时ms: Date.now() - started };
  } catch (e) {
    outcome = { 抛出: true, 抛出于: step, ...describeError(e) };
  } finally {
    try {
      await stmt.close();
    } catch {
      /* 关闭期错误不影响结论 */
    }
    try {
      await sql.close();
    } catch {
      /* 同上 */
    }
  }
  record(name, outcome.抛出 ? '报错' : '不报错', {
    mode: mode.name,
    语句: sqlText,
    结果: outcome
  });
}

async function main() {
  const boot = await connTo(null);
  try {
    console.log(
      `client @tdengine/websocket，server version: ${await boot.version()}`
    );
  } finally {
    await boot.close();
  }

  const fpBefore = await realFingerprint();
  console.log(`\n真实库指纹（前）：${json(fpBefore)}`);

  const setup = await connTo(null);
  try {
    await setup.exec(`DROP DATABASE IF EXISTS ${DB}`);
    await setup.exec(`CREATE DATABASE ${DB} KEEP 3650 DURATION 10 BUFFER 16`);
  } finally {
    await setup.close();
  }

  try {
    for (const mode of MODES) {
      // ── Q1 · 子表不存在时：报错还是静默建表？ ─────────────────────
      await caseMissingSubtable({
        name: `Q1a 形态②（带 tags）+ 子表不存在 [${mode.name}]`,
        mode,
        sqlText: SQL_WITH_TAGS,
        bind: p => {
          p.setVarchar(['q1a_new']);
          p.setVarchar(['loc_new']);
          p.setInt([7]);
          p.setTimestamp([Date.now()]);
          p.setFloat([1.1]);
          p.setInt([2]);
          p.setFloat([0.2]);
        }
      });
      await caseMissingSubtable({
        name: `Q1b 形态②（省略 tags）+ 子表不存在 [${mode.name}]`,
        mode,
        sqlText: SQL_NO_TAGS,
        bind: p => {
          p.setVarchar(['q1b_new']);
          p.setTimestamp([Date.now()]);
          p.setFloat([1.1]);
          p.setInt([2]);
          p.setFloat([0.2]);
        }
      });

      // ── Q2 · 一次 exec 能否覆盖多个子表？ ─────────────────────────
      await caseMultiSubtableOneExec({
        name: `Q2a 形态②（带 tags）一次 exec 跨 100 子表 [${mode.name}]`,
        mode,
        sqlText: SQL_WITH_TAGS,
        withTags: true
      });
      await caseMultiSubtableOneExec({
        name: `Q2b 形态②（省略 tags）一次 exec 跨 100 子表 [${mode.name}]`,
        mode,
        sqlText: SQL_NO_TAGS,
        withTags: false
      });

      // ── Q2 对照 · 逐子表 exec（复刻 N1 的 5.5× 口径）──────────────
      await caseMultiSubtablePerExec({
        name: `Q2c 形态②（省略 tags）逐子表 exec（100 次）[${mode.name}]`,
        mode,
        sqlText: SQL_NO_TAGS,
        withTags: false
      });
    }
  } finally {
    // 整库删掉——leave no trace
    const cleanup = await connTo(null);
    try {
      await cleanup.exec(`DROP DATABASE IF EXISTS ${DB}`);
    } finally {
      await cleanup.close();
    }
    const gone = await (async () => {
      const s = await connTo(null);
      try {
        const rows = await query(
          s,
          `SELECT COUNT(*) FROM information_schema.ins_databases WHERE name='${DB}'`
        );
        return rows[0]?.[0];
      } finally {
        await s.close();
      }
    })();
    console.log(`\n临时库 ${DB} 删除后仍存在的数量：${gone}（0 = 已删净）`);
  }

  const fpAfter = await realFingerprint();
  console.log(`真实库指纹（后）：${json(fpAfter)}`);
  console.log(
    `真实库指纹一致：${json(fpBefore) === json(fpAfter) ? '✅ 未变' : '❌ 有变化'}`
  );

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
