/**
 * Prisma query 事件的日志决策（纯函数，便于单测）。
 * - 超阈值（>=）：warn 级，慢查询文案（保持既有格式）
 * - 低于阈值且开启全量查询日志（PRISMA_QUERY_LOG=true）：log 级（info），普通查询文案
 * - 其余情况：不打日志（返回 null）
 */
export interface QueryLogEvent {
  query: string;
  duration: number;
}

export interface ResolvedQueryLog {
  level: 'warn' | 'log';
  message: string;
}

export function resolveQueryLog(
  event: QueryLogEvent,
  threshold: number,
  queryLog: boolean
): ResolvedQueryLog | null {
  if (event.duration >= threshold) {
    return {
      level: 'warn',
      message: `Slow query detected (${event.duration}ms >= ${threshold}ms): ${event.query}`
    };
  }
  if (queryLog) {
    return {
      level: 'log',
      message: `Query log (${event.duration}ms): ${event.query}`
    };
  }
  return null;
}
