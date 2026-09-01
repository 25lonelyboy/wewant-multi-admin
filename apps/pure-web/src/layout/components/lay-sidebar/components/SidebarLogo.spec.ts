// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// Mock dependencies
vi.mock('@/router/utils', () => ({
  getTopMenu: () => ({ path: '/welcome' })
}));

const mockNav = vi.hoisted(() => ({
  title: 'Test App',
  getLogo: () => '/logo.png'
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => mockNav
}));

import SidebarLogo from './SidebarLogo.vue';

describe('SidebarLogo', () => {
  it('renders logo container', () => {
    const wrapper = shallowMount(SidebarLogo as any, {
      props: {
        collapse: false
      },
      global: {
        stubs: {
          'router-link': true,
          transition: true
        }
      }
    });

    expect(wrapper.find('.sidebar-logo-container').exists()).toBe(true);
  });

  it('applies collapses class when collapse is true', () => {
    const wrapper = shallowMount(SidebarLogo as any, {
      props: {
        collapse: true
      },
      global: {
        stubs: {
          'router-link': true,
          transition: true
        }
      }
    });

    expect(wrapper.find('.sidebar-logo-container.collapses').exists()).toBe(
      true
    );
  });

  it('does not apply collapses class when collapse is false', () => {
    const wrapper = shallowMount(SidebarLogo as any, {
      props: {
        collapse: false
      },
      global: {
        stubs: {
          'router-link': true,
          transition: true
        }
      }
    });

    expect(wrapper.find('.sidebar-logo-container.collapses').exists()).toBe(
      false
    );
  });

  it('renders logo image', () => {
    const wrapper = shallowMount(SidebarLogo as any, {
      props: {
        collapse: false
      },
      global: {
        stubs: {
          'router-link': {
            template: '<a><slot /></a>'
          },
          transition: false
        }
      }
    });

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('/logo.png');
  });

  it('renders title text', () => {
    const wrapper = shallowMount(SidebarLogo as any, {
      props: {
        collapse: false
      },
      global: {
        stubs: {
          'router-link': {
            template: '<a><slot /></a>'
          },
          transition: false
        }
      }
    });

    expect(wrapper.find('.sidebar-title').text()).toBe('Test App');
  });
});
