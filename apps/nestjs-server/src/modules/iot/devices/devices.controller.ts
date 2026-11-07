import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service.js';
import {
  RegisterDeviceDto,
  RegisterDeviceQueryDto,
  RescheduleDeviceDto
} from './dto/device.dto.js';

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

  @Delete(':localDeviceId')
  @ApiOperation({
    summary: '注销设备；未生效设备借此撤销（零长区间）。幂等，不删表、不删数据'
  })
  retire(@Param('localDeviceId') localDeviceId: string) {
    return this.devices.retire(localDeviceId);
  }

  @Patch(':localDeviceId')
  @ApiOperation({
    summary: '改期未生效设备（fromAt 必须在未来）；已生效设备不可改期'
  })
  reschedule(
    @Param('localDeviceId') localDeviceId: string,
    @Body() dto: RescheduleDeviceDto
  ) {
    return this.devices.reschedule(localDeviceId, dto);
  }
}
