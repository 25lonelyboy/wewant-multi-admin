import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service.js';
import type { RequestWithId } from '../middleware/request-id.middleware.js';

/**
 * 结构化日志：dev 环境 pino-pretty 可读输出；test/production 纯 JSON 行
 * （test 不开 transport，避免 jest 中 worker 线程干扰）。
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        // nestjs-pino 4.6.1 默认 forRoutes '*'（叠加全局前缀后 Nest 11 报 Unsupported route path WARN），
        // 此处用官方逃生口语法固定为全部路由，消除启动 WARN
        forRoutes: ['/{*splat}'],
        pinoHttp: {
          level: config.logLevel,
          // 读取 request-id 中间件写入的 requestId；缺失时兜底生成
          // （防御性兜底：若中间件移除，日志 id 与响应头脱钩，但不应崩溃）
          genReqId: req => (req as RequestWithId).requestId ?? randomUUID(),
          // 请求作用域日志统一携带 requestId 字段（P1 残留：filter context 与 pino req.id 漂移）
          customProps: req => ({
            requestId: (req as RequestWithId).requestId
          }),
          redact: {
            paths: ['req.headers.authorization', '*.password'],
            censor: '***'
          },
          // 健康检查路径不产生访问日志（含 query 变体；尾斜杠 /health/ 暂不覆盖，P2 换 terminus 时按需处理）
          // 注意：Nest 中间件在路由匹配后执行，req.url 已被 Express 5 改写为剩余路径，必须用 originalUrl 判断
          autoLogging: {
            ignore: req =>
              (req as Request).originalUrl?.split('?')[0] === '/health'
          },
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
