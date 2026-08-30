import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const forageFake = vi.hoisted(() => ({
  INDEXEDDB: 1,
  LOCALSTORAGE: 2,
  config: vi.fn(),
  setItem: vi.fn(),
  getItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  keys: vi.fn()
}));

vi.mock('localforage', () => ({ default: forageFake }));

import { localForage } from './index';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

it('构造时初始化驱动优先级与库名', () => {
  localForage();
  expect(forageFake.config).toHaveBeenCalledWith({
    driver: [forageFake.INDEXEDDB, forageFake.LOCALSTORAGE],
    name: 'pure-admin'
  });
});

describe('setItem', () => {
  it('默认 m=0：expires 为 0（永久），resolve 原始数据', async () => {
    forageFake.setItem.mockResolvedValue({ data: 42 });
    await expect(localForage().setItem('k', 42)).resolves.toBe(42);
    expect(forageFake.setItem).toHaveBeenCalledWith('k', {
      data: 42,
      expires: 0
    });
  });

  it('m>0：expires = 当前时间 + m 分钟', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T00:00:00Z'));
    forageFake.setItem.mockResolvedValue({ data: 'v' });
    await localForage().setItem('k', 'v', 5);
    expect(forageFake.setItem).toHaveBeenCalledWith('k', {
      data: 'v',
      expires: Date.now() + 5 * 60 * 1000
    });
  });

  it('底层 reject 透传', async () => {
    forageFake.setItem.mockRejectedValue(new Error('quota'));
    await expect(localForage().setItem('k', 'v')).rejects.toThrow('quota');
  });
});

describe('getItem', () => {
  it('底层返回 null：resolve null', async () => {
    forageFake.getItem.mockResolvedValue(null);
    await expect(localForage().getItem('k')).resolves.toBeNull();
  });

  it('expires=0（永久）：resolve data', async () => {
    forageFake.getItem.mockResolvedValue({ data: 'v', expires: 0 });
    await expect(localForage().getItem<string>('k')).resolves.toBe('v');
  });

  it('未过期：resolve data', async () => {
    forageFake.getItem.mockResolvedValue({
      data: 'v',
      expires: Date.now() + 60_000
    });
    await expect(localForage().getItem<string>('k')).resolves.toBe('v');
  });

  it('已过期：resolve null', async () => {
    forageFake.getItem.mockResolvedValue({ data: 'v', expires: 1 });
    await expect(localForage().getItem('k')).resolves.toBeNull();
  });

  it('底层 reject 透传', async () => {
    forageFake.getItem.mockRejectedValue(new Error('io'));
    await expect(localForage().getItem('k')).rejects.toThrow('io');
  });
});

describe('removeItem / clear / keys', () => {
  it('removeItem resolve', async () => {
    forageFake.removeItem.mockResolvedValue(undefined);
    await expect(localForage().removeItem('k')).resolves.toBeUndefined();
  });

  it('removeItem reject 透传', async () => {
    forageFake.removeItem.mockRejectedValue(new Error('io'));
    await expect(localForage().removeItem('k')).rejects.toThrow('io');
  });

  it('clear resolve', async () => {
    forageFake.clear.mockResolvedValue(undefined);
    await expect(localForage().clear()).resolves.toBeUndefined();
  });

  it('keys resolve 列表', async () => {
    forageFake.keys.mockResolvedValue(['a', 'b']);
    await expect(localForage().keys()).resolves.toEqual(['a', 'b']);
  });

  it('keys reject 透传', async () => {
    forageFake.keys.mockRejectedValue(new Error('io'));
    await expect(localForage().keys()).rejects.toThrow('io');
  });
});
