import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ModelsService } from './models.service.js';
import { ModelDeclarationDto, PublishModelQueryDto } from './dto/model.dto.js';

@ApiTags('Iot')
@ApiBearerAuth()
@Controller('iot/models')
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Post()
  @ApiOperation({
    summary: '注册物模型（新模型建表 / 已有模型发布新版本；dryRun 只返回 DDL）'
  })
  publish(
    @Body() dto: ModelDeclarationDto,
    @Query() query: PublishModelQueryDto
  ) {
    return this.models.publish(dto, query.dryRun === 'true');
  }

  @Delete(':modelCode/versions/:version')
  @ApiOperation({
    summary: '撤销尚未生效的模型版本（置空引用、删版本行、回填前驱右边界）'
  })
  revoke(
    @Param('modelCode') modelCode: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.models.revokeVersion(modelCode, version);
  }
}
