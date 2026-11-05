import type { Logger } from '@nestjs/common';
import type { TdSql } from '../tdengine/td-client.js';

/** 记录“本次注册建了哪些表”，失败清理只认这份清单 */
export interface CreatedTable {
  db: string;
  name: string;
  kind: 'stable' | 'table';
}

export interface CleanupContext {
  modelCode?: string;
  localDeviceId?: string;
}

const DROP_ATTEMPTS = 3;

/**
 * 按清单**逆序**删除本次建的表。
 *
 * ⚠️ 只删清单里的名字：不按前缀匹配、不做“看起来像我们建的”推断——删错会删掉别人的表。
 * 单张失败先重试（间隔递增）；仍失败只记 error 并继续删下一张，残留由审计
 * （`orphanRaw` / `orphanDs`）兜住。
 */
export async function dropCreatedTables(
  td: TdSql,
  created: readonly CreatedTable[],
  logger: Logger,
  context: CleanupContext
): Promise<void> {
  for (const table of [...created].reverse()) {
    const sql = `DROP ${table.kind === 'stable' ? 'STABLE' : 'TABLE'} ${table.db}.${table.name}`;
    let lastError: unknown;
    for (let attempt = 0; attempt < DROP_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
      try {
        await td.exec(sql);
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError !== undefined) {
      const detail =
        lastError instanceof Error ? lastError.message : '未知错误';
      logger.error(
        `注册失败清理：删除表 ${table.db}.${table.name} 仍失败，留给审计认领` +
          `（modelCode=${context.modelCode ?? '-'}，localDeviceId=${context.localDeviceId ?? '-'}）：${detail}`
      );
    }
  }
}
