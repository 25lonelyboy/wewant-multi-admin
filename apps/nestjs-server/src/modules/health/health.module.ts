import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator } from './database-health.indicator.js';
import { RedisHealthIndicator } from './redis-health.indicator.js';

@Module({
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator]
})
export class HealthModule {}
