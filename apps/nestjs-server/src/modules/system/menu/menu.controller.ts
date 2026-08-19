import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator.js';
import { MenuService } from './menu.service.js';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto.js';

@ApiTags('System')
@ApiBearerAuth()
@Controller('system/menus')
export class MenuController {
  constructor(private readonly menus: MenuService) {}

  @Get()
  @RequirePermissions('system:menu:query')
  @ApiOperation({ summary: '全量活跃菜单树（无分页，按 sort 升序）' })
  tree() {
    return this.menus.tree();
  }

  @Post()
  @RequirePermissions('system:menu:add')
  @ApiOperation({
    summary: '创建菜单（name/permission 预查重；meta 嵌套校验）'
  })
  create(@Body() dto: CreateMenuDto) {
    return this.menus.create(dto);
  }

  @Put(':id')
  @RequirePermissions('system:menu:update')
  @ApiOperation({ summary: '更新菜单（含移动节点，防环双层校验）' })
  update(@Param('id') id: string, @Body() dto: UpdateMenuDto) {
    return this.menus.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('system:menu:delete')
  @ApiOperation({ summary: '软删除当前节点（不级联子树）' })
  async remove(@Param('id') id: string) {
    await this.menus.remove(id);
    return null;
  }
}
