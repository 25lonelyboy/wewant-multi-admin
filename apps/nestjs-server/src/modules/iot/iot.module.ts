import { Module } from '@nestjs/common';
import { TelemetrySubscriberService } from './telemetry/telemetry-subscriber.service.js';

/**
 * iot 域：设备接入。本增量做「订阅 + 投队列」——**入队在解析之前**，完整解析与落库属数据链路
 * 增量（消费者在 `apps/iot-worker`），设备注册与物模型属物模型增量。
 * AppConfigService 是 @Global()，无需再 import。
 */
@Module({
  providers: [TelemetrySubscriberService]
})
export class IotModule {}
