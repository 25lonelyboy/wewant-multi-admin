import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd, type TdSql } from '../src/tdengine/client.js';
import {
  DS_DATABASE,
  DS_LEVELS,
  RAW_DATABASE,
  alterDsMinuteKeepStatement,
  createDatabaseStatements,
  createDsStableStatements,
  createDsSubtableStatements,
  createRawStableStatement,
  createSubtableStatement,
  dsStableName,
  rawStableName
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

/**
 * 降采样库里已存在的流。
 *
 * 降采样已改为 worker 侧定时重算、不再用流；建库脚本据这份名单**清掉遗留流**——
 * 留下来会继续往降采样表写错数据，静默抵消这次迁移。
 */
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

    const subtables = p1DeviceRegistry.allSubtables();
    // ⚠️ 建表与降采样计算必须同形：都按档案里出现过的模型编码逐个处理
    const modelCodes = [...new Set(subtables.map(sub => sub.modelCode))];

    for (const modelCode of modelCodes) {
      await sql.exec(createRawStableStatement(modelCode));
      console.log(`  ✔ 超表：${RAW_DATABASE}.${rawStableName(modelCode)}`);
      for (const statement of createDsStableStatements(modelCode)) {
        await sql.exec(statement);
      }
      await sql.exec(alterDsMinuteKeepStatement(modelCode));
      console.log(
        `  ✔ 降采样超表：${DS_LEVELS.map(level => `${DS_DATABASE}.${dsStableName(modelCode, level)}`).join(' / ')}`
      );
    }

    for (const subtable of subtables) {
      await sql.exec(createSubtableStatement(subtable));
    }
    console.log(`  ✔ 子表：${subtables.length} 张`);

    const streams = await existingStreamNames(sql);
    for (const name of streams) {
      await sql.exec(`DROP STREAM IF EXISTS ${DS_DATABASE}.${name}`);
    }
    console.log(`  ✔ 清理遗留流：${streams.size} 条`);

    for (const subtable of subtables) {
      for (const statement of createDsSubtableStatements(subtable)) {
        await sql.exec(statement);
      }
    }
    console.log(`  ✔ 降采样子表：${subtables.length * DS_LEVELS.length} 张`);

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
