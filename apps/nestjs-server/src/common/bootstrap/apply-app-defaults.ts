import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service.js';
import { requestIdMiddleware } from '../middleware/request-id.middleware.js';

/**
 * main.ts 与 e2e 共用的应用装配（P1 残留 B 项收尾）：
 * 全局前缀 / requestId 中间件 / ValidationPipe / CORS / shutdown 钩子。
 * 新增 e2e 直接复用，消除装配漂移。
 */
export function applyAppDefaults(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // 逗号分隔允许多来源；trim + 过滤空串，容忍 "a, b" 与尾逗号等手写配置
  app.enableCors({
    origin: config.corsOrigin
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  });
  app.enableShutdownHooks();
}
