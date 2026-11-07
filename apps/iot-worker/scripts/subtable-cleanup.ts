import { loadConfig } from '../src/config.js';
import { readRegistryState } from '../src/snapshot/read.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedFromSnapshot,
  type AuditReport
} from '../src/subtables/audit.js';
import {
  checkSnapshotFreshness,
  cleanupOrphans
} from '../src/subtables/cleanup.js';

interface CliOptions {
  apply: boolean;
  json: boolean;
  listAll: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { apply: false, json: false, listAll: false };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--list-all') options.listAll = true;
    else if (arg === '-h' || arg === '--help') {
      console.log(
        '用法：pnpm --filter @multi-admin/iot-worker run subtable:cleanup [--apply] [--json] [--list-all]\n' +
          '缺省 dry-run：打印孤儿名单与总数，不删除任何表。--apply 才执行删除。'
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
  listAll: boolean
): void {
  console.log(`${names.length === 0 ? '✔' : '✖'} ${title}：${names.length}`);
  const shown = listAll ? names : names.slice(0, 20);
  for (const name of shown) console.log(`    ${name}`);
  if (!listAll && names.length > shown.length) {
    console.log(
      `    …另 ${names.length - shown.length} 张（--list-all 打全量）`
    );
  }
}

function printReport(report: AuditReport, listAll: boolean): void {
  printBucket('孤儿原始子表', report.orphanRaw, listAll);
  printBucket('缺失原始子表', report.missingRaw, listAll);
  printBucket('孤儿降采样子表', report.orphanDs, listAll);
  printBucket('缺失降采样子表', report.missingDs, listAll);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const state = await readRegistryState(config.redisUrl);
  if (state === null) {
    console.error(
      '✖ 业务 Redis 里没有档案快照（iot:registry:snapshot）：先启动 server 让它重建快照，再跑清理'
    );
    process.exitCode = 2;
    return;
  }

  const freshness = checkSnapshotFreshness(
    state.built,
    state.rev,
    state.snapshot.builtAt
  );
  if (!freshness.ok) {
    console.error(
      `✖ 快照不可用（${freshness.reason}）：拒绝清理，避免拿滞后快照把刚注册的表删掉。` +
        ' 先确认 server 在线且 iot:registry:built 与 iot:registry:rev 一致。'
    );
    process.exitCode = 1;
    return;
  }

  const expected = expectedFromSnapshot(state.snapshot);
  if (expected.length === 0) {
    console.error('✖ 期望集为空：注册表没有读出任何设备，拒绝清理');
    process.exitCode = 1;
    return;
  }

  const sql = await connectTd(config.tdengineUrl);
  try {
    const result = await cleanupOrphans(
      { query: sql, exec: statement => sql.exec(statement) },
      expected,
      { apply: options.apply }
    );
    const pending = [
      ...result.report.orphanRaw,
      ...result.report.orphanDs
    ].filter(name => !result.skippedYoung.includes(name));

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            expected: expected.length,
            apply: options.apply,
            report: result.report,
            pending,
            skippedYoung: result.skippedYoung,
            dropped: result.dropped,
            failed: result.failed
          },
          null,
          2
        )
      );
    } else {
      console.log(
        `▶ 子表清理（${options.apply ? '执行' : 'dry-run'}）：期望 ${expected.length} 台设备`
      );
      printReport(result.report, options.listAll);
      if (result.skippedYoung.length > 0) {
        console.log(
          `▶ 新建表保护期（不足 10 分钟）跳过 ${result.skippedYoung.length} 张：`
        );
        for (const name of result.skippedYoung.slice(0, 20)) {
          console.log(`    ${name}`);
        }
        if (result.skippedYoung.length > 20) {
          console.log(
            `    …另 ${result.skippedYoung.length - 20} 张（下一轮再清）`
          );
        }
      }
      if (options.apply) {
        console.log(
          `▶ 已删除 ${result.dropped.length} 张，失败 ${result.failed.length} 张`
        );
        for (const name of result.failed) {
          console.error(`    ✖ 删除失败（重试后仍失败）：${name}`);
        }
      } else {
        console.log(
          `▶ 待删 ${pending.length} 张（原始优先，随后降采样）；确认后加 --apply 执行`
        );
      }
    }

    if (result.failed.length > 0) process.exitCode = 1;

    if (options.apply) {
      const remaining = await auditSubtables(sql, expected);
      if (!options.json) {
        console.log('▶ 清理后重新审计：');
        printReport(remaining, options.listAll);
      }
      // 保护期内跳过的孤儿允许留在库里；缺失桶不属清理职责
      const unexpected = [...remaining.orphanRaw, ...remaining.orphanDs].filter(
        name => !result.skippedYoung.includes(name)
      );
      if (unexpected.length > 0) process.exitCode = 1;
    }
  } finally {
    await sql.close();
    destroyTd();
  }
}

void main().catch(error => {
  console.error('✖ 清理失败：', error);
  process.exit(1);
});
