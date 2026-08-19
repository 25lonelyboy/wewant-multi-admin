import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';
import { UserStatus } from '../../../../generated/prisma/client.js';
import { MAX_PAGE_SIZE } from '../../shared/system-shared.js';

export class QueryUsersDto {
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

  @ApiPropertyOptional({ description: '用户名模糊筛选' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan', description: '用户名（活跃用户内唯一）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username!: string;

  @ApiProperty({
    example: 'P@ssw0rd!',
    description: '明文密码，argon2 哈希后落库（护栏 5：新建必填）'
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: '张三' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname!: string;

  @ApiPropertyOptional({ enum: UserStatus, default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [0, 1], description: '0 女 / 1 男' })
  @IsOptional()
  @IsIn([0, 1])
  sex?: 0 | 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({ type: [String], description: '创建即分配的角色 id' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

/**
 * 护栏 6：username 不可改——本 DTO 不含 username 字段，
 * ValidationPipe whitelist 下多余入参被剥离，防改名绕过护栏 1。
 */
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nickname?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: [0, 1] })
  @IsOptional()
  @IsIn([0, 1])
  sex?: 0 | 1;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string;

  @ApiPropertyOptional({
    example: 'NewP@ss1!',
    description: '可选，传则 argon2 重哈希（护栏 5）'
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password?: string;

  @ApiPropertyOptional({
    type: [String],
    description: '可选，传则整体替换角色分配'
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}

export class SetUserRolesDto {
  @ApiProperty({
    type: [String],
    description: '角色 id 全量替换集（幂等；空数组 = 清空）'
  })
  @IsArray()
  @IsString({ each: true })
  roleIds!: string[];
}
