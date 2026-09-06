import { describe, it, expect } from 'vitest';
import { useBoolean } from './useBoolean';

describe('useBoolean', () => {
  it('默认初始为 false', () => {
    const { bool } = useBoolean();
    expect(bool.value).toBe(false);
  });

  it('自定义初始值', () => {
    const { bool } = useBoolean(true);
    expect(bool.value).toBe(true);
  });

  it('setBool/setTrue/setFalse/toggle 行为', () => {
    const { bool, setBool, setTrue, setFalse, toggle } = useBoolean();
    setBool(true);
    expect(bool.value).toBe(true);
    setFalse();
    expect(bool.value).toBe(false);
    setTrue();
    expect(bool.value).toBe(true);
    toggle();
    expect(bool.value).toBe(false);
    toggle();
    expect(bool.value).toBe(true);
  });
});
