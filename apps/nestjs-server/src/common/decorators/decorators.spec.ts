import { Reflector } from '@nestjs/core';
import { Public, IS_PUBLIC_KEY } from './public.decorator.js';
import {
  RequirePermissions,
  REQUIRE_PERMISSIONS_KEY
} from './require-permissions.decorator.js';
import { CurrentUser } from './current-user.decorator.js';

class FixtureController {
  @Public()
  login() {}

  @RequirePermissions('system:user:query', 'system:user:add')
  list() {}

  getUser(@CurrentUser() user: unknown) {
    return user;
  }
}

describe('认证装饰器', () => {
  const reflector = new Reflector();

  it('@Public 写入 isPublic 元数据', () => {
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      reflector.get(IS_PUBLIC_KEY, FixtureController.prototype.login)
    ).toBe(true);
  });

  it('@RequirePermissions 写入权限点数组', () => {
    expect(
      reflector.get(
        REQUIRE_PERMISSIONS_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        FixtureController.prototype.list
      )
    ).toEqual(['system:user:query', 'system:user:add']);
  });

  it('@CurrentUser 为参数装饰器（function 类型）', () => {
    expect(typeof CurrentUser).toBe('function');
  });
});
