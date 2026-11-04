import assert from 'node:assert/strict';
import { test } from 'node:test';
import { P1_MODEL } from './p1-model.js';
import { validateModel, type ModelIssueCode } from './model-validate.js';
import type {
  Aggregate,
  ModelDeclaration,
  PropertyDecl,
  PropertyKind
} from './model-types.js';

function declaration(
  overrides: Partial<ModelDeclaration> = {}
): ModelDeclaration {
  return {
    modelCode: 'p1',
    properties: [],
    services: [],
    events: [],
    ...overrides
  };
}

function property(overrides: Partial<PropertyDecl> = {}): PropertyDecl {
  return {
    key: 'temperature',
    kind: 'float',
    aggregates: ['sum'],
    ...overrides
  };
}

function expectIssue(model: ModelDeclaration, code: ModelIssueCode): void {
  const result = validateModel(model);
  assert.equal(result.ok, false, `应被拒：${code}`);
  if (result.ok) return;
  assert.ok(
    result.issues.some(issue => issue.code === code),
    `缺少 ${code}，实际：${JSON.stringify(result.issues)}`
  );
}

void test('P1 模型通过校验且无警告', () => {
  const result = validateModel(P1_MODEL);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.warnings, []);
});

void test('声明服务或事件不拒绝，只出 warning', () => {
  const result = validateModel(
    declaration({
      properties: [property()],
      services: [{ key: 'reset' }]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.warnings, ['service-not-implemented']);
});

void test('校验成功时返回归一化后的声明', () => {
  const result = validateModel(
    declaration({
      modelCode: 'P1',
      properties: [
        property({ key: 'P1_Temp', aggregates: ['max', 'sum', 'max'] })
      ]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.declaration.modelCode, 'p1');
  const first = result.declaration.properties[0];
  assert.equal(first?.key, 'p1_temp');
  assert.deepEqual(first?.aggregates, ['sum', 'max']);
});

void test('结构体子字段的 key 也归一化', () => {
  const result = validateModel(
    declaration({
      properties: [
        property({
          key: 'config',
          kind: 'struct',
          aggregates: ['count'],
          varcharLength: 1024,
          fields: [{ key: 'Rated_Power', kind: 'float' }]
        })
      ]
    })
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.declaration.properties[0]?.fields, [
    { key: 'rated_power', kind: 'float' }
  ]);
});

void test('invalid-model-code', () => {
  expectIssue(
    declaration({ modelCode: 'p1-2', properties: [property()] }),
    'invalid-model-code'
  );
});

void test('invalid-key', () => {
  expectIssue(
    declaration({ properties: [property({ key: '1abc' })] }),
    'invalid-key'
  );
});

void test('duplicate-key：属性之间大小写归一后重名', () => {
  expectIssue(
    declaration({
      properties: [property({ key: 'Temp' }), property({ key: 'temp' })]
    }),
    'duplicate-key'
  );
});

void test('duplicate-key：属性与服务共享命名空间', () => {
  expectIssue(
    declaration({
      properties: [property({ key: 'power' })],
      services: [{ key: 'Power' }]
    }),
    'duplicate-key'
  );
});

void test('invalid-kind：array 不在八档内', () => {
  expectIssue(
    declaration({
      properties: [property({ kind: 'array' as unknown as PropertyKind })]
    }),
    'invalid-kind'
  );
});

void test('missing-field：字符串缺 varcharLength', () => {
  expectIssue(
    declaration({ properties: [property({ kind: 'string' })] }),
    'missing-field'
  );
});

void test('unexpected-field：布尔带单位', () => {
  expectIssue(
    declaration({
      properties: [property({ kind: 'bool', unit: 'A' })]
    }),
    'unexpected-field'
  );
});

void test('invalid-aggregate：不在四类之内', () => {
  expectIssue(
    declaration({
      properties: [property({ aggregates: ['avg'] as unknown as Aggregate[] })]
    }),
    'invalid-aggregate'
  );
});

void test('invalid-varchar-length：超上限与零', () => {
  expectIssue(
    declaration({
      properties: [
        property({
          kind: 'string',
          aggregates: ['count'],
          varcharLength: 70000
        })
      ]
    }),
    'invalid-varchar-length'
  );
  expectIssue(
    declaration({
      properties: [
        property({ kind: 'string', aggregates: ['count'], varcharLength: 0 })
      ]
    }),
    'invalid-varchar-length'
  );
});

void test('invalid-range：min 大于 max', () => {
  expectIssue(
    declaration({
      properties: [property({ range: { min: 10, max: 1 } })]
    }),
    'invalid-range'
  );
});

void test('invalid-enum-values：空、重复、非整数', () => {
  for (const enumValues of [[], [1, 1], [1.5]]) {
    expectIssue(
      declaration({
        properties: [property({ kind: 'enum', enumValues })]
      }),
      'invalid-enum-values'
    );
  }
});

void test('invalid-struct-field：空字段表、嵌套结构体、子字段重名', () => {
  expectIssue(
    declaration({
      properties: [
        property({
          kind: 'struct',
          aggregates: ['count'],
          varcharLength: 512,
          fields: []
        })
      ]
    }),
    'invalid-struct-field'
  );

  expectIssue(
    declaration({
      properties: [
        property({
          kind: 'struct',
          aggregates: ['count'],
          varcharLength: 512,
          fields: [{ key: 'a', kind: 'struct' as unknown as 'float' }]
        })
      ]
    }),
    'invalid-struct-field'
  );

  expectIssue(
    declaration({
      properties: [
        property({
          kind: 'struct',
          aggregates: ['count'],
          varcharLength: 512,
          fields: [
            { key: 'rated', kind: 'float' },
            { key: 'Rated', kind: 'int' }
          ]
        })
      ]
    }),
    'invalid-struct-field'
  );
});

void test('empty-model：一个属性都没有的模型被拒', () => {
  expectIssue(declaration(), 'empty-model');
});
