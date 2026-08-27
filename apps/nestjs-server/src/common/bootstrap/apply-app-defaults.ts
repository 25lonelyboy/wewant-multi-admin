import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { json } from 'express';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfigService } from '../../config/app-config.service.js';
import { toValidationErrorDetails } from '../errors/validation-error-details.js';
import { requestIdMiddleware } from '../middleware/request-id.middleware.js';

/**
 * main.ts 与 e2e 共用的应用装配：
 * 全局前缀 / requestId 中间件 / helmet / ValidationPipe / CORS / Swagger / shutdown 钩子。
 */
export function applyAppDefaults(app: INestApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.use(requestIdMiddleware);
  // helmet：非生产关 CSP（Swagger UI 依赖内联脚本，默认 CSP 致文档页白屏）；生产保持默认
  app.use(helmet(config.isProduction ? {} : { contentSecurityPolicy: false }));
  // 请求体大小：路由级必须在前面注册，全局兜底
  app.use('/api/v1/upload', json({ limit: config.uploadBodyLimit }));
  app.use(json({ limit: config.bodyLimit }));
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException({
          statusCode: 400,
          message: '参数校验失败',
          // 递归展开嵌套 DTO：嵌套字段以点分路径输出（如 meta.title）
          errors: toValidationErrorDetails(errors)
        })
    })
  );
  // 逗号分隔允许多来源；trim + 过滤空串，容忍 "a, b" 与尾逗号等手写配置
  app.enableCors({
    origin: config.corsOrigin
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  });
  // Swagger：仅非生产启用
  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('多端管理后台 API')
      .setDescription('P3 认证与 RBAC 端点域；信封 {code,message,data}')
      .setVersion('v1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
  app.enableShutdownHooks();
}
