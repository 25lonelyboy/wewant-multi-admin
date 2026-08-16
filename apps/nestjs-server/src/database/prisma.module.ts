import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * 全局数据访问模块；数据权限/租户中间件挂载点预留（P3/P4 消费）。
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
