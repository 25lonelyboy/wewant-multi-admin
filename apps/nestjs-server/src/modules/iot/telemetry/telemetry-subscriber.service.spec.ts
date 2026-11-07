import { Logger } from '@nestjs/common';
import mqtt from 'mqtt';
import type { AppConfigService } from '../../../config/app-config.service.js';
import { TelemetrySubscriberService } from './telemetry-subscriber.service.js';
import type {
  SendDisposition,
  TelemetryProducer
} from './telemetry-producer.js';

// MQTT 连接替身：本文件的用例不连真实 Broker。`connect` 返回一个 inert client，
// `onModuleInit` 里注册的回调都成为空操作，从而只观察"传给 connect 的选项"。
jest.mock('mqtt', () => {
  const client = {
    on: jest.fn(),
    subscribe: jest.fn(),
    end: jest.fn(),
    unsubscribe: jest.fn()
  };
  return { __esModule: true, default: { connect: jest.fn(() => client) } };
});

// 直接构造而不经 Nest 生命周期：本文件只覆盖报文判定与每秒窗口的计数分支。
// 装生产者走覆写的 createProducer（见 SubscriberWithFake），不触发队列与 MQTT。
// 队列侧的真实接线由 iot e2e（连真实 EMQX + redis-queue）覆盖。
const stubConfig = {
  mqttUrl: 'mqtt://127.0.0.1:1883'
} as unknown as AppConfigService;

/**
 * 测试装配：覆写 `createProducer` 返回替身，再经基类的 `startProducer` 装配——
 * 全程不进入 `onModuleInit`，故不连接 MQTT、不起上报定时器。
 */
class SubscriberWithFake extends TelemetrySubscriberService {
  private fake: TelemetryProducer | null = null;

  use(producer: TelemetryProducer): this {
    this.fake = producer;
    this.startProducer();
    return this;
  }

  protected override createProducer(): TelemetryProducer {
    return this.fake as TelemetryProducer;
  }
}

/** 只用到 start / send / close 的替身：每次 send 返回指定的去向 */
function producerReturning(disposition: SendDisposition): TelemetryProducer {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(disposition),
    close: jest.fn().mockResolvedValue(undefined)
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
    const service = new SubscriberWithFake(stubConfig).use(
      producerReturning('enqueued')
    );
    service.handleMessage('wewant/devices/sim-001/telemetry', Buffer.from('{'));
    await settled();

    const window = service.report();
    expect(window.unreadable).toBe(1);
    expect(window.enqueued).toBe(1);
  });

  it('解析成功但读不出设备编号的报文同样计入「无法读取编号」', async () => {
    const service = new SubscriberWithFake(stubConfig).use(
      producerReturning('enqueued')
    );
    // 合法 JSON，但没有可用的 localDeviceId ⇒ 读不出编号（不是"坏 JSON"）
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      Buffer.from(JSON.stringify({ ts: 1759603200000, metrics: [] }))
    );
    await settled();

    const window = service.report();
    expect(window.unreadable).toBe(1);
    expect(window.enqueued).toBe(1);
    expect(window.devices).toBe(0);
  });

  it('超限丢弃的报文不计入入队数', async () => {
    const service = new SubscriberWithFake(stubConfig).use(
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
    const service = new SubscriberWithFake(stubConfig).use(
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

  it('超限拒收的报文单独成列，不计入入队与丢弃', async () => {
    const service = new SubscriberWithFake(stubConfig).use(
      producerReturning('oversized')
    );
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );
    await settled();

    expect(service.receivedTotal).toBe(0);
    const window = service.report();
    expect(window.oversized).toBe(1);
    expect(window.dropped).toBe(0);
    expect(window.enqueued).toBe(0);
    expect(lastLog()).toContain('超限 1');
  });

  it('身份不一致的拦截数单独成列，不与入队数混', async () => {
    const service = new SubscriberWithFake(stubConfig).use(
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

  it('每秒日志按去向给出明细，且「无法读取编号」是与去向并列的一列', async () => {
    const service = new SubscriberWithFake(stubConfig).use(
      producerReturning('enqueued')
    );
    // 一条合法 + 一条坏 JSON：两条都入队，其中一条读不出编号
    service.handleMessage(
      'wewant/devices/sim-001/telemetry',
      payload('sim-001')
    );
    service.handleMessage('wewant/devices/sim-001/telemetry', Buffer.from('{'));
    await settled();

    service.report();
    // 整条模板连续匹配：证明「无法读取编号」是并列列，而非挂在「丢弃」下的括号附注
    expect(lastLog()).toContain(
      '入队 2 / 落缓冲 0 / 丢弃 0 / 超限 0 / 无法读取编号 1 / 1 台设备'
    );
  });
});

describe('TelemetrySubscriberService 连接选项（Clean Start 开关）', () => {
  const connect = mqtt.connect as unknown as jest.Mock;

  /** onModuleInit 会读到的全部配置字段 */
  function configWith(clean: boolean): AppConfigService {
    return {
      mqttUrl: 'mqtt://127.0.0.1:1883',
      mqttClientId: 'wewant-iot-subscriber',
      mqttCleanSession: clean,
      mqttSessionExpirySeconds: 86_400
    } as unknown as AppConfigService;
  }

  afterEach(() => {
    connect.mockClear();
  });

  it('缺省 clean=false：保留跨重连的持久会话（生产口径）', async () => {
    const service = new SubscriberWithFake(configWith(false)).use(
      producerReturning('enqueued')
    );
    service.onModuleInit();
    try {
      expect(connect).toHaveBeenCalledWith(
        'mqtt://127.0.0.1:1883',
        expect.objectContaining({
          clientId: 'wewant-iot-subscriber',
          clean: false
        })
      );
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('MQTT_CLEAN_SESSION=true ⇒ clean=true：丢弃同 clientId 的既有会话', async () => {
    const service = new SubscriberWithFake(configWith(true)).use(
      producerReturning('enqueued')
    );
    service.onModuleInit();
    try {
      expect(connect).toHaveBeenCalledWith(
        'mqtt://127.0.0.1:1883',
        expect.objectContaining({ clean: true })
      );
    } finally {
      await service.onModuleDestroy();
    }
  });
});
