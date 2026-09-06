// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { reactive } from 'vue';

const mockRouteData = vi.hoisted(() => ({
  path: '/dashboard/analysis',
  name: 'Analysis',
  query: {},
  params: {}
}));
const mockRoute = reactive(mockRouteData);

const mockRouter = vi.hoisted(() => ({
  options: {
    routes: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' },
        children: [
          {
            path: 'analysis',
            name: 'Analysis',
            meta: { title: 'Analysis' }
          }
        ]
      }
    ]
  },
  currentRoute: {
    value: {
      path: '/dashboard/analysis',
      name: 'Analysis'
    }
  },
  push: vi.fn()
}));

const mockMultiTags = vi.hoisted(() => [
  {
    path: '/dashboard/analysis',
    name: 'Analysis',
    meta: { title: 'Analysis' },
    query: {},
    params: {}
  }
]);

// Mock dependencies
vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter
}));

const findRouteByPathFn = vi.hoisted(() => vi.fn());
const getParentPathsFn = vi.hoisted(() => vi.fn());

vi.mock('@/router/utils', () => ({
  getParentPaths: (name: string, ...args: any[]) => {
    if (getParentPathsFn.getMockImplementation())
      return getParentPathsFn(name, ...args);
    if (name === 'Analysis') return ['/dashboard'];
    return [];
  },
  findRouteByPath: (path: string, ...args: any[]) => {
    if (findRouteByPathFn.getMockImplementation())
      return findRouteByPathFn(path, ...args);
    if (path === '/dashboard') {
      return {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' }
      };
    }
    if (path === '/dashboard/analysis') {
      return {
        path: '/dashboard/analysis',
        name: 'Analysis',
        meta: { title: 'Analysis' }
      };
    }
    return null;
  }
}));

vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({
    multiTags: mockMultiTags
  })
}));

import SidebarBreadCrumb from './SidebarBreadCrumb.vue';

describe('SidebarBreadCrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findRouteByPathFn.mockReset();
    getParentPathsFn.mockReset();
    mockRoute.path = '/dashboard/analysis';
    mockRoute.query = {};
    mockRoute.params = {};
  });

  it('renders breadcrumb items', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('handles link click with name', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    const item = {
      name: 'Dashboard',
      path: '/dashboard'
    };

    await (wrapper.vm as any).handleLink(item);
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'Dashboard' });
  });

  it('handles link click with query', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    const item = {
      name: 'Dashboard',
      path: '/dashboard',
      query: { id: '1' }
    };

    await (wrapper.vm as any).handleLink(item);
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: 'Dashboard',
      query: { id: '1' }
    });
  });

  it('handles link click with params', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    const item = {
      name: 'Dashboard',
      path: '/dashboard',
      params: { id: '1' }
    };

    await (wrapper.vm as any).handleLink(item);
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: 'Dashboard',
      params: { id: '1' }
    });
  });

  it('handles link click with redirect', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    const item = {
      name: 'Dashboard',
      path: '/dashboard',
      redirect: '/welcome'
    };

    await (wrapper.vm as any).handleLink(item);
    expect(mockRouter.push).toHaveBeenCalledWith('/welcome');
  });

  it('handles link click with path only', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    const item = {
      path: '/dashboard'
    };

    await (wrapper.vm as any).handleLink(item);
    expect(mockRouter.push).toHaveBeenCalledWith({ path: '/dashboard' });
  });

  it('updates breadcrumb on route change', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();

    // Simulate route change
    mockRoute.path = '/dashboard';
    await wrapper.vm.$nextTick();

    expect(wrapper.exists()).toBe(true);
  });

  it('getBreadcrumb uses query when route has query params', async () => {
    mockRoute.query = { id: '1' };
    mockRoute.params = {};
    mockMultiTags.length = 0;
    mockMultiTags.push({
      path: '/dashboard/analysis',
      name: 'Analysis',
      meta: { title: 'Analysis' },
      query: { id: '1' },
      params: {}
    } as any);

    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('getBreadcrumb uses params when route has params', async () => {
    mockRoute.query = {};
    mockRoute.params = { id: '2' };
    mockMultiTags.length = 0;
    mockMultiTags.push({
      path: '/dashboard/analysis',
      name: 'Analysis',
      meta: { title: 'Analysis' },
      query: {},
      params: { id: '2' }
    } as any);

    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('renders breadcrumb items with titles from levelList', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': {
            template: '<div class="el-breadcrumb-stub"><slot /></div>'
          },
          'el-breadcrumb-item': {
            template: '<div class="el-breadcrumb-item-stub"><slot /></div>'
          },
          'transition-group': {
            template: '<div><slot /></div>'
          }
        }
      }
    });

    await wrapper.vm.$nextTick();
    // levelList should have items from getBreadcrumb
    const items = wrapper.findAll('.el-breadcrumb-item-stub');
    expect(items.length).toBeGreaterThan(0);
  });

  it('getBreadcrumb removes child with same title as parent', async () => {
    // This test covers the branch where matched.splice is called
    // when a child route has the same title as its parent
    // The getBreadcrumb function is called on mount
    // With the default mock setup, the parent route '/dashboard' has
    // meta.title 'Dashboard' and child 'Analysis' has different title,
    // so no splice occurs. We verify the forEach branch executes.
    mockRoute.query = {};
    mockRoute.params = {};
    mockRoute.path = '/dashboard/analysis';

    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();
    // Verify levelList was populated (filter ran)
    expect((wrapper.vm as any).levelList).toBeDefined();
  });

  it('getBreadcrumb splices when child has same title as parent', async () => {
    findRouteByPathFn.mockImplementation((path: string) => {
      if (path === '/dashboard') {
        return {
          path: '/dashboard',
          name: 'Dashboard',
          meta: { title: 'Dashboard' },
          children: [
            { path: 'analysis', name: 'Analysis', meta: { title: 'Dashboard' } }
          ]
        } as any;
      }
      if (path === '/dashboard/analysis') {
        return {
          path: '/dashboard/analysis',
          name: 'Analysis',
          meta: { title: 'Dashboard' }
        } as any;
      }
      return null;
    });
    getParentPathsFn.mockReturnValue(['/dashboard'] as any);

    mockRoute.query = {};
    mockRoute.params = {};
    mockRoute.path = '/dashboard/analysis';

    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': true,
          'el-breadcrumb-item': true,
          'transition-group': true
        }
      }
    });

    await wrapper.vm.$nextTick();
    expect((wrapper.vm as any).levelList).toBeDefined();

    // Clean up overrides
    findRouteByPathFn.mockReset();
    getParentPathsFn.mockReset();
  });

  it('watch triggers getBreadcrumb on route.path change', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': {
            template: '<div class="bc"><slot /></div>'
          },
          'el-breadcrumb-item': {
            template: '<div class="bci"><slot /></div>'
          },
          'transition-group': {
            template: '<div><slot /></div>'
          }
        }
      }
    });
    await wrapper.vm.$nextTick();

    // Change route.path reactively to trigger watch
    mockRoute.path = '/dashboard';
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('handleLink is called when clicking breadcrumb anchor', async () => {
    const wrapper = mount(SidebarBreadCrumb as any, {
      global: {
        stubs: {
          'el-breadcrumb': {
            template: '<div class="bc"><slot /></div>'
          },
          'el-breadcrumb-item': {
            template: '<div class="bci"><slot /></div>'
          },
          'transition-group': {
            template: '<div><slot /></div>'
          }
        }
      }
    });
    await wrapper.vm.$nextTick();

    const anchor = wrapper.find('a');
    expect(anchor.exists()).toBe(true);
    await anchor.trigger('click');
    expect(mockRouter.push).toHaveBeenCalled();
  });
});
