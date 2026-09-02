// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({
    layout: ref('vertical'),
    device: ref('desktop'),
    logout: vi.fn(),
    onPanel: vi.fn(),
    pureApp: { sidebar: { opened: true } },
    username: 'admin',
    userAvatar: '/avatar.png',
    avatarsStyle: { width: '22px' },
    toggleSideBar: vi.fn(),
    toAccountSettings: vi.fn(),
    getDropdownItemStyle: vi.fn(() => ({})),
    getDropdownItemClass: vi.fn(() => '')
  })
}));

vi.mock('@/layout/hooks/useTranslationLang', () => ({
  useTranslationLang: () => ({
    t: (key: string) => key,
    locale: ref('zh'),
    translationCh: vi.fn(),
    translationEn: vi.fn()
  })
}));

import LayNavbar from './index.vue';

describe('LayNavbar', () => {
  function mountNavbar() {
    return shallowMount(LayNavbar as any, {
      global: {
        stubs: {
          LaySearch: { template: '<div class="lay-search" />' },
          LayNotice: { template: '<div class="lay-notice" />' },
          LayNavMix: { template: '<div class="lay-nav-mix" />' },
          LaySidebarFullScreen: { template: '<div />' },
          LaySidebarBreadCrumb: { template: '<div class="breadcrumb" />' },
          LaySidebarTopCollapse: { template: '<div />' },
          IconifyIconOffline: { template: '<span />' },
          ElDropdown: {
            template: '<div><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElDropdownItem: {
            template: '<div @click="$emit(\'click\', $event)"><slot /></div>'
          }
        }
      }
    });
  }

  it('renders navbar container', () => {
    const wrapper = mountNavbar();
    expect(wrapper.find('.navbar').exists()).toBe(true);
  });

  it('renders LaySearch in vertical layout', () => {
    const wrapper = mountNavbar();
    expect(wrapper.find('.lay-search').exists()).toBe(true);
  });

  it('renders LayNotice in vertical layout', () => {
    const wrapper = mountNavbar();
    expect(wrapper.find('.lay-notice').exists()).toBe(true);
  });

  it('renders breadcrumb in vertical layout', () => {
    const wrapper = mountNavbar();
    expect(wrapper.find('.breadcrumb').exists()).toBe(true);
  });

  it('renders username text', () => {
    const wrapper = mountNavbar();
    expect(wrapper.find('p').text()).toBe('admin');
  });

  it('renders user avatar', () => {
    const wrapper = mountNavbar();
    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/avatar.png');
  });
});
