import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard.js';
import { BizException } from '../errors/biz.exception.js';
import { BizCode } from '@multi-admin/contracts';
import type { AuthUser } from '../../modules/auth/auth-user.js';

const mockContext = (user?: AuthUser) =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user })
    })
  }) as unknown as ExecutionContext;

const mockReflector = (permissions?: string[]) =>
  ({
    getAllAndOverride: () => permissions
  }) as unknown as Reflector;

const baseUser: AuthUser = {
  userId: '1',
  username: 'test',
  nickname: '测试',
  sid: 'sid-1',
  jti: 'jti-1',
  exp: 9999999999,
  roles: ['user'],
  permissions: ['user:read', 'user:write']
};

describe('PermissionsGuard', () => {
  it('无元数据直通（return true）', () => {
    const guard = new PermissionsGuard(mockReflector(undefined));
    expect(guard.canActivate(mockContext(baseUser))).toBe(true);
  });

  it('空数组元数据直通', () => {
    const guard = new PermissionsGuard(mockReflector([]));
    expect(guard.canActivate(mockContext(baseUser))).toBe(true);
  });

  it('通配 *:*:* 直通', () => {
    const admin: AuthUser = { ...baseUser, permissions: ['*:*:*'] };
    const guard = new PermissionsGuard(
      mockReflector(['user:read', 'user:write', 'system:admin'])
    );
    expect(guard.canActivate(mockContext(admin))).toBe(true);
  });

  it('满足 AND 权限通过', () => {
    const guard = new PermissionsGuard(
      mockReflector(['user:read', 'user:write'])
    );
    expect(guard.canActivate(mockContext(baseUser))).toBe(true);
  });

  it('缺权限 → FORBIDDEN (40301)', () => {
    const guard = new PermissionsGuard(
      mockReflector(['user:read', 'system:admin'])
    );
    expect(() => guard.canActivate(mockContext(baseUser))).toThrow(
      BizException
    );
    try {
      guard.canActivate(mockContext(baseUser));
    } catch (e) {
      expect((e as BizException).code).toBe(BizCode.FORBIDDEN);
    }
  });

  it('无 user → UNAUTHORIZED (40101)', () => {
    const guard = new PermissionsGuard(mockReflector(['user:read']));
    expect(() => guard.canActivate(mockContext(undefined))).toThrow(
      BizException
    );
    try {
      guard.canActivate(mockContext(undefined));
    } catch (e) {
      expect((e as BizException).code).toBe(BizCode.UNAUTHORIZED);
    }
  });
});
