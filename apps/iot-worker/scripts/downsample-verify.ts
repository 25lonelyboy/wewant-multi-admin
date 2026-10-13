import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { DS_LEVELS, RAW_DATABASE, type DsLevel } from '../src/schema.js';
import {
  checkTablesNonEmpty,
  verifyLevel,
  type LevelVerifyResult,
  type VerifyMismatch
} from '../src/downsample/verify.js';

/**
 * 降采样**逐条对账**脚本（判据②改写，设计 §9）。
 *
 * 对最近 N 个窗口，把「原始表按子表窗口聚合」与「降采样表」逐字段比，不等即报出
 * `(子表, 窗口, 字段, 期望, 实际)`；三条输出表还存在性 + 非空检查。有任何差异即非零退出，可作门禁。
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
    '选项：',
    '  --windows <n>   比对窗口数 N（缺省 K-1）',
    '  --skip <n>      从最新已闭合窗口往回跳过的窗口数（缺省 1）',
    '  --now <ms|iso>  以指定时刻为"现在"（缺省墙上时钟）；用于复算历史段',
    '  --level <list>  只比对这些级别，逗号分隔（缺省全部 1m,1h,1d）',
    '  -h, --help      显示本帮助'
  ].join('\n');
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
        options.windows = Number(next());
        break;
      case '--skip':
        options.skip = Number(next());
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

function printMismatch(mismatch: VerifyMismatch): void {
  console.log(
    `    ✖ 子表=${mismatch.subtable} 窗口=${iso(mismatch.ts)} ` +
      `字段=${mismatch.field} 期望=${mismatch.expected} 实际=${mismatch.actual}` +
      `（${mismatch.kind}）`
  );
}

function printLevel(result: LevelVerifyResult): number {
  const { range, level } = result;
  console.log(
    `[${level}] 窗口 [${iso(range.startMs)}, ${iso(range.endMs)}) ` +
      `共 ${range.windows} 个（skip=${range.skip}，K=${range.lookback}，` +
      `保证被环最近一轮覆盖=${range.guaranteed}）`
  );
  console.log(
    `      原始聚合 ${result.expectedCount} 个(子表,窗口) / ` +
      `降采样 ${result.actualCount} 行 → 差异 ${result.mismatches.length}`
  );
  for (const mismatch of result.mismatches) printMismatch(mismatch);
  return result.mismatches.length;
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

    let mismatches = 0;
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
      mismatches += printLevel(result);
    }

    const tableIssues = await checkTablesNonEmpty(sql);
    if (tableIssues.length === 0) {
      console.log('  输出表：✔ 三条存在且非空');
    } else {
      for (const issue of tableIssues) {
        console.log(`  输出表：✖ ${issue.message}`);
      }
    }

    const failed = mismatches + tableIssues.length;
    if (failed > 0) {
      console.error(
        `\n✖ 对账失败：${mismatches} 处字段/行差异，${tableIssues.length} 处输出表问题（${Date.now() - started} ms）`
      );
      process.exitCode = 1;
    } else {
      console.log(`\n✔ 对账通过：无差异（${Date.now() - started} ms）`);
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
