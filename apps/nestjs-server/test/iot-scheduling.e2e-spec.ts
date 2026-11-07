import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { BizCode } from '@multi-admin/contracts';
import {
  DS_LEVELS,
  dsStableName,
  dsSubtableName,
  subtableName
} from '@multi-admin/device-registry';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { TdClientProvider } from './../src/modules/iot/tdengine/td-client.provider.js';
import type { TdSql } from './../src/modules/iot/tdengine/td-client.js';

// 排期与撤销打真库：版本区间、复合外键与 partial unique index 都是数据库行为。
// 每个模型编码带 e2e_sched_ 前缀，afterAll 先删表再删行。
const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

const PREFIX = 'e2e_sched_';
const MODEL_A = `${PREFIX}a`;
const MODEL_B = `${PREFIX}b`;
const MODEL_C = `${PREFIX}c`;
const DEVICE_A = 'e2e-sched-a';
const DEVICE_B = 'e2e-sched-b';
const DEVICE_C = 'e2e-sched-c';
const MODELS = [MODEL_A, MODEL_B, MODEL_C];

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

function modelCode(code: string, effectiveFrom?: string) {
  return {
    modelCode: code,
    properties: [
      {
        key: 'temperature',
        kind: 'float',
        unit: '°C',
        range: { min: -50, max: 200 },
        aggregates: ['sum', 'count', 'min', 'max']
      }
    ],
    services: [],
    events: [],
    ...(effectiveFrom === undefined ? {} : { effectiveFrom })
  };
}

const iso = (ms: number): string => new Date(ms).toISOString();

describe('iot 排期与撤销 (e2e)', () => {
  let app: INestApplication<Server>;
  let td: TdSql;
  let token = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });

  const api = () => request(app.getHttpServer());
  const post = (url: string, body: object) =>
    api().post(url).set('Authorization', `Bearer ${token}`).send(body);
  const del = (url: string) =>
    api().delete(url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    await prisma.$connect();
    td = await app.get(TdClientProvider).get();
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'e2e-admin-password' });
    token = (res.body as Envelope<{ accessToken: string }>).data.accessToken;
  }, 30_000);

  beforeEach(async () => {
    // 全局限流按 IP 计数；逐例清业务 Redis（顺带清掉快照，重建器会自己补）
    await app.get<{ flushdb(): Promise<string> }>(REDIS_CLIENT).flushdb();
  });

  afterAll(async () => {
    for (const modelCode of MODELS) {
      const usages = await prisma.iotDeviceModelUsage.findMany({
        where: { modelCode },
        select: { device: { select: { deviceId: true } } }
      });
      for (const usage of usages) {
        const raw = subtableName(modelCode, usage.device.deviceId);
        await td.exec(`DROP TABLE IF EXISTS wewant_iot.${raw}`).catch(() => {});
        for (const level of DS_LEVELS) {
          await td
            .exec(
              `DROP TABLE IF EXISTS wewant_iot_ds.${dsSubtableName(raw, level)}`
            )
            .catch(() => {});
        }
      }
      await td
        .exec(`DROP STABLE IF EXISTS wewant_iot.${modelCode}`)
        .catch(() => {});
      for (const level of DS_LEVELS) {
        await td
          .exec(
            `DROP STABLE IF EXISTS wewant_iot_ds.${dsStableName(modelCode, level)}`
          )
          .catch(() => {});
      }
    }
    await prisma.iotDeviceModelUsage.deleteMany({
      where: { device: { localDeviceId: { startsWith: 'e2e-sched-' } } }
    });
    await prisma.iotDevice.deleteMany({
      where: { localDeviceId: { startsWith: 'e2e-sched-' } }
    });
    await prisma.iotModelVersion.deleteMany({
      where: { modelCode: { in: MODELS } }
    });
    await prisma.iotDeviceModel.deleteMany({ where: { code: { in: MODELS } } });
    await prisma.$disconnect();
    await app.close();
  });

  it('⭐ 发布未来版本 + 按 fromAt 选版本；撤销后回填前驱、置空 usage 出处', async () => {
    const now = Date.now();
    const future = iso(now + 3_600_000);

    expect((await post('/api/v1/iot/models', modelCode(MODEL_A))).status).toBe(
      201
    );
    const publishedV2 = await post(
      '/api/v1/iot/models',
      modelCode(MODEL_A, future)
    );
    expect(publishedV2.status).toBe(201);

    // 不做回溯：早于/等于最新版本一律 400
    const backtrack = await post(
      '/api/v1/iot/models',
      modelCode(MODEL_A, iso(now))
    );
    expect(backtrack.status).toBe(400);
    expect(
      JSON.stringify((backtrack.body as Envelope<unknown>).data)
    ).toContain('not-after-latest');

    // 提前建单：fromAt 落在 v2 区间 ⇒ usage.version = 2
    const registered = await post('/api/v1/iot/devices', {
      localDeviceId: DEVICE_A,
      modelCode: MODEL_A,
      fromAt: iso(now + 7_200_000)
    });
    expect(registered.status).toBe(201);

    const usageBefore = await prisma.iotDeviceModelUsage.findFirstOrThrow({
      where: { device: { localDeviceId: DEVICE_A } }
    });
    expect(usageBefore.version).toBe(2);

    // 撤销 v2：usage 置空、版本行消失、前驱 effectiveTo 回到 null
    const revoked = await del(`/api/v1/iot/models/${MODEL_A}/versions/2`);
    expect(revoked.status).toBe(200);
    const body = revoked.body as Envelope<{ clearedUsages: number }>;
    expect(body.data.clearedUsages).toBe(1);

    const usageAfter = await prisma.iotDeviceModelUsage.findFirstOrThrow({
      where: { device: { localDeviceId: DEVICE_A } }
    });
    expect(usageAfter.version).toBeNull();

    const v1 = await prisma.iotModelVersion.findUniqueOrThrow({
      where: { modelCode_version: { modelCode: MODEL_A, version: 1 } }
    });
    expect(v1.effectiveTo).toBeNull();
    expect(v1.status).toBe('ACTIVE');
    expect(
      await prisma.iotModelVersion.count({ where: { modelCode: MODEL_A } })
    ).toBe(1);
  });

  it('⭐ fromAt 早于模型最早生效时刻 ⇒ 409 且带最早可生效时刻；不早于则成功', async () => {
    const now = Date.now();
    const future = iso(now + 3_600_000);
    expect(
      (await post('/api/v1/iot/models', modelCode(MODEL_B, future))).status
    ).toBe(201);

    const tooEarly = await post('/api/v1/iot/devices', {
      localDeviceId: DEVICE_B,
      modelCode: MODEL_B,
      fromAt: iso(now)
    });
    expect(tooEarly.status).toBe(409);
    const error = tooEarly.body as Envelope<{
      reason: string;
      earliestEffectiveFrom?: string;
    }>;
    expect(error.code).toBe(BizCode.CONFLICT);
    expect(error.data.reason).toBe('from-at-before-model');
    expect(Date.parse(error.data.earliestEffectiveFrom ?? '')).toBe(
      Date.parse(future)
    );

    const ok = await post('/api/v1/iot/devices', {
      localDeviceId: DEVICE_B,
      modelCode: MODEL_B,
      fromAt: iso(now + 7_200_000)
    });
    expect(ok.status).toBe(201);
    const usage = await prisma.iotDeviceModelUsage.findFirstOrThrow({
      where: { device: { localDeviceId: DEVICE_B } }
    });
    expect(usage.version).toBe(1);
  });

  it('⭐ 空壳撤销被挡：有排期设备时撤销唯一版本 ⇒ 409 并列出设备', async () => {
    const now = Date.now();
    const future = iso(now + 3_600_000);
    expect(
      (await post('/api/v1/iot/models', modelCode(MODEL_C, future))).status
    ).toBe(201);
    expect(
      (
        await post('/api/v1/iot/devices', {
          localDeviceId: DEVICE_C,
          modelCode: MODEL_C,
          fromAt: iso(now + 7_200_000)
        })
      ).status
    ).toBe(201);

    const blocked = await del(`/api/v1/iot/models/${MODEL_C}/versions/1`);
    expect(blocked.status).toBe(409);
    const error = blocked.body as Envelope<{
      reason: string;
      devices?: string[];
    }>;
    expect(error.data.reason).toBe('versions-uncover-devices');
    expect(error.data.devices).toContain(DEVICE_C);

    // 版本仍在
    expect(
      await prisma.iotModelVersion.count({ where: { modelCode: MODEL_C } })
    ).toBe(1);
  });
});
