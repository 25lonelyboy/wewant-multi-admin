import mqtt, { type MqttClient } from 'mqtt';
import { telemetryTopic } from '@multi-admin/contracts';
import { buildPayload } from './telemetry.js';

export interface DeviceOptions {
  url: string;
  deviceId: string;
  intervalMs: number;
}

/**
 * 启动一台虚拟设备：一条 MQTT 连接 + 一个定时上行。clientId 用 deviceId，
 * 与生产口径「clientId 绑定设备身份」同形。
 */
export function startDevice({
  url,
  deviceId,
  intervalMs
}: DeviceOptions): MqttClient {
  const client = mqtt.connect(url, { clientId: deviceId, clean: true });

  client.on('connect', () => {
    console.log(`[sim] ${deviceId} 已连接`);
  });
  client.on('error', err => {
    console.error(`[sim] ${deviceId} 连接错误：${err.message}`);
  });

  // 断连期间跳过发布：不在此清理定时器，重连后自动恢复
  setInterval(() => {
    if (!client.connected) return;
    client.publish(
      telemetryTopic(deviceId),
      JSON.stringify(buildPayload(deviceId)),
      { qos: 0 }
    );
  }, intervalMs);

  return client;
}

/** 断开一台设备并等待 socket 关闭 */
export function stopDevice(client: MqttClient): Promise<void> {
  return new Promise(resolve => client.end(false, {}, () => resolve()));
}
