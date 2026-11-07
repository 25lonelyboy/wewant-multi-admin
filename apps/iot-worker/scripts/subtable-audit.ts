import { loadConfig } from '../src/config.js';
import { readSnapshotOnce } from '../src/snapshot/read.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedFromSnapshot,
  type AuditReport
} from '../src/subtables/audit.js';

interface CliOptions {
  json: boolean;
  listAll: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { json: false, listAll: false };
  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--list-all') options.listAll = true;
    else if (arg === '-h' || arg === '--help') {
      console.log(
        '用法：pnpm --filter @multi-admin/iot-worker run subtable:audit [--json] [--list-all]'
      );
      process.exit(0);
    } else {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

function printBucket(
  title: string,
  names: readonly string[],
  advice: string,
  listAll: boolean
): void {
  console.log(`${names.length === 0 ? '✔' : '✖'} ${title}：${names.length}`);
  if (names.length === 0) return;
  const shown = listAll ? names : names.slice(0, 20);
  for (const name of shown) console.log(`    ${name}`);
  if (!listAll && names.length > shown.length) {
    console.log(
      `    …另 ${names.length - shown.length} 张（--list-all 打全量）`
    );
  }
  console.log(`    处置：${advice}`);
}

function printReport(report: AuditReport, listAll: boolean): void {
  printBucket(
    '孤儿原始子表',
    report.orphanRaw,
    '开发环境重置库；正式流程走注销',
    listAll
  );
  printBucket(
    '缺失原始子表',
    report.missingRaw,
    '重跑建表脚本；不自动补',
    listAll
  );
  printBucket('孤儿降采样子表', report.orphanDs, '同上', listAll);
  printBucket('缺失降采样子表', report.missingDs, '同上', listAll);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const snapshot = await readSnapshotOnce(config.redisUrl);
  if (snapshot === null) {
    console.error(
      '✖ 业务 Redis 里没有档案快照（iot:registry:snapshot）：先启动 server 让它重建快照，再跑审计'
    );
    process.exitCode = 2;
    return;
  }
  const expected = expectedFromSnapshot(snapshot);
  const sql = await connectTd(config.tdengineUrl);

  try {
    const report = await auditSubtables(sql, expected);
    if (options.json) {
      console.log(
        JSON.stringify({ expected: expected.length, ...report }, null, 2)
      );
    } else {
      console.log(`▶ 子表审计：期望 ${expected.length} 台设备`);
      printReport(report, options.listAll);
    }
    const total = Object.values(report).reduce(
      (sum, list) => sum + list.length,
      0
    );
    if (total > 0) process.exitCode = 1;
  } finally {
    await sql.close();
    destroyTd();
  }
}

void main().catch(error => {
  console.error('✖ 审计失败：', error);
  process.exit(1);
});
