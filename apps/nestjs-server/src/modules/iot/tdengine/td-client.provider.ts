import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service.js';
import { connectTd, destroyTd, type TdSql } from './td-client.js';

/**
 * TDengine 连接的单例持有者，**懒连接**。
 *
 * server 是 HTTP 服务：时序库不可达不该让它起不来。第一次真正用到时才建立连接，
 * 注册请求因此返回 5xx，其它接口不受影响。
 */
@Injectable()
export class TdClientProvider implements OnModuleDestroy {
  private readonly logger = new Logger(TdClientProvider.name);
  private connection: Promise<TdSql> | null = null;

  constructor(private readonly config: AppConfigService) {}

  /**
   * 取连接。并发调用共享同一个建立中的 Promise；建立失败则清空缓存，
   * 下一次调用重新尝试，而不是把一次瞬时故障固化成永久失败。
   */
  get(): Promise<TdSql> {
    if (this.connection === null) {
      const pending = connectTd(this.config.tdengineUrl);
      this.connection = pending;
      void pending.catch(() => {
        if (this.connection === pending) this.connection = null;
      });
    }
    return this.connection;
  }

  async onModuleDestroy(): Promise<void> {
    const pending = this.connection;
    this.connection = null;
    if (pending !== null) {
      try {
        await (await pending).close();
      } catch (error) {
        this.logger.warn(`关闭 TDengine 连接失败：${String(error)}`);
      }
    }
    // 连接器在 import 时就已加载，即使从未连上也要释放其全局资源
    destroyTd();
  }
}
