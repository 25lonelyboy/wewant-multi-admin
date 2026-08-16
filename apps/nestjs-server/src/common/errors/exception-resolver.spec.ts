import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException
} from '@nestjs/common';
import { BizCode } from './biz-code.js';
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

  it('未知异常归为 50000', () => {
    expect(resolveException(new Error('boom'))).toEqual({
      status: 500,
      code: BizCode.INTERNAL_ERROR,
      message: '服务器内部错误'
    });
    expect(resolveException('string error').code).toBe(BizCode.INTERNAL_ERROR);
  });
});
