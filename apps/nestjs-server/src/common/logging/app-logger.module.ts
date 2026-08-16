import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';

/**
 * 结构化日志：dev 环境 pino-pretty 可读输出；test/production 纯 JSON 行
 * （test 不开 transport，避免 jest 中 worker 线程干扰）。
 * genReqId 复用 requestId 中间件写入的 req.requestId。
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          // requestId 由 request-id 中间件写入（见 express-request.d.ts 全局扩展），此处仅读取
          genReqId: req =>
            (req as unknown as Express.Request).requestId ?? randomUUID(),
          redact: {
            paths: ['req.headers.authorization', '*.password'],
            censor: '***'
          },
          autoLogging: { ignore: req => req.url === '/health' },
          ...(config.nodeEnv === 'development'
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' }
                }
              }
            : {})
        }
      })
    })
  ]
})
export class AppLoggerModule {}
