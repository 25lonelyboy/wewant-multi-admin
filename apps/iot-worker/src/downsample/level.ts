import { DS_LEVELS, type DsLevel } from '@multi-admin/device-registry';
import type { WindowSpec } from './window.js';

/**
 * 一级降采样的全部口径：窗口、**读查询的 `INTERVAL` 表达式**、**调度**。
 *
 * ⭐ 窗口的 `windowMs`/`offsetMs` 与 `windowExpr`/`offsetExpr` 必须描述**同一个窗口**——
 * 前者喂给边界算术，后者原样进读查询；两者不一致就是"算一段、查另一段"，且不报错。
 */

/** BullMQ 调度：`every` 与 `pattern`（cron）二者取一 */
export interface LevelSchedule {
  /** 调度 id——⚠️ 不能带冒号（BullMQ 用冒号组织键空间） */
  id: string;
  /** 固定间隔（毫秒） */
  every?: number;
  /** cron 表达式（与 `tz` 配对） */
  pattern?: string;
  /** cron 的时区口径 */
  tz?: string;
}

export interface DsLevelSpec extends WindowSpec {
  level: DsLevel;
  /** 读查询 `INTERVAL` 的第一段，如 `1m` / `1h` / `1d` */
  windowExpr: string;
  /** 读查询 `INTERVAL` 的第二段（业务日 offset），如 `8h`；非业务日窗口为 `null` */
  offsetExpr: string | null;
  schedule: LevelSchedule;
}

/**
 * 三级**平级**：都从原始超表算，互不依赖（§4 说明为何不链式）。
 *
 * ⚠️ `1d` 的业务日从早 8 点起（§11）⇒ 读查询 `INTERVAL(1d, 8h)`、边界算术 `offsetMs = 8h`，
 * 两者同源。
 */
export const LEVEL_SPECS: readonly DsLevelSpec[] = [
  {
    level: '1m',
    windowMs: 60_000,
    offsetMs: 0,
    windowExpr: '1m',
    offsetExpr: null,
    schedule: { id: 'ds-1m', every: 60_000 }
  },
  {
    level: '1h',
    windowMs: 3_600_000,
    offsetMs: 0,
    windowExpr: '1h',
    offsetExpr: null,
    schedule: { id: 'ds-1h', every: 3_600_000 }
  },
  {
    level: '1d',
    windowMs: 86_400_000,
    offsetMs: 8 * 3_600_000,
    windowExpr: '1d',
    offsetExpr: '8h',
    schedule: { id: 'ds-1d', pattern: '0 8 * * *', tz: 'Asia/Shanghai' }
  }
];

/** 读查询里原样使用的 `INTERVAL(...)` 子句 */
export function intervalClause(spec: DsLevelSpec): string {
  const inner =
    spec.offsetExpr === null
      ? spec.windowExpr
      : `${spec.windowExpr}, ${spec.offsetExpr}`;
  return `INTERVAL(${inner})`;
}

/** 按级别取窗口口径 */
export function levelSpec(level: DsLevel): DsLevelSpec {
  const spec = LEVEL_SPECS.find(candidate => candidate.level === level);
  if (spec === undefined) throw new Error(`未知降采样级别：${level}`);
  return spec;
}

/** 三级齐全——与 `device-registry` 的 `DS_LEVELS` 对齐（改一处须同步另一处） */
export function assertLevelCoverage(): void {
  const missing = DS_LEVELS.filter(
    level => !LEVEL_SPECS.some(spec => spec.level === level)
  );
  if (missing.length > 0) {
    throw new Error(`降采样级别缺少窗口口径：${missing.join(', ')}`);
  }
}
