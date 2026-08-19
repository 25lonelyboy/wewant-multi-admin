import { Module } from '@nestjs/common';
import { UserController } from './user/user.controller.js';
import { UserService } from './user/user.service.js';

/** system 域：PrismaModule 是 @Global()，无需再 import */
@Module({
  controllers: [UserController],
  providers: [UserService]
})
export class SystemModule {}
