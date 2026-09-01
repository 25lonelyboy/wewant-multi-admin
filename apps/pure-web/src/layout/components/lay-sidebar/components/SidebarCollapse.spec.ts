// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// Mock dependencies
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

vi.mock('@pureadmin/utils', () => ({
  useGlobal: () => ({
    $storage: {
      layout: {
        themeColor: 'light'
      }
    }
  })
}));

const mockNav = vi.hoisted(() => ({
  tooltipEffect: 'dark'
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => mockNav
}));

import SidebarLeftCollapse from './SidebarLeftCollapse.vue';
import SidebarCenterCollapse from './SidebarCenterCollapse.vue';
import SidebarTopCollapse from './SidebarTopCollapse.vue';

describe('SidebarLeftCollapse', () => {
  it('renders with default props', () => {
    const wrapper = shallowMount(SidebarLeftCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('.left-collapse').exists()).toBe(true);
  });

  it('has toggleClick method that emits event', () => {
    const wrapper = shallowMount(SidebarLeftCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        },
        directives: {
          tippy: () => {}
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.toggleClick).toBeDefined();
    vm.toggleClick();
    expect(wrapper.emitted('toggleClick')).toBeTruthy();
  });

  it('computes iconClass correctly', () => {
    const wrapper = shallowMount(SidebarLeftCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.iconClass).toContain('ml-4');
    expect(vm.iconClass).toContain('mb-1');
  });
});

describe('SidebarCenterCollapse', () => {
  it('renders with default props', () => {
    const wrapper = shallowMount(SidebarCenterCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('.center-collapse').exists()).toBe(true);
  });

  it('emits toggleClick event on click', async () => {
    const wrapper = shallowMount(SidebarCenterCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    await wrapper.find('.center-collapse').trigger('click');
    expect(wrapper.emitted('toggleClick')).toBeTruthy();
  });

  it('computes iconClass correctly', () => {
    const wrapper = shallowMount(SidebarCenterCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.iconClass).toContain('size-4');
  });
});

describe('SidebarTopCollapse', () => {
  it('renders with default props', () => {
    const wrapper = shallowMount(SidebarTopCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('emits toggleClick event on click', async () => {
    const wrapper = shallowMount(SidebarTopCollapse as any, {
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    await wrapper.find('div').trigger('click');
    expect(wrapper.emitted('toggleClick')).toBeTruthy();
  });

  it('shows correct title based on isActive', async () => {
    const wrapper = shallowMount(SidebarTopCollapse as any, {
      props: {
        isActive: false
      },
      global: {
        stubs: {
          IconifyIconOffline: true
        }
      }
    });

    expect(wrapper.attributes('title')).toBe('buttons.pureClickExpand');

    await wrapper.setProps({ isActive: true });
    expect(wrapper.attributes('title')).toBe('buttons.pureClickCollapse');
  });
});
