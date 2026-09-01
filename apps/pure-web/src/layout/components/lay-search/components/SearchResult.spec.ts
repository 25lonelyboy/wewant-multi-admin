// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => 'mock-icon-component'
}));

vi.mock('@/store/modules/epTheme', () => ({
  useEpThemeStoreHook: () => ({ epThemeColor: '#409EFF' })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useResizeObserver: vi.fn()
  };
});

import SearchResult from './SearchResult.vue';

const options = [
  { path: '/dashboard', meta: { icon: 'ep/home-filled', title: 'Dashboard' } },
  { path: '/users', meta: { icon: 'ep/user', title: 'Users' } },
  { path: '/settings', meta: { icon: 'ep/setting', title: 'Settings' } }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SearchResult', () => {
  const mountOptions = {
    props: { value: '/dashboard', options },
    global: {
      stubs: {
        component: true,
        EnterOutlined: { template: '<span class="enter-stub" />' }
      }
    }
  };

  it('renders all result items', () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const items = wrapper.findAll('.result-item');
    expect(items.length).toBe(3);
  });

  it('renders item titles via transformI18n', () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const titles = wrapper.findAll('.result-item-title');
    expect(titles[0].text()).toBe('Dashboard');
    expect(titles[1].text()).toBe('Users');
    expect(titles[2].text()).toBe('Settings');
  });

  it('applies active style to the item matching value prop', () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const items = wrapper.findAll('.result-item');
    // First item should have active style (background = themeColor)
    expect(items[0].attributes('style')).toContain('rgb(64, 158, 255)');
    // Other items should not have active background
    expect(items[1].attributes('style')).not.toContain('rgb(64, 158, 255)');
  });

  it('emits enter when a result item is clicked', async () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const items = wrapper.findAll('.result-item');
    await items[1].trigger('click');
    expect(wrapper.emitted('enter')).toBeTruthy();
  });

  it('emits update:value on mouseenter', async () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const items = wrapper.findAll('.result-item');
    await items[2].trigger('mouseenter');
    expect(wrapper.emitted('update:value')).toBeTruthy();
    expect(wrapper.emitted('update:value')![0]).toEqual(['/settings']);
  });

  it('exposes handleScroll method', () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    expect(typeof (wrapper.vm as any).handleScroll).toBe('function');
  });

  it('handleScroll returns 0 when ref not found', () => {
    const wrapper = shallowMount(SearchResult as any, mountOptions);
    const result = (wrapper.vm as any).handleScroll(99);
    expect(result).toBe(0);
  });
});
