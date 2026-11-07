import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { REDIS_CLIENT } from '../../../common/redis/redis.constants.js';
import { REGISTRY_REV_KEY } from './snapshot.keys.js';

/**
 * 档案期望版本号（`iot:registry:rev`）。
 *
 * ⚠️ **写路径只在 PG 事务提交之后调用**：事务内的 `INCR` 先于提交，重建器可能读到未提交的数据。
 * ⚠️ **`bump()` 失败只记 error，不影响接口返回**：PG 已经提交，让请求失败会误导调用方以为没建成功；
 * 漏掉的版本号由 60 秒无条件重建补上。
 */
@Injectable()
export class RegistryRevisionService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: Logger
  ) {}

  async bump(): Promise<void> {
    try {
      await this.redis.incr(REGISTRY_REV_KEY);
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        '档案版本号递增失败，由 60 秒无条件重建兜底'
      );
    }
  }

  async read(): Promise<number> {
    const value = await this.redis.get(REGISTRY_REV_KEY);
    if (value === null) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
