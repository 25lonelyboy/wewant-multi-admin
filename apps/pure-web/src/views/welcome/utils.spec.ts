// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getRandomIntBetween } from './utils';

describe('welcome/utils', () => {
  it('getRandomIntBetween 返回 [min, max] 范围内的整数', () => {
    for (let i = 0; i < 50; i++) {
      const v = getRandomIntBetween(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
