import { Module } from '@nestjs/common';
import { MenuController } from './menu/menu.controller.js';
import { MenuService } from './menu/menu.service.js';
import { RoleController } from './role/role.controller.js';
import { RoleService } from './role/role.service.js';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';

/** system 域：PrismaModule 是 @Global()，无需再 import */
@Module({
  controllers: [UserController, RoleController, MenuController],
  providers: [UserService, RoleService, MenuService]
})
export class SystemModule {}
