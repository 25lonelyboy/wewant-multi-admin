import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.constants.js';

/** 探针超时（ms）：依赖假死时避免 /health 永久悬挂。导出以便测试注入小值。 */
export const PROBE_TIMEOUT_MS = 3_000;

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
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
      const pong = await Promise.race([this.redis.ping(), timeout]);
      return this.getStatus('redis', pong === 'PONG');
    } catch (err) {
      return this.getStatus('redis', false, {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}
