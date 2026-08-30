// @vitest-environment jsdom
import { it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

import { setConfig } from '@/config';
import { useSettingStoreHook } from './settings';

const hook = useSettingStoreHook;

beforeEach(() => {
  setConfig({ Title: 'admin', FixedHeader: true, HiddenSideBar: false });
  hook().$reset();
});

it('state 初始化来自 getConfig', () => {
  expect(hook().title).toBe('admin');
  expect(hook().fixedHeader).toBe(true);
  expect(hook().hiddenSideBar).toBe(false);
});

it('CHANGE_SETTING：key 存在于 store 实例则写入', () => {
  hook().CHANGE_SETTING({ key: 'fixedHeader', value: false });
  expect(hook().fixedHeader).toBe(false);
});

it('CHANGE_SETTING：key 不存在则守卫静默忽略', () => {
  hook().CHANGE_SETTING({ key: 'noSuchKey', value: 'x' });
  expect(hook().$state).not.toHaveProperty('noSuchKey');
});

it('changeSetting 转发 CHANGE_SETTING', () => {
  hook().changeSetting({ key: 'title', value: 'new-title' });
  expect(hook().title).toBe('new-title');
});

it('getters 直读 state', () => {
  hook().CHANGE_SETTING({ key: 'hiddenSideBar', value: true });
  expect(hook().getHiddenSideBar).toBe(true);
  expect(hook().getTitle).toBe('admin');
  expect(hook().getFixedHeader).toBe(true);
});
