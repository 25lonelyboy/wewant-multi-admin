import { Body, Controller, Post, Query } from '@nestjs/common';
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
}
