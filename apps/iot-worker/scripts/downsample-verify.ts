import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { DS_LEVELS, RAW_DATABASE, type DsLevel } from '../src/schema.js';
import {
  checkTablesNonEmpty,
  partitionMismatches,
  verifyLevel,
  type LevelVerifyResult,
  type VerifyMismatch
} from '../src/downsample/verify.js';

/**
 * 降采样**逐条对账**脚本（判据②改写，设计 §9）。
 *
 * 对最近 N 个窗口，把「原始表按子表窗口聚合」与「降采样表」逐字段比，报出
 * `(子表, 窗口, 字段, 期望, 实际)`；三条输出表还存在性 + 非空检查。
 *
 * ⭐ **K 内 / K 外**：K 契约区（最近 K 个已闭合窗口，环每轮重算的那一段）内的差异判失败、非零退出；
 * 区外的差异（仅 `--windows > K` 时出现）可能是晚到数据造成的良性陈旧，只提示、不判失败。
 *
 * ⚠️ **不用 `COUNT(DISTINCT …)`**（TDengine 里不可信，C11）。
 * ⚠️ 窗口范围默认**跳过最新一个已闭合窗口**（见 `verify.ts` 的 `checkedWindowRange`）——
 * 那是环触发抖动的吸收带，把它当差异就是假警报。
 */

interface CliOptions {
  nowMs: number;
  windows: number | undefined;
  skip: number | undefined;
  levels: DsLevel[];
}

function usage(): string {
  return [
    '用法：pnpm --filter @multi-admin/iot-worker run downsample:verify [选项]',
    '',
    '对最近 N 个窗口把「原始表按子表窗口聚合」与降采样表逐字段比，报出',
    '(子表, 窗口, 字段, 期望, 实际)；三条输出表存在性 + 非空一并查。',
    '',
    'K 内 / K 外（默认范围）：',
    `  K = DOWNSAMPLE_LOOKBACK_WINDOWS（缺省 3），环每轮重算的窗口数，也是它的自愈窗口。`,
    '  默认跳过最新一个已闭合窗口（吸收调度触发抖动）、比对 N=K-1 个窗口，全部落在 K 契约区',
    '  ⇒ 此时任何差异都是真缺陷、判失败。',
    '  --windows 调到 > K 会把范围伸进「环不再维护」的窗口：那里的差异可能是晚到数据造成的',
    '  良性陈旧，脚本只作提示、不判失败。--skip 0 会纳入最新窗口（有触发抖动风险）。',
    '',
    '前提：逐条对账只在管道相对静止时逐位成立；活数据持续到达时，晚到数据造成的差异会在环',
    '下一轮重算 + 下次对账后消失。脚本已先重读两侧，排除「两条语句之间发生一次写入」的假警报。',
    '',
    '选项：',
    '  --windows <n>   比对窗口数 N（正整数，缺省 K-1）',
    '  --skip <n>      从最新已闭合窗口往回跳过的窗口数 S（非负整数，缺省 1）',
    '  --now <ms|iso>  以指定时刻为"现在"（缺省墙上时钟）；用于复算历史段',
    '  --level <list>  只比对这些级别，逗号分隔（缺省全部 1m,1h,1d）',
    '  -h, --help      显示本帮助',
    '',
    '退出码：0 = K 契约区内无差异、三条输出表存在且非空；1 = 有真缺陷或输出表问题。'
  ].join('\n');
}

/** 解析整数参数；非整数或越界即带清晰信息失败（不让 NaN 流进边界计算） */
function parseIntArg(flag: string, value: string, min: number): number {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`${flag} 需要整数，收到「${value}」`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${flag} 需要 ≥ ${min} 的整数，收到「${value}」`);
  }
  return parsed;
}

function parseNow(value: string): number {
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`--now 无法解析：${value}（给 epoch 毫秒或 ISO 时间）`);
  }
  return parsed;
}

function parseLevels(value: string): DsLevel[] {
  const levels = value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
  for (const level of levels) {
    if (!(DS_LEVELS as readonly string[]).includes(level)) {
      throw new Error(`未知级别：${level}（可选 ${DS_LEVELS.join(' / ')}）`);
    }
  }
  return levels as DsLevel[];
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    nowMs: Date.now(),
    windows: undefined,
    skip: undefined,
    levels: [...DS_LEVELS]
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${arg} 缺参数`);
      i += 1;
      return value;
    };
    switch (arg) {
      case '--windows':
        options.windows = parseIntArg('--windows', next(), 1);
        break;
      case '--skip':
        options.skip = parseIntArg('--skip', next(), 0);
        break;
      case '--now':
        options.nowMs = parseNow(next());
        break;
      case '--level':
        options.levels = parseLevels(next());
        break;
      case '-h':
      case '--help':
        console.log(usage());
        process.exit(0);
        break;
      default:
        throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function printMismatch(marker: string, mismatch: VerifyMismatch): void {
  console.log(
    `    ${marker} 子表=${mismatch.subtable} 窗口=${iso(mismatch.ts)} ` +
      `字段=${mismatch.field} 期望=${mismatch.expected} 实际=${mismatch.actual}` +
      `（${mismatch.kind}）`
  );
}

/** 单级差异：K 契约区内的判失败，区外的只提示 */
interface LevelCounts {
  failures: number;
  informational: number;
}

function printLevel(result: LevelVerifyResult): LevelCounts {
  const { range, level } = result;
  console.log(
    `[${level}] 窗口 [${iso(range.startMs)}, ${iso(range.endMs)}) ` +
      `共 ${range.windows} 个（skip=${range.skip}，K=${range.lookback}，` +
      `保证被环最近一轮覆盖=${range.guaranteed}）`
  );

  // ⭐ K 契约区内的差异是真缺陷；区外的（仅 N > K 时出现）可能是晚到数据造成的良性陈旧（设计 §9）
  const { failures, informational } = partitionMismatches(
    range,
    result.mismatches
  );

  console.log(
    `      原始聚合 ${result.expectedCount} 个(子表,窗口) / ` +
      `降采样 ${result.actualCount} 行 → K 契约区内差异 ${failures.length} 处` +
      `（另 ${informational.length} 处在区外，仅提示）`
  );
  for (const mismatch of failures) printMismatch('✖', mismatch);
  for (const mismatch of informational) printMismatch('⚠', mismatch);
  return { failures: failures.length, informational: informational.length };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  // 期望标签：建表端按注册表写死 ⇒ 这里也用注册表作为期望来源
  const deviceIds = new Map(
    p1DeviceRegistry.allSubtables().map(sub => [sub.name, sub.deviceId])
  );
  const deviceIdFor = (rawName: string): string | null =>
    deviceIds.get(rawName) ?? null;

  const sql = await connectTd(config.tdengineUrl, RAW_DATABASE);
  const started = Date.now();

  try {
    const lookback = config.downsampleLookbackWindows;
    console.log('▶ 降采样逐条对账');
    console.log(
      `  now=${iso(options.nowMs)}  K=${lookback}  ` +
        `N=${options.windows ?? lookback - 1}  skip=${options.skip ?? 1}`
    );

    let failures = 0;
    let informational = 0;
    for (const level of options.levels) {
      const result = await verifyLevel(
        sql,
        level,
        options.nowMs,
        {
          lookback,
          windows: options.windows,
          skip: options.skip
        },
        deviceIdFor
      );
      const counts = printLevel(result);
      failures += counts.failures;
      informational += counts.informational;
    }

    const tableIssues = await checkTablesNonEmpty(sql);
    if (tableIssues.length === 0) {
      console.log('  输出表：✔ 三条存在且非空');
    } else {
      for (const issue of tableIssues) {
        console.log(`  输出表：✖ ${issue.message}`);
      }
    }

    const failed = failures + tableIssues.length;
    if (informational > 0) {
      console.log(
        `  ℹ ${informational} 处差异落在 K 契约区外（环不再维护的窗口），仅提示、不判失败`
      );
    }
    if (failed > 0) {
      console.error(
        `\n✖ 对账失败：K 契约区内 ${failures} 处差异，${tableIssues.length} 处输出表问题（${Date.now() - started} ms）`
      );
      process.exitCode = 1;
    } else {
      console.log(
        `\n✔ 对账通过：K 契约区内无差异（${Date.now() - started} ms）`
      );
    }
  } finally {
    await sql.close();
    destroyTd();
  }
}

void main().catch(error => {
  console.error('✖ 对账脚本执行失败：', error);
  process.exit(1);
});
