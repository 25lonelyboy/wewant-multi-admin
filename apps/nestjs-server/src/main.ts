import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
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

  await app.listen(config.port);
}

void (async () => {
  await bootstrap();
})();
