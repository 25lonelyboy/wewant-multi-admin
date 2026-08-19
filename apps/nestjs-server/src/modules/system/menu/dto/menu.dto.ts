import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { MenuType } from '../../../../generated/prisma/client.js';
import { MenuMetaDto } from '../../shared/menu-meta.dto.js';

export class CreateMenuDto {
  @ApiProperty({
    enum: MenuType,
    description: 'P5 前端负责 mock 数字 ↔ 枚举映射（分设计 §12 备案 2）'
  })
  @IsEnum(MenuType)
  type!: MenuType;

  @ApiPropertyOptional({ description: '父菜单 id，空为顶层' })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiProperty({ example: 'SystemUser', description: '路由名（活跃内唯一）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiProperty({ example: 'menus.pureUser', description: 'i18n key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  component?: string;

  @ApiPropertyOptional({
    example: 'system:user:add',
    description: 'BUTTON 型必填（service 层校验）'
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  permission?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort?: number;

  @ApiPropertyOptional({ default: true, description: 'showLink 的单一语义源' })
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @ApiPropertyOptional({
    type: MenuMetaDto,
    description: '前端路由元数据（整体替换，写路径嵌套校验）'
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuMetaDto)
  meta?: MenuMetaDto;
}

/** 可改字段含 parentId（移动节点，防环见 service 护栏 4）与 meta 整体替换 */
export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
