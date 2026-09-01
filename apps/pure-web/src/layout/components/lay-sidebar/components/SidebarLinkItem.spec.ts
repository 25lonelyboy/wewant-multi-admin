// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';

// Mock dependencies
vi.mock('@pureadmin/utils', () => ({
  isUrl: (url: string) => /^https?:\/\//.test(url)
}));

import SidebarLinkItem from './SidebarLinkItem.vue';

describe('SidebarLinkItem', () => {
  it('renders router-link for internal links', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: '/dashboard',
          path: '/dashboard'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('renders anchor tag for external links', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: 'https://example.com',
          path: 'https://example.com'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.isExternalLink).toBe(true);
  });

  it('computes isExternalLink correctly for internal link', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: '/dashboard',
          path: '/dashboard'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.isExternalLink).toBe(false);
  });

  it('computes isExternalLink correctly for external link', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: 'https://example.com',
          path: 'https://example.com'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.isExternalLink).toBe(true);
  });

  it('getLinkProps returns correct props for external link', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: 'https://example.com',
          path: 'https://example.com'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    const vm = wrapper.vm as any;
    const linkProps = vm.getLinkProps({
      name: 'https://example.com'
    });

    expect(linkProps).toEqual({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener'
    });
  });

  it('getLinkProps returns correct props for internal link', () => {
    const wrapper = shallowMount(SidebarLinkItem as any, {
      props: {
        to: {
          name: '/dashboard',
          path: '/dashboard'
        }
      },
      global: {
        stubs: {
          'router-link': true,
          a: true
        }
      }
    });

    const vm = wrapper.vm as any;
    const linkProps = vm.getLinkProps({
      name: '/dashboard'
    });

    expect(linkProps).toEqual({
      to: {
        name: '/dashboard'
      }
    });
  });
});
