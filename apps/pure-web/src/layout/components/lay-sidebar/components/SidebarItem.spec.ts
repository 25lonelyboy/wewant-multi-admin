// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

const mockNav = vi.hoisted(() => {
  const layoutRef = { value: 'vertical' };
  const isCollapseRef = { value: false };
  return {
    layout: layoutRef,
    isCollapse: isCollapseRef,
    tooltipEffect: 'dark',
    getDivStyle: {}
  };
});

// Mock dependencies
vi.mock('@/config', () => ({
  getConfig: () => ({})
}));

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/components/ReIcon/src/hooks', () => ({
  useRenderIcon: () => 'mock-icon-component'
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => mockNav
}));

import SidebarItem from './SidebarItem.vue';

describe('SidebarItem', () => {
  const mockItem = {
    path: '/dashboard',
    name: 'Dashboard',
    meta: {
      icon: 'ep/home-filled',
      title: 'Dashboard'
    },
    children: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = false;
  });

  it('renders single menu item when no children', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: mockItem,
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    expect(wrapper.exists()).toBe(true);
  });

  it('handles hasOneShowingChild with no children', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: { ...mockItem, children: [] },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.hasOneShowingChild([], mockItem)).toBe(true);
  });

  it('handles hasOneShowingChild with one child', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          ...mockItem,
          children: [
            {
              path: 'child1',
              name: 'Child1',
              meta: { title: 'Child1' }
            }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    const children = [
      {
        path: 'child1',
        name: 'Child1',
        meta: { title: 'Child1' }
      }
    ];
    expect(vm.hasOneShowingChild(children, mockItem)).toBe(true);
  });

  it('handles hasOneShowingChild with multiple children', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          ...mockItem,
          children: [
            {
              path: 'child1',
              name: 'Child1',
              meta: { title: 'Child1' }
            },
            {
              path: 'child2',
              name: 'Child2',
              meta: { title: 'Child2' }
            }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    const children = [
      {
        path: 'child1',
        name: 'Child1',
        meta: { title: 'Child1' }
      },
      {
        path: 'child2',
        name: 'Child2',
        meta: { title: 'Child2' }
      }
    ];
    expect(vm.hasOneShowingChild(children, mockItem)).toBe(false);
  });

  it('resolves http paths correctly', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: mockItem,
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.resolvePath('https://example.com')).toBe('https://example.com');
    expect(vm.resolvePath('http://example.com')).toBe('http://example.com');
  });

  it('resolves relative paths correctly', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: mockItem,
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.resolvePath('analysis')).toBe('/dashboard/analysis');
  });

  it('computes textClass correctly for collapsed vertical layout', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = true;

    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: {
            title: 'Dashboard'
            // No icon to trigger the condition
          },
          parentId: null,
          pathList: [1],
          children: []
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });

    const vm = wrapper.vm as any;
    expect(vm.textClass).toContain('min-w-13.5!');
  });
});
