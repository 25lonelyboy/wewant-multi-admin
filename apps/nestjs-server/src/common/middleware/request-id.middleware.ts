import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * pino-http 层可见的 requestId 形态（由本中间件写入；
 * 可选语义：中间件未注册时 requestId 缺失）。
 */
export interface RequestWithId extends IncomingMessage {
  requestId?: string;
}

/**
 * Express 原生中间件（经 applyAppDefaults 以 app.use 注册，先于 Nest 路由）：
 * 生成/透传 requestId，写入 req.requestId 与响应头，供日志与排障贯穿链路。
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && incoming ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
