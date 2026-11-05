import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
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
}

export class RegisterDeviceQueryDto {
  @ApiPropertyOptional({
    description: '只跑前置检查并返回 DDL，不建表、不写库'
  })
  @IsOptional()
  @IsBooleanString()
  dryRun?: string;
}
