import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Prisma 7 官方形态：driver adapter 自管连接池，应用层不持有 pg.Pool。
 * 生命周期挂 OnApplicationBootstrap/Shutdown（与 P1 enableShutdownHooks 联动）。
 * 慢查询超阈值（PRISMA_SLOW_QUERY_MS）或 PRISMA_QUERY_LOG=true 时输出 warn 日志。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly config: AppConfigService;
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.databaseUrl,
        max: config.databasePoolMax
      }),
      log: [{ level: 'query', emit: 'event' }]
    });
    this.config = config;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.$connect();
    (this as PrismaClient<'query'>).$on(
      'query',
      (e: { query: string; duration: number }) => {
        const threshold = this.config.prismaSlowQueryMs;
        if (e.duration >= threshold || this.config.prismaQueryLog) {
          this.logger.warn(
            `Slow query detected (${e.duration}ms >= ${threshold}ms): ${e.query}`
          );
        }
      }
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
