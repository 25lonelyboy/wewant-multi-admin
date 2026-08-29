import { describe, it, expect } from 'vitest';
import propTypes from './propTypes';

describe('propTypes', () => {
  it('基础校验器 type 属性对应正确构造函数', () => {
    expect(propTypes.string.type).toBe(String);
    expect(propTypes.number.type).toBe(Number);
    expect(propTypes.bool.type).toBe(Boolean);
    expect(propTypes.object.type).toBe(Object);
    expect(propTypes.integer.type).toBe(Number);
  });

  it('def() 返回 default 字段', () => {
    const withDefault = propTypes.string.def('fallback');
    expect(withDefault).toMatchObject({ default: 'fallback' });
  });

  it('自定义 style 校验器与 VNodeChild 校验器存在', () => {
    expect(propTypes.style).toBeDefined();
    expect(propTypes.style.type).toEqual([String, Object]);
    expect(propTypes.VNodeChild).toBeDefined();
  });
});
