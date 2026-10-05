import { startDevice, stopDevice } from './device.js';

const url = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
const deviceCount = Number(process.env.SIM_DEVICE_COUNT ?? 100);
const intervalMs = Number(process.env.SIM_INTERVAL_MS ?? 1000);

const deviceIds = Array.from(
  { length: deviceCount },
  (_, i) => `sim-${String(i + 1).padStart(3, '0')}`
);

console.log(
  `[sim] 目标 ${url}｜设备 ${deviceCount} 台｜上行间隔 ${intervalMs}ms｜主题前缀 wewant/devices/`
);

const clients = deviceIds.map(deviceId =>
  startDevice({ url, deviceId, intervalMs })
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
