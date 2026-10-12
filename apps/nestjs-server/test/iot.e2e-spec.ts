import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import mqtt, { type MqttClient } from 'mqtt';
import { Queue } from 'bullmq';
import {
  TELEMETRY_INGEST_QUEUE,
  TELEMETRY_QUEUE_PREFIX,
  telemetryTopic
} from '@multi-admin/contracts';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { TelemetrySubscriberService } from './../src/modules/iot/telemetry/telemetry-subscriber.service.js';

// 接入链路无假实现可用：这段接线（mqtt.js 连接 / 订阅 / 报文分发 / 投队列）正是本增量
// 唯一带真实外部依赖的部分，用真实 EMQX + 真实队列 Redis 验证。
const MQTT_URL = process.env.MQTT_URL ?? 'mqtt://127.0.0.1:1883';
const QUEUE_REDIS_URL = process.env.QUEUE_REDIS_URL ?? 'redis://127.0.0.1:6380';

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`等待超时：条件在 ${timeoutMs}ms 内未成立`);
}

function telemetryPayload(localDeviceId: string): string {
  return JSON.stringify({
    localDeviceId,
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
  let queue: Queue;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();

    subscriber = app.get(TelemetrySubscriberService);

    // 消费端不在本用例里跑，队列只作"报文到没到"的证据；先清空，保证计数指向本用例
    queue = new Queue(TELEMETRY_INGEST_QUEUE, {
      prefix: TELEMETRY_QUEUE_PREFIX,
      connection: { url: QUEUE_REDIS_URL }
    });
    await queue.obliterate({ force: true }).catch(() => undefined);

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
    await queue?.close();
    await app.close();
  });

  it('设备上行报文经 Broker 抵达订阅端并入队', async () => {
    // 以「本用例自己那台设备被看到」为断言，而非全局计数：Broker 上可能同时有
    // 模拟器的在跑，全局计数会被环境流量推高，断言就不再指向本用例的报文。
    expect(subscriber.hasSeenDevice('e2e-001')).toBe(false);

    await publisher.publishAsync(
      telemetryTopic('e2e-001'),
      telemetryPayload('e2e-001')
    );

    await waitFor(() => subscriber.hasSeenDevice('e2e-001'));
    expect(subscriber.hasSeenDevice('e2e-001')).toBe(true);
    // 入队是异步的，等它落到队列
    await waitFor(async () => (await queue.getWaitingCount()) > 0);
  });

  it('主题段与载荷编号不一致的报文被拦下，不入队', async () => {
    const rejectedBefore = subscriber.identityRejectedTotal;
    const waitingBefore = await queue.getWaitingCount();

    await publisher.publishAsync(
      telemetryTopic('e2e-004'),
      telemetryPayload('e2e-005')
    );

    await waitFor(() => subscriber.identityRejectedTotal > rejectedBefore);
    expect(subscriber.hasSeenDevice('e2e-005')).toBe(false);
    expect(await queue.getWaitingCount()).toBe(waitingBefore);
  });

  it('结构不符的报文原样入队（计数与丢弃归消费者）', async () => {
    const waitingBefore = await queue.getWaitingCount();

    await publisher.publishAsync(telemetryTopic('e2e-002'), 'not-json');

    await waitFor(async () => (await queue.getWaitingCount()) > waitingBefore);
  });
});
