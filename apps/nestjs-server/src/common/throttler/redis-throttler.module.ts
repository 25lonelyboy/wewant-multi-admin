import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { RedisThrottlerStorage } from './redis-throttler.storage.js';

/**
 * 桥接模块：将 RedisThrottlerStorage 与其 RedisModule 依赖捆绑导出，
 * 供 ThrottlerModule.forRootAsync 的 imports 解析注入链。
 */
@Module({
  imports: [RedisModule],
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage]
})
export class RedisThrottlerModule {}
