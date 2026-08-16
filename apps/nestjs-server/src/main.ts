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
  app.enableCors({ origin: config.corsOrigin.split(',') });
  app.enableShutdownHooks();

  await app.listen(config.port);
}

void (async () => {
  await bootstrap();
})();
