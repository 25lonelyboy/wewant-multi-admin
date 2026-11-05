import { Module } from '@nestjs/common';
import { TdClientProvider } from './tdengine/td-client.provider.js';
import { TelemetrySubscriberService } from './telemetry/telemetry-subscriber.service.js';

/**
 * iot 域：设备接入。本增量做「订阅 + 投队列」——**入队在解析之前**，完整解析与落库属数据链路
 * 增量（消费者在 `apps/iot-worker`）；物模型与设备档案的注册路径（DDL 由 server 执行）在本模块。
 * AppConfigService 是 @Global()，无需再 import。
 */
@Module({
  providers: [TelemetrySubscriberService, TdClientProvider]
})
export class IotModule {}
