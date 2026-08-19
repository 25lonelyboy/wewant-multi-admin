import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import { RoleStatus } from '../../../../generated/prisma/client.js';
import { MAX_PAGE_SIZE } from '../../shared/system-shared.js';

export class QueryRoleDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({ description: '名称模糊筛选' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '标识模糊筛选' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ enum: RoleStatus })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;
}

export class CreateRoleDto {
  @ApiProperty({
    example: 'editor',
    description: '角色标识（活跃内唯一，创建后不可改）'
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*$/, {
    message: 'code 需字母开头，仅含字母/数字/_/-'
  })
  code!: string;

  @ApiProperty({ example: '编辑' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @ApiPropertyOptional({ enum: RoleStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ type: [String], description: '创建即分配的菜单 id' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuIds?: string[];
}

/**
 * 护栏：code 不可改——本 DTO 不含 code 字段，whitelist 剥离多余入参。
 * menuIds 可传则整体替换菜单分配。
 */
export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ enum: RoleStatus })
  @IsOptional()
  @IsEnum(RoleStatus)
  status?: RoleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '可选，传则整体替换菜单分配'
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuIds?: string[];
}

export class AssignRoleMenusDto {
  @ApiProperty({
    type: [String],
    description: '菜单 id 全量替换集（幂等；空数组 = 清空）'
  })
  @IsArray()
  @IsString({ each: true })
  menuIds!: string[];
}
