import type {
  ModelDeclaration,
  SubtableRef
} from '@multi-admin/device-registry';
import {
  alterDsStables,
  alterRawStable,
  createDsStables,
  createDsSubtables,
  createRawStable,
  createRawSubtable
} from './ddl.js';

const DECL: ModelDeclaration = {
  modelCode: 'e2e_reg_ddl',
  properties: [
    {
      key: 'temperature',
      kind: 'float',
      aggregates: ['sum', 'count', 'min', 'max']
    },
    { key: 'door', kind: 'bool', aggregates: ['count', 'min', 'max'] },
    { key: 'status', kind: 'enum', enumValues: [0, 1], aggregates: ['count'] },
    { key: 'code', kind: 'string', varcharLength: 32, aggregates: [] }
  ],
  services: [],
  events: []
};

const NO_AGGREGATE: ModelDeclaration = {
  modelCode: 'e2e_reg_plain',
  properties: [
    { key: 'temperature', kind: 'float', aggregates: [] },
    { key: 'door', kind: 'bool', aggregates: [] }
  ],
  services: [],
  events: []
};

const REF: SubtableRef = {
  name: 'e2e_reg_ddl_abcdef0123456789',
  deviceId: 'ABCDEF0123456789',
  modelCode: 'e2e_reg_ddl'
};

describe('DDL 生成', () => {
  it('原始超表按声明顺序落列，枚举 INT、字符串 VARCHAR(n)', () => {
    expect(createRawStable(DECL)).toBe(
      'CREATE STABLE wewant_iot.e2e_reg_ddl ' +
        '(ts TIMESTAMP, temperature FLOAT, door BOOL, status INT, code VARCHAR(32)) ' +
        'TAGS (deviceId VARCHAR(16))'
    );
  });

  it('降采样超表：属性按声明顺序、聚合按固定顺序', () => {
    const [minute] = createDsStables(DECL);
    expect(minute).toContain(
      'ts TIMESTAMP, ' +
        'sum_temperature DOUBLE, count_temperature BIGINT, min_temperature FLOAT, max_temperature FLOAT, ' +
        'count_door BIGINT, min_door BOOL, max_door BOOL, ' +
        'count_status BIGINT'
    );
  });

  it('降采样超表三张，分钟级带超表级 KEEP', () => {
    const statements = createDsStables(DECL);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('wewant_iot_ds.e2e_reg_ddl_1m');
    expect(statements[0]).toContain('KEEP 1095');
    expect(statements[1]).not.toContain('KEEP');
    expect(statements[2]).not.toContain('KEEP');
  });

  it('无聚合模型一张降采样超表都不建', () => {
    expect(createDsStables(NO_AGGREGATE)).toEqual([]);
  });

  it('生成的语句里没有 IF NOT EXISTS', () => {
    const statements = [
      createRawStable(DECL),
      ...createDsStables(DECL),
      ...alterRawStable(DECL, [
        { key: 'pressure', kind: 'double', aggregates: [] }
      ]),
      ...alterDsStables(
        DECL,
        [{ key: 'pressure', kind: 'double', aggregates: ['sum'] }],
        new Set(['e2e_reg_ddl_1m', 'e2e_reg_ddl_1h', 'e2e_reg_ddl_1d'])
      ),
      createRawSubtable(REF),
      ...createDsSubtables(
        REF,
        DECL.properties,
        new Set(['e2e_reg_ddl_abcdef0123456789_1m'])
      )
    ];
    for (const statement of statements) {
      expect(statement).not.toContain('IF NOT EXISTS');
    }
  });

  it('加列按列展开：TDengine 一次 ADD COLUMN 只能一列', () => {
    const statements = alterRawStable(DECL, [
      { key: 'pressure', kind: 'double', aggregates: [] },
      { key: 'online', kind: 'bool', aggregates: [] }
    ]);
    expect(statements).toEqual([
      'ALTER STABLE wewant_iot.e2e_reg_ddl ADD COLUMN pressure DOUBLE',
      'ALTER STABLE wewant_iot.e2e_reg_ddl ADD COLUMN online BOOL'
    ]);
  });
});

describe('降采样超表演进：建还是 ALTER 由表在不在决定', () => {
  it('三张都在 ⇒ 逐列 ALTER 新增聚合列', () => {
    const statements = alterDsStables(
      DECL,
      [{ key: 'pressure', kind: 'double', aggregates: ['sum', 'count'] }],
      new Set(['e2e_reg_ddl_1m', 'e2e_reg_ddl_1h', 'e2e_reg_ddl_1d'])
    );
    expect(statements).toHaveLength(6);
    expect(statements[0]).toBe(
      'ALTER STABLE wewant_iot_ds.e2e_reg_ddl_1m ADD COLUMN sum_pressure DOUBLE'
    );
    expect(statements[1]).toBe(
      'ALTER STABLE wewant_iot_ds.e2e_reg_ddl_1m ADD COLUMN count_pressure BIGINT'
    );
  });

  it('一张都没有 ⇒ 按新声明建三张', () => {
    const pressure = {
      key: 'pressure',
      kind: 'double',
      aggregates: ['sum']
    } as const;
    const next: ModelDeclaration = {
      ...DECL,
      properties: [...DECL.properties, pressure]
    };
    const statements = alterDsStables(next, [pressure], new Set());
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain(
      'CREATE STABLE wewant_iot_ds.e2e_reg_ddl_1m'
    );
    expect(statements[0]).toContain('sum_pressure DOUBLE');
    expect(statements[0]).toContain('KEEP 1095');
  });

  it('新增属性不带聚合且表都在 ⇒ 不动降采样超表', () => {
    expect(
      alterDsStables(
        {
          ...DECL,
          properties: [
            ...DECL.properties,
            { key: 'x', kind: 'int', aggregates: [] }
          ]
        },
        [{ key: 'x', kind: 'int', aggregates: [] }],
        new Set(['e2e_reg_ddl_1m', 'e2e_reg_ddl_1h', 'e2e_reg_ddl_1d'])
      )
    ).toEqual([]);
  });
});

describe('子表 DDL', () => {
  it('原始子表挂当前模型的超表，标签值保留原样大小写', () => {
    expect(createRawSubtable(REF)).toBe(
      'CREATE TABLE wewant_iot.e2e_reg_ddl_abcdef0123456789 ' +
        "USING wewant_iot.e2e_reg_ddl TAGS ('ABCDEF0123456789')"
    );
  });

  it('降采样子表只建缺的', () => {
    const statements = createDsSubtables(
      REF,
      DECL.properties,
      new Set(['e2e_reg_ddl_abcdef0123456789_1m'])
    );
    expect(statements).toEqual([
      'CREATE TABLE wewant_iot_ds.e2e_reg_ddl_abcdef0123456789_1h ' +
        "USING wewant_iot_ds.e2e_reg_ddl_1h TAGS ('ABCDEF0123456789')",
      'CREATE TABLE wewant_iot_ds.e2e_reg_ddl_abcdef0123456789_1d ' +
        "USING wewant_iot_ds.e2e_reg_ddl_1d TAGS ('ABCDEF0123456789')"
    ]);
  });

  it('无聚合模型不建降采样子表', () => {
    expect(createDsSubtables(REF, NO_AGGREGATE.properties, new Set())).toEqual(
      []
    );
  });
});
