import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  DS_LEVELS,
  dsSubtableName,
  subtableName
} from '@multi-admin/device-registry';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { TdClientProvider } from './../src/modules/iot/tdengine/td-client.provider.js';
import type { TdSql } from './../src/modules/iot/tdengine/td-client.js';

// 重建器打真 Redis + 真 PG：它自己的节拍、条件写与 60 秒兜底都是运行期行为，mock 不出来。
const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

const LOCAL_DEVICE_ID = 'e2e-snapshot-device';
const BUILT_KEY = 'iot:registry:built';
const SNAPSHOT_KEY = 'iot:registry:snapshot';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface DeviceResult {
  localDeviceId: string;
  deviceId: string;
}

interface SnapshotPayload {
  version: number;
  devices: Array<{ localDeviceId: string }>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

describe('iot 档案快照重建 (e2e)', () => {
  let app: INestApplication<Server>;
  let td: TdSql;
  let token = '';
  let deviceId = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });

  const api = () => request(app.getHttpServer());

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
    // 限流按 IP 计数；同时清掉快照键——重建器会自己补一份
    await app.get<{ flushdb(): Promise<string> }>(REDIS_CLIENT).flushdb();
  });

  afterAll(async () => {
    if (deviceId !== '') {
      const raw = subtableName('p1', deviceId);
      await td.exec(`DROP TABLE IF EXISTS wewant_iot.${raw}`).catch(() => {});
      for (const level of DS_LEVELS) {
        await td
          .exec(
            `DROP TABLE IF EXISTS wewant_iot_ds.${dsSubtableName(raw, level)}`
          )
          .catch(() => {});
      }
    }
    await prisma.iotDeviceModelUsage.deleteMany({
      where: { device: { localDeviceId: LOCAL_DEVICE_ID } }
    });
    await prisma.iotDevice.deleteMany({
      where: { localDeviceId: LOCAL_DEVICE_ID }
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('⭐ 注册一台设备后 2 秒内 built 前进，且快照里能看到它', async () => {
    const redis = app.get<{
      get(key: string): Promise<string | null>;
    }>(REDIS_CLIENT);
    const before = Number((await redis.get(BUILT_KEY)) ?? -1);

    const res = await api()
      .post('/api/v1/iot/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ localDeviceId: LOCAL_DEVICE_ID, modelCode: 'p1' });
    expect(res.status).toBe(201);
    deviceId = (res.body as Envelope<DeviceResult>).data.deviceId;

    // A4 口径：写路径只 INCR，重建器 500ms 节拍
    const deadline = Date.now() + 2_000;
    let built = Number((await redis.get(BUILT_KEY)) ?? -1);
    while (built <= before && Date.now() < deadline) {
      await sleep(50);
      built = Number((await redis.get(BUILT_KEY)) ?? -1);
    }
    expect(built).toBeGreaterThan(before);

    const payload = JSON.parse(
      (await redis.get(SNAPSHOT_KEY)) ?? '{}'
    ) as SnapshotPayload;
    expect(payload.version).toBe(built);
    expect(
      payload.devices.some(device => device.localDeviceId === LOCAL_DEVICE_ID)
    ).toBe(true);
  });

  it('⭐ 变更信号丢失可自愈：删掉 built 后自动重建', async () => {
    const redis = app.get<{
      del(key: string): Promise<number>;
      get(key: string): Promise<string | null>;
    }>(REDIS_CLIENT);

    // 先确保有一份快照
    const buildDeadline = Date.now() + 2_000;
    while (
      (await redis.get(BUILT_KEY)) === null &&
      Date.now() < buildDeadline
    ) {
      await sleep(50);
    }
    expect(await redis.get(BUILT_KEY)).not.toBeNull();

    await redis.del(BUILT_KEY);

    // 键缺失即触发重建（也覆盖 60 秒兜底的上界）
    const deadline = Date.now() + 60_000;
    while ((await redis.get(BUILT_KEY)) === null && Date.now() < deadline) {
      await sleep(100);
    }
    expect(await redis.get(BUILT_KEY)).not.toBeNull();
    expect(await redis.get(SNAPSHOT_KEY)).not.toBeNull();
  });

  it('⭐ payload 被单独淘汰后自动重建（built 还在、版本不变）', async () => {
    const redis = app.get<{
      del(key: string): Promise<number>;
      get(key: string): Promise<string | null>;
    }>(REDIS_CLIENT);

    const buildDeadline = Date.now() + 2_000;
    while (
      (await redis.get(SNAPSHOT_KEY)) === null &&
      Date.now() < buildDeadline
    ) {
      await sleep(50);
    }
    expect(await redis.get(SNAPSHOT_KEY)).not.toBeNull();

    // 大键先被淘汰：built 与 rev 都还在，等版本写入必须被允许
    await redis.del(SNAPSHOT_KEY);

    const deadline = Date.now() + 2_000;
    while ((await redis.get(SNAPSHOT_KEY)) === null && Date.now() < deadline) {
      await sleep(50);
    }
    expect(await redis.get(SNAPSHOT_KEY)).not.toBeNull();
    expect(await redis.get(BUILT_KEY)).not.toBeNull();
  });
});
