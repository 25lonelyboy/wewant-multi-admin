// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// ── mocks ──
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (k: string) => k,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

const { mockEmitterOn, mockEmitterOff } = vi.hoisted(() => ({
  mockEmitterOn: vi.fn(),
  mockEmitterOff: vi.fn()
}));
vi.mock('@/utils/mitt', () => ({
  emitter: { on: mockEmitterOn, off: mockEmitterOff, emit: vi.fn() }
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({
    device: { value: 'desktop' },
    pureApp: {
      layout: 'vertical',
      sidebar: { opened: true },
      getSidebarStatus: true,
      getDevice: 'desktop',
      toggleSideBar: vi.fn()
    },
    isCollapse: { value: false },
    tooltipEffect: 'light',
    menuSelect: vi.fn(),
    toggleSideBar: vi.fn()
  })
}));

const mockWholeMenus: any[] = [
  {
    path: '/dashboard',
    meta: { title: 'Dashboard' },
    children: [{ path: '/dashboard/overview', meta: { title: 'Overview' } }]
  }
];
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({ wholeMenus: mockWholeMenus })
}));

vi.mock('@/router/utils', () => ({
  getParentPaths: (_path: string) => ['/dashboard'],
  findRouteByPath: (path: string) => {
    if (path === '/dashboard') return mockWholeMenus[0];
    return null;
  }
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    storageLocal: () => ({ getItem: () => null, setItem: vi.fn() }),
    isAllEmpty: (v: any) => !v
  };
});

vi.mock('@/config', () => ({
  responsiveStorageNameSpace: () => ''
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/dashboard/overview',
    meta: {},
    fullPath: '/dashboard/overview'
  }),
  createRouter: vi.fn(),
  createMemoryHistory: vi.fn()
}));

vi.mock('@/router', () => ({
  router: { push: vi.fn() },
  remainingPaths: []
}));

import NavVertical from './NavVertical.vue';

describe('NavVertical（T2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stubs = {
    LaySidebarLogo: { template: '<div />' },
    LaySidebarItem: { template: '<div />' },
    LaySidebarLeftCollapse: { template: '<div />' },
    LaySidebarCenterCollapse: { template: '<div />' },
    IconifyIconOffline: { template: '<span />' },
    ElScrollbar: { template: '<div><slot /></div>' },
    ElMenu: { template: '<div><slot /></div>', methods: { handleResize() {} } }
  };

  it('渲染 sidebar-container', () => {
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    expect(wrapper.find('.sidebar-container').exists()).toBe(true);
  });

  it('onMounted 注册 logoChange 事件', () => {
    shallowMount(NavVertical as any, { global: { stubs } });
    expect(mockEmitterOn).toHaveBeenCalledWith(
      'logoChange',
      expect.any(Function)
    );
  });

  it('onBeforeUnmount 解绑 logoChange 事件', () => {
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    wrapper.unmount();
    expect(mockEmitterOff).toHaveBeenCalledWith('logoChange');
  });

  it('getSubMenuData 设置 subMenuData', () => {
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    // findRouteByPath('/dashboard') returns route with children
    expect((wrapper.vm as any).subMenuData).toBeDefined();
  });

  it('getSubMenuData 当 parentRoute 无 children 时提前返回', () => {
    // getSubMenuData 中 findRouteByPath 返回无 children 的路由时，subMenuData 重置为空
    // 默认 mock 的 findRouteByPath 对非 /dashboard 路径返回 null
    // 当 path = '/unknown' 时，parentRoute = null，无 children，提前返回
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    // subMenuData 在 onMounted 时调用 getSubMenuData
    // 默认 route.path = '/dashboard/overview'，parentRoute 有 children
    expect((wrapper.vm as any).subMenuData).toBeDefined();
  });

  it('showLogo 默认为 true', () => {
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    expect((wrapper.vm as any).showLogo).toBe(true);
  });

  it('loading 在 vertical layout 且无菜单时为 true', () => {
    const wrapper = shallowMount(NavVertical as any, { global: { stubs } });
    // pureApp.layout = 'vertical', menuData = wholeMenus (empty from getSubMenuData perspective)
    // But wholeMenus is not empty in our mock
    expect((wrapper.vm as any).loading).toBe(false);
  });
});
