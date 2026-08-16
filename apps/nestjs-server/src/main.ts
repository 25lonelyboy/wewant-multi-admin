import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { applyAppDefaults } from './common/bootstrap/apply-app-defaults.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  applyAppDefaults(app);
  await app.listen(app.get(AppConfigService).port);
}

void (async () => {
  await bootstrap();
})();
