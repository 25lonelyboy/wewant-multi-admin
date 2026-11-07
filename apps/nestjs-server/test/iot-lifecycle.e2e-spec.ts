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

// 注销 / 撤销 / 改期 / 复活打真 PG + 真 TDengine：行锁、partial unique index、
// 子表齐全检查与区间判定都是数据库行为。设备编号统一 e2e-life- 前缀，
// afterAll 先删表再删行（不假设可以清库）。
const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

const PREFIX = 'e2e_life_';
const MODEL_RETIRE = `${PREFIX}retire`;
const MODEL_REVOKE = `${PREFIX}revoke`;
const MODEL_SCHEDULE = `${PREFIX}schedule`;
const MODEL_EFFECTIVE = `${PREFIX}effective`;
const MODEL_FUTURE = `${PREFIX}future`;
const MODEL_REVIVE = `${PREFIX}revive`;
const MODEL_REVIVE_MISSING = `${PREFIX}missing`;
const MODEL_OVERLAP = `${PREFIX}overlap`;
const MODEL_OTHER = `${PREFIX}other`;
const MODELS = [
  MODEL_RETIRE,
  MODEL_REVOKE,
  MODEL_SCHEDULE,
  MODEL_EFFECTIVE,
  MODEL_FUTURE,
  MODEL_REVIVE,
  MODEL_REVIVE_MISSING,
  MODEL_OVERLAP,
  MODEL_OTHER
];

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface DeviceResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  status: string;
  ddl: string[];
}

interface RetireResult {
  localDeviceId: string;
  deviceId: string;
  status: string;
  effectiveTo: string | null;
}

interface RescheduleResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  fromAt: string;
  version: number | null;
}

interface SnapshotPayload {
  version: number;
  devices: Array<{ localDeviceId: string }>;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

function modelBody(code: string, effectiveFrom?: string) {
  return {
    modelCode: code,
    properties: [
      {
        key: 'temperature',
        kind: 'float',
        unit: '°C',
        range: { min: -50, max: 200 },
        aggregates: ['sum']
      }
    ],
    services: [],
    events: [],
    ...(effectiveFrom === undefined ? {} : { effectiveFrom })
  };
}

describe('iot 设备生命周期 (e2e)', () => {
  let app: INestApplication<Server>;
  let td: TdSql;
  let token = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });
  /** 已注册设备（含复活），收尾时据此删子表 */
  const registrations: Array<{ modelCode: string; deviceId: string }> = [];

  const api = () => request(app.getHttpServer());
  const authorized = (method: 'post' | 'delete' | 'patch', url: string) =>
    api()[method](url).set('Authorization', `Bearer ${token}`);

  const postModel = (body: object) =>
    authorized('post', '/api/v1/iot/models').send(body);
  const postDevice = (body: object) =>
    authorized('post', '/api/v1/iot/devices').send(body);
  const retireDevice = (localDeviceId: string) =>
    authorized('delete', `/api/v1/iot/devices/${localDeviceId}`);
  const rescheduleDevice = (localDeviceId: string, body: object) =>
    authorized('patch', `/api/v1/iot/devices/${localDeviceId}`).send(body);

  const expectData = <T>(res: request.Response): T => {
    expect(res.status).toBeLessThan(300);
    const body = res.body as Envelope<T>;
    expect(body.code).toBe(BizCode.SUCCESS);
    return body.data;
  };

  const expectError = (
    res: request.Response,
    status: number
  ): { code: number; data: unknown } => {
    expect(res.status).toBe(status);
    const body = res.body as Envelope<unknown>;
    expect(body.code).not.toBe(BizCode.SUCCESS);
    return { code: body.code, data: body.data };
  };

  async function registerDevice(
    localDeviceId: string,
    modelCode: string,
    fromAt?: string
  ): Promise<DeviceResult> {
    const result = expectData<DeviceResult>(
      await postDevice({
        localDeviceId,
        modelCode,
        ...(fromAt === undefined ? {} : { fromAt })
      })
    );
    registrations.push({ modelCode, deviceId: result.deviceId });
    return result;
  }

  /** 等快照里出现该设备（重建器 500ms 节拍，A4 口径 2 秒） */
  async function waitForSnapshotDevice(
    localDeviceId: string
  ): Promise<SnapshotPayload> {
    const redis = app.get<{ get(key: string): Promise<string | null> }>(
      REDIS_CLIENT
    );
    const deadline = Date.now() + 3_000;
    for (;;) {
      const raw = await redis.get('iot:registry:snapshot');
      if (raw !== null) {
        const payload = JSON.parse(raw) as SnapshotPayload;
        if (payload.devices.some(d => d.localDeviceId === localDeviceId)) {
          return payload;
        }
      }
      if (Date.now() >= deadline) {
        throw new Error(`快照里没有设备 ${localDeviceId}`);
      }
      await sleep(50);
    }
  }

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
    // 全局限流按 IP 计数；同时清掉快照键——重建器会自己补一份
    await app.get<{ flushdb(): Promise<string> }>(REDIS_CLIENT).flushdb();
  });

  afterAll(async () => {
    for (const modelCode of MODELS) {
      for (const registration of registrations.filter(
        r => r.modelCode === modelCode
      )) {
        const raw = subtableName(modelCode, registration.deviceId);
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
      where: { device: { localDeviceId: { startsWith: 'e2e-life-' } } }
    });
    await prisma.iotDevice.deleteMany({
      where: { localDeviceId: { startsWith: 'e2e-life-' } }
    });
    await prisma.iotModelVersion.deleteMany({
      where: { modelCode: { in: MODELS } }
    });
    await prisma.iotDeviceModel.deleteMany({ where: { code: { in: MODELS } } });
    await prisma.$disconnect();
    await app.close();
  }, 30_000);

  it('注销生效设备：RETIRED + usage 闭合；重复注销幂等；快照仍含设备', async () => {
    expectData(await postModel(modelBody(MODEL_RETIRE)));
    const device = await registerDevice('e2e-life-a', MODEL_RETIRE);

    const beforeDelete = Date.now();
    const retired = expectData<RetireResult>(await retireDevice('e2e-life-a'));
    expect(retired.status).toBe('RETIRED');
    expect(retired.deviceId).toBe(device.deviceId);
    const effectiveTo = Date.parse(retired.effectiveTo ?? '');
    expect(Number.isNaN(effectiveTo)).toBe(false);
    expect(effectiveTo).toBeGreaterThanOrEqual(beforeDelete);
    expect(effectiveTo).toBeLessThanOrEqual(Date.now());

    const stored = await prisma.iotDevice.findUniqueOrThrow({
      where: { localDeviceId: 'e2e-life-a' }
    });
    expect(stored.status).toBe('RETIRED');
    expect(stored.statusChangedAt).not.toBeNull();

    const usages = await prisma.iotDeviceModelUsage.findMany({
      where: { deviceId: device.deviceId }
    });
    expect(usages).toHaveLength(1);
    expect(usages[0]?.toAt?.getTime()).toBe(effectiveTo);

    // 幂等：toAt 与 statusChangedAt 都不变
    const again = expectData<RetireResult>(await retireDevice('e2e-life-a'));
    expect(again.status).toBe('RETIRED');
    expect(Date.parse(again.effectiveTo ?? '')).toBe(effectiveTo);
    const storedAgain = await prisma.iotDevice.findUniqueOrThrow({
      where: { localDeviceId: 'e2e-life-a' }
    });
    expect(storedAgain.statusChangedAt?.getTime()).toBe(
      stored.statusChangedAt?.getTime()
    );

    // 注销后不重启 worker，快照仍含该设备（审计期望集不缩）
    await waitForSnapshotDevice('e2e-life-a');
  });

  it('撤销未生效设备：toAt = fromAt，零长区间', async () => {
    expectData(await postModel(modelBody(MODEL_REVOKE)));
    const now = Date.now();
    const fromAt = iso(now + 3_600_000);
    const device = await registerDevice('e2e-life-b', MODEL_REVOKE, fromAt);

    const retired = expectData<RetireResult>(await retireDevice('e2e-life-b'));
    expect(retired.effectiveTo).toBe(fromAt);

    const usage = await prisma.iotDeviceModelUsage.findFirstOrThrow({
      where: { deviceId: device.deviceId }
    });
    expect(usage.fromAt.toISOString()).toBe(fromAt);
    expect(usage.toAt?.toISOString()).toBe(fromAt);
    expect(
      (
        await prisma.iotDevice.findUniqueOrThrow({
          where: { localDeviceId: 'e2e-life-b' }
        })
      ).status
    ).toBe('RETIRED');
  });

  it('改期：按新区间选版本；同一 fromAt 幂等；目标在过去 409', async () => {
    expectData(await postModel(modelBody(MODEL_SCHEDULE)));
    const now = Date.now();
    const fromAt = iso(now + 3_600_000);
    const device = await registerDevice('e2e-life-c', MODEL_SCHEDULE, fromAt);

    const target = iso(now + 7_200_000);
    const moved = expectData<RescheduleResult>(
      await rescheduleDevice('e2e-life-c', { fromAt: target })
    );
    expect(moved.fromAt).toBe(target);
    expect(moved.version).toBe(1);
    const usage = await prisma.iotDeviceModelUsage.findFirstOrThrow({
      where: { deviceId: device.deviceId }
    });
    expect(usage.fromAt.toISOString()).toBe(target);

    // 幂等：同一目标重复提交返回相同结果，不报错
    const same = expectData<RescheduleResult>(
      await rescheduleDevice('e2e-life-c', { fromAt: target })
    );
    expect(same.fromAt).toBe(target);

    // 目标在过去 ⇒ 409（当前时段仍在未来，先过 device-effective 这道）
    const past = await rescheduleDevice('e2e-life-c', {
      fromAt: iso(now - 60_000)
    });
    expect(expectError(past, 409).data).toMatchObject({
      reason: 'from-at-not-future'
    });
  });

  it('已生效设备改期 ⇒ 409 device-effective', async () => {
    expectData(await postModel(modelBody(MODEL_EFFECTIVE)));
    await registerDevice('e2e-life-d', MODEL_EFFECTIVE);

    const res = await rescheduleDevice('e2e-life-d', {
      fromAt: iso(Date.now() + 3_600_000)
    });
    expect(expectError(res, 409).data).toMatchObject({
      reason: 'device-effective'
    });
  });

  it('改期目标早于模型最早版本 ⇒ 409 from-at-before-model', async () => {
    const now = Date.now();
    const earliest = iso(now + 3_600_000);
    expectData(await postModel(modelBody(MODEL_FUTURE, earliest)));
    await registerDevice('e2e-life-e', MODEL_FUTURE, earliest);

    const res = await rescheduleDevice('e2e-life-e', {
      fromAt: iso(now + 300_000)
    });
    const error = expectError(res, 409);
    expect(error.data).toMatchObject({ reason: 'from-at-before-model' });
    expect(
      (error.data as { earliestEffectiveFrom?: string }).earliestEffectiveFrom
    ).toBe(earliest);
  });

  it('同型号复活：沿用 deviceId 与子表名，新 open usage；不同型号 409', async () => {
    expectData(await postModel(modelBody(MODEL_OTHER)));
    expectData(await postModel(modelBody(MODEL_REVIVE)));
    const registered = await registerDevice('e2e-life-f', MODEL_REVIVE);
    expectData(await retireDevice('e2e-life-f'));

    const revived = expectData<DeviceResult>(
      await postDevice({
        localDeviceId: 'e2e-life-f',
        modelCode: MODEL_REVIVE
      })
    );
    expect(revived.deviceId).toBe(registered.deviceId);
    expect(revived.status).toBe('ACTIVE');
    expect(revived.ddl).toEqual([]);

    const stored = await prisma.iotDevice.findUniqueOrThrow({
      where: { localDeviceId: 'e2e-life-f' }
    });
    expect(stored.status).toBe('ACTIVE');
    const usages = await prisma.iotDeviceModelUsage.findMany({
      where: { deviceId: registered.deviceId },
      orderBy: { fromAt: 'asc' }
    });
    expect(usages).toHaveLength(2);
    expect(usages.filter(usage => usage.toAt === null)).toHaveLength(1);

    // 换型号：退役设备挂到别的模型 ⇒ 409
    expectData(await retireDevice('e2e-life-f'));
    const other = await postDevice({
      localDeviceId: 'e2e-life-f',
      modelCode: MODEL_OTHER
    });
    expect(expectError(other, 409).data).toMatchObject({
      reason: 'registered-to-other-model',
      modelCode: MODEL_REVIVE
    });
  });

  it('复活缺表 ⇒ 409 schema-mismatch，PG 不留半条', async () => {
    expectData(await postModel(modelBody(MODEL_REVIVE_MISSING)));
    const registered = await registerDevice('e2e-life-g', MODEL_REVIVE_MISSING);
    expectData(await retireDevice('e2e-life-g'));
    const before = await prisma.iotDevice.findUniqueOrThrow({
      where: { localDeviceId: 'e2e-life-g' }
    });

    // 手工删掉一张降采样子表：复活不自动补，缺一张即结构不一致
    const raw = subtableName(MODEL_REVIVE_MISSING, registered.deviceId);
    const dsName = dsSubtableName(raw, '1m');
    await td.exec(`DROP TABLE IF EXISTS wewant_iot_ds.${dsName}`);

    const res = await postDevice({
      localDeviceId: 'e2e-life-g',
      modelCode: MODEL_REVIVE_MISSING
    });
    const error = expectError(res, 409);
    expect(error.data).toMatchObject({ reason: 'schema-mismatch' });
    expect((error.data as { tables?: string[] }).tables).toContain(dsName);

    const after = await prisma.iotDevice.findUniqueOrThrow({
      where: { localDeviceId: 'e2e-life-g' }
    });
    expect(after.status).toBe('RETIRED');
    expect(after.statusChangedAt?.getTime()).toBe(
      before.statusChangedAt?.getTime()
    );
    expect(
      await prisma.iotDeviceModelUsage.count({
        where: { deviceId: registered.deviceId, toAt: null }
      })
    ).toBe(0);
  });

  it('复活 fromAt 早于最后一个非空 usage 的 toAt ⇒ 409 from-at-overlaps-usage', async () => {
    const now = Date.now();
    expectData(await postModel(modelBody(MODEL_OVERLAP, iso(now - 7_200_000))));
    await registerDevice('e2e-life-h', MODEL_OVERLAP, iso(now - 3_600_000));
    expectData(await retireDevice('e2e-life-h'));

    const res = await postDevice({
      localDeviceId: 'e2e-life-h',
      modelCode: MODEL_OVERLAP,
      fromAt: iso(now - 1_800_000)
    });
    const error = expectError(res, 409);
    expect(error.data).toMatchObject({ reason: 'from-at-overlaps-usage' });
    expect(typeof (error.data as { latestToAt?: string }).latestToAt).toBe(
      'string'
    );
  });

  it('未知设备：注销与改期都是 404', async () => {
    const retired = await retireDevice('e2e-life-missing');
    expect(expectError(retired, 404).code).toBe(BizCode.NOT_FOUND);

    const rescheduled = await rescheduleDevice('e2e-life-missing', {
      fromAt: iso(Date.now() + 3_600_000)
    });
    expect(expectError(rescheduled, 404).code).toBe(BizCode.NOT_FOUND);
  });

  it('路径参数先过标识符校验：非法编号 400', async () => {
    const retired = await retireDevice('e2e%2Flife');
    expect(expectError(retired, 400).code).toBe(BizCode.VALIDATION_FAILED);

    const rescheduled = await rescheduleDevice('e2e%20life', {
      fromAt: iso(Date.now() + 3_600_000)
    });
    expect(expectError(rescheduled, 400).code).toBe(BizCode.VALIDATION_FAILED);
  });
});
