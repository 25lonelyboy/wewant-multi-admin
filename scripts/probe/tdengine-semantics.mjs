// TDengine 语义探针：把增量 2 决策卡上几处"文档说不清、必须实测"的行为跑一遍。
//
// 只依赖 Node 内建能力（global fetch），不引任何 TDengine 客户端——
// 走 taosAdapter 的 REST 接口（POST /rest/sql），探的是**服务端语义**，
// 与连接器无关；结论对 @tdengine/websocket 同样成立。
//
// 前提：本机 127.0.0.1:6041 上已有可用的 tdengine + taosAdapter
//       （scripts/probe/tdengine-container.sh 会负责起一个）
//
// 用法：
//   node scripts/probe/tdengine-semantics.mjs
//   TDENGINE_URL=http://127.0.0.1:6041 node scripts/probe/tdengine-semantics.mjs
//   PROBE_BIG_TABLES=200 PROBE_BIG_ROWS=5000 node scripts/probe/tdengine-semantics.mjs
//
// 注意：REST 接口是无状态的，USE 不生效——本脚本所有表名一律带库名前缀。

const BASE = process.env.TDENGINE_URL ?? 'http://127.0.0.1:6041';
const USER = process.env.TDENGINE_USER ?? 'root';
const PASS = process.env.TDENGINE_PASS ?? 'taosdata';
const AUTH = `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`;

const DB = 'probe_iot';
const BIG_TABLES = Number(process.env.PROBE_BIG_TABLES ?? 100);
const BIG_ROWS = Number(process.env.PROBE_BIG_ROWS ?? 2000);
const SMALL_TABLES = 1;
const SMALL_ROWS = 1000;
const INSERT_CHUNK = 1000; // 每批 INSERT 的行数（单条 SQL 上限约 4MB）

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

/** 执行并断言成功；失败抛出 */
async function run(text) {
  const r = await post(text);
  if (r.code !== 0) {
    throw new Error(`[code ${r.code}] ${r.desc}\n  ← ${text.slice(0, 160)}`);
  }
  return r;
}

/** 执行但不抛错，返回成败——用来探能力边界 */
async function attempt(text) {
  try {
    const r = await post(text);
    return r.code === 0
      ? { ok: true, desc: 'OK' }
      : { ok: false, code: r.code, desc: r.desc };
  } catch (e) {
    return { ok: false, code: 'EXC', desc: String(e.message).slice(0, 160) };
  }
}

/** 执行并返回行对象数组 */
async function rows(text) {
  const r = await run(text);
  const meta = r.column_meta ?? [];
  return (r.data ?? []).map(row =>
    Object.fromEntries(meta.map((c, i) => [c[0], row[i]]))
  );
}

async function timed(label, fn) {
  const t0 = performance.now();
  const value = await fn();
  const ms = performance.now() - t0;
  console.log(`    ${label}：${ms.toFixed(0)} ms`);
  return { ms, value };
}

// ── 报告口径 ─────────────────────────────────────────────────────────────

const summary = [];
function record(key, verdict, detail) {
  summary.push({ key, verdict, detail });
  const icon = { pass: '✅', fail: '❌', info: '📊' }[verdict] ?? '·';
  console.log(`  ${icon} ${key}：${detail}`);
}
const h1 = t => console.log(`\n${'═'.repeat(72)}\n${t}\n${'═'.repeat(72)}`);
const h2 = t => console.log(`\n── ${t}`);

// ── P1：省略列的写入语义（NULL 还是 NONE）────────────────────────────────

async function probeOmittedColumn() {
  h1('P1  省略列的写入语义：第二个报文会抹掉第一个报文吗？');

  await run(`DROP DATABASE IF EXISTS ${DB}`);
  await run(
    `CREATE DATABASE ${DB} PRECISION 'ms' KEEP 3650 DURATION 10 BUFFER 16`
  );
  await run(
    `CREATE STABLE ${DB}.sem (ts TIMESTAMP, v1 DOUBLE, v2 DOUBLE, v3 DOUBLE) TAGS (dev VARCHAR(32))`
  );

  const T0 = 1759747200000;

  // C1：先写整行，再写同一时间戳但只带 v1
  h2('C1  同一时间戳覆盖写：第二条只带 v1，v2/v3 保留旧值还是被抹成 NULL？');
  await run(
    `INSERT INTO ${DB}.c1 USING ${DB}.sem TAGS ('c1') VALUES (${T0}, 1.0, 2.0, 3.0)`
  );
  await run(`INSERT INTO ${DB}.c1 (ts, v1) VALUES (${T0}, 9.9)`);
  const c1 = (await rows(`SELECT ts, v1, v2, v3 FROM ${DB}.c1`))[0];
  const kept = c1.v2 === 2 && c1.v3 === 3;
  record(
    'P1-C1 省略列语义',
    'info',
    kept
      ? `保留旧值 → 省略＝NONE（v1=${c1.v1}, v2=${c1.v2}, v3=${c1.v3}）`
      : `被抹成 NULL → 省略＝NULL（v1=${c1.v1}, v2=${c1.v2}, v3=${c1.v3}）`
  );

  // C2：显式写 NULL 对照
  h2('C2  显式写 NULL 会怎样（与 C1 对照，用来确认 NONE 与 NULL 确实不同）');
  await run(
    `INSERT INTO ${DB}.c2 USING ${DB}.sem TAGS ('c2') VALUES (${T0}, 1.0, 2.0, 3.0)`
  );
  await run(`INSERT INTO ${DB}.c2 (ts, v1, v2) VALUES (${T0}, 9.9, NULL)`);
  const c2 = (await rows(`SELECT ts, v1, v2, v3 FROM ${DB}.c2`))[0];
  record(
    'P1-C2 显式 NULL',
    'info',
    `v1=${c2.v1}, v2=${c2.v2}, v3=${c2.v3}（v2 应为 NULL；v3 用于与 C1 对比）`
  );

  // C3：窄表分两条报文到齐（本项目最关心的形态）
  h2(
    'C3  同一 ts 分两条报文写：第一条只带 v1，第二条只带 v2（都用列清单，不写 NULL）'
  );
  await run(
    `INSERT INTO ${DB}.c3 USING ${DB}.sem (dev) TAGS ('c3') (ts, v1) VALUES (${T0}, 1.0)`
  );
  await run(
    `INSERT INTO ${DB}.c3 USING ${DB}.sem (dev) TAGS ('c3') (ts, v2) VALUES (${T0}, 2.0)`
  );
  const c3 = (await rows(`SELECT ts, v1, v2 FROM ${DB}.c3`))[0];
  record(
    'P1-C3 分次到齐',
    'info',
    `v1=${c3.v1}, v2=${c3.v2}` +
      (c3.v1 === 1 && c3.v2 === 2
        ? ' → 两列都在，分次写安全'
        : ' → 有一列丢了，分次写不安全')
  );

  // C4：自动建表路径是否同语义
  h2('C4  自动建表路径（USING ... TAGS）是否与 C1 同语义');
  await run(
    `INSERT INTO ${DB}.c4 USING ${DB}.sem TAGS ('c4') VALUES (${T0}, 1.0, 2.0, 3.0)`
  );
  await run(
    `INSERT INTO ${DB}.c4 USING ${DB}.sem (dev) TAGS ('c4') (ts, v1) VALUES (${T0}, 9.9)`
  );
  const c4 = (await rows(`SELECT ts, v1, v2, v3 FROM ${DB}.c4`))[0];
  record(
    'P1-C4 自动建表同语义',
    c1.v2 === c4.v2 && c1.v3 === c4.v3 ? 'pass' : 'fail',
    `v1=${c4.v1}, v2=${c4.v2}, v3=${c4.v3}（与 C1 一致）`
  );

  // C5：超表语法写入是否同语义
  h2('C5  超表语法写入（tbname + 列清单省略 v3）是否同语义');
  await run(
    `INSERT INTO ${DB}.sem (tbname, dev, ts, v1, v2, v3) VALUES ('c5', 'c5', ${T0}, 1.0, 2.0, 3.0)`
  );
  await run(
    `INSERT INTO ${DB}.sem (tbname, dev, ts, v1) VALUES ('c5', 'c5', ${T0}, 9.9)`
  );
  const c5 = (
    await rows(`SELECT ts, v1, v2, v3 FROM ${DB}.sem WHERE tbname = 'c5'`)
  )[0];
  record(
    'P1-C5 超表语法同语义',
    c1.v2 === c5.v2 && c1.v3 === c5.v3 ? 'pass' : 'fail',
    `v1=${c5.v1}, v2=${c5.v2}, v3=${c5.v3}（与 C1 一致）`
  );

  // C6：NONE 是"保留旧值"还是"整行不存在"——用 LAST 函数侧面看
  h2('C6  后续正常写入能否把 NONE 列带回来（排除"列为 NONE 就永远读不到"）');
  await run(`INSERT INTO ${DB}.c1 VALUES (${T0 + 1000}, 7.7, 8.8, 9.9)`);
  const c6 = await rows(`SELECT ts, v1, v2, v3 FROM ${DB}.c1 ORDER BY ts`);
  record(
    'P1-C6 后续写入正常',
    c6.length === 2 ? 'pass' : 'fail',
    `共 ${c6.length} 行`
  );
}

// ── P2：ALTER STABLE ADD COLUMN 的代价 ──────────────────────────────────

async function seed(db, stb, tables, rowsPerTable) {
  const T0 = 1600000000000;
  let sent = 0;
  for (let t = 1; t <= tables; t++) {
    const dev = `dev${t}`;
    for (let start = 0; start < rowsPerTable; start += INSERT_CHUNK) {
      const n = Math.min(INSERT_CHUNK, rowsPerTable - start);
      const values = [];
      for (let i = 0; i < n; i++) {
        const idx = start + i;
        values.push(`('${dev}', '${dev}', ${T0 + idx * 1000}, ${idx % 97})`);
      }
      await run(
        `INSERT INTO ${db}.${stb} (tbname, dev, ts, m1) VALUES ${values.join(', ')}`
      );
      sent += n;
    }
  }
  return sent;
}

async function diskOf(db) {
  try {
    const r = await rows(
      `SELECT * FROM INFORMATION_SCHEMA.INS_DISK_USAGE WHERE db_name = '${db}'`
    );
    return r[0] ?? null;
  } catch {
    return null;
  }
}

async function probeAlterCost() {
  h1('P2  ALTER STABLE ADD COLUMN / ADD TAG 的代价（规模对比法）');
  console.log(
    `  口径：同一 schema 建两个库（小 ${SMALL_TABLES}×${SMALL_ROWS} / 大 ${BIG_TABLES}×${BIG_ROWS}），` +
      `\n  分别计时 ALTER。耗时与行数无关 → 元数据操作；随行数线性增长 → 触碰数据。`
  );

  await run(`DROP DATABASE IF EXISTS ${DB}_small`);
  await run(`DROP DATABASE IF EXISTS ${DB}_big`);
  for (const db of [`${DB}_small`, `${DB}_big`]) {
    await run(
      `CREATE DATABASE ${db} PRECISION 'ms' KEEP 3650 DURATION 10 BUFFER 16`
    );
    await run(
      `CREATE STABLE ${db}.perf (ts TIMESTAMP, m1 DOUBLE) TAGS (dev VARCHAR(32))`
    );
  }

  h2('灌数');
  await timed(`小库 ${SMALL_TABLES}×${SMALL_ROWS}`, () =>
    seed(`${DB}_small`, 'perf', SMALL_TABLES, SMALL_ROWS)
  );
  await timed(`大库 ${BIG_TABLES}×${BIG_ROWS}`, () =>
    seed(`${DB}_big`, 'perf', BIG_TABLES, BIG_ROWS)
  );

  for (const [db, label, expected] of [
    [`${DB}_small`, '小', SMALL_TABLES * SMALL_ROWS],
    [`${DB}_big`, '大', BIG_TABLES * BIG_ROWS]
  ]) {
    const got = (await rows(`SELECT COUNT(*) AS n FROM ${db}.perf`))[0].n;
    console.log(
      `    ${label}库 COUNT(*)：${got}（期望 ${expected}）${got === expected ? '' : '  ⚠️ 不一致'}`
    );
  }

  h2('ALTER STABLE ... ADD COLUMN m2 DOUBLE');
  const before = {
    small: await diskOf(`${DB}_small`),
    big: await diskOf(`${DB}_big`)
  };
  const alter = {};
  for (const [db, label] of [
    [`${DB}_small`, '小'],
    [`${DB}_big`, '大']
  ]) {
    const r = await timed(`${label}库（${db}）`, () =>
      run(`ALTER STABLE ${db}.perf ADD COLUMN m2 DOUBLE`)
    );
    alter[label] = r.ms;
  }
  const after = {
    small: await diskOf(`${DB}_small`),
    big: await diskOf(`${DB}_big`)
  };

  const ratio = alter['大'] / Math.max(alter['小'], 1);
  const delta = alter['大'] - alter['小'];
  const metaOnly = delta < 200 || ratio < 3;
  record(
    'P2-1 ADD COLUMN 是否触碰数据',
    metaOnly ? 'pass' : 'fail',
    `小 ${alter['小'].toFixed(0)} ms / 大 ${alter['大'].toFixed(0)} ms` +
      `（Δ ${delta.toFixed(0)} ms，倍率 ${ratio.toFixed(1)}×；两库行数比 ${((BIG_TABLES * BIG_ROWS) / (SMALL_TABLES * SMALL_ROWS)).toFixed(0)}×）` +
      ` → ${metaOnly ? '与规模弱相关，倾向元数据操作' : '随规模增长，疑似触碰历史数据'}`
  );

  h2('ALTER 后历史行读出来是什么');
  const hist = await rows(
    `SELECT ts, m1, m2 FROM ${DB}_big.perf WHERE tbname = 'dev1' ORDER BY ts LIMIT 3`
  );
  console.log(`    ${JSON.stringify(hist)}`);
  record(
    'P2-2 历史行的新列',
    'info',
    hist.every(r => r.m2 === null)
      ? '新列为 NULL（历史行未被重写）'
      : '新列有值，需进一步看'
  );

  h2('ALTER 后写入：新列可写、且不影响老列');
  await run(
    `INSERT INTO ${DB}_big.perf (tbname, dev, ts, m1, m2) VALUES ('dev1', 'dev1', 1600000000000, 1.0, 42.0)`
  );
  const written = (
    await rows(
      `SELECT m1, m2 FROM ${DB}_big.perf WHERE tbname = 'dev1' AND ts = 1600000000000`
    )
  )[0];
  record(
    'P2-3 新列可写',
    written.m1 === 1 && written.m2 === 42 ? 'pass' : 'fail',
    JSON.stringify(written)
  );

  h2('ALTER STABLE ... ADD TAG loc VARCHAR(16)');
  const tagAlter = {};
  for (const [db, label] of [
    [`${DB}_small`, '小'],
    [`${DB}_big`, '大']
  ]) {
    const r = await timed(`${label}库`, () =>
      run(`ALTER STABLE ${db}.perf ADD TAG loc VARCHAR(16)`)
    );
    tagAlter[label] = r.ms;
  }
  const tagRatio = tagAlter['大'] / Math.max(tagAlter['小'], 1);
  const tagDelta = tagAlter['大'] - tagAlter['小'];
  const tagMetaOnly = tagDelta < 200 || tagRatio < 3;
  record(
    'P2-4 ADD TAG 是否触碰数据',
    tagMetaOnly ? 'pass' : 'fail',
    `小 ${tagAlter['小'].toFixed(0)} ms / 大 ${tagAlter['大'].toFixed(0)} ms` +
      `（Δ ${tagDelta.toFixed(0)} ms）→ ${tagMetaOnly ? '倾向元数据操作' : '随规模增长'}`
  );

  // 文档明写"不能缩短""不能改非变长类型""不能改主键"——顺手验一下
  h2('边界：文档说不能做的三件事');
  const shrink = await attempt(
    `ALTER STABLE ${DB}_big.perf MODIFY COLUMN m1 BIGINT`
  );
  record(
    'P2-5 非变长类型不可改',
    shrink.ok ? 'fail' : 'pass',
    shrink.ok ? '竟然成功了（与文档不符）' : `按预期拒绝：${shrink.desc}`
  );
  const subAlter = await attempt(`ALTER TABLE ${DB}_big.dev1 ADD COLUMN z INT`);
  record(
    'P2-6 子表结构不可单独改',
    subAlter.ok ? 'fail' : 'pass',
    subAlter.ok ? '竟然允许了（与文档不符）' : `按预期拒绝：${subAlter.desc}`
  );
  const dropPk = await attempt(`ALTER STABLE ${DB}_big.perf DROP COLUMN ts`);
  record(
    'P2-7 主键列不可删',
    dropPk.ok ? 'fail' : 'pass',
    dropPk.ok ? '竟然允许了（与文档不符）' : `按预期拒绝：${dropPk.desc}`
  );

  h2('磁盘用量对照（ALTER 前 / 后）');
  console.log(
    `    小库：${JSON.stringify(before.small)} → ${JSON.stringify(after.small)}`
  );
  console.log(
    `    大库：${JSON.stringify(before.big)} → ${JSON.stringify(after.big)}`
  );
}

// ── P3：虚拟表能力边界（本机版本实测）────────────────────────────────────

async function probeVirtualTables() {
  h1('P3  虚拟表能力边界：本机这个版本到底支持到哪一步');

  await run(
    `CREATE DATABASE IF NOT EXISTS ${DB} PRECISION 'ms' KEEP 3650 DURATION 10 BUFFER 16`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.src_a (ts TIMESTAMP, a DOUBLE) TAGS (g INT)`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.src_b (ts TIMESTAMP, b DOUBLE) TAGS (g INT)`
  );
  const T0 = 1759747200000;
  await run(
    `INSERT INTO ${DB}.sa1 USING ${DB}.src_a TAGS (1) VALUES (${T0}, 1.1)`
  );
  await run(
    `INSERT INTO ${DB}.sa2 USING ${DB}.src_a TAGS (2) VALUES (${T0}, 2.2)`
  );
  await run(
    `INSERT INTO ${DB}.sb1 USING ${DB}.src_b TAGS (1) VALUES (${T0}, 3.3)`
  );

  h2('a) 虚拟超表本体（VIRTUAL 1）');
  const a = await attempt(
    `CREATE STABLE ${DB}.vst (ts TIMESTAMP, a DOUBLE, b DOUBLE) TAGS (g INT) VIRTUAL 1`
  );
  record('P3-a 虚拟超表', a.ok ? 'pass' : 'fail', a.ok ? '可创建' : a.desc);

  h2('b) 虚拟子表引用物理子表的列');
  const b = await attempt(
    `CREATE VTABLE ${DB}.vct1 (a FROM ${DB}.sa1.a, b FROM ${DB}.sb1.b) USING ${DB}.vst TAGS (1)`
  );
  record(
    'P3-b 虚拟子表（跨源合并列）',
    b.ok ? 'pass' : 'fail',
    b.ok ? '可创建' : b.desc
  );

  h2('c) 同一虚拟超表下挂**列集合不同**的第二个虚拟子表 ← 本项目最关心');
  const c = await attempt(
    `CREATE VTABLE ${DB}.vct2 (a FROM ${DB}.sa2.a) USING ${DB}.vst TAGS (2)`
  );
  record(
    'P3-c 列集合不同的多个虚拟子表',
    c.ok ? 'pass' : 'fail',
    c.ok ? '可创建 → 阶段 B 的虚拟表路线在本版本可行' : `不可行：${c.desc}`
  );

  if (c.ok) {
    h2('d) 查虚拟超表：多张列集合不同的虚拟子表如何合并');
    const d = await rows(`SELECT * FROM ${DB}.vst ORDER BY ts`);
    console.log(`    ${JSON.stringify(d)}`);
    record(
      'P3-d 虚拟超表查询',
      d.length >= 2 ? 'pass' : 'info',
      `${d.length} 行；缺的列为 NULL 即符合官方描述`
    );
  }

  // 注意：父 VST 一旦挂了 VCT，就不能再被继承（"Parent VST already has VCT, cannot be
  // inherited"）。所以继承实验必须用**干净的父级**，与上面 vst 那棵树分开。
  h2('e) 虚拟超表继承 BASE ON（用干净父级）');
  await attempt(`DROP VTABLE IF EXISTS ${DB}.vct_a`);
  await attempt(`DROP STABLE IF EXISTS ${DB}.p_temp`);
  await attempt(`DROP STABLE IF EXISTS ${DB}.p_device`);
  await run(
    `CREATE STABLE ${DB}.p_device (ts TIMESTAMP, status INT) TAGS (region INT) VIRTUAL 1`
  );
  const e = await attempt(
    `CREATE STABLE ${DB}.p_temp (ts TIMESTAMP, temp DOUBLE) TAGS (sensor_id INT) BASE ON ${DB}.p_device VIRTUAL 1`
  );
  record(
    'P3-e BASE ON 继承',
    e.ok ? 'pass' : 'fail',
    e.ok ? '可创建' : `不支持：${e.desc}`
  );
  if (e.ok) {
    const desc = await rows(`DESCRIBE ${DB}.p_temp`);
    const cols = desc.map(c => `${c.field}${c.note === 'TAG' ? '(tag)' : ''}`);
    console.log(`    子 VST 结构：${cols.join(', ')}`);
    const inherit = await attempt('SHOW VTABLE INHERITS');
    record(
      'P3-e2 继承关系可见',
      inherit.ok ? 'pass' : 'fail',
      inherit.ok ? 'SHOW VTABLE INHERITS 可用' : inherit.desc
    );
  }

  h2('f) 虚拟子表引用另一个虚拟子表');
  const f = await attempt(
    `CREATE VTABLE ${DB}.vct3 (a FROM ${DB}.vct1.a) USING ${DB}.vst TAGS (3)`
  );
  record(
    'P3-f 虚拟表引用虚拟表',
    f.ok ? 'pass' : 'fail',
    f.ok ? '可创建' : `不支持：${f.desc}`
  );

  h2('g) 虚拟表不可写');
  const g = await attempt(
    `INSERT INTO ${DB}.vct1 (ts, a) VALUES (${T0 + 1000}, 5.5)`
  );
  record(
    'P3-g 虚拟表只读',
    g.ok ? 'fail' : 'pass',
    g.ok ? '竟然写进去了（与文档不符）' : `按预期拒绝：${g.desc}`
  );

  h2('h) SHOW VTABLE INHERITS');
  const h = await attempt('SHOW VTABLE INHERITS');
  record(
    'P3-h 继承关系查询',
    h.ok ? 'pass' : 'fail',
    h.ok ? '可用' : `不可用：${h.desc}`
  );

  // 本项目最关心的一条：「不同设备指标不同，但要在同一个列表里一起看」
  h2('i) 非叶虚拟超表查询是否自动 UNION ALL 所有后代 ← 统一列表的关键机制');
  if (!e.ok) {
    record('P3-i 非叶自动 UNION ALL', 'info', '跳过：本版本没有 BASE ON');
    return;
  }
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.src_st (ts TIMESTAMP, status INT) TAGS (g INT)`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.src_tp (ts TIMESTAMP, temp DOUBLE) TAGS (g INT)`
  );
  await run(
    `INSERT INTO ${DB}.sst1 USING ${DB}.src_st TAGS (1) VALUES (${T0}, 100)`
  );
  await run(
    `INSERT INTO ${DB}.stp1 USING ${DB}.src_tp TAGS (1) VALUES (${T0}, 36.5)`
  );
  const i1 = await attempt(
    `CREATE VTABLE ${DB}.vct_a (status FROM ${DB}.sst1.status, temp FROM ${DB}.stp1.temp) ` +
      `USING ${DB}.p_temp TAGS (1, 100)`
  );
  if (!i1.ok) {
    record('P3-i 非叶自动 UNION ALL', 'info', `挂 VCT 失败，跳过：${i1.desc}`);
    return;
  }
  const leaf = await rows(`SELECT * FROM ${DB}.p_temp ORDER BY ts`);
  const root = await rows(`SELECT * FROM ${DB}.p_device ORDER BY ts`);
  console.log(`    查叶子 p_temp：${JSON.stringify(leaf)}`);
  console.log(`    查根   p_device：${JSON.stringify(root)}`);
  record(
    'P3-i 非叶自动 UNION ALL',
    root.length === leaf.length && root.length > 0 ? 'pass' : 'fail',
    root.length === leaf.length && root.length > 0
      ? `查根返回 ${root.length} 行，与查叶子一致 → 引擎自动把父级展开为后代的 UNION ALL`
      : `查根 ${root.length} 行 / 查叶 ${leaf.length} 行 → 未展开，需再看`
  );
}

// ── P4：跨超表查询（"把不同超表当同一张表"到底能做到什么）──────────────

async function probeCrossStableQuery() {
  h1('P4  跨超表查询：UNION ALL 的真实约束 + 超表查询的返回顺序');

  await run(
    `CREATE DATABASE IF NOT EXISTS ${DB} PRECISION 'ms' KEEP 3650 DURATION 10 BUFFER 16`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.u_dbl (ts TIMESTAMP, x DOUBLE) TAGS (g INT)`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.u_int (ts TIMESTAMP, y INT) TAGS (g INT)`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.u_str (ts TIMESTAMP, s VARCHAR(16)) TAGS (g INT)`
  );
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.u_dbl2 (ts TIMESTAMP, x DOUBLE) TAGS (g INT)`
  );
  const T0 = 1759747200000;
  await run(
    `INSERT INTO ${DB}.u1 USING ${DB}.u_dbl TAGS (1) VALUES (${T0}, 1.5)`
  );
  await run(
    `INSERT INTO ${DB}.u4 USING ${DB}.u_dbl2 TAGS (4) VALUES (${T0}, 9.5)`
  );
  await run(
    `INSERT INTO ${DB}.u2 USING ${DB}.u_int TAGS (2) VALUES (${T0}, 7)`
  );
  await run(
    `INSERT INTO ${DB}.u3 USING ${DB}.u_str TAGS (3) VALUES (${T0}, 'abc')`
  );

  h2('a) 两张同型超表 UNION ALL（行方向"合起来看"）');
  const a = await attempt(
    `SELECT ts, x FROM ${DB}.u_dbl UNION ALL SELECT ts, x FROM ${DB}.u_dbl2`
  );
  const aRows = a.ok
    ? await rows(
        `SELECT ts, x FROM ${DB}.u_dbl UNION ALL SELECT ts, x FROM ${DB}.u_dbl2`
      )
    : [];
  record(
    'P4-a 同型超表 UNION ALL',
    a.ok ? 'pass' : 'fail',
    a.ok ? `可用：${JSON.stringify(aRows)}` : a.desc
  );

  h2('b) 列名不同、类型可转换（DOUBLE vs INT）');
  const b = await attempt(
    `SELECT ts, x FROM ${DB}.u_dbl UNION ALL SELECT ts, y FROM ${DB}.u_int`
  );
  const bRows = b.ok
    ? await rows(
        `SELECT ts, x FROM ${DB}.u_dbl UNION ALL SELECT ts, y FROM ${DB}.u_int`
      )
    : [];
  record(
    'P4-b 类型可转换',
    b.ok ? 'pass' : 'fail',
    b.ok ? `可用，结果列名取第一个 SELECT：${JSON.stringify(bRows)}` : b.desc
  );

  h2('c) 列数不一致 ← 验证"必须手工对齐列"这条硬约束');
  const c = await attempt(
    `SELECT ts, x FROM ${DB}.u_dbl UNION ALL SELECT ts FROM ${DB}.u_int`
  );
  record(
    'P4-c 列数不一致',
    c.ok ? 'fail' : 'pass',
    c.ok
      ? '竟然允许了（与文档不符）'
      : `按预期拒绝：${c.desc} —— 这就是"指标集合不同必须手工补占位列"的实证`
  );

  h2('c2) 类型不可转换方向（VARCHAR 在前、DOUBLE 在后）');
  const c2 = await attempt(
    `SELECT ts, s FROM ${DB}.u_str UNION ALL SELECT ts, x FROM ${DB}.u_dbl`
  );
  record(
    'P4-c2 类型可转换性',
    'info',
    c2.ok ? '允许（后续类型可转成第一个的类型）' : `拒绝：${c2.desc}`
  );

  h2('d) 手工补 NULL 占位列做对齐（社区版唯一可行的"统一视图"手法）');
  const d = await attempt(
    `SELECT ts, x, CAST(NULL AS VARCHAR(16)) AS s FROM ${DB}.u_dbl ` +
      `UNION ALL SELECT ts, CAST(NULL AS DOUBLE) AS x, s FROM ${DB}.u_str`
  );
  const dRows = d.ok
    ? await rows(
        `SELECT ts, x, CAST(NULL AS VARCHAR(16)) AS s FROM ${DB}.u_dbl ` +
          `UNION ALL SELECT ts, CAST(NULL AS DOUBLE) AS x, s FROM ${DB}.u_str`
      )
    : [];
  record(
    'P4-d 手工占位对齐',
    d.ok ? 'pass' : 'fail',
    d.ok ? `可用：${JSON.stringify(dRows)}` : d.desc
  );

  h2('e) 超表查询不带 ORDER BY 时的返回顺序（文档：按子表分组返回）');
  await run(
    `CREATE STABLE IF NOT EXISTS ${DB}.ord (ts TIMESTAMP, v INT) TAGS (dev VARCHAR(16))`
  );
  await run(
    `INSERT INTO ${DB}.o1 USING ${DB}.ord TAGS ('d1') VALUES (${T0}, 1) (${T0 + 2000}, 3) (${T0 + 4000}, 5)`
  );
  await run(
    `INSERT INTO ${DB}.o2 USING ${DB}.ord TAGS ('d2') VALUES (${T0 + 1000}, 2) (${T0 + 3000}, 4) (${T0 + 6000}, 6)`
  );
  const noOrder = await rows(`SELECT tbname, ts, v FROM ${DB}.ord`);
  const withOrder = await rows(
    `SELECT tbname, ts, v FROM ${DB}.ord ORDER BY ts`
  );
  // 注意：REST 返回的时间戳是 ISO 字符串（不是数字），比较顺序时必须分别显示
  const rel = v =>
    typeof v === 'number' ? `${v - T0}` : String(v).slice(11, 23);
  console.log(
    `    无 ORDER BY：${noOrder.map(r => `${r.tbname}@${rel(r.ts)}`).join(' ')}`
  );
  console.log(
    `    有 ORDER BY：${withOrder.map(r => `${r.tbname}@${rel(r.ts)}`).join(' ')}`
  );
  const grouped =
    noOrder.length === 6 &&
    noOrder.slice(0, 3).every(r => r.tbname === noOrder[0].tbname) &&
    noOrder.slice(3).every(r => r.tbname === noOrder[3].tbname) &&
    noOrder[0].tbname !== noOrder[3].tbname;
  record(
    'P4-e 无 ORDER BY 按子表分组',
    grouped ? 'pass' : 'info',
    grouped
      ? '确认：结果按子表分段返回，列表混排必须显式 ORDER BY'
      : '未观察到按子表分组，需再看'
  );
}

// ── 主流程 ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`TDengine 语义探针`);
  console.log(`  端点：${BASE}（REST /rest/sql，经 taosAdapter）`);

  h1('P0  连通性与版本');
  const ver = await rows('SELECT SERVER_VERSION()');
  console.log(`    ${JSON.stringify(ver)}`);
  record('P0 服务端版本', 'info', JSON.stringify(ver[0]));

  await probeOmittedColumn();
  await probeAlterCost();
  await probeVirtualTables();
  await probeCrossStableQuery();

  h1('结论速查');
  for (const s of summary) {
    const icon = { pass: '✅', fail: '❌', info: '📊' }[s.verdict] ?? '·';
    console.log(`${icon} ${s.key}`);
    console.log(`     ${s.detail}`);
  }
  console.log(`\n机器可读汇总：`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(
    `\n探针未清理探针库（${DB} / ${DB}_small / ${DB}_big），便于人工复核。`
  );
}

main().catch(err => {
  console.error(`\n✖ 探针中断：${err.message}`);
  console.error(
    `  若为连接失败，请先起容器：bash scripts/probe/tdengine-container.sh`
  );
  process.exit(1);
});
