// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { formRules as _formRules } from './rule';
const formRules = _formRules as any;

describe('menu formRules', () => {
  it('title / name / path / auths 均为 required', () => {
    for (const key of ['title', 'name', 'path', 'auths'] as const) {
      const rules = formRules[key];
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({ required: true, trigger: 'blur' });
    }
  });
});
