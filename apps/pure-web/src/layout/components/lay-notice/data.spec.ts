// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key
}));

import { noticesData } from './data';

describe('noticesData', () => {
  it('is an array with 3 items', () => {
    expect(Array.isArray(noticesData)).toBe(true);
    expect(noticesData).toHaveLength(3);
  });

  it('each item has required fields', () => {
    for (const item of noticesData) {
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('list');
      expect(item).toHaveProperty('emptyText');
      expect(Array.isArray(item.list)).toBe(true);
    }
  });

  it('first tab is notify (key=1) with empty list', () => {
    expect(noticesData[0].key).toBe('1');
    expect(noticesData[0].list).toHaveLength(0);
  });

  it('second tab is message (key=2) with 3 items', () => {
    expect(noticesData[1].key).toBe('2');
    expect(noticesData[1].list).toHaveLength(3);
  });

  it('third tab is todo (key=3) with 4 items', () => {
    expect(noticesData[2].key).toBe('3');
    expect(noticesData[2].list).toHaveLength(4);
  });

  it('todo items have status field', () => {
    const todoItems = noticesData[2].list;
    const withStatus = todoItems.filter(i => i.status);
    expect(withStatus.length).toBeGreaterThan(0);
  });
});
