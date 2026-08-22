import {
  Global,
  Inject,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Redis } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service.js';
import { REDIS_CLIENT } from './redis.constants.js';

/**
 * 自研薄壳（设计 §5.1）：lazyConnect + 启动 ping 快速失败；
 * maxRetriesPerRequest:null 为官方 going-to-production 推荐（BullMQ 前瞻）；
 * error 事件转 nestjs-pino，避免无 listener 时连接错误 crash 进程；
 * 不启用 keyPrefix（会与未来 BullMQ 键空间冲突，设计 §5.2）。
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService, Logger],
      useFactory: (config: AppConfigService, logger: Logger) => {
        const client = new Redis(config.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: null
        });
        // 按连接状态迁移去重，重连风暴下不再刷屏；ready 后复位允许再报
        let errorLogged = false;
        client.on('error', (err: unknown) => {
          if (!errorLogged) {
            errorLogged = true;
            logger.error({ err }, 'redis 连接错误（自动重连中）');
          }
        });
        client.on('ready', () => {
          errorLogged = false;
        });
        return client;
      }
    }
  ],
  exports: [REDIS_CLIENT]
})
export class RedisModule
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    // 快速失败：Redis 不可达即崩，compose 重启策略兜底，不拖到运行时
    await this.redis.ping();
  }

  /** quit 3s 竞速超时，超时强制 disconnect，防 shutdown 悬挂 */
  async onApplicationShutdown(): Promise<void> {
    await Promise.race([
      this.redis.quit().catch(() => undefined),
      new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 3_000);
        timer.unref();
      })
    ]);
    if (this.redis.status !== 'end') {
      this.redis.disconnect();
    }
  }
}
