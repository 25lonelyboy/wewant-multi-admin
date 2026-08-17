import { Test } from '@nestjs/testing';
import type { AppConfigService } from './app-config.service.js';

describe('AppConfigService', () => {
  let service: AppConfigService;

  beforeAll(async () => {
    process.env['LOG_LEVEL'] = 'warn';
    // 动态 import：@nestjs/config 4.x 的 forRoot 在模块加载时同步执行 validate
    // 并缓存校验结果快照，故须在 process.env 就绪后再加载模块，快照才会包含 warn
    const { AppConfigModule } = await import('./app-config.module.js');
    const { AppConfigService } = await import('./app-config.service.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule]
    }).compile();
    service = moduleRef.get(AppConfigService);
  });

  afterAll(() => {
    delete process.env['LOG_LEVEL'];
  });

  it('process.env 优先于 .env 文件且经 zod 校验', () => {
    expect(service.logLevel).toBe('warn');
  });

  it('提供类型安全 getter 与派生属性', () => {
    expect(typeof service.port).toBe('number');
    expect(typeof service.isProduction).toBe('boolean');
  });

  it('databaseUrl/redisUrl 读取测试态兜底环境变量', () => {
    expect(service.databaseUrl).toBe(process.env['DATABASE_URL']);
    expect(service.redisUrl).toBe(process.env['REDIS_URL']);
  });

  it('JWT getter：secret 透传 env、TTL 解析为秒', () => {
    expect(service.jwtAccessSecret).toBe(process.env['JWT_ACCESS_SECRET']);
    expect(service.jwtRefreshSecret).toBe(process.env['JWT_REFRESH_SECRET']);
    expect(service.jwtAccessTtlSeconds).toBe(900); // 默认 15m
    expect(service.jwtRefreshTtlSeconds).toBe(604800); // 默认 7d
  });
});
