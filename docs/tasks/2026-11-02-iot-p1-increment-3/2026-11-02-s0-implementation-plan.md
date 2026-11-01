# S0 债务清理与护栏 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把开发库拉回"表存在 ⇔ 已注册"的干净基线，并让漂移、空对账、e2e 残留、worker 卡死四类问题各自有一个能红的检测。

**Architecture:** 清库交给一次性重建（`down -v` + 重建脚本），代码侧只做只读审计与护栏——删除能力不落进工具，避免与将来的注销流程形成两条删除路径。心跳用 Redis 键 + TTL，探针是独立编译入口。

**Tech Stack:** TypeScript ESM、`node:test`、`tsx`、`@tdengine/websocket`、ioredis、Docker Compose

## Global Constraints

- Node >= 24、pnpm >= 11；命令一律用 `pnpm --filter @multi-admin/iot-worker run <script>`
- 提交信息 `type(scope): 描述`，scope 白名单见 `commitlint.config.mjs`；iot-worker 的改动用 `repo`
- ESLint `--max-warnings 0`；格式化由 Prettier 独占，不手改对齐
- 新增依赖必须走 catalog：`ioredis` 已在 `pnpm-workspace.yaml` 固定为 `^6.0.0`，`nestjs-server` 已在消费
- 单测：`node --import tsx --test test/*.test.ts`；e2e 需 `pnpm ops:env-up` 起的 postgres / redis / redis-queue / emqx / tdengine
- 改文档必须跑 `pnpm doc:lint`
- 破坏性命令（`docker compose down -v`）只能在本地开发环境、且经用户确认后执行

---

### Task 1: 重建开发库卷

**Files:** 无（运维动作）

**Interfaces:**
- Consumes: 无
- Produces: 干净基线——`wewant_iot` 100 张原始子表、`wewant_iot_ds` 300 张降采样子表

- [ ] **Step 1: 记录当前状态（执行前留证）**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const sql = await connectTd(loadConfig().tdengineUrl);
  const raw = await sql.query('SHOW wewant_iot.TABLES');
  const ds = await sql.query('SHOW wewant_iot_ds.TABLES');
  console.log({ raw: raw.length, ds: ds.length });
  await sql.close();
})();
"
```

Expected: 打印 `{ raw: <清理前行数>, ds: <清理前行数> }`（`raw` 应为 12,000 量级）。把输出贴进任务记录。

- [ ] **Step 2: 向用户确认后再执行**（破坏性，不确认不执行）

停止并等待用户明确同意。确认后：

```bash
docker compose down -v
pnpm ops:env-up
pnpm --filter @multi-admin/iot-worker run tdengine:init
```

Expected：`ops:env-up` 完成 migrate + seed；`tdengine:init` 打印 `✔ 子表：100 张`、`✔ 降采样子表：300 张`。

- [ ] **Step 3: 核对基线表数**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const sql = await connectTd(loadConfig().tdengineUrl);
  const raw = await sql.query('SHOW wewant_iot.TABLES');
  const ds = await sql.query('SHOW wewant_iot_ds.TABLES');
  console.log({ raw: raw.length, ds: ds.length });
  await sql.close();
})();
"
```

Expected：`{ raw: 100, ds: 300 }`。（`SHOW <db>.TABLES` 只列子表、不含超表——见增量 2 的核实记录。）

- [ ] **Step 4: 记录到任务目录**

把 Step 1 与 Step 3 的输出写进 `docs/tasks/2026-11-02-iot-p1-increment-3/2026-11-02-s0-baseline.md`（新建，几行即可：清理前表数、清理后表数、执行时间）。

---

### Task 2: 只读子表审计

**Files:**
- Create: `apps/iot-worker/src/subtables/audit.ts`
- Create: `apps/iot-worker/scripts/subtable-audit.ts`
- Create: `apps/iot-worker/test/subtable-audit.test.ts`
- Modify: `apps/iot-worker/package.json`（加 `subtable:audit` 脚本）

**Interfaces:**
- Consumes: `TdRow`（`src/tdengine/client.ts`）、`DS_DATABASE` / `DS_LEVELS` / `RAW_DATABASE` / `RAW_STABLE` / `dsStableName` / `dsSubtableName`（`src/schema.ts`）、`p1DeviceRegistry`（`@multi-admin/device-registry`）
- Produces:
  - `export interface AuditQuery { query(sql: string): Promise<TdRow[]> }`
  - `export interface ExpectedSubtable { name: string; deviceId: string }`
  - `export interface AuditReport { orphanRaw: string[]; missingRaw: string[]; orphanDs: string[]; missingDs: string[] }`
  - `export function expectedDsNames(expected: readonly ExpectedSubtable[]): string[]`
  - `export async function auditSubtables(query: AuditQuery, expected: readonly ExpectedSubtable[]): Promise<AuditReport>`——`expected` 为空时抛错

- [ ] **Step 1: 先核 `information_schema.ins_tables` 的列名**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const sql = await connectTd(loadConfig().tdengineUrl);
  console.log(await sql.query(\"SELECT db_name, stable_name, table_name FROM information_schema.ins_tables LIMIT 3\"));
  await sql.close();
})();
"
```

Expected：不报错并返回行（或空数组），说明三列都存在。已有先例：`apps/nestjs-server/scripts/tdengine-stmt-tbname-probe.mjs:106,122` 用的就是这两个列。**若报列不存在，停下来报告**——退回 `SHOW <db>.TABLES` 拿不到父超表，方案需重定。

- [ ] **Step 2: 写失败的测试**

`apps/iot-worker/test/subtable-audit.test.ts`：

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TdRow } from '../src/tdengine/client.js';
import {
  auditSubtables,
  expectedDsNames,
  type ExpectedSubtable
} from '../src/subtables/audit.js';

const EXPECTED: ExpectedSubtable[] = [{ name: 'abc_001', deviceId: 'ABC' }];

function fakeQuery(rows: TdRow[]): { query(sql: string): Promise<TdRow[]> } {
  return { async query(): Promise<TdRow[]> { return rows; } };
}

void test('期望集为空时拒绝判定', async () => {
  await assert.rejects(
    () => auditSubtables(fakeQuery([]), []),
    /期望集为空/
  );
});

void test('期望集的降采样名按三级展开', () => {
  assert.deepEqual(expectedDsNames(EXPECTED), [
    'abc_001_1m',
    'abc_001_1h',
    'abc_001_1d'
  ]);
});

void test('干净环境四桶全空', async () => {
  const rows: TdRow[] = [
    ['telemetry', 'abc_001'],
    ['telemetry_1m', 'abc_001_1m'],
    ['telemetry_1h', 'abc_001_1h'],
    ['telemetry_1d', 'abc_001_1d']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report, {
    orphanRaw: [],
    missingRaw: [],
    orphanDs: [],
    missingDs: []
  });
});

void test('孤儿与缺失分桶，超表自身的行被忽略', async () => {
  const rows: TdRow[] = [
    ['telemetry', 'telemetry'],
    ['telemetry', 'abc_001'],
    ['telemetry', 'old_001'],
    ['telemetry_1m', 'abc_001_1m'],
    ['telemetry_1m', 'old_001_1m'],
    ['telemetry_1h', 'abc_001_1h']
  ];
  const report = await auditSubtables(fakeQuery(rows), EXPECTED);
  assert.deepEqual(report.orphanRaw, ['old_001']);
  assert.deepEqual(report.orphanDs, ['old_001_1m']);
  assert.deepEqual(report.missingRaw, []);
  assert.deepEqual(report.missingDs, ['abc_001_1d']);
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/subtable-audit.test.ts
```

Expected: FAIL，`Cannot find module '../src/subtables/audit.js'`。

- [ ] **Step 4: 实现审计主体**

`apps/iot-worker/src/subtables/audit.ts`：

```ts
import type { TdRow } from '../tdengine/client.js';
import {
  DS_DATABASE,
  DS_LEVELS,
  RAW_DATABASE,
  RAW_STABLE,
  dsStableName,
  dsSubtableName
} from '../schema.js';

/** 只读查询依赖——生产是 `TdSql`，单测注入替身 */
export interface AuditQuery {
  query(sql: string): Promise<TdRow[]>;
}

export interface ExpectedSubtable {
  name: string;
  deviceId: string;
}

export interface AuditReport {
  /** 表在、注册表里没有 */
  orphanRaw: string[];
  /** 注册了、表不在 */
  missingRaw: string[];
  orphanDs: string[];
  missingDs: string[];
}

/** 期望的降采样子表名：每个采集点按三级展开 */
export function expectedDsNames(
  expected: readonly ExpectedSubtable[]
): string[] {
  return expected.flatMap(sub =>
    DS_LEVELS.map(level => dsSubtableName(sub.name, level))
  );
}

function difference(a: readonly string[], b: ReadonlySet<string>): string[] {
  return a.filter(name => !b.has(name)).sort();
}

/**
 * 只读审计「表存在 ⇔ 已注册」。
 *
 * ⚠️ 空期望集必须拒绝判定：注册表加载失败时若照常比，整库都会被判成孤儿。
 */
export async function auditSubtables(
  query: AuditQuery,
  expected: readonly ExpectedSubtable[]
): Promise<AuditReport> {
  if (expected.length === 0) {
    throw new Error(
      '期望集为空：注册表没有读出任何采集点，拒绝判定（否则全库都会被判成孤儿）'
    );
  }

  const rows = await query.query(
    `SELECT stable_name, table_name FROM information_schema.ins_tables ` +
      `WHERE db_name IN ('${RAW_DATABASE}', '${DS_DATABASE}')`
  );

  const dsStables = new Set<string>(DS_LEVELS.map(level => dsStableName(level)));
  const existingRaw = new Set<string>();
  const existingDs = new Set<string>();

  for (const row of rows) {
    const stable = String(row[0] ?? '').toLowerCase();
    const table = String(row[1] ?? '').toLowerCase();
    // 超表自身的行不算子表
    if (table === '' || table === stable) continue;
    if (stable === RAW_STABLE) existingRaw.add(table);
    else if (dsStables.has(stable)) existingDs.add(table);
  }

  const wantRaw = new Set(expected.map(sub => sub.name));
  const wantDs = new Set(expectedDsNames(expected));

  return {
    orphanRaw: difference([...existingRaw], wantRaw),
    missingRaw: difference([...wantRaw], existingRaw),
    orphanDs: difference([...existingDs], wantDs),
    missingDs: difference([...wantDs], existingDs)
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/subtable-audit.test.ts
```

Expected: 4 passing。

- [ ] **Step 6: 写 CLI**

`apps/iot-worker/scripts/subtable-audit.ts`：

```ts
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from '../src/config.js';
import { connectTd, destroyTd } from '../src/tdengine/client.js';
import { auditSubtables, type AuditReport } from '../src/subtables/audit.js';

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
    console.log(`    …另 ${names.length - shown.length} 张（--list-all 打全量）`);
  }
  console.log(`    处置：${advice}`);
}

function printReport(report: AuditReport, listAll: boolean): void {
  printBucket('孤儿原始子表', report.orphanRaw, '开发环境重置库；正式流程走注销', listAll);
  printBucket('缺失原始子表', report.missingRaw, '重跑建表脚本；不自动补', listAll);
  printBucket('孤儿降采样子表', report.orphanDs, '同上', listAll);
  printBucket('缺失降采样子表', report.missingDs, '同上', listAll);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const expected = p1DeviceRegistry.allSubtables();
  const sql = await connectTd(config.tdengineUrl);

  try {
    const report = await auditSubtables(sql, expected);
    if (options.json) {
      console.log(JSON.stringify({ expected: expected.length, ...report }, null, 2));
    } else {
      console.log(`▶ 子表审计：期望 ${expected.length} 个采集点`);
      printReport(report, options.listAll);
    }
    const total = Object.values(report).reduce((sum, list) => sum + list.length, 0);
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
```

- [ ] **Step 7: 加脚本入口**

`apps/iot-worker/package.json` 的 `scripts` 中，`"downsample:verify"` 之后加：

```json
"subtable:audit": "tsx scripts/subtable-audit.ts"
```

- [ ] **Step 8: 在干净基线上跑（应全绿）**

```bash
pnpm --filter @multi-admin/iot-worker run subtable:audit
```

Expected：四个 `✔`，退出码 0。

- [ ] **Step 9: 证明它能红**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const sql = await connectTd(loadConfig().tdengineUrl, 'wewant_iot');
  await sql.exec(\"CREATE TABLE IF NOT EXISTS probe_x USING telemetry TAGS ('PROBEX')\");
  await sql.close();
})();
"
pnpm --filter @multi-admin/iot-worker run subtable:audit; echo "exit=$?"
```

Expected：`✖ 孤儿原始子表：1` 且列出 `probe_x`，`exit=1`。

- [ ] **Step 10: 清掉探针表，确认恢复**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const sql = await connectTd(loadConfig().tdengineUrl, 'wewant_iot');
  await sql.exec('DROP TABLE IF EXISTS probe_x');
  await sql.close();
})();
"
pnpm --filter @multi-admin/iot-worker run subtable:audit; echo "exit=$?"
```

Expected：全绿，`exit=0`。

- [ ] **Step 11: 门禁与提交**

```bash
pnpm --filter @multi-admin/iot-worker run typecheck
pnpm --filter @multi-admin/iot-worker run lint
pnpm --filter @multi-admin/iot-worker run test
git add apps/iot-worker/src/subtables/audit.ts apps/iot-worker/scripts/subtable-audit.ts apps/iot-worker/test/subtable-audit.test.ts apps/iot-worker/package.json
git commit -m "feat(repo): iot-worker 只读子表审计——表存在 ⇔ 已注册可核"
```

---

### Task 3: 对账脚本空过护栏

**Files:**
- Modify: `apps/iot-worker/src/downsample/verify.ts`（在 `LevelVerifyResult` 定义之后加函数）
- Modify: `apps/iot-worker/scripts/downsample-verify.ts`
- Test: `apps/iot-worker/test/downsample-verify.test.ts`

**Interfaces:**
- Consumes: `LevelVerifyResult`
- Produces: `export function emptySideFailures(result: Pick<LevelVerifyResult, 'level' | 'expectedCount' | 'actualCount'>): string[]`

- [ ] **Step 1: 写失败的测试**

在 `apps/iot-worker/test/downsample-verify.test.ts` 的 import 里加入 `emptySideFailures`，文件末尾追加：

```ts
void test('两侧计数为 0 判失败——空对账不是证据', () => {
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 0, actualCount: 0 }).length,
    2
  );
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 5, actualCount: 0 }).length,
    1
  );
  assert.equal(
    emptySideFailures({ level: '1m', expectedCount: 5, actualCount: 5 }).length,
    0
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/downsample-verify.test.ts
```

Expected: FAIL，`emptySideFailures is not a function`。

- [ ] **Step 3: 实现**

`apps/iot-worker/src/downsample/verify.ts`，在 `LevelVerifyResult` 定义之后：

```ts
/**
 * 两侧计数为 0 的护栏。
 *
 * 流量停了时脚本会拿 0 组比 0 组、结论仍是"差异 0 处 · 对账通过"——0 组不是证据。
 * 这里只提供判据，不提供 `--allow-empty` 开关：要观察空库就别跑这个脚本。
 */
export function emptySideFailures(
  result: Pick<LevelVerifyResult, 'level' | 'expectedCount' | 'actualCount'>
): string[] {
  const failures: string[] = [];
  if (result.expectedCount === 0) {
    failures.push(
      `[${result.level}] 原始侧 0 个 (子表,窗口)：空对账不构成证据——按数据最后时间戳用 --now 取窗口，或先起流量`
    );
  }
  if (result.actualCount === 0) {
    failures.push(
      `[${result.level}] 降采样侧 0 行：空对账不构成证据——同上`
    );
  }
  return failures;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/downsample-verify.test.ts
```

Expected: PASS。

- [ ] **Step 5: 接进脚本**

`apps/iot-worker/scripts/downsample-verify.ts`：

导入行加入 `emptySideFailures`：

```ts
import {
  checkTablesNonEmpty,
  emptySideFailures,
  partitionMismatches,
  verifyLevel,
  type LevelVerifyResult,
  type VerifyMismatch
} from '../src/downsample/verify.js';
```

`main()` 里，`const counts = printLevel(result);` 之后：

```ts
      const empty = emptySideFailures(result);
      for (const message of empty) console.log(`      ✖ ${message}`);
      failures += counts.failures + empty.length;
```

并删掉原来的 `failures += counts.failures;` 行。

同时把收尾文案里的「处差异」改成「处问题（含空对账）」——空对账不是差异，混在一句话里会误导读数。

- [ ] **Step 6: 证明它能红（无流量时）**

```bash
pnpm --filter @multi-admin/iot-worker run downsample:verify; echo "exit=$?"
```

Expected：每个级别打印 `✖ … 空对账不构成证据`，`exit=1`。

- [ ] **Step 7: 门禁与提交**

```bash
pnpm --filter @multi-admin/iot-worker run typecheck
pnpm --filter @multi-admin/iot-worker run lint
pnpm --filter @multi-admin/iot-worker run test
git add apps/iot-worker/src/downsample/verify.ts apps/iot-worker/scripts/downsample-verify.ts apps/iot-worker/test/downsample-verify.test.ts
git commit -m "fix(repo): 降采样对账拒绝空过——两侧计数为 0 即判失败"
```

---

### Task 4: e2e 不再留下行

**Files:**
- Modify: `apps/iot-worker/test/consumer.e2e.ts`

**Interfaces:**
- Consumes: `p1DeviceRegistry.resolve`、`dsSubtableName`、`RAW_DATABASE`、`DS_DATABASE`
- Produces: 无（测试内部）

- [ ] **Step 1: 加子表名常量与三级窗口清理助手**

`apps/iot-worker/test/consumer.e2e.ts` 顶部 import 改为（删除原 `import { RAW_DATABASE } from '../src/schema.js';` 那一行）：

```ts
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { DS_DATABASE, RAW_DATABASE, dsSubtableName } from '../src/schema.js';
import { LEVEL_SPECS } from '../src/downsample/level.js';
import { lastClosedBoundary } from '../src/downsample/window.js';
import type { TdSql } from '../src/tdengine/client.js';

const SUBTABLE = ((): string => {
  const resolved = p1DeviceRegistry.resolve('sim-001');
  assert.ok(resolved.ok, 'sim-001 应在 P1 档案里');
  return `${resolved.deviceId}_${resolved.pointKey}`.toLowerCase();
})();

/**
 * 删掉这段数据在三级降采样里可能产生的窗口行。
 *
 * 本进程不跑降采样环，但**另一个开着环的 worker**（含 CI 的 worker 容器）会把同一段算成
 * 1m/1h/1d 三行——只删 1m 会留下 1h/1d 的残留。
 */
async function deleteDsWindows(
  sql: TdSql,
  fromMs: number,
  toMs: number
): Promise<void> {
  for (const spec of LEVEL_SPECS) {
    const starts = new Set([
      lastClosedBoundary(fromMs, spec),
      lastClosedBoundary(toMs, spec)
    ]);
    for (const start of starts) {
      await sql
        .exec(
          `DELETE FROM ${DS_DATABASE}.${dsSubtableName(SUBTABLE, spec.level)} WHERE ts = ${start}`
        )
        .catch(() => undefined);
    }
  }
}
```

- [ ] **Step 2: 第一个用例的 finally 补删除**

先把这个用例里的 `const ts = Date.now();` 从 `try {` 内部**移到 `try` 之前**——`const` 是块级作用域，留在 `try` 里会在 `finally` 中取不到。

在 `finally` 里、`await queue.obliterate(...)` 之前插入：

```ts
    await deleteDsWindows(sql, ts, ts + 2);
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts >= ${ts} AND ts < ${ts + 3}`
      )
      .catch(() => undefined);
```

⚠️ 顺序不能反：先删原始行的话，本机同时运行的降采样环可能在两步之间把窗口算出来、留下一条孤立聚合行。

- [ ] **Step 3: 第二个用例的 finally 补删除**

同样先把该用例的 `const base = Date.now();` 移到 `try` 之前，再在 `finally` 里插入：

```ts
    await deleteDsWindows(sql, base, base + 2);
    await sql
      .exec(
        `DELETE FROM ${RAW_DATABASE}.${SUBTABLE} WHERE ts >= ${base} AND ts < ${base + 3}`
      )
      .catch(() => undefined);
```

- [ ] **Step 4: 连跑两次 e2e，确认行数不增长**

```bash
pnpm --filter @multi-admin/iot-worker run test:e2e
pnpm --filter @multi-admin/iot-worker run test:e2e
```

Expected：两次全绿。

- [ ] **Step 5: 核对子表行数**

```bash
pnpm --filter @multi-admin/iot-worker exec tsx -e "
import { p1DeviceRegistry } from '@multi-admin/device-registry';
import { loadConfig } from './src/config.ts';
import { connectTd } from './src/tdengine/client.ts';
void (async () => {
  const resolved = p1DeviceRegistry.resolve('sim-001');
  if (!resolved.ok) throw new Error('sim-001 未登记');
  const name = (resolved.deviceId + '_' + resolved.pointKey).toLowerCase();
  const sql = await connectTd(loadConfig().tdengineUrl, 'wewant_iot');
  console.log(name, await sql.query('SELECT COUNT(*) FROM ' + name));
  await sql.close();
})();
"
```

Expected：两次运行前后打印的行数一致（每次跑完 e2e 后计数不增长）。

- [ ] **Step 6: 提交**

```bash
git add apps/iot-worker/test/consumer.e2e.ts
git commit -m "test(repo): consumer e2e 清理自己写入的行与窗口"
```

---

### Task 5: worker 心跳与 compose 健康检查

**Files:**
- Create: `apps/iot-worker/src/redis-store.ts`
- Create: `apps/iot-worker/src/heartbeat.ts`
- Create: `apps/iot-worker/src/healthcheck.ts`
- Create: `apps/iot-worker/test/redis-store.test.ts`
- Create: `apps/iot-worker/test/heartbeat.test.ts`
- Create: `apps/iot-worker/test/healthcheck.test.ts`
- Modify: `apps/iot-worker/src/index.ts`
- Modify: `apps/iot-worker/package.json`（加 `ioredis` 依赖）
- Modify: `docker-compose.yml`（worker 服务加 healthcheck）

**Interfaces:**
- Consumes: `TELEMETRY_QUEUE_PREFIX`（`@multi-admin/contracts`）
- Produces:
  - `src/redis-store.ts`：`export interface RedisLike { set(key, value, ttlSeconds): Promise<void>; get(key): Promise<string | null>; del(key): Promise<void>; disconnect(): void }`、`export function createRedis(url: string, makeClient?): RedisLike`
  - `src/heartbeat.ts`：`export const HEARTBEAT_TTL_SECONDS = 30`、`export const HEARTBEAT_INTERVAL_MS = 10_000`、`export function heartbeatKey(host: string): string`、`export interface HeartbeatTimer`、`export interface Heartbeat { stop(): Promise<void> }`、`export function startHeartbeat(store: RedisLike, logger, options?): Heartbeat`
  - `src/healthcheck.ts`：`export async function runHealthcheck(deps: { store: RedisLike; host: string; log: (msg: string) => void }): Promise<number>`

- [ ] **Step 1: 加依赖**

`apps/iot-worker/package.json` 的 `dependencies` 里，`"bullmq": "catalog:"` 之后加一行：

```json
"ioredis": "catalog:",
```

然后：

```bash
pnpm install
```

Expected：`pnpm-lock.yaml` 中 `apps/iot-worker` 的 importer 出现 `ioredis`；`pnpm install` 不报 `ERR_PNPM_CATALOG_ENTRY_NOT_FOUND`。

- [ ] **Step 2: 写失败的测试（三个文件）**

`apps/iot-worker/test/redis-store.test.ts`：

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRedis, wrapRedis, type RedisClientLike } from '../src/redis-store.js';

void test('createRedis 用快速失败的选项建连并吞掉 error 事件', () => {
  let options: Record<string, unknown> | undefined;
  let errorHandler: (() => void) | undefined;
  const fake: RedisClientLike = {
    async set() { return 'OK'; },
    async get() { return null; },
    async del() { return 1; },
    disconnect() { /* noop */ },
    on(event, handler) { if (event === 'error') errorHandler = handler; }
  };
  const store = createRedis('redis://x', (url, opts) => {
    assert.equal(url, 'redis://x');
    options = opts;
    return fake;
  });
  assert.deepEqual(options, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000
  });
  assert.equal(typeof errorHandler, 'function');
  store.disconnect();
});

void test('wrapRedis 把 TTL 转成 EX 参数并透传返回值', async () => {
  const calls: unknown[][] = [];
  const client: RedisClientLike = {
    async set(...args) { calls.push(args); return 'OK'; },
    async get() { return 'v'; },
    async del() { return 1; },
    disconnect() { /* noop */ },
    on() { /* noop */ }
  };
  const store = wrapRedis(client);
  await store.set('k', 'v', 30);
  assert.deepEqual(calls[0], ['k', 'v', 'EX', 30]);
  assert.equal(await store.get('k'), 'v');
});
```

`apps/iot-worker/test/heartbeat.test.ts`：

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TTL_SECONDS,
  heartbeatKey,
  startHeartbeat,
  type HeartbeatTimer
} from '../src/heartbeat.js';
import type { RedisLike } from '../src/redis-store.js';

function fakeTimer(): HeartbeatTimer & { tick(): void; cleared(): boolean } {
  let fn: (() => void) | undefined;
  let cleared = false;
  return {
    setInterval(handler) { fn = handler; return 1; },
    clearInterval() { cleared = true; },
    tick() { fn?.(); },
    cleared() { return cleared; }
  };
}

function fakeStore(failing = false): RedisLike & { sets: string[]; dels: string[] } {
  const sets: string[] = [];
  const dels: string[] = [];
  return {
    sets,
    dels,
    async set(key) {
      if (failing) throw new Error('down');
      sets.push(key);
    },
    async get() { return null; },
    async del(key) { dels.push(key); },
    disconnect() { /* noop */ }
  };
}

/** 让已排队的微任务跑完——比 `await Promise.resolve()` 稳 */
const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

void test('心跳键带队列前缀与容器主机名', () => {
  const key = heartbeatKey('abc123');
  assert.equal(key, 'wewant:worker:hb:abc123');
});

void test('TTL 大于刷新间隔且不超过三倍', () => {
  const ttlMs = HEARTBEAT_TTL_SECONDS * 1000;
  assert.ok(ttlMs > HEARTBEAT_INTERVAL_MS);
  assert.ok(ttlMs <= HEARTBEAT_INTERVAL_MS * 3);
});

void test('启动立即写一次，之后按间隔刷新；stop 清定时器并删键', async () => {
  const store = fakeStore();
  const timer = fakeTimer();
  const heartbeat = startHeartbeat(store, { warn() { /* noop */ } }, {
    host: 'h1',
    timer
  });
  await flush();
  assert.deepEqual(store.sets, ['wewant:worker:hb:h1']);

  timer.tick();
  await flush();
  assert.equal(store.sets.length, 2);

  await heartbeat.stop();
  assert.equal(timer.cleared(), true);
  assert.deepEqual(store.dels, ['wewant:worker:hb:h1']);
});

void test('连续失败只记一次 warn', async () => {
  const warnings: string[] = [];
  const timer = fakeTimer();
  startHeartbeat(
    fakeStore(true),
    { warn(_obj: object, msg: string) { warnings.push(msg); } },
    { host: 'h1', timer }
  );
  await flush();
  timer.tick();
  await flush();
  timer.tick();
  await flush();
  assert.equal(warnings.length, 1);
});
```

`apps/iot-worker/test/healthcheck.test.ts`：

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runHealthcheck } from '../src/healthcheck.js';
import type { RedisLike } from '../src/redis-store.js';

function storeWith(value: string | null): RedisLike {
  return {
    async set() { /* noop */ },
    async get() { return value; },
    async del() { /* noop */ },
    disconnect() { /* noop */ }
  };
}

void test('心跳键不存在时判不健康', async () => {
  const logs: string[] = [];
  const code = await runHealthcheck({
    store: storeWith(null),
    host: 'h1',
    log: message => logs.push(message)
  });
  assert.equal(code, 1);
  assert.equal(logs.length, 1);
});

void test('心跳键存在时判健康', async () => {
  const code = await runHealthcheck({
    store: storeWith('{"pid":1}'),
    host: 'h1',
    log() { /* noop */ }
  });
  assert.equal(code, 0);
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/redis-store.test.ts test/heartbeat.test.ts test/healthcheck.test.ts
```

Expected: FAIL，三个模块都不存在。

- [ ] **Step 4: 实现 redis-store 与心跳**

`apps/iot-worker/src/redis-store.ts`：

```ts
import { Redis } from 'ioredis';

/** 心跳与探针共用的一层薄封装——把 ioredis 的多余能力挡在外面，也让单测能注入替身 */
export interface RedisLike {
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  disconnect(): void;
}

export interface RedisClientLike {
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
  disconnect(): void;
  on(event: 'error', handler: () => void): void;
}

export interface RedisClientOptions {
  enableOfflineQueue: boolean;
  maxRetriesPerRequest: number;
  connectTimeout: number;
}

export function wrapRedis(client: RedisClientLike): RedisLike {
  return {
    async set(key, value, ttlSeconds) {
      await client.set(key, value, 'EX', ttlSeconds);
    },
    async get(key) {
      return await client.get(key);
    },
    async del(key) {
      await client.del(key);
    },
    disconnect() {
      client.disconnect();
    }
  };
}

/**
 * 建一条**快速失败**的连接：`enableOfflineQueue:false` 让 Redis 不可达时立刻抛，
 * 而不是把命令挂进离线队列（心跳宁可报错，也不要静默堆积）。
 */
export function createRedis(
  url: string,
  makeClient: (url: string, options: RedisClientOptions) => RedisClientLike = (
    target,
    options
  ) => new Redis(target, options)
): RedisLike {
  const client = makeClient(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000
  });
  // ioredis 的 error 事件不接会冒成未捕获异常
  client.on('error', () => undefined);
  return wrapRedis(client);
}
```

`apps/iot-worker/src/heartbeat.ts`：

```ts
import { hostname } from 'node:os';
import { TELEMETRY_QUEUE_PREFIX } from '@multi-admin/contracts';
import type { RedisLike } from './redis-store.js';

/** 键的存活时间；进程卡死时靠它自己过期 */
export const HEARTBEAT_TTL_SECONDS = 30;
/** 刷新间隔，必须明显小于 TTL */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * 带容器主机名：多实例部署时，一个健康实例的心跳不会顶掉另一个卡死实例的。
 */
export function heartbeatKey(host: string): string {
  return `${TELEMETRY_QUEUE_PREFIX}:worker:hb:${host}`;
}

export interface HeartbeatTimer {
  setInterval(handler: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface HeartbeatOptions {
  host?: string;
  intervalMs?: number;
  ttlSeconds?: number;
  timer?: HeartbeatTimer;
}

export interface Heartbeat {
  stop(): Promise<void>;
}

interface HeartbeatLogger {
  warn(obj: object, msg: string): void;
}

const REAL_TIMER: HeartbeatTimer = {
  setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
  clearInterval: id => globalThis.clearInterval(id as ReturnType<typeof setInterval>)
};

/**
 * 只反映"事件环还在转 + 队列 Redis 可达"，不反映消费进度。
 * 定时器与存储都可注入，单测不需要真 Redis、也不需要真等待。
 */
export function startHeartbeat(
  store: RedisLike,
  logger: HeartbeatLogger,
  options: HeartbeatOptions = {}
): Heartbeat {
  const host = options.host ?? hostname();
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const ttlSeconds = options.ttlSeconds ?? HEARTBEAT_TTL_SECONDS;
  const timer = options.timer ?? REAL_TIMER;
  const key = heartbeatKey(host);
  let warned = false;

  const beat = async (): Promise<void> => {
    try {
      await store.set(
        key,
        JSON.stringify({ pid: process.pid, ts: Date.now() }),
        ttlSeconds
      );
      warned = false;
    } catch (error) {
      if (!warned) {
        warned = true;
        logger.warn({ err: String(error) }, '心跳写入失败（本次进程只记一次）');
      }
    }
  };

  void beat();
  const timerId = timer.setInterval(() => void beat(), intervalMs);

  return {
    async stop(): Promise<void> {
      timer.clearInterval(timerId);
      try {
        await store.del(key);
      } catch {
        // 退出路径不因心跳失败而阻塞
      }
      store.disconnect();
    }
  };
}
```

- [ ] **Step 5: 跑单测确认通过**

```bash
pnpm --filter @multi-admin/iot-worker run test -- test/redis-store.test.ts test/heartbeat.test.ts
```

Expected: 6 passing。

- [ ] **Step 6: 写探针**

`apps/iot-worker/src/healthcheck.ts`：

```ts
import { hostname } from 'node:os';
import { heartbeatKey } from './heartbeat.js';
import { createRedis, type RedisLike } from './redis-store.js';

export interface HealthcheckDeps {
  store: RedisLike;
  host: string;
  log: (message: string) => void;
}

/**
 * 心跳键存在即健康。
 *
 * 测什么：事件环停摆（定时器不再刷新）、队列 Redis 不可达（键过期）。
 * 不测：消费卡住但事件环正常——那是指标，不是 liveness。
 */
export async function runHealthcheck(deps: HealthcheckDeps): Promise<number> {
  const value = await deps.store.get(heartbeatKey(deps.host));
  if (value === null) {
    deps.log('心跳键不存在或已过期');
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const url = process.env.QUEUE_REDIS_URL;
  if (url === undefined || url === '') {
    console.error('缺少 QUEUE_REDIS_URL');
    process.exitCode = 1;
    return;
  }

  const store = createRedis(url);
  try {
    process.exitCode = await runHealthcheck({
      store,
      host: hostname(),
      log: message => console.error(message)
    });
  } finally {
    store.disconnect();
  }
}

void main().catch(error => {
  console.error('健康检查失败：', error);
  process.exit(1);
});
```

- [ ] **Step 7: 接进进程入口**

`apps/iot-worker/src/index.ts`：

import 区加：

```ts
import { startHeartbeat } from './heartbeat.js';
import { createRedis } from './redis-store.js';
```

`consumer.start();` 之后、`const ring = ...` 之前加：

```ts
const heartbeat = startHeartbeat(createRedis(config.queueRedisUrl), logger);
```

把 `shutdown` 改成 async，并在停机链里带心跳：

```ts
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, '收到停止信号，先落库再退出');
  try {
    await Promise.all([
      consumer.close(),
      ring?.close() ?? Promise.resolve(),
      heartbeat.stop()
    ]);
    logger.info(consumer.stats, 'iot-worker 已停止');
    destroyTd();
    process.exit(0);
  } catch (error) {
    logger.error({ err: String(error) }, '停机失败');
    destroyTd();
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 8: compose 加 healthcheck**

`docker-compose.yml` 的 `worker` 服务，`depends_on` 之前插入：

```yaml
    healthcheck:
      test: ['CMD', 'node', 'dist/healthcheck.js']
      interval: 30s
      timeout: 5s
      retries: 2
      start_period: 30s
```

- [ ] **Step 9: 构建并验证健康 → 不健康 → 恢复**

```bash
pnpm --filter @multi-admin/iot-worker run build
docker compose up -d --build worker
sleep 45
docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q worker)"
```

Expected：`healthy`。

```bash
docker compose exec worker sh -c 'kill -STOP 1'
sleep 100
docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q worker)"
docker compose exec worker sh -c 'kill -CONT 1'
sleep 45
docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q worker)"
```

Expected：第二条 `unhealthy`（键过期 ≤40 s + 两次 30 s 探测），第三条回到 `healthy`。

- [ ] **Step 10: 门禁与提交**

```bash
pnpm --filter @multi-admin/iot-worker run typecheck
pnpm --filter @multi-admin/iot-worker run lint
pnpm --filter @multi-admin/iot-worker run test
pnpm --filter @multi-admin/iot-worker run test:coverage
git add apps/iot-worker/src/redis-store.ts apps/iot-worker/src/heartbeat.ts apps/iot-worker/src/healthcheck.ts apps/iot-worker/src/index.ts apps/iot-worker/test/redis-store.test.ts apps/iot-worker/test/heartbeat.test.ts apps/iot-worker/test/healthcheck.test.ts apps/iot-worker/package.json pnpm-lock.yaml docker-compose.yml
git commit -m "feat(repo): iot-worker 心跳与健康检查——卡死可被 docker ps 看出来"
```

Expected：`test:coverage` 通过（lines ≥90 / functions ≥85 / branches ≥80）。⚠️ `pnpm check` 只跑 `test`、不跑覆盖率，所以这一步不能省。

---

### Task 6: 文档与整体验收

**Files:**
- Modify: `docs/architecture/backend.md`（iot-worker 段落）
- Modify: `docs/engineering/build-and-verify.md`（脚本表）
- Modify: `docs/tasks/2026-11-02-iot-p1-increment-3/2026-11-02-s0-baseline.md`（补验收结果）

**Interfaces:**
- Consumes: 前五个任务的产出
- Produces: 无

- [ ] **Step 1: 更新 backend.md 的 worker 段**

在「消费者（`apps/iot-worker`）」段落末尾补一句（与相邻条目同一写法）：

```markdown
- **健康检查**：进程每 10 s 向队列 Redis 写心跳键 `wewant:worker:hb:<容器主机名>`（TTL 30 s），compose 的 healthcheck 跑 `node dist/healthcheck.js` 读该键。它只反映**事件环停摆**与**队列 Redis 不可达**，不反映消费进度（消费卡住但事件环正常时仍报健康）；⚠️ compose 不会因 unhealthy 自动重启，这是可见信号，并为 K8s 的 liveness 铺路。
```

- [ ] **Step 2: 更新 build-and-verify.md 的脚本表**

在 `downsample-verify.ts` 一行之后加：

```markdown
| `apps/iot-worker/scripts/subtable-audit.ts` | **只读子表审计**（`pnpm --filter @multi-admin/iot-worker run subtable:audit`）：比对「库内子表」与「注册表期望」的四桶（孤儿/缺失 × 原始/降采样），任一非空退出码 1。只读，**不含删除能力**——清库在开发环境用重建卷，正式删除归注销流程 |
```

- [ ] **Step 3: 写验收记录**

在 `docs/tasks/2026-11-02-iot-p1-increment-3/2026-11-02-s0-baseline.md` 追加验收表，每项只填「通过 / 不通过」，并在表下贴命令输出摘录：

```markdown
## 验收

| 项 | 判据（必须成立才算通过） | 结果 |
| --- | --- | --- |
| 干净基线 | `subtable:audit` 四桶全空；`SHOW` 计数 100 / 300 | 通过 / 不通过 |
| 审计能红 | 建 `probe_x` 后退出码 1 且点出名字；删掉后回到 0 | 通过 / 不通过 |
| 空期望闸 | 单测 `空期望集拒绝判定` 通过 | 通过 / 不通过 |
| 护栏能红 | 无流量时 `downsample:verify` 退出码 1 并打印"空对账不构成证据" | 通过 / 不通过 |
| e2e 不留行 | 连跑两次后子表计数不增长 | 通过 / 不通过 |
| 健康检查能红 | STOP 后 ≤90 s 变 unhealthy，CONT 后回到 healthy | 通过 / 不通过 |

### 输出摘录

（逐条粘贴对应命令的原始输出）
```

任一项"不通过"就停下来修，不要把未验证项写成通过。

- [ ] **Step 4: 全量门禁**

```bash
pnpm check
pnpm doc:lint
```

Expected：两者全绿。（`pnpm check` 含 prettier → typecheck → lint → stylelint → test 覆盖枚举；若 `check` 因与本增量无关的既有问题失败，先修或单独说明，不要跳过。）

- [ ] **Step 5: 提交**

```bash
git add docs/architecture/backend.md docs/engineering/build-and-verify.md docs/tasks/2026-11-02-iot-p1-increment-3/2026-11-02-s0-baseline.md
git commit -m "docs(repo): S0 清理与护栏收口——审计脚本与 worker 健康检查入事实源"
```

---

## 附：执行顺序与阻塞点

1. Task 1 **必须**先得到用户确认（`down -v` 不可逆）
2. Task 2 Step 1 若 `ins_tables` 列名与假设不符，**停下来报告**，不要自行改用 `SHOW TABLES`
3. Task 4 的 e2e 依赖 Task 1 起好的环境
4. Task 5 Step 9 需要能操作 docker；若本机无法 `kill -STOP`，记录"未验证"而不是跳过
