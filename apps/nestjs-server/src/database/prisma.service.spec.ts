import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService } from './prisma.service.js';

jest.mock('@prisma/adapter-pg', () => ({
  // 生成 client 构造时校验 adapter.provider，需补最小形态
  PrismaPg: jest.fn().mockReturnValue({
    __mockAdapter: true,
    provider: 'postgres',
    adapterName: '@prisma/adapter-pg'
  })
}));

describe('PrismaService', () => {
  const config = {
    databaseUrl: 'postgresql://u:p@h:5432/db',
    databasePoolMax: 20,
    prismaSlowQueryMs: 500,
    prismaQueryLog: false
  } as AppConfigService;

  it('以官方形态构造 adapter（connectionString + max 传入）', () => {
    void new PrismaService(config);
    expect(PrismaPg).toHaveBeenCalledWith({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax
    });
  });

  it('生命周期：bootstrap 连接并注册 query 监听、shutdown 断开', async () => {
    const service = new PrismaService(config);
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);
    const on = jest.spyOn(service, '$on').mockImplementation(() => undefined);
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();
    expect(connect).toHaveBeenCalled();
    expect(on).toHaveBeenCalledWith('query', expect.any(Function));

    await service.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalled();
  });
});
