import mqtt, { type MqttClient } from 'mqtt';
import { telemetryTopic } from '@multi-admin/contracts';
import { buildPayload } from './telemetry.js';

export interface DeviceOptions {
  url: string;
  localDeviceId: string;
  intervalMs: number;
  /** MQTT 协议版本：现场同时存在 3.1.1（4）与 5.0（5）的设备，两版都要造 */
  protocolVersion: 4 | 5;
}

/**
 * 启动一台虚拟设备：一条 MQTT 连接 + 一个定时上行。clientId 用本地编号，
 * 与生产口径「clientId 绑定设备身份」同形。
 *
 * ⚠️ 模拟器**不读设备档案**：它只报自己编的 `localDeviceId`，平台的 `deviceId` 与
 * 设备档案对它不可见——一旦可见，它模拟的就不再是真实链路的形态。
 */
export function startDevice({
  url,
  localDeviceId,
  intervalMs,
  protocolVersion
}: DeviceOptions): MqttClient {
  const client = mqtt.connect(url, {
    clientId: localDeviceId,
    clean: true,
    protocolVersion
  });

  client.on('connect', () => {
    console.log(
      `[sim] ${localDeviceId} 已连接（MQTT ${protocolVersion === 5 ? '5.0' : '3.1.1'}）`
    );
  });
  client.on('error', err => {
    console.error(`[sim] ${localDeviceId} 连接错误：${err.message}`);
  });

  // 断连期间跳过发布：不在此清理定时器，重连后自动恢复
  setInterval(() => {
    if (!client.connected) return;
    client.publish(
      telemetryTopic(localDeviceId),
      JSON.stringify(buildPayload(localDeviceId)),
      { qos: 0 }
    );
  }, intervalMs);

  return client;
}

/** 断开一台设备并等待 socket 关闭 */
export function stopDevice(client: MqttClient): Promise<void> {
  return new Promise(resolve => client.end(false, {}, () => resolve()));
}
