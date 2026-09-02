// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getPickerShortcuts } from './utils';

describe('monitor/utils', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('getPickerShortcuts 返回8个快捷选项', () => {
    const shortcuts = getPickerShortcuts();
    expect(shortcuts).toHaveLength(8);
    expect(shortcuts[0].text).toBe('今天');
  });

  it('每个快捷项 value 为函数且返回日期数组', () => {
    const shortcuts = getPickerShortcuts();
    for (const s of shortcuts) {
      expect(typeof s.value).toBe('function');
      const result = (s.value as Function)();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Date);
    }
  });

  it('本周/上周 在周日（getDay()===0）时走 -6 分支', () => {
    // 2024-09-01 是周日
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-01T12:00:00'));
    const shortcuts = getPickerShortcuts();
    // 本周 (index 3)
    const weekResult = (shortcuts[3].value as Function)();
    expect(weekResult).toHaveLength(2);
    expect(weekResult[0]).toBeInstanceOf(Date);
    // 上周 (index 4)
    const lastWeekResult = (shortcuts[4].value as Function)();
    expect(lastWeekResult).toHaveLength(2);
    expect(lastWeekResult[0]).toBeInstanceOf(Date);
  });
});
