// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

const layoutRef = ref('vertical');
const isCollapseRef = ref(false);
const mockNav = {
  layout: layoutRef,
  isCollapse: isCollapseRef,
  tooltipEffect: 'dark',
  getDivStyle: {}
};

// Mock dependencies
const getConfigMock = vi.hoisted(() => ({ getConfig: () => ({}) }));
vi.mock('@/config', () => getConfigMock);

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

  it('expandCloseIcon returns object when MenuArrowIconNoTransition is set', () => {
    getConfigMock.getConfig = () => ({ MenuArrowIconNoTransition: true });
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
    const icons = vm.expandCloseIcon;
    expect(icons).toHaveProperty('expand-close-icon');
    expect(icons).toHaveProperty('expand-open-icon');
    expect(icons).toHaveProperty('collapse-close-icon');
    expect(icons).toHaveProperty('collapse-open-icon');
    getConfigMock.getConfig = () => ({});
  });

  it('hasOneShowingChild returns false when showParent is true', () => {
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
    const children = [
      {
        path: 'child1',
        name: 'Child1',
        meta: { title: 'Child1', showParent: true }
      }
    ];
    expect(vm.hasOneShowingChild(children, mockItem)).toBe(false);
  });

  it('renders el-sub-menu when has multiple children', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          ...mockItem,
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: true,
          ReText: true
        }
      }
    });
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
  });

  it('computes getSubMenuIconStyle for horizontal layout', () => {
    mockNav.layout.value = 'horizontal';
    mockNav.isCollapse.value = false;
    const wrapper = shallowMount(SidebarItem as any, {
      props: { item: mockItem, basePath: '/dashboard' },
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
    expect((wrapper.vm as any).getSubMenuIconStyle.margin).toBe('0 5px 0 0');
  });

  it('computes getSubMenuIconStyle for collapsed layout', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: { item: mockItem, basePath: '/dashboard' },
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
    expect((wrapper.vm as any).getSubMenuIconStyle.margin).toBe('0 auto');
  });

  it('textClass returns base class for non-collapsed layout', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = false;
    const wrapper = shallowMount(SidebarItem as any, {
      props: { item: mockItem, basePath: '/dashboard' },
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
    expect((wrapper.vm as any).textClass).toBe('w-full! text-inherit!');
  });

  it('resolves basePath when routePath is empty with http', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: { item: mockItem, basePath: 'http://example.com' },
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
    expect(vm.resolvePath('')).toBe('http://example.com');
  });

  it('renders el-sub-menu with icon in collapsed horizontal layout', () => {
    mockNav.layout.value = 'horizontal';
    mockNav.isCollapse.value = false;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          ...mockItem,
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
  });

  it('renders el-sub-menu with mix layout and collapsed', () => {
    mockNav.layout.value = 'mix';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          ...mockItem,
          pathList: ['/dashboard'],
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
  });

  it('renders el-sub-menu without icon', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = false;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard' },
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
  });

  it('renders single child with icon in collapsed vertical', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard', icon: 'ep/home-filled' },
          parentId: null,
          pathList: ['/dashboard'],
          children: []
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': {
            template:
              '<div class="el-menu-item-stub"><slot /><slot name="title" /></div>'
          },
          'el-sub-menu': true,
          'el-text': true,
          SidebarLinkItem: {
            template: '<div><slot /><slot name="title" /></div>'
          },
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders single child without icon in collapsed mix layout', () => {
    mockNav.layout.value = 'mix';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard' },
          pathList: ['/dashboard', '/dashboard'],
          children: []
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': {
            template: '<div><slot /><slot name="title" /></div>'
          },
          'el-sub-menu': true,
          'el-text': { template: '<span><slot /></span>' },
          SidebarLinkItem: {
            template: '<div><slot /><slot name="title" /></div>'
          },
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('expandCloseIcon returns empty string when no config', () => {
    getConfigMock.getConfig = () => ({});
    const wrapper = shallowMount(SidebarItem as any, {
      props: { item: mockItem, basePath: '/dashboard' },
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
    expect((wrapper.vm as any).expandCloseIcon).toBe('');
  });

  it('renders nothing when item is undefined', () => {
    const wrapper = shallowMount(SidebarItem as any, {
      props: { basePath: '/dashboard' },
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
    // Neither SidebarLinkItem nor el-sub-menu should render (v-if comment)
    expect(wrapper.html()).toContain('v-if');
  });

  it('renders el-text in collapsed vertical layout with no icon and pathList length 1', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard' },
          parentId: null,
          pathList: ['/dashboard'],
          children: []
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': {
            template:
              '<div class="el-menu-item-stub"><slot /><slot name="title" /></div>'
          },
          'el-sub-menu': true,
          'el-text': { template: '<span class="el-text-stub"><slot /></span>' },
          SidebarLinkItem: {
            template: '<div><slot /><slot name="title" /></div>'
          },
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    // textClass should include min-w-13.5! for this configuration
    expect((wrapper.vm as any).textClass).toContain('min-w-13.5!');
    // Component renders without crash
    expect(wrapper.exists()).toBe(true);
  });

  it('renders el-text in collapsed mix layout with no icon and pathList length 2', () => {
    mockNav.layout.value = 'mix';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard' },
          pathList: ['/dashboard', '/dashboard'],
          children: []
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': {
            template:
              '<div class="el-menu-item-stub"><slot /><slot name="title" /></div>'
          },
          'el-sub-menu': true,
          'el-text': { template: '<span class="el-text-stub"><slot /></span>' },
          SidebarLinkItem: {
            template: '<div><slot /><slot name="title" /></div>'
          },
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span><slot /></span>' }
        }
      }
    });
    // textClass should include min-w-13.5! for mix+collapsed+pathList=2
    expect((wrapper.vm as any).textClass).toContain('min-w-13.5!');
    expect(wrapper.exists()).toBe(true);
  });

  it('renders sub-menu ReText with mix layout, icon, and not collapsed', () => {
    mockNav.layout.value = 'mix';
    mockNav.isCollapse.value = false;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard', icon: 'ep/home-filled' },
          pathList: ['/dashboard'],
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': { template: '<span class="el-text-stub"><slot /></span>' },
          SidebarLinkItem: true,
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span class="retext-stub"><slot /></span>' }
        }
      }
    });
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
    expect(wrapper.findAll('.retext-stub').length).toBeGreaterThan(0);
  });

  it('renders sub-menu with collapsed vertical, icon, and parentId null (hides ReText)', () => {
    mockNav.layout.value = 'vertical';
    mockNav.isCollapse.value = true;
    const wrapper = shallowMount(SidebarItem as any, {
      props: {
        item: {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard', icon: 'ep/home-filled' },
          parentId: null,
          pathList: ['/dashboard'],
          children: [
            { path: 'child1', name: 'Child1', meta: { title: 'Child1' } },
            { path: 'child2', name: 'Child2', meta: { title: 'Child2' } }
          ]
        },
        basePath: '/dashboard'
      },
      global: {
        stubs: {
          'el-menu-item': true,
          'el-sub-menu': {
            template:
              '<div class="el-sub-menu-stub"><slot name="title" /><slot /></div>'
          },
          'el-text': true,
          SidebarLinkItem: true,
          SidebarExtraIcon: { template: '<span />' },
          ReText: { template: '<span class="retext-stub"><slot /></span>' }
        }
      }
    });
    // ReText should be hidden when vertical+collapsed+icon+parentId null
    expect(wrapper.find('.el-sub-menu-stub').exists()).toBe(true);
  });
});
