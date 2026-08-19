import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { UserService } from './user.service.js';
import {
  CreateUserDto,
  QueryUsersDto,
  SetUserRolesDto,
  UpdateUserDto
} from './dto/user.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermissions('system:user:query')
  @ApiOperation({ summary: '用户分页列表（username 模糊/status 筛选）' })
  list(@Query() query: QueryUsersDto) {
    return this.users.list(query);
  }

  @Post()
  @RequirePermissions('system:user:add')
  @ApiOperation({ summary: '创建用户（username 预查重；roleIds 创建即分配）' })
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:user:update')
  @ApiOperation({ summary: '更新用户（username 不可改；password 可选）' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.users.update(id, dto, operator.userId);
  }

  @Delete(':id')
  @RequirePermissions('system:user:delete')
  @ApiOperation({ summary: '删除用户（软删除：写 deletedAt）' })
  async remove(@Param('id') id: string, @CurrentUser() operator: AuthUser) {
    await this.users.remove(id, operator.userId);
    return null;
  }

  @Get(':id/roles')
  @RequirePermissions('system:user:query')
  @ApiOperation({ summary: '用户已分配的活跃角色 id 列表' })
  rolesOf(@Param('id') id: string) {
    return this.users.roleIdsOf(id);
  }

  @Put(':id/roles')
  @RequirePermissions('system:user:update')
  @ApiOperation({ summary: '用户角色整体替换（幂等）' })
  setRoles(
    @Param('id') id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() operator: AuthUser
  ) {
    return this.users.setRoles(id, dto.roleIds, operator.userId);
  }
}
