import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { BizCode } from '@multi-admin/contracts';
import { BizException } from './biz.exception.js';
import { resolveException } from './exception-resolver.js';

describe('resolveException', () => {
  it('BizException 原样透传 code/status/message', () => {
    expect(
      resolveException(new BizException(BizCode.FORBIDDEN, '无权限'))
    ).toEqual({
      status: 403,
      code: 40301,
      message: '无权限'
    });
  });

  it('BadRequestException（ValidationPipe 产物）映射为 40001', () => {
    const resolved = resolveException(
      new BadRequestException(['username 不能为空'])
    );
    expect(resolved.status).toBe(400);
    expect(resolved.code).toBe(BizCode.VALIDATION_FAILED);
  });

  it('其余 HttpException 按 status * 100 生成 code', () => {
    expect(resolveException(new NotFoundException('未找到')).code).toBe(40400);
    expect(resolveException(new ForbiddenException()).code).toBe(40300);
    expect(resolveException(new HttpException('自定义', 418)).code).toBe(41800);
  });

  it('HttpException 数组态 message 以 "; " 拼接', () => {
    const resolved = resolveException(
      new HttpException({ message: ['a', 'b'], error: 'x' }, 422)
    );
    expect(resolved.message).toBe('a; b');
    expect(resolved.code).toBe(42200);
  });

  it('HttpException 对象态无 message 字段时回退 exception.message', () => {
    const resolved = resolveException(new HttpException({ error: 'x' }, 422));
    expect(typeof resolved.message).toBe('string');
    expect(resolved.message.length).toBeGreaterThan(0);
  });

  it('未知异常归为 50000', () => {
    expect(resolveException(new Error('boom'))).toEqual({
      status: 500,
      code: BizCode.INTERNAL_ERROR,
      message: '服务器内部错误'
    });
    expect(resolveException('string error').code).toBe(BizCode.INTERNAL_ERROR);
  });

  it('BadRequestException 带 errors 数组时透传 data', () => {
    const errors = [
      { field: 'username', message: '用户名不能为空' },
      { field: 'email', message: '邮箱格式不正确' }
    ];
    const ex = new BadRequestException({
      statusCode: 400,
      message: '参数校验失败',
      errors
    });
    const resolved = resolveException(ex);
    expect(resolved.data).toEqual({ errors });
  });

  it('BadRequestException 无 errors 时 data 为 undefined', () => {
    const resolved = resolveException(new BadRequestException('简单错误'));
    expect(resolved.data).toBeUndefined();
  });
});

describe('resolveException · Prisma 已知错误分支', () => {
  const known = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('mock', {
      code,
      clientVersion: '7.0.0'
    });

  it('P2002 唯一冲突 → 409 CONFLICT(40900)', () => {
    expect(resolveException(known('P2002'))).toEqual({
      status: 409,
      code: BizCode.CONFLICT,
      message: '资源唯一约束冲突'
    });
  });

  it('P2025 目标不存在 → 404 NOT_FOUND(40404)', () => {
    expect(resolveException(known('P2025'))).toEqual({
      status: 404,
      code: BizCode.NOT_FOUND,
      message: '资源不存在或已删除'
    });
  });

  it('P2003 FK 约束 → 400 VALIDATION_FAILED(40001)', () => {
    expect(resolveException(known('P2003'))).toEqual({
      status: 400,
      code: BizCode.VALIDATION_FAILED,
      message: '关联资源不存在或无效'
    });
  });

  it('其余 Prisma 已知错误仍归 50000', () => {
    expect(resolveException(known('P2010')).code).toBe(BizCode.INTERNAL_ERROR);
  });
});
