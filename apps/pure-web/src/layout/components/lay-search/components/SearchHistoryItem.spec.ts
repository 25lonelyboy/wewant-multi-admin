// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => 'mock-icon-component'
}));

import SearchHistoryItem from './SearchHistoryItem.vue';

const baseItem = {
  path: '/dashboard',
  type: 'history' as const,
  meta: { icon: 'ep/home-filled', title: 'Dashboard' }
};

describe('SearchHistoryItem', () => {
  it('renders item title via transformI18n', () => {
    const wrapper = shallowMount(SearchHistoryItem as any, {
      props: { item: baseItem },
      global: {
        stubs: {
          component: true,
          IconifyIconOffline: { template: '<span class="stub-icon" />' }
        }
      }
    });
    expect(wrapper.find('.history-item-title').text()).toBe('Dashboard');
  });

  it('emits collectItem when star icon is clicked', async () => {
    const wrapper = shallowMount(SearchHistoryItem as any, {
      props: { item: baseItem },
      global: {
        stubs: {
          component: true,
          IconifyIconOffline: { template: '<span class="stub-icon" />' }
        }
      }
    });
    // The first IconifyIconOffline is the star (collect) icon
    const icons = wrapper.findAll('.stub-icon');
    await icons[0].trigger('click');
    expect(wrapper.emitted('collectItem')).toBeTruthy();
    expect(wrapper.emitted('collectItem')![0]).toEqual([baseItem]);
  });

  it('emits deleteItem when close icon is clicked', async () => {
    const wrapper = shallowMount(SearchHistoryItem as any, {
      props: { item: baseItem },
      global: {
        stubs: {
          component: true,
          IconifyIconOffline: { template: '<span class="stub-icon" />' }
        }
      }
    });
    // The second IconifyIconOffline is the close (delete) icon
    const icons = wrapper.findAll('.stub-icon');
    await icons[1].trigger('click');
    expect(wrapper.emitted('deleteItem')).toBeTruthy();
    expect(wrapper.emitted('deleteItem')![0]).toEqual([baseItem]);
  });
});
