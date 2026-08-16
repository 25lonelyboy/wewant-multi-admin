import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

/**
 * 双探针健康检查：terminus 只做编排，失败时其抛 ServiceUnavailableException（503），
 * 经全局过滤器派生 code 50300（status × 100，总 spec §5）。信封由响应拦截器包装。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy(),
      () => this.redis.isHealthy()
    ]);
  }
}
