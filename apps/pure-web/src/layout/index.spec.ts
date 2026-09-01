// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/layout/hooks/useLayout', () => ({
  useLayout: () => ({ layout: ref('vertical') })
}));

const appStoreState = vi.hoisted(() => ({
  sidebar: { opened: true, withoutAnimation: false, isClickCollapse: false },
  device: 'desktop',
  layout: 'vertical',
  toggleDevice: vi.fn(),
  toggleSideBar: vi.fn(),
  setViewportSize: vi.fn()
}));
vi.mock('@/store/modules/app', () => ({
  useAppStoreHook: () => appStoreState
}));

const settingsState = vi.hoisted(() => ({
  fixedHeader: true,
  hiddenSideBar: false
}));
vi.mock('@/store/modules/settings', () => ({
  useSettingStoreHook: () => settingsState
}));

vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({ dataThemeChange: vi.fn() })
}));

const storageData: Record<string, any> = {
  configure: { hideTabs: false },
  layout: {
    layout: 'vertical',
    theme: 'light',
    darkMode: false,
    sidebarStatus: true,
    epThemeColor: '#409EFF',
    themeColor: 'light',
    themeMode: 'light'
  }
};

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useDark: () => ({ isDark: ref(false) }),
    useGlobal: () => ({ $storage: storageData }),
    deviceDetection: () => false,
    useResizeObserver: vi.fn()
  };
});

import LayoutIndex from './index.vue';

describe('LayoutIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appStoreState.sidebar = {
      opened: true,
      withoutAnimation: false,
      isClickCollapse: false
    };
    appStoreState.device = 'desktop';
    settingsState.fixedHeader = true;
    settingsState.hiddenSideBar = false;
  });

  function mountLayout() {
    return shallowMount(LayoutIndex as any, {
      global: {
        stubs: {
          LayTag: { template: '<div class="lay-tag" />' },
          LayNavbar: { template: '<div class="lay-navbar" />' },
          LayContent: { template: '<div class="lay-content" />' },
          LaySetting: { template: '<div class="lay-setting" />' },
          NavVertical: { template: '<div class="nav-vertical" />' },
          NavHorizontal: { template: '<div class="nav-horizontal" />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElBacktop: { template: '<div />' },
          IconifyIconOffline: { template: '<span />' }
        }
      }
    });
  }

  it('renders app-wrapper', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('.app-wrapper').exists()).toBe(true);
  });

  it('applies openSidebar class when sidebar opened', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('.app-wrapper').classes()).toContain('openSidebar');
  });

  it('applies hideSidebar class when sidebar closed', () => {
    appStoreState.sidebar.opened = false;
    const wrapper = mountLayout();
    expect(wrapper.find('.app-wrapper').classes()).toContain('hideSidebar');
  });

  it('renders LaySetting component', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('.lay-setting').exists()).toBe(true);
  });

  it('renders NavVertical in vertical layout', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('.nav-vertical').exists()).toBe(true);
  });

  it('renders main-container', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('.main-container').exists()).toBe(true);
  });

  it('applies mobile class when device is mobile', () => {
    appStoreState.device = 'mobile';
    const wrapper = mountLayout();
    expect(wrapper.find('.app-wrapper').classes()).toContain('mobile');
  });

  it('set.classes computes correctly', () => {
    const wrapper = mountLayout();
    const classes = (wrapper.vm as any).set.classes;
    expect(classes).toHaveProperty('hideSidebar');
    expect(classes).toHaveProperty('openSidebar');
    expect(classes).toHaveProperty('mobile');
  });
});
