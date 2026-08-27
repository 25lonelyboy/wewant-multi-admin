import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema.js';
import { parseDurationToSeconds } from './parse-duration.js';

/**
 * 类型安全的配置访问入口：业务代码注入本服务，不裸写字符串 key。
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get port(): number {
    return this.config.get('PORT', { infer: true });
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get corsOrigin(): string {
    return this.config.get('CORS_ORIGIN', { infer: true });
  }

  get databaseUrl(): Env['DATABASE_URL'] {
    return this.config.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): Env['REDIS_URL'] {
    return this.config.get('REDIS_URL', { infer: true });
  }

  get jwtAccessSecret(): Env['JWT_ACCESS_SECRET'] {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  get jwtRefreshSecret(): Env['JWT_REFRESH_SECRET'] {
    return this.config.get('JWT_REFRESH_SECRET', { infer: true });
  }

  get jwtAccessTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get('JWT_ACCESS_TTL', { infer: true })
    );
  }

  get jwtRefreshTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get('JWT_REFRESH_TTL', { infer: true })
    );
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get bodyLimit(): string {
    return this.config.get('BODY_LIMIT', { infer: true });
  }

  get uploadBodyLimit(): string {
    return this.config.get('UPLOAD_BODY_LIMIT', { infer: true });
  }

  get prismaSlowQueryMs(): number {
    return this.config.get('PRISMA_SLOW_QUERY_MS', { infer: true });
  }

  get databasePoolMax(): number {
    return this.config.get('DATABASE_POOL_MAX', { infer: true });
  }

  get prismaQueryLog(): boolean {
    return this.config.get('PRISMA_QUERY_LOG', { infer: true }) === 'true';
  }
}
