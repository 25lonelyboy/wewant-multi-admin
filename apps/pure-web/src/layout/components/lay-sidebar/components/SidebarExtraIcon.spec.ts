// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// Mock dependencies
vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => 'mock-icon-component'
}));

import SidebarExtraIcon from './SidebarExtraIcon.vue';

describe('SidebarExtraIcon', () => {
  it('renders nothing when extraIcon is empty', () => {
    const wrapper = shallowMount(SidebarExtraIcon as any, {
      props: {
        extraIcon: ''
      },
      global: {
        stubs: {
          component: true
        }
      }
    });

    expect(wrapper.find('.flex-c').exists()).toBe(false);
  });

  it('renders icon when extraIcon is provided', () => {
    const wrapper = shallowMount(SidebarExtraIcon as any, {
      props: {
        extraIcon: 'ep/star-filled'
      },
      global: {
        stubs: {
          component: true
        }
      }
    });

    expect(wrapper.find('.flex-c').exists()).toBe(true);
  });
});
