import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import type { MenuMeta } from './system-shared.js';

/**
 * meta Json 写路径校验：菜单域 DTO 以 @ValidateNested() + @Type(() => MenuMetaDto) 挂载。
 * 读路径不反序列化校验（写时校验、读时信任）。
 */
export class MenuMetaDto implements MenuMeta {
  @ApiPropertyOptional({ description: '重定向路由' })
  @IsOptional()
  @IsString()
  redirect?: string;

  @ApiPropertyOptional({ description: '菜单右侧图标区' })
  @IsOptional()
  @IsString()
  extraIcon?: string;

  @ApiPropertyOptional({ description: '进场动画' })
  @IsOptional()
  @IsString()
  enterTransition?: string;

  @ApiPropertyOptional({ description: '离场动画' })
  @IsOptional()
  @IsString()
  leaveTransition?: string;

  @ApiPropertyOptional({ description: '详情页激活的菜单路径' })
  @IsOptional()
  @IsString()
  activePath?: string;

  @ApiPropertyOptional({ description: '路由绑定的权限点（前端路由级细粒度）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  auths?: string[];

  @ApiPropertyOptional({ description: 'iframe 地址' })
  @IsOptional()
  @IsString()
  frameSrc?: string;

  @ApiPropertyOptional({ description: 'iframe 显示加载动画' })
  @IsOptional()
  @IsBoolean()
  frameLoading?: boolean;

  @ApiPropertyOptional({ description: '缓存页面组件' })
  @IsOptional()
  @IsBoolean()
  keepAlive?: boolean;

  @ApiPropertyOptional({ description: '不在标签区渲染' })
  @IsOptional()
  @IsBoolean()
  hiddenTag?: boolean;

  @ApiPropertyOptional({ description: '标签区固定' })
  @IsOptional()
  @IsBoolean()
  fixedTag?: boolean;

  @ApiPropertyOptional({ description: '激活本页时显示父级菜单' })
  @IsOptional()
  @IsBoolean()
  showParent?: boolean;
}
