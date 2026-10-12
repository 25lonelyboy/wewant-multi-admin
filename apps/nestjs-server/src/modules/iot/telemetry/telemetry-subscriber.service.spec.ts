import type { AppConfigService } from '../../../config/app-config.service.js';
import { TelemetrySubscriberService } from './telemetry-subscriber.service.js';

// 直接构造而不经 Nest 生命周期：本文件只覆盖报文判定分支。
// 生产者（队列）在 onModuleInit 里才建，这里不触发 ⇒ 只验路由与在线视图。
// 队列侧的接线由 iot e2e（连真实 EMQX + redis-queue）覆盖。
const stubConfig = {
  mqttUrl: 'mqtt://127.0.0.1:1883'
} as unknown as AppConfigService;

function payload(localDeviceId: string): Buffer {
  return Buffer.from(
    JSON.stringify({ localDeviceId, ts: 1759603200000, metrics: [] })
  );
}

describe('TelemetrySubscriberService 报文处理', () => {
  it('初始计数为零', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    expect(service.receivedTotal).toBe(0);
    expect(service.identityRejectedTotal).toBe(0);
  });

  it('主题与载荷一致的报文记进在线视图', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );

    expect(service.hasSeenDevice('sim-001')).toBe(true);
    expect(service.identityRejectedTotal).toBe(0);
  });

  it('主题与载荷不一致的报文被拦下，且不进在线视图', () => {
    const service = new TelemetrySubscriberService(stubConfig);
    service.handleMessage(
      'wewant/devices/sim-002/telemetry',
      payload('sim-001')
    );

    expect(service.identityRejectedTotal).toBe(1);
    expect(service.hasSeenDevice('sim-001')).toBe(false);
    expect(service.hasSeenDevice('sim-002')).toBe(false);
  });

  it('坏报文不抛错（原样入队，计数归消费者）', () => {
    const service = new TelemetrySubscriberService(stubConfig);

    expect(() =>
      service.handleMessage(
        'wewant/devices/sim-001/telemetry',
        Buffer.from('{')
      )
    ).not.toThrow();
    expect(service.identityRejectedTotal).toBe(0);
    expect(service.hasSeenDevice('sim-001')).toBe(false);
  });
});
