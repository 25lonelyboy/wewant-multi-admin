// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

const mockRoute = vi.hoisted(() => ({
  path: '/dashboard/analysis',
  name: 'Analysis',
  query: {},
  params: {}
}));

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

vi.mock('@/router/utils', () => ({
  getParentPaths: (name: string) => {
    if (name === 'Analysis') return ['/dashboard'];
    return [];
  },
  findRouteByPath: (path: string) => {
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
});
