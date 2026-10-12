import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import {
  DS_DATABASE,
  DS_LEVELS,
  DS_STREAMS,
  RAW_DATABASE,
  RAW_STABLE,
  alterDsMinuteKeepStatement,
  createDatabaseStatements,
  createDsStableStatements,
  createRawStableStatement,
  createStreamStatement,
  createSubtableStatement,
  dsStableName
} from '../src/schema.js';

/**
 * 窗口对齐取**服务器时区**，配错了不会报错、只会把数据分进错的窗口——所以这里显式断言。
 *
 * ⚠️ `ALTER LOCAL 'timezone' '…'` 返回成功但**静默无效**（该变量只读，反映系统时区）；
 * 要改只能设容器/服务器的时区再重启。
 */
async function assertServerTimezone(
  sql: TdSql,
  expected: string
): Promise<void> {
  const rows = await sql.query('SHOW LOCAL VARIABLES');
  const row = rows.find(candidate => candidate[0] === 'timezone');
  const value = row === undefined ? '' : String(row[1] ?? '');
  if (!value.includes(expected)) {
    throw new Error(
      `服务器时区是「${value || '未知'}」，期望含「${expected}」；窗口会对不齐业务日。` +
        '请设容器/服务器时区后重启 TDengine。'
    );
  }
}

async function existingStreamNames(sql: TdSql): Promise<Set<string>> {
  const rows = await sql.query(
    `SELECT stream_name FROM information_schema.ins_streams WHERE db_name = '${DS_DATABASE}'`
  );
  return new Set(rows.map(row => String(row[0])));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const sql = await connectTd(config.tdengineUrl);
  const started = Date.now();

  try {
    console.log(`▶ TDengine ${await sql.version()}`);
    await assertServerTimezone(sql, config.tdengineTimezone);
    console.log(`  ✔ 服务器时区含「${config.tdengineTimezone}」`);

    for (const statement of createDatabaseStatements()) {
      await sql.exec(statement);
    }
    console.log(`  ✔ 建库：${RAW_DATABASE} / ${DS_DATABASE}`);

    await sql.exec(createRawStableStatement());
    console.log(`  ✔ 超表：${RAW_DATABASE}.${RAW_STABLE}`);

    const subtables = p1DeviceRegistry.allSubtables();
    for (const subtable of subtables) {
      await sql.exec(createSubtableStatement(subtable));
    }
    console.log(`  ✔ 子表：${subtables.length} 张`);

    for (const statement of createDsStableStatements()) {
      await sql.exec(statement);
    }
    console.log(
      `  ✔ 降采样超表：${DS_LEVELS.map(level => `${DS_DATABASE}.${dsStableName(level)}`).join(' / ')}`
    );

    await sql.exec(alterDsMinuteKeepStatement());
    console.log('  ✔ 分钟级超表级 KEEP');

    const existing = await existingStreamNames(sql);
    for (const spec of DS_STREAMS) {
      if (existing.has(spec.name)) {
        console.log(`  ○ 流已存在，跳过：${DS_DATABASE}.${spec.name}`);
        continue;
      }
      await sql.exec(createStreamStatement(spec));
      console.log(`  ✔ 建流：${DS_DATABASE}.${spec.name}`);
    }

    console.log(`\n✔ TDengine 初始化完成（${Date.now() - started} ms）`);
  } finally {
    await sql.close();
    destroyTd();
  }
}

void main().catch(error => {
  console.error('✖ TDengine 初始化失败：', error);
  process.exit(1);
});
