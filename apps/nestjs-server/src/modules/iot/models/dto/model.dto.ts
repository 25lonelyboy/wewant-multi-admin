import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBooleanString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';
import { MAX_MODEL_CODE_LENGTH } from '@multi-admin/device-registry';

/**
 * 只做**浅层**校验：三个数组存在、模型编码非空。
 *
 * 八档判别字段用装饰器表达会变成一整页 `@ValidateIf`，且与 S3 的校验器重复——
 * 深层规则一律交给 `validateModel`。
 */
export class ModelDeclarationDto {
  @ApiProperty({ example: 'p1', maxLength: MAX_MODEL_CODE_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MODEL_CODE_LENGTH)
  modelCode!: string;

  @ApiProperty({
    type: [Object],
    description: '属性声明（深层规则见 validateModel）'
  })
  @IsArray()
  properties!: unknown[];

  @ApiProperty({ type: [Object] })
  @IsArray()
  services!: unknown[];

  @ApiProperty({ type: [Object] })
  @IsArray()
  events!: unknown[];
}

export class PublishModelQueryDto {
  @ApiPropertyOptional({
    description: '只跑校验与比对并返回 DDL，不写库、不执行'
  })
  @IsOptional()
  @IsBooleanString()
  dryRun?: string;
}
