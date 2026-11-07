import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { MAX_MODEL_CODE_LENGTH } from '@multi-admin/device-registry';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'sim-0001', description: '设备自报的本地编号' })
  @IsString()
  @IsNotEmpty()
  localDeviceId!: string;

  @ApiProperty({ example: 'p1', maxLength: MAX_MODEL_CODE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MODEL_CODE_LENGTH)
  modelCode!: string;

  @ApiPropertyOptional({ example: '5.0' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  protocolVersion?: string;

  @ApiPropertyOptional({
    description:
      '档案生效起点（ISO 8601）；缺省为当前时刻，可早于当前（补登）也可晚于当前（提前建单）。不得早于模型最早版本的生效时刻'
  })
  @IsOptional()
  @IsISO8601()
  fromAt?: string;
}

export class RegisterDeviceQueryDto {
  @ApiPropertyOptional({
    description: '只跑前置检查并返回 DDL，不建表、不写库'
  })
  @IsOptional()
  @IsBooleanString()
  dryRun?: string;
}
