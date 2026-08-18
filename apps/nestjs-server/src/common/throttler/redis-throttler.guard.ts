import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BizCode } from '../errors/biz-code.js';
import { BizException } from '../errors/biz.exception.js';

@Injectable()
export class RedisThrottlerGuard extends ThrottlerGuard {
  protected override throwThrottlingException(): never {
    throw new BizException(BizCode.RATE_LIMITED, '请求过于频繁，请稍后再试');
  }
}
