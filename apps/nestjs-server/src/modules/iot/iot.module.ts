import { Module } from '@nestjs/common';
import { TelemetrySubscriberService } from './telemetry/telemetry-subscriber.service.js';

/**
 * iot 域：设备接入。本增量只做「订阅 + 可见性日志」——不进队列、不落库（属数据链路增量），
 * 不做设备注册与物模型（属物模型增量）。AppConfigService 是 @Global()，无需再 import。
 */
@Module({
  providers: [TelemetrySubscriberService]
})
export class IotModule {}
