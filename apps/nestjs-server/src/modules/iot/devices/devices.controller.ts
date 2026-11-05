import { Body, Controller, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service.js';
import { RegisterDeviceDto, RegisterDeviceQueryDto } from './dto/device.dto.js';

@ApiTags('Iot')
@ApiBearerAuth()
@Controller('iot/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @ApiOperation({
    summary:
      '注册设备档案（平台签发 deviceId、建子表；已注册即幂等；dryRun 只返回 DDL）'
  })
  register(
    @Body() dto: RegisterDeviceDto,
    @Query() query: RegisterDeviceQueryDto
  ) {
    return this.devices.register(dto, query.dryRun === 'true');
  }
}
