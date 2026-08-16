import { Injectable } from '@nestjs/common';
import { HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service.js';

/**
 * 自写 DB 探针（设计 §6）：不用 terminus 内置 PrismaHealthIndicator，
 * 其回落逻辑依赖错误文案字符串匹配，v7 query compiler 下未验证。
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus('database', true);
    } catch {
      return this.getStatus('database', false);
    }
  }
}
