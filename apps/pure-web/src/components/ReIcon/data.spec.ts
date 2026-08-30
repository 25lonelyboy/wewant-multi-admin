import { describe, it, expect } from 'vitest';
import { IconJson } from './data';

describe('IconJson 数据完整性', () => {
  it('含 ep:/ri:/fa-solid: 三图标集且均为非空数组', () => {
    expect(Object.keys(IconJson)).toEqual(['ep:', 'ri:', 'fa-solid:']);
    for (const list of Object.values(IconJson)) {
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    }
  });

  it('各集图标名无重复、无空串', () => {
    for (const list of Object.values(IconJson)) {
      expect(new Set(list).size).toBe(list.length);
      expect(list.every(i => typeof i === 'string' && i.length > 0)).toBe(true);
    }
  });
});
