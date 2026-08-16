import { Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service.js';

/** 探针超时（ms）：依赖假死时避免 /health 永久悬挂。导出以便测试注入小值。 */
export const PROBE_TIMEOUT_MS = 3_000;

/**
 * 自写 DB 探针（设计 §6）：不用 terminus 内置 PrismaHealthIndicator，
 * 其回落逻辑依赖错误文案字符串匹配，v7 query compiler 下未验证。
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(
    timeoutMs: number = PROBE_TIMEOUT_MS
  ): Promise<HealthIndicatorResult> {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('probe timeout')),
          timeoutMs
        );
        timer.unref();
      });
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return this.getStatus('database', true);
    } catch (err) {
      return this.getStatus('database', false, {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
