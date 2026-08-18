import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/**
 * 双探针健康检查（债 #4：自研轻量编排替换 terminus）：
 * 任一探针 down → 503，经全局过滤器派生 code 50300（status × 100，总 spec §5）。
 * 信封 {code:0, data:{status, details}} 契约保持不变（e2e 既有断言为验收基准）。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator
  ) {}

  @Public()
  @Get()
  async check() {
    const database = await this.db.isHealthy();
    const redis = await this.redis.isHealthy();
    const details = { database, redis };
    if (database.status !== 'up' || redis.status !== 'up') {
      throw new HttpException(
        { status: 'error', details },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }
    return { status: 'ok', details };
  }
}
