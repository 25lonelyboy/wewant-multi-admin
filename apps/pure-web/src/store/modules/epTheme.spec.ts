// @vitest-environment jsdom
import { it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

import { storageLocal } from '@pureadmin/utils';
import { setConfig } from '@/config';
import { useEpThemeStoreHook } from './epTheme';

const hook = useEpThemeStoreHook;
const layoutKey = 'responsive-layout';

beforeEach(() => {
  storageLocal().clear();
  setConfig({
    ResponsiveStorageNameSpace: 'responsive-',
    EpThemeColor: '#409eff',
    Theme: 'light'
  });
  hook().$reset();
});

it('state 初始化回退链：storage 未命中时取 getConfig', () => {
  expect(hook().epThemeColor).toBe('#409eff');
  expect(hook().epTheme).toBe('light');
});

it('state 初始化：storage 命中时恢复 epThemeColor/theme', () => {
  storageLocal().setItem(layoutKey, { epThemeColor: '#123456', theme: 'dark' });
  hook().$reset();
  expect(hook().epThemeColor).toBe('#123456');
  expect(hook().epTheme).toBe('dark');
});

it('fill getter：light 主题返回主色，其余返回白色', () => {
  hook().$patch({ epTheme: 'light' });
  expect(hook().fill).toBe('#409eff');
  hook().$patch({ epTheme: 'dark' });
  expect(hook().fill).toBe('#fff');
});

it('setEpThemeColor：layout 为空时仅内存变更、解析出 epTheme 空值', () => {
  hook().setEpThemeColor('#000000');
  expect(hook().epThemeColor).toBe('#000000');
  expect(hook().epTheme).toBeUndefined();
  expect(storageLocal().getItem(layoutKey)).toBeNull();
});

it('setEpThemeColor：layout 存在时同步 epTheme 并持久化新色', () => {
  storageLocal().setItem(layoutKey, {
    theme: 'light',
    epThemeColor: '#409eff'
  });
  hook().$reset();
  hook().setEpThemeColor('#654321');
  expect(hook().epTheme).toBe('light');
  expect(hook().epThemeColor).toBe('#654321');
  expect(storageLocal().getItem(layoutKey)).toMatchObject({
    theme: 'light',
    epThemeColor: '#654321'
  });
});

it('getters 直读 state', () => {
  hook().$patch({ epThemeColor: '#abcdef' });
  expect(hook().getEpThemeColor).toBe('#abcdef');
});
