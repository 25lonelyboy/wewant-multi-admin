import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaPg } from '@prisma/adapter-pg';
import { BizCode } from '@multi-admin/contracts';
import {
  DS_LEVELS,
  dsStableName,
  dsSubtableName
} from '@multi-admin/device-registry';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from './../src/app.module.js';
import { applyAppDefaults } from './../src/common/bootstrap/apply-app-defaults.js';
import { REDIS_CLIENT } from './../src/common/redis/redis.constants.js';
import { DeviceIdIssuer } from './../src/modules/iot/devices/device-id-issuer.js';
import { TdClientProvider } from './../src/modules/iot/tdengine/td-client.provider.js';
import type { TdSql } from './../src/modules/iot/tdengine/td-client.js';

// 注册路径打真库：TDengine 的表/列与 PG 的档案行都要真，mock 不出「建表后 SHOW TABLES 看得到」。
// 每个模型编码带 e2e_reg_ 前缀，afterAll 先删表再删行（不假设可以清库）。
const TEST_DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/multi_admin_test?schema=public';

const PREFIX = 'e2e_reg_';
const MACHINE = `${PREFIX}machine`;
const PLAIN = `${PREFIX}plain`;
const DRY = `${PREFIX}dry`;
const NO_ACTIVE = `${PREFIX}noactive`;

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface ModelResult {
  modelCode: string;
  version: number;
  status: string;
  warnings: string[];
  ddl: string[];
}

interface DeviceResult {
  localDeviceId: string;
  deviceId: string;
  modelCode: string;
  status: string;
  ddl: string[];
}

let sequence = 0;
const nextDeviceId = () => `T${String(sequence + 1).padStart(15, '0')}`;
const issuer = {
  issue(): string {
    sequence += 1;
    return `T${String(sequence).padStart(15, '0')}`;
  }
};

describe('iot 注册路径 (e2e)', () => {
  let app: INestApplication<Server>;
  let td: TdSql;
  let adminToken = '';
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL })
  });
  const models = new Set<string>();
  const registrations: Array<{ modelCode: string; deviceId: string }> = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      // 随机签发没法预造「同名子表」；测试用确定性序列定位下一个标识
      .overrideProvider(DeviceIdIssuer)
      .useValue(issuer)
      .compile();

    app = moduleFixture.createNestApplication();
    applyAppDefaults(app);
    await app.init();
    await prisma.$connect();
    td = await app.get(TdClientProvider).get();
    adminToken = await login('admin', 'e2e-admin-password');
  }, 30_000);

  beforeEach(async () => {
    // 全局限流 60 次/分、按 IP 计数；套件用例多，逐例清零
    await app.get<{ flushdb(): Promise<string> }>(REDIS_CLIENT).flushdb();
  });

  afterAll(async () => {
    for (const modelCode of models) {
      for (const registration of registrations.filter(
        r => r.modelCode === modelCode
      )) {
        const raw = `${modelCode}_${registration.deviceId}`.toLowerCase();
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
      where: { modelCode: { startsWith: PREFIX } }
    });
    await prisma.iotDevice.deleteMany({
      where: { localDeviceId: { startsWith: 'e2e-reg-' } }
    });
    await prisma.iotModelVersion.deleteMany({
      where: { modelCode: { startsWith: PREFIX } }
    });
    await prisma.iotDeviceModel.deleteMany({
      where: { code: { startsWith: PREFIX } }
    });
    await prisma.$disconnect();
    await app.close();
  }, 30_000);

  const api = () => request(app.getHttpServer());
  const post = (url: string, body: unknown) =>
    api()
      .post(`/api/v1${url}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body as object);

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

  async function login(username: string, password: string): Promise<string> {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username, password });
    const body = res.body as Envelope<{ accessToken: string }>;
    return body.data.accessToken;
  }

  /** 库里所有表（原始 + 降采样），键为 `db.table` */
  async function allTables(): Promise<string[]> {
    const rows = await td.query(
      `SELECT db_name, table_name FROM information_schema.ins_tables ` +
        `WHERE db_name IN ('wewant_iot', 'wewant_iot_ds')`
    );
    return rows
      .map(row => `${String(row[0])}.${String(row[1])}`.toLowerCase())
      .sort();
  }

  async function allStables(): Promise<string[]> {
    const rows = await td.query(
      `SELECT db_name, stable_name FROM information_schema.ins_stables ` +
        `WHERE db_name IN ('wewant_iot', 'wewant_iot_ds')`
    );
    return rows
      .map(row => `${String(row[0])}.${String(row[1])}`.toLowerCase())
      .sort();
  }

  async function columnsOf(db: string, stable: string): Promise<string[]> {
    const rows = await td.query(`DESCRIBE ${db}.${stable}`);
    return rows.map(row => String(row[0]).toLowerCase());
  }

  /**
   * 已有模型的新版本只能在未来生效（`models.service` 的 not-in-future）：给「演进 / 重放」
   * 用例一个单调递增的未来时刻——同一声明重放也是一次新版本发布。
   */
  let effectiveCursor = Date.now() + 3_600_000;
  const nextEffectiveFrom = (): string => {
    effectiveCursor += 60_000;
    return new Date(effectiveCursor).toISOString();
  };

  function machineDeclaration(extra: unknown[] = [], effectiveFrom?: string) {
    return {
      modelCode: MACHINE,
      properties: [
        { key: 'temperature', kind: 'float', aggregates: ['sum'] },
        { key: 'door_open', kind: 'bool', aggregates: ['count'] },
        {
          key: 'mode',
          kind: 'enum',
          enumValues: [0, 1, 2],
          aggregates: ['count']
        },
        ...extra
      ],
      services: [],
      events: [],
      ...(effectiveFrom === undefined ? {} : { effectiveFrom })
    };
  }

  function plainDeclaration() {
    return {
      modelCode: PLAIN,
      properties: [
        { key: 'temperature', kind: 'float', aggregates: [] },
        { key: 'door_open', kind: 'bool', aggregates: [] }
      ],
      services: [],
      events: []
    };
  }

  describe('拒绝路径', () => {
    it('非法档位 400，不建表、不落库', async () => {
      const res = await post('/iot/models', {
        modelCode: `${PREFIX}bad`,
        properties: [{ key: 'x', kind: 'array', aggregates: [] }],
        services: [],
        events: []
      });
      const error = expectError(res, 400);
      expect(error.code).toBe(BizCode.VALIDATION_FAILED);
      expect(JSON.stringify(error.data)).toContain('invalid-kind');
      expect(
        await prisma.iotDeviceModel.count({ where: { code: `${PREFIX}bad` } })
      ).toBe(0);
    });

    it('localDeviceId 不是标识符 ⇒ 400 并给出原因，不落库', async () => {
      const cases: Array<{ raw: string; reason: string }> = [
        { raw: 'e2e/reg', reason: 'invalid-char' },
        { raw: 'e2e reg', reason: 'invalid-char' },
        { raw: 'a'.repeat(65), reason: 'too-long' },
        { raw: '   ', reason: 'empty' }
      ];
      for (const item of cases) {
        const res = await post('/iot/devices', {
          localDeviceId: item.raw,
          modelCode: `${PREFIX}whatever`
        });
        const error = expectError(res, 400);
        expect(error.code).toBe(BizCode.VALIDATION_FAILED);
        expect(JSON.stringify(error.data)).toContain(item.reason);
      }
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: { startsWith: 'e2e/reg' } }
        })
      ).toBe(0);
    });

    it('大写 localDeviceId 归一化后注册成功', async () => {
      const modelCode = `${PREFIX}upper`;
      expectData(
        await post('/iot/models', {
          modelCode,
          properties: [{ key: 'temperature', kind: 'float', aggregates: [] }],
          services: [],
          events: []
        })
      );
      models.add(modelCode);

      const result = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'E2E-REG-UPPER',
          modelCode
        })
      );
      expect(result.localDeviceId).toBe('e2e-reg-upper');
      registrations.push({ modelCode, deviceId: result.deviceId });

      const row = await prisma.iotDevice.findUniqueOrThrow({
        where: { localDeviceId: 'e2e-reg-upper' }
      });
      expect(row.status).toBe('ACTIVE');
    });

    it('布尔档位声明 sum 400：推导不出降采样列', async () => {
      const res = await post('/iot/models', {
        modelCode: `${PREFIX}badagg`,
        properties: [{ key: 'door', kind: 'bool', aggregates: ['sum'] }],
        services: [],
        events: []
      });
      const error = expectError(res, 400);
      expect(JSON.stringify(error.data)).toContain('no-column-type');
    });

    it('引用非 ACTIVE 模型 409，不建表', async () => {
      await prisma.iotDeviceModel.create({ data: { code: NO_ACTIVE } });
      await prisma.iotModelVersion.create({
        data: {
          modelCode: NO_ACTIVE,
          version: 1,
          status: 'SUPERSEDED',
          properties: [],
          services: [],
          events: [],
          effectiveFrom: new Date(Date.now() - 3_600_000),
          effectiveTo: new Date()
        }
      });
      models.add(NO_ACTIVE);

      const before = await allTables();
      const res = await post('/iot/devices', {
        localDeviceId: 'e2e-reg-noactive',
        modelCode: NO_ACTIVE
      });
      const error = expectError(res, 409);
      expect((error.data as { reason: string }).reason).toBe(
        'model-not-active'
      );
      expect(await allTables()).toEqual(before);
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: 'e2e-reg-noactive' }
        })
      ).toBe(0);
    });

    it('档案存在但非 ACTIVE ⇒ device-not-active，不建表', async () => {
      await prisma.iotDevice.create({
        data: {
          localDeviceId: 'e2e-reg-pending',
          deviceId: 'T000000000000900',
          status: 'PENDING'
        }
      });
      const tablesBefore = await allTables();
      const res = await post('/iot/devices', {
        localDeviceId: 'e2e-reg-pending',
        modelCode: `${PREFIX}pendingmodel`
      });
      const error = expectError(res, 409);
      expect(error.data).toEqual({
        reason: 'device-not-active',
        status: 'PENDING'
      });
      expect(await allTables()).toEqual(tablesBefore);
    });
  });

  describe('新模型 + 第一台设备', () => {
    it('表、列、档案全部由声明生成', async () => {
      models.add(MACHINE);
      const modelResult = expectData<ModelResult>(
        await post('/iot/models', machineDeclaration())
      );
      expect(modelResult.version).toBe(1);
      expect(modelResult.status).toBe('ACTIVE');

      const stables = await allStables();
      expect(stables).toEqual(
        expect.arrayContaining([
          `wewant_iot.${MACHINE}`,
          ...DS_LEVELS.map(
            level => `wewant_iot_ds.${dsStableName(MACHINE, level)}`
          )
        ])
      );

      // 判据 C：BOOL 与枚举测点，列类型全部由模型生成
      const rawColumns = await columnsOf('wewant_iot', MACHINE);
      expect(rawColumns).toEqual(
        expect.arrayContaining(['temperature', 'door_open', 'mode'])
      );
      const dsColumns = await columnsOf(
        'wewant_iot_ds',
        dsStableName(MACHINE, '1m')
      );
      expect(dsColumns).toEqual(
        expect.arrayContaining([
          'sum_temperature',
          'count_door_open',
          'count_mode'
        ])
      );
      // 只给 temperature 声明 sum：没有 sum_door_open
      expect(dsColumns).not.toContain('sum_door_open');

      const deviceResult = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'E2E-REG-001',
          modelCode: MACHINE,
          protocolVersion: '5.0'
        })
      );
      registrations.push({
        modelCode: MACHINE,
        deviceId: deviceResult.deviceId
      });
      expect(deviceResult.deviceId).toMatch(/^[A-Z][A-Z0-9]{15}$/);
      expect(deviceResult.ddl).toHaveLength(4);

      const tables = await allTables();
      expect(tables).toEqual(
        expect.arrayContaining([
          `wewant_iot.${MACHINE}_${deviceResult.deviceId}`.toLowerCase(),
          ...DS_LEVELS.map(
            level =>
              `wewant_iot_ds.${dsSubtableName(
                `${MACHINE}_${deviceResult.deviceId}`.toLowerCase(),
                level
              )}`
          )
        ])
      );

      const device = await prisma.iotDevice.findUniqueOrThrow({
        where: { localDeviceId: 'e2e-reg-001' }
      });
      expect(device.status).toBe('ACTIVE');
      expect(device.protocolVersion).toBe('5.0');
      expect(
        await prisma.iotDeviceModelUsage.count({
          where: { deviceId: device.deviceId, toAt: null }
        })
      ).toBe(1);
    });

    it('同模型第二台设备：模型表不动，只多一套子表', async () => {
      const stablesBefore = await allStables();
      const second = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'e2e-reg-002',
          modelCode: MACHINE
        })
      );
      registrations.push({ modelCode: MACHINE, deviceId: second.deviceId });
      expect(await allStables()).toEqual(stablesBefore);
      expect(await allTables()).toEqual(
        expect.arrayContaining([
          `wewant_iot.${MACHINE}_${second.deviceId}`.toLowerCase()
        ])
      );
    });

    it('幂等：同一请求重放，表数与行数不变', async () => {
      const tablesBefore = (await allTables()).sort();
      const rowsBefore = await prisma.iotDevice.count({
        where: { localDeviceId: { startsWith: 'e2e-reg-' } }
      });
      const replay = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'e2e-reg-001',
          modelCode: MACHINE
        })
      );
      expect(replay.ddl).toEqual([]);
      expect((await allTables()).sort()).toEqual(tablesBefore);
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: { startsWith: 'e2e-reg-' } }
        })
      ).toBe(rowsBefore);
    });

    it('换型号 409：换型不属本增量', async () => {
      const res = await post('/iot/devices', {
        localDeviceId: 'e2e-reg-001',
        modelCode: PLAIN
      });
      const error = expectError(res, 409);
      expect((error.data as { reason: string }).reason).toBe(
        'registered-to-other-model'
      );
    });
  });

  describe('模型内演进', () => {
    it('改 key 的 kind 被拒，版本仍是 1', async () => {
      const res = await post('/iot/models', {
        modelCode: MACHINE,
        properties: [
          { key: 'temperature', kind: 'int', aggregates: ['sum'] },
          { key: 'door_open', kind: 'bool', aggregates: ['count'] },
          {
            key: 'mode',
            kind: 'enum',
            enumValues: [0, 1, 2],
            aggregates: ['count']
          }
        ],
        services: [],
        events: [],
        effectiveFrom: nextEffectiveFrom()
      });
      const error = expectError(res, 400);
      expect(JSON.stringify(error.data)).toContain('kind-changed');
      expect(
        await prisma.iotModelVersion.count({
          where: { modelCode: MACHINE, status: 'ACTIVE' }
        })
      ).toBe(1);
    });

    it('加属性：超表与三张降采样超表各多一列，旧版本 SUPERSEDED', async () => {
      const result = expectData<ModelResult>(
        await post(
          '/iot/models',
          machineDeclaration(
            [{ key: 'pressure', kind: 'double', aggregates: ['sum'] }],
            nextEffectiveFrom()
          )
        )
      );
      expect(result.version).toBe(2);

      expect(await columnsOf('wewant_iot', MACHINE)).toContain('pressure');
      for (const level of DS_LEVELS) {
        expect(
          await columnsOf('wewant_iot_ds', dsStableName(MACHINE, level))
        ).toContain('sum_pressure');
      }

      const versions = await prisma.iotModelVersion.findMany({
        where: { modelCode: MACHINE },
        orderBy: { version: 'asc' }
      });
      expect(versions.map(v => v.status)).toEqual(['SUPERSEDED', 'ACTIVE']);
      expect(versions[0].effectiveTo).not.toBeNull();
    });

    it('某一级降采样表缺列时，重放只补该级', async () => {
      const level = '1h';
      const stable = dsStableName(MACHINE, level);
      await td.exec(
        `ALTER STABLE wewant_iot_ds.${stable} DROP COLUMN sum_pressure`
      );
      expect(await columnsOf('wewant_iot_ds', stable)).not.toContain(
        'sum_pressure'
      );

      const result = expectData<ModelResult>(
        await post(
          '/iot/models',
          machineDeclaration(
            [{ key: 'pressure', kind: 'double', aggregates: ['sum'] }],
            nextEffectiveFrom()
          )
        )
      );
      // 1m / 1d 已有该列，不重复 ALTER；只补 1h
      expect(result.ddl).toEqual([
        `ALTER STABLE wewant_iot_ds.${stable} ADD COLUMN sum_pressure DOUBLE`
      ]);
      expect(await columnsOf('wewant_iot_ds', stable)).toContain(
        'sum_pressure'
      );
      for (const other of DS_LEVELS.filter(candidate => candidate !== level)) {
        expect(
          await columnsOf('wewant_iot_ds', dsStableName(MACHINE, other))
        ).toContain('sum_pressure');
      }
      expect(result.version).toBe(3);
    });

    it('减属性放行，列保留在库里', async () => {
      const result = expectData<ModelResult>(
        await post('/iot/models', {
          modelCode: MACHINE,
          properties: [
            { key: 'temperature', kind: 'float', aggregates: ['sum'] },
            { key: 'door_open', kind: 'bool', aggregates: ['count'] }
          ],
          services: [],
          events: [],
          effectiveFrom: nextEffectiveFrom()
        })
      );
      expect(result.version).toBe(4);
      // 物理一份、逻辑多版：声明里没有的属性，新数据不再上报，旧列不删
      expect(await columnsOf('wewant_iot', MACHINE)).toContain('mode');
      expect(
        await columnsOf('wewant_iot_ds', dsStableName(MACHINE, '1m'))
      ).toContain('count_mode');
      expect(
        (
          await prisma.iotModelVersion.findFirstOrThrow({
            where: { modelCode: MACHINE, status: 'ACTIVE' }
          })
        ).version
      ).toBe(4);
    });
  });

  describe('无聚合模型', () => {
    it('只建原始超表与子表，没有降采样表', async () => {
      models.add(PLAIN);
      expectData<ModelResult>(await post('/iot/models', plainDeclaration()));
      expect(await allStables()).not.toEqual(
        expect.arrayContaining([`wewant_iot_ds.${dsStableName(PLAIN, '1m')}`])
      );

      const device = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'e2e-reg-plain-1',
          modelCode: PLAIN
        })
      );
      registrations.push({ modelCode: PLAIN, deviceId: device.deviceId });
      expect(device.ddl).toHaveLength(1);
      expect(
        (await allTables()).filter(t => t.startsWith('wewant_iot_ds.'))
      ).not.toEqual(
        expect.arrayContaining([
          `wewant_iot_ds.${dsSubtableName(
            `${PLAIN}_${device.deviceId}`.toLowerCase(),
            '1m'
          )}`
        ])
      );
    });

    it('聚合从无到有：补出三张降采样超表与已有设备的三张子表', async () => {
      const result = expectData<ModelResult>(
        await post('/iot/models', {
          modelCode: PLAIN,
          properties: [
            { key: 'temperature', kind: 'float', aggregates: ['sum'] },
            { key: 'door_open', kind: 'bool', aggregates: [] }
          ],
          services: [],
          events: [],
          effectiveFrom: nextEffectiveFrom()
        })
      );
      expect(result.version).toBe(2);

      for (const level of DS_LEVELS) {
        expect(await allStables()).toEqual(
          expect.arrayContaining([
            `wewant_iot_ds.${dsStableName(PLAIN, level)}`
          ])
        );
      }
      const [registration] = registrations
        .filter(r => r.modelCode === PLAIN)
        .slice(-1);
      const raw = `${PLAIN}_${registration.deviceId}`.toLowerCase();
      expect((await allTables()).sort()).toEqual(
        expect.arrayContaining(
          DS_LEVELS.map(level => `wewant_iot_ds.${dsSubtableName(raw, level)}`)
        )
      );
    });

    it('补建可重放：再发布同一份声明不报错、不产生重复表', async () => {
      const tablesBefore = (await allTables()).sort();
      const result = expectData<ModelResult>(
        await post('/iot/models', {
          modelCode: PLAIN,
          properties: [
            { key: 'temperature', kind: 'float', aggregates: ['sum'] },
            { key: 'door_open', kind: 'bool', aggregates: [] }
          ],
          services: [],
          events: [],
          effectiveFrom: nextEffectiveFrom()
        })
      );
      expect(result.version).toBe(3);
      // 列差集为空：同一声明重放不会重复 ALTER、不产生新表
      expect(result.ddl).toEqual([]);
      expect((await allTables()).sort()).toEqual(tablesBefore);
    });
  });

  describe('dryRun', () => {
    it('模型 dryRun 返回 DDL 但不落库、不建表', async () => {
      models.add(DRY);
      const tablesBefore = await allTables();
      const result = expectData<ModelResult>(
        await post(`/iot/models?dryRun=true`, {
          modelCode: DRY,
          properties: [{ key: 'temperature', kind: 'float', aggregates: [] }],
          services: [],
          events: []
        })
      );
      expect(result.ddl.length).toBeGreaterThan(0);
      expect(result.ddl.join('\n')).not.toContain('IF NOT EXISTS');
      expect(await allTables()).toEqual(tablesBefore);
      expect(await prisma.iotDeviceModel.count({ where: { code: DRY } })).toBe(
        0
      );
    });

    it('设备 dryRun 返回 DDL 但不建表、不落库', async () => {
      expectData<ModelResult>(
        await post('/iot/models', {
          modelCode: DRY,
          properties: [{ key: 'temperature', kind: 'float', aggregates: [] }],
          services: [],
          events: []
        })
      );
      const tablesBefore = await allTables();
      const result = expectData<DeviceResult>(
        await post('/iot/devices?dryRun=true', {
          localDeviceId: 'e2e-reg-dry-1',
          modelCode: DRY
        })
      );
      expect(result.ddl).toHaveLength(1);
      expect(await allTables()).toEqual(tablesBefore);
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: 'e2e-reg-dry-1' }
        })
      ).toBe(0);
    });
  });

  describe('表已存在与失败重试', () => {
    it('手工占住同名子表：409，PG 不留档案，手工表不被删', async () => {
      // DRY 模型已注册，用它的标识序列造一个可预知的子表名
      const deviceId = nextDeviceId();
      const occupied = `${DRY}_${deviceId}`.toLowerCase();
      await td.exec(
        `CREATE TABLE wewant_iot.${occupied} USING wewant_iot.${DRY} TAGS ('${deviceId}')`
      );
      try {
        const res = await post('/iot/devices', {
          localDeviceId: 'e2e-reg-occupied',
          modelCode: DRY
        });
        const error = expectError(res, 409);
        expect((error.data as { reason: string }).reason).toBe('table-exists');
        expect(await allTables()).toContain(`wewant_iot.${occupied}`);
        expect(
          await prisma.iotDevice.count({
            where: { localDeviceId: 'e2e-reg-occupied' }
          })
        ).toBe(0);
      } finally {
        await td.exec(`DROP TABLE IF EXISTS wewant_iot.${occupied}`);
      }
    });

    it('失败后同一 localDeviceId 能重试成功', async () => {
      const blockedId = nextDeviceId();
      const blocked = `${DRY}_${blockedId}`.toLowerCase();
      await td.exec(
        `CREATE TABLE wewant_iot.${blocked} USING wewant_iot.${DRY} TAGS ('${blockedId}')`
      );

      const failed = await post('/iot/devices', {
        localDeviceId: 'e2e-reg-retry',
        modelCode: DRY
      });
      expectError(failed, 409);
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: 'e2e-reg-retry' }
        })
      ).toBe(0);

      // 清掉障碍，同一 localDeviceId 重新提交
      await td.exec(`DROP TABLE IF EXISTS wewant_iot.${blocked}`);
      const expectedId = nextDeviceId();
      const success = expectData<DeviceResult>(
        await post('/iot/devices', {
          localDeviceId: 'e2e-reg-retry',
          modelCode: DRY
        })
      );
      registrations.push({ modelCode: DRY, deviceId: success.deviceId });
      expect(success.deviceId).toBe(expectedId);
      expect(
        await prisma.iotDevice.count({
          where: { localDeviceId: 'e2e-reg-retry', status: 'ACTIVE' }
        })
      ).toBe(1);
    });
  });
});
