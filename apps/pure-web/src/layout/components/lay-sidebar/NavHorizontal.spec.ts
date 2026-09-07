// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// ── mocks ──
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } })
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
    title: 'TestApp',
    logout: vi.fn(),
    onPanel: vi.fn(),
    getLogo: () => '/logo.svg',
    username: 'admin',
    userAvatar: '/avatar.png',
    backTopMenu: vi.fn(),
    avatarsStyle: { marginRight: '10px' },
    toAccountSettings: vi.fn(),
    getDropdownItemStyle: () => ({}),
    getDropdownItemClass: () => ''
  })
}));

vi.mock('@/layout/hooks/useTranslationLang', () => ({
  useTranslationLang: () => ({
    t: (k: string) => k,
    route: { path: '/', meta: {} },
    locale: { value: 'zh' },
    translationCh: vi.fn(),
    translationEn: vi.fn()
  })
}));

vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => ({ wholeMenus: [] })
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

vi.mock('@/router', () => ({
  router: { push: vi.fn() },
  remainingPaths: []
}));

import NavHorizontal from './NavHorizontal.vue';

describe('NavHorizontal（T2）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const stubs = {
    LaySearch: { template: '<div />' },
    LayNotice: { template: '<div />' },
    LaySidebarItem: { template: '<div />' },
    LaySidebarFullScreen: { template: '<div />' },
    IconifyIconOffline: { template: '<span />' },
    GlobalizationIcon: { template: '<span />' },
    AccountSettingsIcon: { template: '<span />' },
    LogoutCircleRLine: { template: '<span />' },
    Setting: { template: '<span />' },
    Check: { template: '<span />' },
    ElMenu: { template: '<div><slot /></div>', methods: { handleResize() {} } },
    ElMenuItem: { template: '<div><slot /></div>' },
    ElDropdown: { template: '<div><slot /><slot name="dropdown" /></div>' },
    ElDropdownMenu: { template: '<div><slot /></div>' },
    ElDropdownItem: {
      template: '<div @click="$emit(\'click\')"><slot /></div>'
    }
  };

  it('渲染关键元素', () => {
    const wrapper = shallowMount(NavHorizontal as any, {
      global: { stubs }
    });
    expect(wrapper.find('.horizontal-header').exists()).toBe(true);
  });

  it('showLogo 默认为 true（storage 返回 null 时 fallback）', () => {
    const wrapper = shallowMount(NavHorizontal as any, {
      global: { stubs }
    });
    expect((wrapper.vm as any).showLogo).toBe(true);
  });

  it('onMounted 注册 logoChange 事件', () => {
    shallowMount(NavHorizontal as any, { global: { stubs } });
    expect(mockEmitterOn).toHaveBeenCalledWith(
      'logoChange',
      expect.any(Function)
    );
  });

  it('defaultActive 使用 route.meta.activePath 或 route.path', () => {
    const wrapper = shallowMount(NavHorizontal as any, { global: { stubs } });
    // route.path = '/' from mock
    expect((wrapper.vm as any).defaultActive).toBe('/');
  });
});
