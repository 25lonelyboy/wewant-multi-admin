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
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { RoleService } from './role.service.js';
import {
  AssignRoleMenusDto,
  CreateRoleDto,
  QueryRoleDto,
  UpdateRoleDto
} from './dto/role.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '角色分页列表' })
  list(@Query() query: QueryRoleDto) {
    return this.roles.list(query);
  }

  @Get('all')
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '不分页全量（用户页下拉）' })
  all() {
    return this.roles.all();
  }

  @Post()
  @RequirePermissions('system:role:add')
  @ApiOperation({ summary: '创建角色（code 预查重；menuIds 创建即分配）' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:role:update')
  @ApiOperation({ summary: '更新角色（code 不可改；menuIds 可选）' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('system:role:delete')
  @ApiOperation({ summary: '删除角色（软删除；关联物理保留）' })
  async remove(@Param('id') id: string) {
    await this.roles.remove(id);
    return null;
  }

  @Get(':id')
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '角色详情（不存在/已软删 → 40404）' })
  findOne(@Param('id') id: string) {
    return this.roles.findOne(id);
  }

  @Get(':id/menus')
  @RequirePermissions('system:role:query')
  @ApiOperation({ summary: '角色已分配的活跃菜单 id 列表' })
  menusOf(@Param('id') id: string) {
    return this.roles.menuIdsOf(id);
  }

  @Put(':id/menus')
  @RequirePermissions('system:role:update')
  @ApiOperation({ summary: '角色菜单整体替换（幂等）' })
  setMenus(@Param('id') id: string, @Body() dto: AssignRoleMenusDto) {
    return this.roles.setMenus(id, dto.menuIds);
  }
}
