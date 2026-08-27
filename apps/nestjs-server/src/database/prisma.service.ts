import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';
import { resolveQueryLog } from './query-log.js';

/**
 * Prisma 7 官方形态：driver adapter 自管连接池，应用层不持有 pg.Pool。
 * 生命周期挂 OnApplicationBootstrap/Shutdown（与 P1 enableShutdownHooks 联动）。
 * 慢查询超阈值（PRISMA_SLOW_QUERY_MS）输出 warn 日志；
 * PRISMA_QUERY_LOG=true 时低于阈值的查询另以 log（info）级输出，文案区分。
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
        const resolved = resolveQueryLog(
          e,
          this.config.prismaSlowQueryMs,
          this.config.prismaQueryLog
        );
        if (resolved) {
          this.logger[resolved.level](resolved.message);
        }
      }
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
