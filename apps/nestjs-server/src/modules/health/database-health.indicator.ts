import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

/** 探针超时（ms）：依赖假死时避免 /health 永久悬挂。导出以便测试注入小值。 */
export const PROBE_TIMEOUT_MS = 3_000;

export interface ProbeResult {
  status: 'up' | 'down';
  error?: string;
}

/**
 * 自写 DB 探针（脱离 terminus HealthIndicator 弃用基类，
 * 改纯 Injectable + ProbeResult；/health 信封契约保持不变）。
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('probe timeout')),
          timeoutMs
        );
        timer.unref();
      });
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
