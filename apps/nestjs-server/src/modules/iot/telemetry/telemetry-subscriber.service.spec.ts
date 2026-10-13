import { Logger } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service.js';
import { TelemetrySubscriberService } from './telemetry-subscriber.service.js';
import type {
  SendDisposition,
  TelemetryProducer
} from './telemetry-producer.js';

// 直接构造而不经 Nest 生命周期：本文件只覆盖报文判定与每秒窗口的计数分支。
// 生产者通过构造参数注入替身（只用到 send），不再触发队列与 MQTT。
// 队列侧的真实接线由 iot e2e（连真实 EMQX + redis-queue）覆盖。
const stubConfig = {
  mqttUrl: 'mqtt://127.0.0.1:1883'
} as unknown as AppConfigService;

/** 只用到 send 的替身：每次调用返回指定的去向 */
function producerReturning(disposition: SendDisposition): TelemetryProducer {
  return {
    send: jest.fn().mockResolvedValue(disposition)
  } as unknown as TelemetryProducer;
}

function payload(localDeviceId: string): Buffer {
  return Buffer.from(
    JSON.stringify({ localDeviceId, ts: 1759603200000, metrics: [] })
  );
}

/** 让 fire-and-forget 的 enqueue 落定（微任务排空后再跑宏任务） */
const settled = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

/** 本用例内捕获到的 info 日志 */
let logLines: string[];

/** 最近一条 info 日志 */
function lastLog(): string {
  return logLines.at(-1) ?? '';
}

beforeEach(() => {
  logLines = [];
  jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => {
    logLines.push(String(message));
  });
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

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

describe('TelemetrySubscriberService 每秒窗口（按去向分列）', () => {
  it('坏 JSON 的报文也计入窗口——原样入队，不再漏计', async () => {
    const service = new TelemetrySubscriberService(
      stubConfig,
      producerReturning('enqueued')
    );
    service.handleMessage('wewant/devices/sim-001/telemetry', Buffer.from('{'));
    await settled();

    const window = service.report();
    expect(window.badJson).toBe(1);
    expect(window.enqueued).toBe(1);
  });

  it('超限丢弃的报文不计入入队数', async () => {
    const service = new TelemetrySubscriberService(
      stubConfig,
      producerReturning('dropped')
    );
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );
    await settled();

    expect(service.receivedTotal).toBe(0);
    const window = service.report();
    expect(window.dropped).toBe(1);
    expect(window.enqueued).toBe(0);
  });

  it('落本地缓冲的报文记为落缓冲，不计入入队数', async () => {
    const service = new TelemetrySubscriberService(
      stubConfig,
      producerReturning('spilled')
    );
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );
    await settled();

    expect(service.receivedTotal).toBe(0);
    const window = service.report();
    expect(window.spilled).toBe(1);
    expect(window.enqueued).toBe(0);
  });

  it('身份不一致的拦截数单独成列，不与入队数混', async () => {
    const service = new TelemetrySubscriberService(
      stubConfig,
      producerReturning('enqueued')
    );
    service.handleMessage(
      'wewant/devices/sim-002/telemetry',
      payload('sim-001')
    );
    await settled();

    expect(service.identityRejectedTotal).toBe(1);
    expect(service.receivedTotal).toBe(0);
    const window = service.report();
    expect(window.enqueued).toBe(0);
    expect(window.devices).toBe(0);
    expect(lastLog()).toContain('身份不一致拦截 1 条');
  });

  it('每秒日志按去向给出明细', async () => {
    const service = new TelemetrySubscriberService(
      stubConfig,
      producerReturning('enqueued')
    );
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );
    service.handleMessage('wewant/devices/sim-001/telemetry', Buffer.from('{'));
    await settled();

    service.report();
    const line = lastLog();
    expect(line).toContain('入队 2');
    expect(line).toContain('落缓冲 0');
    expect(line).toContain('丢弃 0');
    expect(line).toContain('坏 JSON 1');
    expect(line).toContain('1 台设备');
  });
});
