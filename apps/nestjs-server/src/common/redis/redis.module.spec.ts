import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import { RedisModule } from './redis.module.js';
import { REDIS_CLIENT } from './redis.constants.js';
import { AppConfigService } from '../../config/app-config.service.js';

// ioredis v6 类型改为具名导出（运行时 CJS 仍同时挂 default/Redis），
// 故 mock 同时提供 default 与 Redis 两个键，与 import { Redis } 匹配
jest.mock('ioredis', () => {
  const instance = {
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    on: jest.fn().mockReturnThis(),
    status: 'ready'
  };
  const ctor = jest.fn(() => instance);
  return { __esModule: true, default: ctor, Redis: ctor, __instance: instance };
});

// 共享 mock 实例的断言形态：属性均为 jest.Mock，避免 unbound-method 误报
interface RedisMockInstance {
  ping: jest.Mock;
  quit: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
  status: string;
}

const config = {
  redisUrl: 'redis://localhost:6379'
} as unknown as AppConfigService;

// 模块封装：REDIS_CLIENT useFactory 的 inject 在 RedisModule 作用域解析，
// 根测试模块的 providers 对其不可见，需用全局模块提供 mock。
@Global()
@Module({
  providers: [
    { provide: AppConfigService, useValue: config },
    { provide: Logger, useValue: { error: jest.fn(), info: jest.fn() } }
  ],
  exports: [AppConfigService, Logger]
})
class MockRedisDepsModule {}

function buildModule() {
  return Test.createTestingModule({
    imports: [MockRedisDepsModule, RedisModule]
  }).compile();
}

describe('RedisModule', () => {
  const emit = (
    client: RedisMockInstance,
    event: string,
    ...args: unknown[]
  ) => {
    const entry = client.on.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === event
    ) as [string, (...a: unknown[]) => void] | undefined;
    expect(entry).toBeDefined();
    entry![1](...args);
  };

  it('以 lazyConnect + maxRetriesPerRequest:null 构造实例并导出具名 token', async () => {
    const moduleRef = await buildModule();
    const client = moduleRef.get<Redis>(REDIS_CLIENT);
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: null
    });
    expect(client).toBeDefined();
    await moduleRef.close();
  });

  it('bootstrap 时 ping 失败则应用启动失败（快速失败）', async () => {
    const moduleRef = await buildModule();
    const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
    client.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(moduleRef.init()).rejects.toThrow('ECONNREFUSED');
    // init 失败后 initializationPromise 已 reject，close() 会再次抛出同一错误，需吞掉
    await moduleRef.close().catch(() => undefined);
  });

  it('shutdown 时优雅 quit', async () => {
    const moduleRef = await buildModule();
    await moduleRef.init();
    const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
    await moduleRef.close();
    expect(client.quit).toHaveBeenCalled();
  });

  /* eslint-disable @typescript-eslint/unbound-method */
  it('error 日志按状态迁移去重，ready 后复位', async () => {
    const moduleRef = await buildModule();
    const logger = moduleRef.get(Logger);
    const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
    emit(client, 'error', new Error('conn refused'));
    emit(client, 'error', new Error('conn refused'));
    expect(logger.error).toHaveBeenCalledTimes(1);
    emit(client, 'ready');
    emit(client, 'error', new Error('conn refused'));
    expect(logger.error).toHaveBeenCalledTimes(2);
    await moduleRef.close().catch(() => undefined);
  });
  /* eslint-enable @typescript-eslint/unbound-method */

  it('quit 悬挂 3s 后强制 disconnect，shutdown 不卡死', async () => {
    const moduleRef = await buildModule();
    await moduleRef.init();
    const client = moduleRef.get<RedisMockInstance>(REDIS_CLIENT);
    client.quit.mockReturnValueOnce(new Promise(() => undefined)); // 永不 resolve
    client.status = 'connecting';
    await moduleRef.close(); // jest 默认 5s 超时内必须返回

    expect(client.disconnect).toHaveBeenCalled();
  });
});
