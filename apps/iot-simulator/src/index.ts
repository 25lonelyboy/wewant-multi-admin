import { localDeviceIdForIndex } from '@multi-admin/contracts';
import { startDevice, stopDevice } from './device.js';

const url = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
const deviceCount = Number(process.env.SIM_DEVICE_COUNT ?? 100);
const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 1000);

// 现场不同时期、不同厂商的设备协议版本不一致：奇偶交替造 3.1.1 与 5.0 两版
const protocolVersionFor = (index: number): 4 | 5 => (index % 2 === 0 ? 4 : 5);

const devices = Array.from({ length: deviceCount }, (_, i) => ({
  localDeviceId: localDeviceIdForIndex(i + 1),
  protocolVersion: protocolVersionFor(i + 1)
}));

const v5Count = devices.filter(d => d.protocolVersion === 5).length;

console.log(
  `[sim] 目标 ${url}｜设备 ${deviceCount} 台（MQTT 5.0 ${v5Count} / 3.1.1 ${deviceCount - v5Count}）｜上行间隔 ${intervalMs}ms｜主题前缀 wewant/devices/`
);

const clients = devices.map(({ localDeviceId, protocolVersion }) =>
  startDevice({ url, localDeviceId, intervalMs, protocolVersion })
);

// 逐条打印 100 台设备的发布没有可读性，改为周期性汇总
const summary = setInterval(() => {
  const online = clients.filter(client => client.connected).length;
  console.log(`[sim] 在线 ${online}/${deviceCount}`);
}, 10_000);

const shutdown = () => {
  console.log('[sim] 断开全部设备...');
  clearInterval(summary);
  void Promise.all(clients.map(stopDevice)).then(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
