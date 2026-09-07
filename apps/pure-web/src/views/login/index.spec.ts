// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? '')),
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? '') : (m ?? ''))
}));

vi.mock('@/utils/message', () => ({ message: vi.fn() }));
vi.mock('@/router/utils' as any, async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    initRouter: vi.fn(),
    getTopMenu: () => ({ path: '/' })
  };
});
vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({
    title: 'TestApp',
    getDropdownItemStyle: () => ({}),
    getDropdownItemClass: () => ''
  })
}));
vi.mock('@/layout/hooks/useLayout', () => ({
  useLayout: () => ({ initStorage: vi.fn() })
}));
vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({
    dataTheme: { value: false },
    themeMode: { value: 'light' },
    dataThemeChange: vi.fn()
  })
}));
vi.mock('@/layout/hooks/useTranslationLang', () => ({
  useTranslationLang: () => ({
    locale: { value: 'zh' },
    translationCh: vi.fn(),
    translationEn: vi.fn()
  })
}));
vi.mock('@vueuse/core', () => ({
  useEventListener: vi.fn()
}));
vi.mock(import('@pureadmin/utils'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    debounce: (fn: any) => fn
  };
});

import LoginIndex from './index.vue';

describe('LoginIndex（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(LoginIndex, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          IconifyIconOnline: { template: '<span />' },
          TypeIt: { template: '<span />' },
          ReImageVerify: { template: '<div />' },
          LoginPhone: { template: '<div />' },
          LoginQrCode: { template: '<div />' },
          LoginRegist: { template: '<div />' },
          LoginUpdate: { template: '<div />' },
          Motion: { template: '<div><slot /></div>' }
        },
        mocks: {
          $route: { path: '/' },
          $router: { push: vi.fn() }
        }
      }
    });
    expect(wrapper.find('*').exists()).toBe(true);
  });
});
