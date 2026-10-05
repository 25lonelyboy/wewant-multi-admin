import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import mqtt, { type MqttClient } from 'mqtt';
import { telemetryTopic } from '@multi-admin/contracts';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { TelemetrySubscriberService } from './../src/modules/iot/telemetry/telemetry-subscriber.service.js';

// 接入链路无假实现可用：这段接线（mqtt.js 连接 / 订阅 / 报文分发）正是本增量
// 唯一带真实外部依赖的部分，用真实 EMQX 验证。
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`等待超时：条件在 ${timeoutMs}ms 内未成立`);
}

function telemetryPayload(deviceId: string): string {
  return JSON.stringify({
    deviceId,
    ts: Date.now(),
    metrics: [
      { key: 'temperature', value: 61.5, unit: '°C' },
      { key: 'current', value: 4.2, unit: 'A' }
    ]
  });
}

describe('设备接入 (e2e)', () => {
  let app: INestApplication<Server>;
  let subscriber: TelemetrySubscriberService;
  let publisher: MqttClient;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();

    subscriber = app.get(TelemetrySubscriberService);

    publisher = mqtt.connect(MQTT_URL, {
      clientId: `e2e-publisher-${process.pid}`
    });
    await new Promise<void>((resolve, reject) => {
      publisher.once('connect', () => resolve());
      publisher.once('error', error =>
        reject(
          new Error(
            `无法连接 Broker ${MQTT_URL}（${error.message}）；本地需先 pnpm ops:env-up`
          )
        )
      );
    });
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>(resolve =>
      publisher?.end(false, {}, () => resolve())
    );
    await app.close();
  });

  it('设备上行报文经 Broker 抵达订阅端', async () => {
    // 以「本用例自己那台设备被看到」为断言，而非全局计数：Broker 上可能同时有
    // 模拟器的在跑，全局计数会被环境流量推高，断言就不再指向本用例的报文。
    expect(subscriber.hasSeenDevice('e2e-001')).toBe(false);

    await publisher.publishAsync(
      telemetryTopic('e2e-001'),
      telemetryPayload('e2e-001')
    );

    await waitFor(() => subscriber.hasSeenDevice('e2e-001'));
    expect(subscriber.hasSeenDevice('e2e-001')).toBe(true);
  });

  it('结构不符的报文被丢弃计数，且不阻断后续接收', async () => {
    const droppedBefore = subscriber.droppedTotal;

    await publisher.publishAsync(telemetryTopic('e2e-002'), 'not-json');
    await waitFor(() => subscriber.droppedTotal > droppedBefore);
    expect(subscriber.droppedTotal).toBeGreaterThan(droppedBefore);

    await publisher.publishAsync(
      telemetryTopic('e2e-003'),
      telemetryPayload('e2e-003')
    );
    await waitFor(() => subscriber.hasSeenDevice('e2e-003'));
    expect(subscriber.hasSeenDevice('e2e-003')).toBe(true);
  });
});
