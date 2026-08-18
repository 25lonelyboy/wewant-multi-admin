import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** 取 JwtAuthGuard 挂载的 req.user */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ user?: unknown }>().user
);
