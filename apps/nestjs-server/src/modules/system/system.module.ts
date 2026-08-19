import { Module } from '@nestjs/common';
import { RoleController } from './role/role.controller.js';
import { RoleService } from './role/role.service.js';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';

/** system 域：PrismaModule 是 @Global()，无需再 import */
@Module({
  controllers: [UserController, RoleController],
  providers: [UserService, RoleService]
})
export class SystemModule {}
