import { MAX_VARCHAR_BYTES } from './column-type.js';
import { checkMetricKey, checkModelCode } from './identifier.js';
import {
  AGGREGATES,
  PROPERTY_KINDS,
  type Aggregate,
  type EventDecl,
  type ModelDeclaration,
  type PropertyDecl,
  type PropertyKind,
  type ServiceDecl,
  type StructField
} from './model-types.js';

/**
 * 模型声明的结构校验。
 *
 * ⚠️ **不判聚合的合法性**——每档位可选哪些聚合由物模型定义接口（S4）收窄；这里只保证
 * 结构自洽（key、必填字段、长度、重名、聚合名是四类之一）。
 */

export type ModelIssueCode =
  /** 一个属性都没有——这样的模型收不到任何数据 */
  | 'empty-model'
  /** 模型编码不合法（复用 `checkModelCode`） */
  | 'invalid-model-code'
  /** 属性 / 服务 / 事件的 key 不合法（复用 `checkMetricKey`） */
  | 'invalid-key'
  /** 归一化后重名——属性之间，以及属性 × 服务 × 事件之间 */
  | 'duplicate-key'
  /** 不在八档内，含 `array` */
  | 'invalid-kind'
  /** 该档位缺配套字段 */
  | 'missing-field'
  /** 该档位不该有的字段（如 `bool` 带 `unit`） */
  | 'unexpected-field'
  /** 聚合名不在 `sum` / `count` / `min` / `max` 之内 */
  | 'invalid-aggregate'
  | 'invalid-varchar-length'
  | 'invalid-range'
  | 'invalid-enum-values'
  /** 子字段档位非法、重名或嵌套结构体 */
  | 'invalid-struct-field';

/** 警告不阻断注册 */
export type ModelWarning = 'service-not-implemented';

export interface ModelIssue {
  /** 定位到字段，形如 `properties[2].aggregates`——S4 直接回显到表单上 */
  path: string;
  code: ModelIssueCode;
}

export type ModelValidation =
  | { ok: true; declaration: ModelDeclaration; warnings: ModelWarning[] }
  | { ok: false; issues: ModelIssue[] };

type FieldName = 'unit' | 'range' | 'varcharLength' | 'enumValues' | 'fields';

const FIELD_NAMES: readonly FieldName[] = [
  'unit',
  'range',
  'varcharLength',
  'enumValues',
  'fields'
];

const KIND_SET: ReadonlySet<string> = new Set(PROPERTY_KINDS);
const SCALAR_KIND_SET: ReadonlySet<string> = new Set(
  PROPERTY_KINDS.filter(kind => kind !== 'struct')
);
const AGGREGATE_SET: ReadonlySet<string> = new Set(AGGREGATES);

const ALLOWED_FIELDS: Record<PropertyKind, readonly FieldName[]> = {
  float: ['unit', 'range'],
  double: ['unit', 'range'],
  int: ['unit', 'range'],
  bigint: ['unit', 'range'],
  bool: [],
  enum: ['range', 'enumValues'],
  string: ['unit', 'varcharLength'],
  struct: ['unit', 'varcharLength', 'fields']
};

const REQUIRED_FIELDS: Record<PropertyKind, readonly FieldName[]> = {
  float: [],
  double: [],
  int: [],
  bigint: [],
  bool: [],
  enum: ['enumValues'],
  string: ['varcharLength'],
  struct: ['varcharLength', 'fields']
};

/**
 * 校验并按归一化重建声明。
 *
 * ⭐ **成功分支返回的不是入参**：key 折小写、聚合集去重并按固定顺序排列。调用方拿到的
 * 就是可直接落库的形态——两道归一化迟早会漂，而 `sum_P1_Temp` 与 `sum_p1_temp` 在编解码
 * 与审计里是两个名字。
 */
export function validateModel(declaration: ModelDeclaration): ModelValidation {
  const issues: ModelIssue[] = [];
  const claimed = new Map<string, string>();

  const modelCode = checkModelCode(declaration.modelCode);
  if (!modelCode.ok) {
    issues.push({ path: 'modelCode', code: 'invalid-model-code' });
  }

  if (declaration.properties.length === 0) {
    issues.push({ path: 'properties', code: 'empty-model' });
  }

  const properties = declaration.properties.map((property, index) =>
    checkProperty(property, `properties[${index}]`, claimed, issues)
  );
  const services = declaration.services.map((service, index) =>
    checkMemberKey(service.key, `services[${index}].key`, claimed, issues)
  );
  const events = declaration.events.map((event, index) =>
    checkMemberKey(event.key, `events[${index}].key`, claimed, issues)
  );

  if (issues.length > 0) return { ok: false, issues };

  const warnings: ModelWarning[] = [];
  if (services.length > 0 || events.length > 0) {
    warnings.push('service-not-implemented');
  }

  return {
    ok: true,
    declaration: {
      modelCode: modelCode.ok ? modelCode.value : declaration.modelCode,
      properties,
      services,
      events
    },
    warnings
  };
}

function checkMemberKey(
  raw: string,
  path: string,
  claimed: Map<string, string>,
  issues: ModelIssue[]
): ServiceDecl | EventDecl {
  const key = checkMetricKey(raw);
  if (!key.ok) {
    issues.push({ path, code: 'invalid-key' });
    return { key: raw };
  }
  if (claimed.has(key.value)) {
    issues.push({ path, code: 'duplicate-key' });
    return { key: key.value };
  }
  claimed.set(key.value, path);
  return { key: key.value };
}

function checkProperty(
  property: PropertyDecl,
  path: string,
  claimed: Map<string, string>,
  issues: ModelIssue[]
): PropertyDecl {
  const key = checkMetricKey(property.key);
  if (!key.ok) {
    issues.push({ path: `${path}.key`, code: 'invalid-key' });
  } else if (claimed.has(key.value)) {
    issues.push({ path: `${path}.key`, code: 'duplicate-key' });
  } else {
    claimed.set(key.value, path);
  }

  const kind = property.kind;
  if (!KIND_SET.has(kind)) {
    issues.push({ path: `${path}.kind`, code: 'invalid-kind' });
    return property;
  }

  const allowed = ALLOWED_FIELDS[kind];
  for (const field of FIELD_NAMES) {
    if (property[field] !== undefined && !allowed.includes(field)) {
      issues.push({ path: `${path}.${field}`, code: 'unexpected-field' });
    }
  }
  for (const field of REQUIRED_FIELDS[kind]) {
    if (property[field] === undefined) {
      issues.push({ path: `${path}.${field}`, code: 'missing-field' });
    }
  }

  if (property.varcharLength !== undefined) {
    const length = property.varcharLength;
    if (!Number.isInteger(length) || length < 1 || length > MAX_VARCHAR_BYTES) {
      issues.push({
        path: `${path}.varcharLength`,
        code: 'invalid-varchar-length'
      });
    }
  }

  if (property.range !== undefined) {
    const { min, max } = property.range;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      issues.push({ path: `${path}.range`, code: 'invalid-range' });
    }
  }

  if (property.enumValues !== undefined) {
    const values = property.enumValues;
    const unique = new Set(values).size === values.length;
    if (
      values.length === 0 ||
      !values.every(value => Number.isInteger(value)) ||
      !unique
    ) {
      issues.push({ path: `${path}.enumValues`, code: 'invalid-enum-values' });
    }
  }

  const normalized: PropertyDecl = {
    ...property,
    key: key.ok ? key.value : property.key,
    aggregates: normalizeAggregates(property, path, issues)
  };

  if (property.fields !== undefined) {
    normalized.fields = checkFields(property.fields, path, issues);
  }

  return normalized;
}

/** 去重并按固定顺序输出；不认识的名字记账，不静默丢 */
function normalizeAggregates(
  property: PropertyDecl,
  path: string,
  issues: ModelIssue[]
): readonly Aggregate[] {
  const seen = new Set<string>();
  for (const aggregate of property.aggregates) {
    if (!AGGREGATE_SET.has(aggregate)) {
      issues.push({ path: `${path}.aggregates`, code: 'invalid-aggregate' });
      continue;
    }
    seen.add(aggregate);
  }
  return AGGREGATES.filter(aggregate => seen.has(aggregate));
}

function checkFields(
  fields: readonly StructField[],
  path: string,
  issues: ModelIssue[]
): readonly StructField[] {
  if (fields.length === 0) {
    issues.push({ path: `${path}.fields`, code: 'invalid-struct-field' });
  }

  const seen = new Set<string>();
  const normalized: StructField[] = [];

  for (const [index, field] of fields.entries()) {
    const fieldPath = `${path}.fields[${index}]`;
    const key = checkMetricKey(field.key);
    if (!key.ok) {
      issues.push({ path: `${fieldPath}.key`, code: 'invalid-struct-field' });
      continue;
    }
    if (!SCALAR_KIND_SET.has(field.kind)) {
      issues.push({ path: `${fieldPath}.kind`, code: 'invalid-struct-field' });
      continue;
    }
    if (seen.has(key.value)) {
      issues.push({ path: `${fieldPath}.key`, code: 'invalid-struct-field' });
      continue;
    }
    seen.add(key.value);
    normalized.push({ key: key.value, kind: field.kind });
  }

  return normalized;
}
