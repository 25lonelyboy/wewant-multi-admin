// TDengine 生命周期探针：把决策卡第 4 项（数据生命周期）上几处"文档说不清、必须实测"的
// 行为跑一遍。与 tdengine-semantics.mjs 同一套底座与风格。
//
// 覆盖：社区版审计能力 / 建库参数能否后改 / 跨库查询 / 三级降采样链 / 窗口对齐时区
//
// 前提：本机 127.0.0.1:6041 上已有可用的 tdengine + taosAdapter
//
// 用法：node scripts/probe/tdengine-lifecycle.mjs

const BASE = process.env.TDENGINE_URL ?? 'http://127.0.0.1:6041';
const USER = process.env.TDENGINE_USER ?? 'root';
const PASS = process.env.TDENGINE_PASS ?? 'taosdata';
const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;

const DB_MAIN = 'probe_life';
const DB_AGG = 'probe_life_agg';
const DB_A = 'probe_xa';
const DB_B = 'probe_xb';

// ── REST 底座 ────────────────────────────────────────────────────────────

async function post(text) {
  const res = await fetch(`${BASE}/rest/sql`, {
    method: 'POST',
    headers: { Authorization: AUTH },
    body: text
  });
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`非 JSON 响应（HTTP ${res.status}）：${raw.slice(0, 200)}`);
  }
}

async function run(text) {
  const r = await post(text);
  if (r.code !== 0)
    throw new Error(`[code ${r.code}] ${r.desc}\n  ← ${text.slice(0, 160)}`);
  return r;
}

async function attempt(text) {
  try {
    const r = await post(text);
    return r.code === 0
      ? { ok: true, desc: 'OK', raw: r }
      : { ok: false, code: r.code, desc: r.desc, raw: r };
  } catch (e) {
    return { ok: false, code: 'ERR', desc: e.message };
  }
}

const results = [];
function record(id, title, detail) {
  results.push({ id, title, detail });
  console.log(`\n[${id}] ${title}\n    ${detail}`);
}

/** 读某个库的建库参数（避免用 keep/duration 做列名——它们是关键字） */
async function readDb(name) {
  const r = await attempt(
    `SELECT * FROM information_schema.ins_databases WHERE name='${name}'`
  );
  if (!r.ok) return JSON.stringify(r);
  const meta = r.raw.column_meta.map(c => c[0]);
  const row = r.raw.data?.[0] ?? [];
  const want = [
    'name',
    'keep',
    'duration',
    'precision',
    'buffer',
    'vgroups',
    'is_audit'
  ];
  const out = {};
  for (const k of want) {
    const i = meta.indexOf(k);
    if (i >= 0) out[k] = row[i];
  }
  return JSON.stringify(out) + `  ｜ 列清单=${meta.join(',')}`;
}

async function section(name) {
  console.log(`\n${'═'.repeat(72)}\n${name}\n${'═'.repeat(72)}`);
}

// ── 开始 ────────────────────────────────────────────────────────────────

const ver = await run('SELECT server_version()');
console.log(`TDengine: ${ver.data[0][0]}`);

// ═══ L1 社区版审计能力 ═══════════════════════════════════════════════════
await section('L1 社区版是否有审计能力');

const auditVars = await post("SHOW VARIABLES LIKE 'audit%'");
record(
  'L1.1',
  "SHOW VARIABLES LIKE 'audit%'",
  auditVars.code === 0
    ? `code=0，返回 ${auditVars.rows} 行：${JSON.stringify(auditVars.data)}`
    : `code=${auditVars.code} ${auditVars.desc}`
);

await attempt(`DROP DATABASE IF EXISTS ${DB_MAIN}_audit_a`);
const auditPlain = await attempt(
  `CREATE DATABASE ${DB_MAIN}_audit_a VGROUPS 1 IS_AUDIT 1`
);
record(
  'L1.2',
  'CREATE DATABASE … IS_AUDIT 1（不带加密子句）',
  JSON.stringify(auditPlain)
);

await attempt(`DROP DATABASE IF EXISTS ${DB_MAIN}_audit_b`);
const auditEnc = await attempt(
  `CREATE DATABASE ${DB_MAIN}_audit_b VGROUPS 1 IS_AUDIT 1 ENCRYPT_ALGORITHM 'SM4-CBC' WAL_LEVEL 2 PRECISION 'ns' KEEP 1825d`
);
record(
  'L1.3',
  'CREATE DATABASE … IS_AUDIT 1 + SM4-CBC（文档给的建法）',
  JSON.stringify(auditEnc)
);

const dbCols = await attempt(
  'SELECT * FROM information_schema.ins_databases LIMIT 1'
);
record(
  'L1.4',
  'ins_databases 列清单（看有没有 is_audit）',
  dbCols.ok
    ? dbCols.raw.column_meta.map(c => c[0]).join(',')
    : JSON.stringify(dbCols)
);

// 分离变量：社区版到底能不能建加密库（审计库的前提）
await attempt(`DROP DATABASE IF EXISTS ${DB_MAIN}_enc`);
const encOnly = await attempt(
  `CREATE DATABASE ${DB_MAIN}_enc ENCRYPT_ALGORITHM 'SM4-CBC'`
);
record(
  'L1.5',
  "CREATE DATABASE … ENCRYPT_ALGORITHM 'SM4-CBC'（只加密，不带 IS_AUDIT）",
  JSON.stringify(encOnly)
);

await attempt(`DROP DATABASE IF EXISTS ${DB_MAIN}_enc2`);
const encAes = await attempt(
  `CREATE DATABASE ${DB_MAIN}_enc2 ENCRYPT_ALGORITHM 'AES-128-CBC'`
);
record(
  'L1.6',
  "CREATE DATABASE … ENCRYPT_ALGORITHM 'AES-128-CBC'（换算法试）",
  JSON.stringify(encAes)
);

// ═══ L2 建库参数能否后改（KEEP / DURATION） ══════════════════════════════
await section('L2 建库参数能否后改');

await attempt(`DROP DATABASE IF EXISTS ${DB_MAIN}`);
await run(
  `CREATE DATABASE ${DB_MAIN} PRECISION 'ms' KEEP 365 DURATION 10 BUFFER 16`
);

const before = await readDb(DB_MAIN);
record('L2.1', '初始建库 KEEP 365 DURATION 10', before);

const alterKeep = await attempt(`ALTER DATABASE ${DB_MAIN} KEEP 1095`);
record(
  'L2.2',
  'ALTER DATABASE … KEEP 1095（能否后改保留期）',
  JSON.stringify(alterKeep)
);

const alterDur = await attempt(`ALTER DATABASE ${DB_MAIN} DURATION 30`);
record(
  'L2.3',
  'ALTER DATABASE … DURATION 30（能否后改文件跨度）',
  JSON.stringify(alterDur)
);

record('L2.4', '改动后读回', await readDb(DB_MAIN));

// KEEP 硬约束：KEEP >= 3 × DURATION
const badKeep = await attempt(`ALTER DATABASE ${DB_MAIN} KEEP 20`);
record(
  'L2.5',
  'ALTER DATABASE … KEEP 20（应违反 KEEP ≥ 3×DURATION）',
  JSON.stringify(badKeep)
);

// ═══ L3 降采样库：KEEP 10 年 ═════════════════════════════════════════════
await section('L3 另建降采样库，KEEP 3650（10 年）');

await attempt(`DROP DATABASE IF EXISTS ${DB_AGG}`);
const aggDb = await attempt(
  `CREATE DATABASE ${DB_AGG} PRECISION 'ms' KEEP 3650 DURATION 10 BUFFER 16`
);
record(
  'L3.1',
  'CREATE DATABASE probe_life_agg KEEP 3650 DURATION 10',
  JSON.stringify(aggDb)
);

record('L3.2', '降采样库读回', await readDb(DB_AGG));

// ═══ L4 跨库查询 ════════════════════════════════════════════════════════
await section('L4 跨库查询（聚合结果另建库后的查询代价）');

for (const db of [DB_A, DB_B]) {
  await attempt(`DROP DATABASE IF EXISTS ${db}`);
  await run(`CREATE DATABASE ${db} PRECISION 'ms' KEEP 365`);
  await run(`CREATE TABLE ${db}.t1 (ts TIMESTAMP, v DOUBLE)`);
}
const t0 = Date.now();
await run(`INSERT INTO ${DB_A}.t1 VALUES (${t0 - 60000}, 1.0), (${t0}, 2.0)`);
await run(`INSERT INTO ${DB_B}.t1 VALUES (${t0 - 60000}, 10.0), (${t0}, 20.0)`);

const crossUnion = await attempt(
  `SELECT * FROM ${DB_A}.t1 UNION ALL SELECT * FROM ${DB_B}.t1 ORDER BY ts`
);
record(
  'L4.1',
  '跨库 UNION ALL',
  crossUnion.ok
    ? `✅ 可用（row_count 见下）`
    : `❌ ${crossUnion.code} ${crossUnion.desc}`
);
if (crossUnion.ok) {
  const rows = await run(
    `SELECT * FROM ${DB_A}.t1 UNION ALL SELECT * FROM ${DB_B}.t1 ORDER BY ts`
  );
  record('L4.2', '跨库 UNION ALL 结果行数', String(rows.rows));
}

const crossJoin = await attempt(
  `SELECT a.ts, a.v AS va, b.v AS vb FROM ${DB_A}.t1 a, ${DB_B}.t1 b WHERE a.ts = b.ts`
);
record(
  'L4.3',
  '跨库 JOIN（同一 DB 内 JOIN 作对照）',
  JSON.stringify(crossJoin)
);

// ═══ L5 三级降采样链 ═════════════════════════════════════════════════════
await section('L5 三级降采样链：原始 → 分钟 → 小时（在输出表上再建流）');

await run(
  `CREATE STABLE IF NOT EXISTS ${DB_MAIN}.rawstb (ts TIMESTAMP, v DOUBLE) TAGS (dev VARCHAR(32))`
);
await run(
  `CREATE TABLE IF NOT EXISTS ${DB_MAIN}.raw USING ${DB_MAIN}.rawstb TAGS ('dev1')`
);

// 一级：原始 → 分钟均值（先建流，再写入，确保触发）
const s1 = await attempt(
  `CREATE STREAM ${DB_MAIN}.s_min PERIOD(10s) FROM ${DB_MAIN}.raw INTO ${DB_MAIN}.m1 AS SELECT _wstart AS ts, AVG(v) AS v_avg, SUM(v) AS v_sum, COUNT(v) AS v_cnt FROM ${DB_MAIN}.raw INTERVAL(1m)`
);
record('L5.1', '一级流：原始 → 分钟（同时产出 sum/count）', JSON.stringify(s1));

// 写入近 2 小时的一分钟粒度数据（用当前时间，避开 KEEP 边界）
const base = Date.now() - 2 * 3600 * 1000;
const rows = [];
for (let i = 0; i < 120; i++) {
  rows.push(`(${base + i * 60000}, ${(20 + Math.sin(i / 10) * 5).toFixed(3)})`);
}
await run(`INSERT INTO ${DB_MAIN}.raw VALUES ${rows.join(',')}`);

console.log('    …等待 45s 让一级流部署并计算…');
await new Promise(r => setTimeout(r, 45000));

const m1Rows = await attempt(`SELECT COUNT(*) AS n FROM ${DB_MAIN}.m1`);
record('L5.3', '分钟表 m1 行数（一级是否产出）', JSON.stringify(m1Rows));

// 二级：分钟表 → 小时表（链式）
const s2 = await attempt(
  `CREATE STREAM ${DB_MAIN}.s_hour PERIOD(10s) FROM ${DB_MAIN}.m1 INTO ${DB_MAIN}.h1 AS SELECT _wstart AS ts, SUM(v_sum) AS v_sum, SUM(v_cnt) AS v_cnt, AVG(v_avg) AS v_avg_naive FROM ${DB_MAIN}.m1 INTERVAL(1h)`
);
record('L5.2', '二级流：分钟表 → 小时表（链式）', JSON.stringify(s2));

console.log('    …等待 45s 让二级流部署并计算…');
await new Promise(r => setTimeout(r, 45000));

const showStreams = await attempt(`SHOW STREAMS`);
record(
  'L5.4',
  'SHOW STREAMS',
  showStreams.ok ? `code=0（有记录）` : JSON.stringify(showStreams)
);

const h1Rows = await attempt(`SELECT * FROM ${DB_MAIN}.h1 LIMIT 5`);
record('L5.5', '小时表 h1 内容（链式是否产出）', JSON.stringify(h1Rows));

// 校验：加权平均 vs 朴素平均（avg of avg 的坑）
const naive = await attempt(`SELECT AVG(v_avg) AS naive FROM ${DB_MAIN}.m1`);
const weighted = await attempt(
  `SELECT SUM(v_sum)/SUM(v_cnt) AS weighted FROM ${DB_MAIN}.m1`
);
record(
  'L5.6',
  '朴素平均 vs 加权平均（avg of avg 的偏差）',
  `naive=${JSON.stringify(naive)} weighted=${JSON.stringify(weighted)}`
);

// ═══ L6 窗口对齐与时区 ══════════════════════════════════════════════════
await section('L6 窗口对齐与时区');

const tz = await attempt(`SHOW VARIABLES LIKE 'timezone'`);
record('L6.1', "SHOW VARIABLES LIKE 'timezone'", JSON.stringify(tz));

const dayWin = await attempt(
  `SELECT _wstart, COUNT(*) AS n FROM ${DB_MAIN}.raw INTERVAL(1d)`
);
record(
  'L6.2',
  'INTERVAL(1d) 的窗口起点（看是否从本地 0 点切）',
  JSON.stringify(dayWin)
);

const hourWin = await attempt(
  `SELECT _wstart, COUNT(*) AS n FROM ${DB_MAIN}.raw INTERVAL(1h)`
);
record('L6.3', 'INTERVAL(1h) 的窗口起点', JSON.stringify(hourWin));

// ═══ 汇总 ═══════════════════════════════════════════════════════════════
await section('汇总');
for (const r of results) console.log(`${r.id}\t${r.title}`);
console.log(`\n共 ${results.length} 项。`);
