import pino from 'pino';
import type { WorkerConfig } from './config.js';

export type Logger = pino.Logger;

/** 结构化日志：字段进 JSON，便于后续按 subtable / reason 聚合 */
export function createLogger(config: WorkerConfig): Logger {
  return pino({
    level: config.logLevel,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
