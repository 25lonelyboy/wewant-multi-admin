import {
  DS_LEVELS,
  dsColumnsOf,
  type DsLevel,
  type ModelDeclaration,
  type SubtableRef
} from '@multi-admin/device-registry';
import {
  alterDsStables,
  alterRawStable,
  createDsStables,
  createDsSubtables,
  createRawStable,
  createRawSubtable,
  type DsStableState
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
        {
          ...DECL,
          properties: [
            ...DECL.properties,
            { key: 'pressure', kind: 'double', aggregates: ['sum'] }
          ]
        },
        existingStates(() => baseDsColumns())
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

function baseDsColumns(): Set<string> {
  const result = dsColumnsOf(DECL.properties);
  if (!result.ok) throw new Error('fixture 推导失败');
  return new Set(result.columns.map(column => column.name));
}

function existingStates(
  columnsFor: (level: DsLevel) => ReadonlySet<string>
): Map<DsLevel, DsStableState> {
  return new Map(
    DS_LEVELS.map(level => [
      level,
      { exists: true, columns: columnsFor(level) }
    ])
  );
}

describe('降采样超表演进：逐级按自己的列做差集', () => {
  const pressure = {
    key: 'pressure',
    kind: 'double',
    aggregates: ['sum', 'count']
  } as const;
  const withPressure: ModelDeclaration = {
    ...DECL,
    properties: [...DECL.properties, pressure]
  };

  it('三张都在且都缺新列 ⇒ 每级逐列 ALTER', () => {
    const statements = alterDsStables(
      withPressure,
      existingStates(() => baseDsColumns())
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
    const statements = alterDsStables(withPressure, new Map());
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
        existingStates(() => baseDsColumns())
      )
    ).toEqual([]);
  });

  it('1m 已有新列、1h / 1d 没有 ⇒ 只补缺的两级', () => {
    const oneMinute = baseDsColumns();
    oneMinute.add('sum_pressure');
    const statements = alterDsStables(
      {
        ...DECL,
        properties: [...DECL.properties, { ...pressure, aggregates: ['sum'] }]
      },
      existingStates(level => (level === '1m' ? oneMinute : baseDsColumns()))
    );
    expect(statements).toEqual([
      'ALTER STABLE wewant_iot_ds.e2e_reg_ddl_1h ADD COLUMN sum_pressure DOUBLE',
      'ALTER STABLE wewant_iot_ds.e2e_reg_ddl_1d ADD COLUMN sum_pressure DOUBLE'
    ]);
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
