import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { AppConfigService } from '../../config/app-config.service.js';

// requestId 由 request-id 中间件在 main.ts 以 app.use 注册（先于 Nest 路由），
// 此处复用其写入的值；可选语义准确：中间件未注册时 requestId 缺失
interface RequestWithId extends IncomingMessage {
  requestId?: string;
}

/**
 * 结构化日志：dev 环境 pino-pretty 可读输出；test/production 纯 JSON 行
 * （test 不开 transport，避免 jest 中 worker 线程干扰）。
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          // 读取 request-id 中间件写入的 requestId；缺失时兜底生成
          // （防御性兜底：若中间件移除，日志 id 与响应头脱钩，但不应崩溃）
          genReqId: req => (req as RequestWithId).requestId ?? randomUUID(),
          redact: {
            paths: ['req.headers.authorization', '*.password'],
            censor: '***'
          },
          // 忽略 pathname 为 /health 的请求（兼容 /health?x=1、/health/）
          autoLogging: { ignore: req => req.url?.split('?')[0] === '/health' },
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
