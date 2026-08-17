import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';
import type { ProbeResult } from './database-health.indicator.js';

/** 探针超时（ms）：依赖假死时避免 /health 永久悬挂。导出以便测试注入小值。 */
export const PROBE_TIMEOUT_MS = 3_000;

@Injectable()
export class RedisHealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isHealthy(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    try {
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('probe timeout')),
          timeoutMs
        );
        timer.unref();
      });
      const pong = await Promise.race([this.redis.ping(), timeout]);
      if (pong !== 'PONG') {
        return {
          status: 'down',
          error: `unexpected ping response: ${String(pong)}`
        };
      }
      return { status: 'up' };
    } catch (err) {
      return {
        status: 'down',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }
}
