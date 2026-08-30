// @vitest-environment jsdom
import { it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : m)
}));

import { storageLocal } from '@pureadmin/utils';
import { setConfig } from '@/config';
import { useAppStoreHook } from './app';

const hook = useAppStoreHook;
const layoutKey = 'responsive-layout';

beforeEach(() => {
  storageLocal().clear();
  setConfig({
    ResponsiveStorageNameSpace: 'responsive-',
    SidebarStatus: true,
    Layout: 'vertical'
  });
  hook().$reset();
});

const seedLayout = (layout: object) =>
  storageLocal().setItem(layoutKey, layout);

it('storage 未命中：state 回退 getConfig 缺省', () => {
  expect(hook().sidebar.opened).toBe(true);
  expect(hook().layout).toBe('vertical');
  expect(hook().device).toBe('desktop');
  expect(hook().viewportSize.width).toBeTypeOf('number');
});

it('storage 命中：state 从 storage 恢复', () => {
  seedLayout({ sidebarStatus: false, layout: 'mix' });
  hook().$reset();
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().layout).toBe('mix');
});

it('TOGGLE_SIDEBAR(opened=true, resize) 分支：强制展开 + 持久化 true', () => {
  seedLayout({ sidebarStatus: false });
  hook().$reset();
  hook().TOGGLE_SIDEBAR(true, 'grow');
  expect(hook().sidebar.opened).toBe(true);
  expect(hook().sidebar.withoutAnimation).toBe(true);
  const saved: any = storageLocal().getItem(layoutKey);
  expect(saved).toMatchObject({ sidebarStatus: true });
});

it('TOGGLE_SIDEBAR(!opened && resize) 分支：强制收起 + 持久化 false', () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  hook().TOGGLE_SIDEBAR(false, 'shrink');
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().sidebar.withoutAnimation).toBe(true);
  expect(storageLocal().getItem(layoutKey)).toMatchObject({
    sidebarStatus: false
  });
});

it('TOGGLE_SIDEBAR 无参切换分支：翻转 + isClickCollapse + 持久化', () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  hook().TOGGLE_SIDEBAR();
  expect(hook().sidebar.opened).toBe(false);
  expect(hook().sidebar.withoutAnimation).toBe(false);
  expect(hook().sidebar.isClickCollapse).toBe(true);
  expect(storageLocal().getItem(layoutKey)).toMatchObject({
    sidebarStatus: false
  });
});

it('TOGGLE_SIDEBAR layout 为 null 时仅变更 state、不持久化', () => {
  storageLocal().clear();
  hook().$reset();
  hook().TOGGLE_SIDEBAR(true, 'grow');
  expect(hook().sidebar.opened).toBe(true);
  expect(hook().sidebar.withoutAnimation).toBe(true);
  expect(storageLocal().getItem(layoutKey)).toBeNull();
});

it('toggleSideBar 包装 actions 转发', async () => {
  seedLayout({ sidebarStatus: true });
  hook().$reset();
  await hook().toggleSideBar();
  expect(hook().sidebar.opened).toBe(false);
});

it('四个 setter 直写 state', () => {
  seedLayout({ sidebarStatus: false });
  hook().$reset();
  hook().toggleDevice('mobile');
  hook().setLayout('mix');
  hook().setViewportSize({ width: 1024, height: 768 });
  hook().setSortSwap(true);
  expect(hook().device).toBe('mobile');
  expect(hook().getDevice).toBe('mobile');
  expect(hook().layout).toBe('mix');
  expect(hook().getViewportWidth).toBe(1024);
  expect(hook().getViewportHeight).toBe(768);
  expect(hook().sortSwap).toBe(true);
  expect(hook().getSidebarStatus).toBe(false);
});
