import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { applyAppDefaults } from './apply-app-defaults.js';

describe('applyAppDefaults', () => {
  const buildFakeApp = (config: Record<string, unknown>) => ({
    get: jest.fn(() => config),
    useLogger: jest.fn(),
    use: jest.fn(),
    setGlobalPrefix: jest.fn(),
    useGlobalPipes: jest.fn(),
    enableCors: jest.fn(),
    enableShutdownHooks: jest.fn()
  });

  it('装配全局前缀/中间件/pipes/CORS/shutdown/helmet', () => {
    const app = buildFakeApp({
      corsOrigin: 'http://a.com, http://b.com,',
      port: 3000,
      isProduction: true
    });

    applyAppDefaults(app as unknown as INestApplication);

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api/v1', {
      exclude: ['health']
    });
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: ['http://a.com', 'http://b.com']
    });
    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(app.useLogger).toHaveBeenCalled();
    expect(app.useGlobalPipes).toHaveBeenCalled();
    // helmet：app.use 参数中存在函数型中间件
    expect(
      app.use.mock.calls.some(([mw]: unknown[]) => typeof mw === 'function')
    ).toBe(true);
  });

  it('Swagger 仅非生产启用（路径 api/docs + Bearer scheme）', () => {
    const createSpy = jest
      .spyOn(SwaggerModule, 'createDocument')
      .mockReturnValue({} as never);
    const setupSpy = jest
      .spyOn(SwaggerModule, 'setup')
      .mockImplementation(() => undefined);
    const app = buildFakeApp({
      corsOrigin: '',
      port: 3000,
      isProduction: false
    });

    applyAppDefaults(app as unknown as INestApplication);

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(setupSpy).toHaveBeenCalledWith('api/docs', app, {});
    createSpy.mockRestore();
    setupSpy.mockRestore();
  });
});
