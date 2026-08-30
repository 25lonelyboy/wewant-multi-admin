import { it, expect, vi } from 'vitest';
import { setupStore, store } from './index';

it('store 是 pinia 实例', () => {
  expect(typeof store.use).toBe('function');
  expect(typeof store.install).toBe('function');
});

it('setupStore 将 store 安装到 app', () => {
  const fakeApp = { use: vi.fn() } as any;
  setupStore(fakeApp as any);
  expect(fakeApp.use).toHaveBeenCalledWith(store);
});
