// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { computed } from 'vue';

// ── mocks ──
vi.mock('animate.css', () => ({}));
vi.mock('@/components/ReIcon/src/offlineIcon', () => ({}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (k: string) => k,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/layout/hooks/useLayout', () => ({
  useLayout: () => ({
    layout: computed(() => 'vertical'),
    layoutTheme: { value: {} },
    initStorage: vi.fn()
  })
}));

vi.mock('@/store/modules/app', () => ({
  useAppStoreHook: () => ({
    sidebar: { opened: true, withoutAnimation: false, isClickCollapse: false },
    device: 'desktop',
    layout: 'vertical',
    getSidebarStatus: true,
    getDevice: 'desktop',
    toggleDevice: vi.fn(),
    toggleSideBar: vi.fn(),
    setViewportSize: vi.fn()
  })
}));

vi.mock('@/store/modules/settings', () => ({
  useSettingStoreHook: () => ({
    fixedHeader: true,
    hiddenSideBar: false
  })
}));

vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({ dataThemeChange: vi.fn(), onReset: vi.fn() })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useDark: () => ({ isDark: { value: false } }),
    useGlobal: () => ({
      $storage: {
        layout: { themeMode: 'light', layout: 'vertical' },
        configure: { hideTabs: false }
      }
    }),
    deviceDetection: () => false,
    useResizeObserver: vi.fn()
  };
});

import LayoutIndex from './index.vue';

describe('LayoutIndex（T3 smoke）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('挂载不崩且根元素渲染', () => {
    const wrapper = shallowMount(LayoutIndex as any, {
      global: {
        stubs: {
          LayTag: { template: '<div />' },
          LayNavbar: { template: '<div />' },
          LayContent: { template: '<div />' },
          LaySetting: { template: '<div />' },
          NavVertical: { template: '<div />' },
          NavHorizontal: { template: '<div />' },
          BackTopIcon: { template: '<span />' },
          ElScrollbar: { template: '<div><slot /></div>' },
          ElBacktop: { template: '<div />' }
        },
        directives: { loading: () => {} }
      }
    });
    expect(wrapper.find('.app-wrapper').exists()).toBe(true);
  });
});
