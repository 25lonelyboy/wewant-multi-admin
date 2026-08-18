import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { BizException } from '../errors/biz.exception.js';
import { BizCode } from '../errors/biz-code.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

const mockContext = (user?: unknown) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user })
    })
  }) as unknown as ExecutionContext;

const mockReflector = (meta: Record<string, unknown>) =>
  ({
    getAllAndOverride: (key: string) => meta[key]
  }) as unknown as Reflector;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  describe('@Public 路由', () => {
    beforeEach(() => {
      reflector = mockReflector({ [IS_PUBLIC_KEY]: true });
      guard = new JwtAuthGuard(reflector);
    });

    it('canActivate 直接返回 true，不调 passport', () => {
      const result = guard.canActivate(mockContext());
      expect(result).toBe(true);
    });
  });

  describe('handleRequest', () => {
    beforeEach(() => {
      reflector = mockReflector({});
      guard = new JwtAuthGuard(reflector);
    });

    it('BizException 原样透传', () => {
      const err = new BizException(BizCode.UNAUTHORIZED, '令牌已失效');
      expect(() => guard.handleRequest(err, null)).toThrow(err);
    });

    it('TokenExpiredError → ACCESS_TOKEN_EXPIRED (40102)', () => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      expect(() => guard.handleRequest(err, null)).toThrow(BizException);
      try {
        guard.handleRequest(err, null);
      } catch (e) {
        expect((e as BizException).code).toBe(BizCode.ACCESS_TOKEN_EXPIRED);
      }
    });

    it('普通 err → UNAUTHORIZED (40101)', () => {
      const err = new Error('some error');
      expect(() => guard.handleRequest(err, null)).toThrow(BizException);
      try {
        guard.handleRequest(err, null);
      } catch (e) {
        expect((e as BizException).code).toBe(BizCode.UNAUTHORIZED);
      }
    });

    it('无 user → UNAUTHORIZED (40101)', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(BizException);
      try {
        guard.handleRequest(null, null);
      } catch (e) {
        expect((e as BizException).code).toBe(BizCode.UNAUTHORIZED);
      }
    });

    it('正常 user 透传', () => {
      const user = { userId: '1', username: 'test' };
      const result = guard.handleRequest(null, user);
      expect(result).toBe(user);
    });
  });
});
