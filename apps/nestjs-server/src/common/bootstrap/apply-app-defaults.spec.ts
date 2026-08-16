import type { INestApplication } from '@nestjs/common';
import { applyAppDefaults } from './apply-app-defaults.js';

describe('applyAppDefaults', () => {
  it('装配全局前缀/中间件/pipes/CORS/shutdown', () => {
    // mock app.get 对 Logger / AppConfigService 均返回含所需字段的对象
    // （useLogger 不校验内容，仅验证装配调用）
    const app = {
      get: jest.fn(() => ({
        corsOrigin: 'http://a.com, http://b.com,',
        port: 3000
      })),
      useLogger: jest.fn(),
      use: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      enableCors: jest.fn(),
      enableShutdownHooks: jest.fn()
    };

    applyAppDefaults(app as unknown as INestApplication);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: ['health']
    });
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://a.com', 'http://b.com']
    });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(app.useLogger).toHaveBeenCalled();
    expect(app.use).toHaveBeenCalled();
    expect(app.useGlobalPipes).toHaveBeenCalled();
  });
});
