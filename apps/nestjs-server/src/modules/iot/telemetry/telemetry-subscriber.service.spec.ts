import type { AppConfigService } from '../../../config/app-config.service.js';
import { TelemetrySubscriberService } from './telemetry-subscriber.service.js';

// 直接构造而不经 Nest 生命周期：本文件只覆盖报文处理分支，
// 连接与订阅接线由 iot e2e（连真实 EMQX）覆盖。
const stubConfig = {
  mqttUrl: 'mqtt://127.0.0.1:1883'
} as unknown as AppConfigService;

describe('TelemetrySubscriberService 报文处理', () => {
  it('初始计数为零', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    expect(service.receivedTotal).toBe(0);
    expect(service.droppedTotal).toBe(0);
  });

  it('合法报文计入 receivedTotal', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      Buffer.from(
        JSON.stringify({
          deviceId: 'sim-001',
          ts: 1759603200000,
          metrics: [{ key: 'temperature', value: 62.4, unit: '°C' }]
        })
      )
    );
    expect(service.receivedTotal).toBe(1);
    expect(service.droppedTotal).toBe(0);
  });

  it('结构不符的报文只计数，不抛错', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    expect(() =>
      service.handleMessage(
        'wewant/devices/sim-001/telemetry',
        Buffer.from('{')
      )
    ).not.toThrow();
    expect(service.receivedTotal).toBe(0);
    expect(service.droppedTotal).toBe(1);
  });
});
