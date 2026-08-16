import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { AppConfigService } from '../config/app-config.service.js';

/**
 * Prisma 7 官方形态：driver adapter 自管连接池，应用层不持有 pg.Pool。
 * 生命周期挂 OnApplicationBootstrap/Shutdown（与 P1 enableShutdownHooks 联动）。
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(config: AppConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl })
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
