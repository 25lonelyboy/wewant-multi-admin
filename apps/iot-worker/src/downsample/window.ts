/**
 * 降采样窗口边界——**纯函数**，不依赖 TDengine、不依赖墙上时钟（`nowMs` 由调用方给）。
 *
 * ⚠️ 窗口对齐发生在**服务器本地时间**（实测 3.4.2.8：`INTERVAL(1d)` 的窗口从 00:00 本地开始，
 * 加 offset 后从 `offset` 本地时刻开始）。本地 = UTC + `SERVER_TZ_OFFSET_MS`，故
 * UTC 口径下的边界是 `floor((t + tz - offset) / W) * W + offset - tz`。
 * ⭐ 这里必须与读查询的 `INTERVAL(<W>[, <offset>])` **用同一组 `windowMs` / `offsetMs`**——
 * 两者错开哪怕一小时，算出来的就不是数据库会写的那一段，且**静默无报错**。
 */

/** 服务器时区相对 UTC 的偏移（毫秒）。部署断言为 Asia/Shanghai（UTC+8，无夏令时） */
export const SERVER_TZ_OFFSET_MS = 8 * 3_600_000;

/** 一级降采样的窗口口径——与读查询的 `INTERVAL` 子句同源 */
export interface WindowSpec {
  /** 窗口长度（毫秒） */
  windowMs: number;
  /** 业务日 offset（毫秒）；读查询 `INTERVAL` 的第二参，非业务日窗口为 0 */
  offsetMs: number;
}

/**
 * `nowMs` 之前**最后一个已闭合窗口的右边界**（epoch 毫秒）。
 *
 * ⭐ 右边界 ≤ now 才闭合：用它当 `endMs` 就不会把"半截窗口"当成完整的写出去（§6 row 5）。
 */
export function lastClosedBoundary(
  nowMs: number,
  spec: WindowSpec,
  tzOffsetMs: number = SERVER_TZ_OFFSET_MS
): number {
  const local = nowMs + tzOffsetMs;
  const localBoundary =
    Math.floor((local - spec.offsetMs) / spec.windowMs) * spec.windowMs +
    spec.offsetMs;
  return localBoundary - tzOffsetMs;
}

/**
 * 覆盖最近 `lookback` 个**已闭合**窗口的半开区间 `[startMs, endMs)`（均 epoch 毫秒）。
 *
 * 每次都重算这一段而没有游标：晚到的数据只要落在最近 `lookback` 个窗口内，下一轮就会被算进去
 * ——这正是补传与停机的自愈机制（§3.2）。多算出来的窗口由下一轮覆盖，幂等无害。
 */
export function closedWindowRange(
  nowMs: number,
  spec: WindowSpec,
  lookback: number,
  tzOffsetMs: number = SERVER_TZ_OFFSET_MS
): { startMs: number; endMs: number } {
  const endMs = lastClosedBoundary(nowMs, spec, tzOffsetMs);
  return { startMs: endMs - lookback * spec.windowMs, endMs };
}
