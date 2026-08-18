import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../src/common/decorators/require-permissions.decorator.js';

/** e2e 专用受保护路由：验证 PermissionsGuard 40301 分支 */
@Controller('__test/protected')
export class TestProtectedController {
  @Get()
  @RequirePermissions('system:user:query')
  get() {
    return { ok: true };
  }
}
