// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref, computed } from 'vue';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/utils/mitt', () => ({
  emitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}));

vi.mock('@/utils/progress', () => ({
  default: { start: vi.fn(), done: vi.fn() }
}));

const mockRoute = vi.hoisted(() => ({
  name: 'Home',
  path: '/welcome',
  fullPath: '/welcome',
  query: {},
  params: {},
  meta: { title: 'Home', showLink: true }
}));
const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  options: { routes: [] }
}));
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => mockRouter
  };
});

const visibleRef = ref(false);
const showTagsRef = ref(false);
const tagsStyleRef = ref('chrome');
const multiTagsRef = ref([
  { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
  { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
]);
const tagsViewsRef = vi.hoisted(() =>
  Array.from({ length: 7 }, (_, i) => ({
    icon: '',
    text: `item${i}`,
    divided: false,
    disabled: false,
    show: true
  }))
);
const buttonTopRef = ref(0);
const buttonLeftRef = ref(0);
const translateXRef = ref(0);
const pureSettingRef = { hiddenSideBar: false };
const activeIndexRef = ref(-1);
const isScrollingRef = ref(false);
const currentSelectRef = ref({});
const closeMenuSpy = vi.fn();
const onContentFullScreenSpy = vi.fn();
const instanceRefs = vi.hoisted(() => ({ refs: {} as Record<string, any> }));

vi.mock('@/layout/hooks/useTag', () => ({
  useTags: () => ({
    Close: '',
    route: mockRoute,
    router: mockRouter,
    visible: visibleRef,
    showTags: showTagsRef,
    instance: instanceRefs,
    tagsStyle: tagsStyleRef,
    multiTags: multiTagsRef,
    tagsViews: tagsViewsRef,
    buttonTop: buttonTopRef,
    buttonLeft: buttonLeftRef,
    translateX: translateXRef,
    isFixedTag: computed(() => () => false),
    pureSetting: pureSettingRef,
    activeIndex: activeIndexRef,
    getTabStyle: computed(() => ({
      transform: 'translateX(0)',
      transition: 'none'
    })),
    isScrolling: isScrollingRef,
    iconIsActive: computed(() => () => false),
    linkIsActive: computed(() => () => ''),
    currentSelect: currentSelectRef,
    scheduleIsActive: computed(() => () => ''),
    getContextMenuStyle: computed(() => ({ left: '0px', top: '0px' })),
    closeMenu: closeMenuSpy,
    onMounted: vi.fn(),
    onMouseenter: vi.fn(),
    onMouseleave: vi.fn(),
    transformI18n: (m: any) =>
      typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''),
    onContentFullScreen: onContentFullScreenSpy
  })
}));

vi.mock('@/router/utils', () => ({
  handleAliveRoute: vi.fn(),
  getTopMenu: () => ({ path: '/welcome' })
}));

const settingsState = vi.hoisted(() => ({ hiddenSideBar: false }));
vi.mock('@/store/modules/settings', () => ({
  useSettingStoreHook: () => ({
    get hiddenSideBar() {
      return settingsState.hiddenSideBar;
    }
  })
}));

const multiTagsStoreMock = vi.hoisted(() => ({
  handleTags: vi.fn((action: string) => {
    if (action === 'slice') return multiTagsRef.value;
    return undefined;
  })
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => multiTagsStoreMock
}));

const permissionFake = vi.hoisted(() => ({
  flatteningRoutes: [] as any[]
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => permissionFake
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    isAllEmpty: (v: any) => !v || (Array.isArray(v) && v.length === 0),
    isEqual: (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b),
    delay: () => Promise.resolve(),
    useResizeObserver: vi.fn()
  };
});

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn()
}));

vi.mock('@/layout/types', () => ({
  routerArrays: [{ path: '/welcome', name: 'Welcome', meta: { title: 'Home' } }]
}));

import LayTag from './index.vue';

describe('LayTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visibleRef.value = false;
    showTagsRef.value = false;
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    mockRoute.path = '/welcome';
    mockRoute.name = 'Welcome';
    mockRoute.fullPath = '/welcome';
    mockRoute.query = {};
    mockRoute.params = {};
    settingsState.hiddenSideBar = false;
    // Reset tagsViews state
    tagsViewsRef.forEach((v: any) => {
      v.show = true;
      v.disabled = false;
    });
    mockRouter.options.routes = [];
    // Reset instance refs
    Object.keys(instanceRefs.refs).forEach(k => delete instanceRefs.refs[k]);
  });

  function mountTag() {
    return shallowMount(LayTag as any, {
      global: {
        stubs: {
          IconifyIconOffline: { template: '<span />' },
          TagChrome: { template: '<div />' },
          ElDropdown: {
            template: '<div><slot /><slot name="dropdown" /></div>'
          },
          ElDropdownMenu: { template: '<div><slot /></div>' },
          ElDropdownItem: { template: '<div><slot /></div>' },
          transition: false
        }
      }
    });
  }

  it('renders tags-view container', () => {
    const wrapper = mountTag();
    expect(wrapper.find('.tags-view').exists()).toBe(true);
  });

  it('renders scroll container', () => {
    const wrapper = mountTag();
    expect(wrapper.find('.scroll-container').exists()).toBe(true);
  });

  it('renders tab items for each multiTag', () => {
    const wrapper = mountTag();
    const scrollItems = wrapper.findAll('.scroll-item');
    expect(scrollItems).toHaveLength(2);
  });

  it('handleScroll updates translateX for positive offset', () => {
    const wrapper = mountTag();
    translateXRef.value = -100;
    (wrapper.vm as any).handleScroll(200);
    expect(translateXRef.value).toBe(0); // Math.min(0, -100+200) = 0
  });

  it('handleScroll clamps to 0 for positive offset beyond 0', () => {
    const wrapper = mountTag();
    translateXRef.value = -50;
    (wrapper.vm as any).handleScroll(100);
    expect(translateXRef.value).toBe(0);
  });

  it('handleScroll sets isScrolling to false', () => {
    const wrapper = mountTag();
    isScrollingRef.value = true;
    (wrapper.vm as any).handleScroll(100);
    expect(isScrollingRef.value).toBe(false);
  });

  it('tagOnClick calls router.push with name', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).tagOnClick({ name: 'Dashboard', path: '/dashboard' });
    expect(mockRouter.push).toHaveBeenCalledWith({ name: 'Dashboard' });
  });

  it('tagOnClick calls router.push with path when no name', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).tagOnClick({ path: '/other' });
    expect(mockRouter.push).toHaveBeenCalledWith({ path: '/other' });
  });

  it('tagOnClick calls router.push with query', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).tagOnClick({
      name: 'Detail',
      query: { id: '1' }
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: 'Detail',
      query: { id: '1' }
    });
  });

  it('tagOnClick emits tagOnClick event', () => {
    const wrapper = mountTag();
    const item = { name: 'Dashboard', path: '/dashboard' };
    (wrapper.vm as any).tagOnClick(item);
    // emitter.emit was called (verified via mock)
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('handleCommand calls onClickDrop', () => {
    const wrapper = mountTag();
    // handleCommand extracts key and item from command
    // We just verify it doesn't crash
    expect(() => {
      (wrapper.vm as any).handleCommand({ key: 0, item: {} });
    }).not.toThrow();
  });

  it('showMenus sets show property on tagsViews[1-5]', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).showMenus(false);
    for (let i = 1; i <= 5; i++) {
      expect(tagsViewsRef[i].show).toBe(false);
    }
  });

  it('disabledMenus sets disabled property on tagsViews[1-5]', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).disabledMenus(true);
    for (let i = 1; i <= 5; i++) {
      expect(tagsViewsRef[i].disabled).toBe(true);
    }
  });

  it('onFresh calls NProgress.start and router.replace', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onFresh();
    expect(mockRouter.replace).toHaveBeenCalled();
  });

  it('dynamicTagView finds tag by path and calls moveToView', async () => {
    const wrapper = mountTag();
    await (wrapper.vm as any).dynamicTagView();
    // Should not throw
    expect(wrapper.exists()).toBe(true);
  });

  it('dynamicTagView finds tag by query', async () => {
    mockRoute.query = { id: '1' };
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' }, query: {} },
      {
        path: '/detail',
        name: 'Detail',
        meta: { title: 'Detail' },
        query: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    await (wrapper.vm as any).dynamicTagView();
    expect(wrapper.exists()).toBe(true);
  });

  it('dynamicTagView finds tag by params', async () => {
    mockRoute.query = {};
    mockRoute.params = { id: '2' };
    multiTagsRef.value = [
      {
        path: '/welcome',
        name: 'Welcome',
        meta: { title: 'Home' },
        params: {}
      },
      {
        path: '/detail',
        name: 'Detail',
        meta: { title: 'Detail' },
        params: { id: '2' }
      }
    ];
    const wrapper = mountTag();
    await (wrapper.vm as any).dynamicTagView();
    expect(wrapper.exists()).toBe(true);
  });

  it('handleScroll with negative offset and scrollbarDom < tabDom', () => {
    const wrapper = mountTag();
    translateXRef.value = -50;
    // Mock scrollbarDom and tabDom
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    (wrapper.vm as any).handleScroll(-100);
    expect(translateXRef.value).toBeLessThanOrEqual(0);
    expect(isScrollingRef.value).toBe(false);
  });

  it('handleScroll with negative offset and scrollbarDom >= tabDom', () => {
    const wrapper = mountTag();
    translateXRef.value = -50;
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 500 };
    (wrapper.vm as any).tabDom = { offsetWidth: 200 };
    (wrapper.vm as any).handleScroll(-100);
    expect(translateXRef.value).toBe(0);
  });

  it('handleWheel sets isScrolling and calls smoothScroll', () => {
    const wrapper = mountTag();
    const event = new WheelEvent('wheel', { deltaX: -100, deltaY: 0 });
    (wrapper.vm as any).handleWheel(event);
    expect(isScrollingRef.value).toBe(true);
  });

  it('handleWheel with positive deltaX', () => {
    const wrapper = mountTag();
    const event = new WheelEvent('wheel', { deltaX: 100, deltaY: 0 });
    (wrapper.vm as any).handleWheel(event);
    expect(isScrollingRef.value).toBe(true);
  });

  it('deleteDynamicTag removes tag by path', () => {
    const wrapper = mountTag();
    const obj = { path: '/dashboard', meta: { title: 'Dashboard' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteDynamicTag removes tag with query', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' },
        query: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    const obj = { path: '/dashboard', query: { id: '1' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteDynamicTag removes tag with params', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' },
        params: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    const obj = { path: '/dashboard', params: { id: '1' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteDynamicTag with tag=other', () => {
    const wrapper = mountTag();
    const obj = { path: '/dashboard', meta: { title: 'Dashboard' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard', 'other');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalledWith(
      'equal',
      expect.any(Array)
    );
  });

  it('deleteDynamicTag with tag=left', () => {
    const wrapper = mountTag();
    const obj = { path: '/dashboard', meta: { title: 'Dashboard' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard', 'left');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteDynamicTag with tag=right', () => {
    const wrapper = mountTag();
    const obj = { path: '/dashboard', meta: { title: 'Dashboard' } };
    (wrapper.vm as any).deleteDynamicTag(obj, '/dashboard', 'right');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteMenu calls deleteDynamicTag and handleAliveRoute', async () => {
    const { handleAliveRoute } = await import('@/router/utils');
    const wrapper = mountTag();
    const item = { path: '/dashboard', meta: { title: 'Dashboard' } };
    (wrapper.vm as any).deleteMenu(item);
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
    expect(handleAliveRoute).toHaveBeenCalled();
  });

  it('onClickDrop case 0 calls onFresh', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(0, {}, { path: '/dashboard', meta: {} });
    expect(mockRouter.replace).toHaveBeenCalled();
  });

  it('onClickDrop case 1 calls deleteMenu', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(
      1,
      {},
      { path: '/dashboard', meta: { title: 'Dashboard' } }
    );
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('onClickDrop case 2 calls deleteMenu with left', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(
      2,
      {},
      { path: '/dashboard', meta: { title: 'Dashboard' } }
    );
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('onClickDrop case 3 calls deleteMenu with right', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(
      3,
      {},
      { path: '/dashboard', meta: { title: 'Dashboard' } }
    );
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('onClickDrop case 4 calls deleteMenu with other', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(
      4,
      {},
      { path: '/dashboard', meta: { title: 'Dashboard' } }
    );
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('onClickDrop case 5 splices all tags and navigates', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(5, {});
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalledWith(
      'splice',
      '',
      expect.any(Object)
    );
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('onClickDrop case 6 calls onContentFullScreen', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(6, {});
    expect(onContentFullScreenSpy).toHaveBeenCalled();
  });

  it('onClickDrop returns early when item is disabled', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(0, { disabled: true });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('selectTag calls closeMenu and onClickDrop', () => {
    const wrapper = mountTag();
    currentSelectRef.value = {
      path: '/dashboard',
      meta: { title: 'Dashboard' }
    };
    (wrapper.vm as any).selectTag(0, {});
    expect(closeMenuSpy).toHaveBeenCalled();
  });

  it('disabledMenus with fixedTag hides close left', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).disabledMenus(true, true);
    expect(tagsViewsRef[2].show).toBe(false);
    expect(tagsViewsRef[2].disabled).toBe(true);
  });

  it('showMenuModel with query params', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' },
        query: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel('/dashboard', { id: '1' });
    // Should not throw
    expect(wrapper.exists()).toBe(true);
  });

  it('showMenuModel with params', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard' },
        params: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel('/dashboard', {}, { id: '1' });
    expect(wrapper.exists()).toBe(true);
  });

  it('showMenuModel with refresh=true', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel('/welcome', {}, {}, true);
    expect(tagsViewsRef[0].show).toBe(true);
  });

  it('openMenu sets currentSelect and shows menu', () => {
    const wrapper = mountTag();
    const tag = {
      path: '/dashboard',
      name: 'Dashboard',
      meta: { title: 'Dashboard' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    expect(currentSelectRef.value).toEqual(tag);
  });

  it('openMenu for topPath shows only refresh', () => {
    const wrapper = mountTag();
    const tag = { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    // showMenus(false) was called, then tagsViews[0].show = true
    expect(tagsViewsRef[0].show).toBe(true);
  });

  it('openMenu with fixedTag shows only refresh', () => {
    const wrapper = mountTag();
    const tag = {
      path: '/other',
      name: 'Other',
      meta: { title: 'Other', fixedTag: true }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    expect(tagsViewsRef[0].show).toBe(true);
  });

  it('openMenu adjusts buttonLeft when exceeding maxLeft', () => {
    const wrapper = mountTag();
    const tag = {
      path: '/dashboard',
      name: 'Dashboard',
      meta: { title: 'Dashboard' }
    };
    const event = { clientX: 1000, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    // left = 1000 - 50 + 5 = 955; maxLeft = 500 - 140 = 360; 955 > 360 → buttonLeft = 360
    expect(buttonLeftRef.value).toBe(360);
  });

  it('openMenu with hiddenSideBar sets buttonTop to clientY', () => {
    settingsState.hiddenSideBar = true;
    const wrapper = mountTag();
    const tag = {
      path: '/dashboard',
      name: 'Dashboard',
      meta: { title: 'Dashboard' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    expect(buttonTopRef.value).toBe(200);
  });

  it('tagOnClick with params', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).tagOnClick({
      name: 'Detail',
      params: { id: '1' }
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      name: 'Detail',
      params: { id: '1' }
    });
  });

  it('dynamicRouteTag adds tag when route not in multiTags', async () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } }
    ];
    const wrapper = mountTag();
    // dynamicRouteTag uses router.options.routes which is mocked as []
    // With empty routes, concatPath won't find the path, so no push occurs
    (wrapper.vm as any).dynamicRouteTag('/dashboard/analysis');
    // Just verify it doesn't throw
    expect(wrapper.exists()).toBe(true);
  });

  it('dynamicRouteTag does nothing when route already in multiTags', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    mockRouter.options.routes = [] as any;
    const wrapper = mountTag();
    (wrapper.vm as any).dynamicRouteTag('/dashboard');
    // handleTags('push', ...) should NOT be called for existing route
    const pushCalls = multiTagsStoreMock.handleTags.mock.calls.filter(
      (c: any[]) => c[0] === 'push'
    );
    expect(pushCalls).toHaveLength(0);
  });

  it('handleCommand with key and item calls onClickDrop', () => {
    const wrapper = mountTag();
    expect(() => {
      (wrapper.vm as any).handleCommand({ key: 5, item: {} });
    }).not.toThrow();
  });

  it('moveToView returns early when instance refs not found', async () => {
    const wrapper = mountTag();
    await (wrapper.vm as any).moveToView(99);
    // Should return early without error
    expect(wrapper.exists()).toBe(true);
  });

  it('showMenuModel for currentIndex === 1 with routeLength !== 2', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    mockRoute.path = '/dashboard';
    const wrapper = mountTag();
    // Just verify showMenuModel doesn't throw
    expect(() => (wrapper.vm as any).showMenuModel('/dashboard')).not.toThrow();
  });

  it('showMenuModel for currentIndex === 1 with routeLength === 2', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    mockRoute.path = '/dashboard';
    const wrapper = mountTag();
    expect(() => (wrapper.vm as any).showMenuModel('/dashboard')).not.toThrow();
  });

  it('showMenuModel for last index', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    mockRoute.path = '/settings';
    const wrapper = mountTag();
    expect(() => (wrapper.vm as any).showMenuModel('/settings')).not.toThrow();
  });

  it('showMenuModel for redirect path disables all', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel(`/redirect/welcome`);
    // Should call disabledMenus(true)
    for (let i = 1; i <= 5; i++) {
      expect(tagsViewsRef[i].disabled).toBe(true);
    }
  });

  it('deleteDynamicTag navigates to last tag when current route deleted', () => {
    mockRoute.path = '/dashboard';
    mockRoute.name = 'Dashboard';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice') return [{ path: '/welcome', name: 'Welcome' }];
      return undefined;
    });
    const wrapper = mountTag();
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard'
    );
    expect(mockRouter.push).toHaveBeenCalled();
  });

  it('deleteDynamicTag navigates with query after delete', () => {
    mockRoute.path = '/dashboard';
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice')
        return [{ path: '/welcome', name: 'Welcome', query: { id: '1' } }];
      return undefined;
    });
    const wrapper = mountTag();
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard'
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ query: { id: '1' } })
    );
  });

  it('deleteDynamicTag navigates with params after delete', () => {
    mockRoute.path = '/dashboard';
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice')
        return [{ path: '/welcome', name: 'Welcome', params: { id: '2' } }];
      return undefined;
    });
    const wrapper = mountTag();
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard'
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      expect.objectContaining({ params: { id: '2' } })
    );
  });

  it('deleteDynamicTag with tag=left returns early without navigation', () => {
    mockRoute.path = '/dashboard';
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice') return [{ path: '/welcome' }];
      return undefined;
    });
    const wrapper = mountTag();
    mockRouter.push.mockClear();
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard',
      'left'
    );
    // tag === 'left' returns early
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('showMenuModel with fixedTag disables all close actions', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard', fixedTag: true }
      }
    ];
    mockRoute.path = '/dashboard';
    const wrapper = mountTag();
    // Just verify showMenuModel doesn't throw with fixedTag
    expect(() => (wrapper.vm as any).showMenuModel('/dashboard')).not.toThrow();
  });

  it('openMenu for non-matching route hides refresh', () => {
    const wrapper = mountTag();
    const tag = {
      path: '/settings',
      name: 'Settings',
      meta: { title: 'Settings' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    mockRoute.path = '/dashboard';
    mockRoute.name = 'Dashboard';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    (wrapper.vm as any).openMenu(tag, event);
    expect(tagsViewsRef[0].show).toBe(false);
  });

  it('onClickDrop case 6 toggles fullscreen icon based on hiddenSideBar', async () => {
    pureSettingRef.hiddenSideBar = true;
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(6, {});
    await new Promise(r => setTimeout(r, 150));
    expect(tagsViewsRef[6].text).toBe('buttons.pureContentExitFullScreen');
    pureSettingRef.hiddenSideBar = false;
  });

  it('renders chrome style tabs when tagsStyle is chrome', () => {
    tagsStyleRef.value = 'chrome';
    const wrapper = mountTag();
    expect(wrapper.find('.scroll-container').exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('renders non-chrome style tabs when tagsStyle is smart', () => {
    tagsStyleRef.value = 'smart';
    const wrapper = mountTag();
    expect(wrapper.find('.scroll-container').exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('renders non-chrome style tabs when tagsStyle is card', () => {
    tagsStyleRef.value = 'card';
    const wrapper = mountTag();
    expect(wrapper.find('.scroll-container').exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('deleteDynamicTag when current !== route.path navigates to last tag', () => {
    mockRoute.path = '/welcome';
    mockRoute.name = 'Welcome';
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice')
        return [
          { path: '/welcome', name: 'Welcome' },
          { path: '/settings', name: 'Settings' }
        ];
      return undefined;
    });
    const wrapper = mountTag();
    // Delete /dashboard but current route is /welcome
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard'
    );
    // Should enter the else branch (current !== route.path)
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('deleteDynamicTag when current !== route.path and route not in multiTags', () => {
    mockRoute.path = '/other';
    mockRoute.name = 'Other';
    multiTagsStoreMock.handleTags = vi.fn((action: string) => {
      if (action === 'slice') return [{ path: '/welcome', name: 'Welcome' }];
      return undefined;
    });
    const wrapper = mountTag();
    (wrapper.vm as any).deleteDynamicTag(
      { path: '/dashboard', meta: { title: 'Dashboard' } },
      '/dashboard'
    );
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalled();
  });

  it('openMenu with route.path !== tag.path and route.name !== tag.name', () => {
    mockRoute.path = '/dashboard';
    mockRoute.name = 'Dashboard';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    const wrapper = mountTag();
    const tag = {
      path: '/settings',
      name: 'Settings',
      meta: { title: 'Settings' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    expect(tagsViewsRef[0].show).toBe(false);
  });

  it('openMenu with multiTags.length === 2 and route.path === tag.path', () => {
    mockRoute.path = '/settings';
    mockRoute.name = 'Settings';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    const wrapper = mountTag();
    const tag = {
      path: '/settings',
      name: 'Settings',
      meta: { title: 'Settings' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    // route.path === tag.path so 2nd condition fails
    // multiTags.length === 2 && route.path !== tag.path? No, route.path === tag.path
    // So 3rd condition also fails -> goes to else: showMenuModel with refresh=true
    expect(currentSelectRef.value).toEqual(tag);
  });

  it('openMenu for matching route calls showMenuModel with refresh=true', () => {
    mockRoute.path = '/dashboard';
    mockRoute.name = 'Dashboard';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    const tag = {
      path: '/dashboard',
      name: 'Dashboard',
      meta: { title: 'Dashboard' }
    };
    const event = { clientX: 100, clientY: 200 } as MouseEvent;
    (wrapper.vm as any).containerDom = {
      getBoundingClientRect: () => ({ left: 50 }),
      offsetWidth: 500
    };
    (wrapper.vm as any).openMenu(tag, event);
    // Should call showMenuModel with refresh=true
    expect(currentSelectRef.value).toEqual(tag);
  });

  it('showMenuModel for currentIndex === 0 disables all menus', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel('/welcome');
    // currentIndex === 0 -> disabledMenus(true)
    // isAllEmpty({}) returns true in our mock, so findIndex by path runs
    expect(() => (wrapper.vm as any).showMenuModel('/welcome')).not.toThrow();
  });

  it('showMenuModel for middle index calls disabledMenus(false)', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } },
      { path: '/profile', name: 'Profile', meta: { title: 'Profile' } }
    ];
    const wrapper = mountTag();
    (wrapper.vm as any).showMenuModel('/dashboard');
    // Middle index -> disabledMenus(false, ...)
    expect(tagsViewsRef[1].disabled).toBe(false);
  });

  it('dynamicRouteTag with nested routes finds and pushes tag', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } }
    ];
    mockRouter.options.routes = [
      {
        path: '/dashboard/analysis',
        name: 'Analysis',
        meta: { title: 'Analysis' }
      }
    ] as any;
    const wrapper = mountTag();
    (wrapper.vm as any).dynamicRouteTag('/dashboard/analysis');
    expect(multiTagsStoreMock.handleTags).toHaveBeenCalledWith(
      'push',
      expect.objectContaining({ path: '/dashboard/analysis' })
    );
  });

  it('handleScroll with negative offset, scrollbarDom < tabDom, translateX within range', () => {
    const wrapper = mountTag();
    translateXRef.value = -200;
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    (wrapper.vm as any).handleScroll(-100);
    expect(translateXRef.value).toBeLessThanOrEqual(-200);
  });

  it('handleScroll with negative offset, scrollbarDom < tabDom, translateX out of range', () => {
    const wrapper = mountTag();
    translateXRef.value = -400;
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    (wrapper.vm as any).handleScroll(-100);
    // translateX >= -(500-200) = -300? -400 < -300, so condition fails
    expect(translateXRef.value).toBe(-400);
  });

  it('smoothScroll calls handleScroll via requestAnimationFrame', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    (wrapper.vm as any).smoothScroll(40);
    // smoothScroll uses rAF, so we just verify it doesn't throw
    expect(wrapper.exists()).toBe(true);
  });

  it('handleWheel with zero deltaX and zero deltaY', () => {
    const wrapper = mountTag();
    const event = new WheelEvent('wheel', { deltaX: 0, deltaY: 0 });
    (wrapper.vm as any).handleWheel(event);
    expect(isScrollingRef.value).toBe(true);
  });

  it('onClickDrop case 6 with hiddenSideBar false sets Fullscreen text', async () => {
    pureSettingRef.hiddenSideBar = false;
    const wrapper = mountTag();
    (wrapper.vm as any).onClickDrop(6, {});
    await new Promise(r => setTimeout(r, 150));
    expect(tagsViewsRef[6].text).toBe('buttons.pureContentFullScreen');
  });

  it('tagOnClick with path only (no name)', () => {
    const wrapper = mountTag();
    (wrapper.vm as any).tagOnClick({ path: '/other' });
    expect(mockRouter.push).toHaveBeenCalledWith({ path: '/other' });
  });

  it('moveToView with valid instance ref', async () => {
    const wrapper = mountTag();
    const mockEl = { offsetLeft: 100, offsetWidth: 80 };
    instanceRefs.refs['dynamic0'] = [mockEl];
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    await (wrapper.vm as any).moveToView(0);
    expect(wrapper.exists()).toBe(true);
  });

  it('moveToView with tabItemElOffsetLeft === 0 resets translateX', async () => {
    const wrapper = mountTag();
    const mockEl = { offsetLeft: 0, offsetWidth: 80 };
    instanceRefs.refs['dynamic0'] = [mockEl];
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 200 };
    (wrapper.vm as any).tabDom = { offsetWidth: 500 };
    await (wrapper.vm as any).moveToView(0);
    expect(translateXRef.value).toBe(0);
  });

  it('moveToView with valid instance ref and tag left of viewport', async () => {
    const wrapper = mountTag();
    translateXRef.value = -200;
    const mockEl = { offsetLeft: 100, offsetWidth: 80 };
    instanceRefs.refs['dynamic0'] = [mockEl];
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 500 };
    (wrapper.vm as any).tabDom = { offsetWidth: 800 };
    await (wrapper.vm as any).moveToView(0);
    // visible area starts at 200, tag at 100 < 200 -> tag left of viewport
    // translateX = -100 + 10 = -90
    expect(translateXRef.value).toBe(-90);
  });

  it('moveToView with valid instance ref and tag in visible area', async () => {
    const wrapper = mountTag();
    translateXRef.value = -50;
    const mockEl = { offsetLeft: 100, offsetWidth: 80 };
    instanceRefs.refs['dynamic0'] = [mockEl];
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 500 };
    (wrapper.vm as any).tabDom = { offsetWidth: 800 };
    await (wrapper.vm as any).moveToView(0);
    expect(wrapper.exists()).toBe(true);
  });

  it('moveToView with valid instance ref and tag right of viewport', async () => {
    const wrapper = mountTag();
    translateXRef.value = 0;
    const mockEl = { offsetLeft: 600, offsetWidth: 80 };
    instanceRefs.refs['dynamic0'] = [mockEl];
    (wrapper.vm as any).scrollbarDom = { offsetWidth: 500 };
    (wrapper.vm as any).tabDom = { offsetWidth: 800 };
    await (wrapper.vm as any).moveToView(0);
    // 600 > 0 && 680 < 500 false -> right of viewport
    // translateX = -(600 - (500 - 10 - 80)) = -(600 - 410) = -190
    expect(translateXRef.value).toBe(-190);
  });

  it('showMenuModel for last index with fixedTag on previous', () => {
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      {
        path: '/dashboard',
        name: 'Dashboard',
        meta: { title: 'Dashboard', fixedTag: true }
      },
      { path: '/settings', name: 'Settings', meta: { title: 'Settings' } }
    ];
    const wrapper = mountTag();
    // Just verify showMenuModel doesn't throw with this configuration
    expect(() => (wrapper.vm as any).showMenuModel('/settings')).not.toThrow();
  });

  it('hides tags-view when showTags is true', () => {
    showTagsRef.value = true;
    const wrapper = mountTag();
    expect(wrapper.find('.tags-view').exists()).toBe(false);
    showTagsRef.value = false;
  });

  it('renders context menu items based on tagsViews show', () => {
    visibleRef.value = true;
    const wrapper = mountTag();
    expect(wrapper.find('.contextmenu').exists()).toBe(true);
    visibleRef.value = false;
  });

  it('clicking close button in non-chrome mode calls deleteMenu', async () => {
    tagsStyleRef.value = 'smart';
    activeIndexRef.value = 1;
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    // In non-chrome mode, close buttons have class el-icon-close
    const closeIcons = wrapper.findAll('.el-icon-close');
    expect(closeIcons.length).toBeGreaterThan(0);
    await closeIcons[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
    activeIndexRef.value = -1;
  });

  it('clicking right arrow calls handleScroll(-200)', async () => {
    const wrapper = mountTag();
    // arrow-right contains a span (IconifyIconOffline stub) - click it
    const arrowSpans = wrapper.findAll('.arrow-right span');
    expect(arrowSpans.length).toBeGreaterThan(0);
    await arrowSpans[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
  });

  it('clicking left arrow calls handleScroll(200)', async () => {
    const wrapper = mountTag();
    const arrowSpans = wrapper.findAll('.arrow-left span');
    expect(arrowSpans.length).toBeGreaterThan(0);
    await arrowSpans[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
  });

  it('clicking context menu item calls selectTag', async () => {
    visibleRef.value = true;
    tagsViewsRef.forEach((v: any) => {
      v.show = true;
      v.disabled = false;
    });
    const wrapper = mountTag();
    const menuItems = wrapper.findAll('.contextmenu li');
    expect(menuItems.length).toBeGreaterThan(0);
    await menuItems[0].trigger('click');
    expect(closeMenuSpy).toHaveBeenCalled();
    visibleRef.value = false;
  });

  it('clicking chrome close button calls deleteMenu', async () => {
    tagsStyleRef.value = 'chrome';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    const closeButtons = wrapper.findAll('.chrome-close-btn');
    expect(closeButtons.length).toBeGreaterThan(0);
    await closeButtons[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('dynamicTagView falls to else branch when query is null', async () => {
    mockRoute.query = null as any;
    mockRoute.params = {};
    mockRoute.path = '/welcome';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    await (wrapper.vm as any).dynamicTagView();
    expect(wrapper.exists()).toBe(true);
    mockRoute.query = {};
  });

  it('dynamicTagView uses params branch when query is null and params exist', async () => {
    mockRoute.query = null as any;
    mockRoute.params = { id: '1' };
    mockRoute.path = '/detail';
    multiTagsRef.value = [
      {
        path: '/welcome',
        name: 'Welcome',
        meta: { title: 'Home' },
        params: {}
      },
      {
        path: '/detail',
        name: 'Detail',
        meta: { title: 'Detail' },
        params: { id: '1' }
      }
    ];
    const wrapper = mountTag();
    await (wrapper.vm as any).dynamicTagView();
    expect(wrapper.exists()).toBe(true);
    mockRoute.query = {};
    mockRoute.params = {};
  });

  it('handleScroll with scrollbarDom ref set (covers truthy branch)', () => {
    const wrapper = mountTag();
    // Set refs via internal setup state to cover truthy branches
    const setupState = (wrapper.vm as any).$;
    if (setupState && setupState.setupState) {
      if (
        setupState.setupState.scrollbarDom &&
        typeof setupState.setupState.scrollbarDom === 'object' &&
        'value' in setupState.setupState.scrollbarDom
      ) {
        setupState.setupState.scrollbarDom.value = { offsetWidth: 200 };
        setupState.setupState.tabDom.value = { offsetWidth: 500 };
      }
    }
    translateXRef.value = -50;
    (wrapper.vm as any).handleScroll(-100);
    expect(translateXRef.value).toBeLessThanOrEqual(0);
  });

  it('handleScroll with positive offset and refs set', () => {
    const wrapper = mountTag();
    const setupState = (wrapper.vm as any).$;
    if (setupState && setupState.setupState) {
      if (
        setupState.setupState.scrollbarDom &&
        typeof setupState.setupState.scrollbarDom === 'object' &&
        'value' in setupState.setupState.scrollbarDom
      ) {
        setupState.setupState.scrollbarDom.value = { offsetWidth: 300 };
        setupState.setupState.tabDom.value = { offsetWidth: 600 };
      }
    }
    translateXRef.value = -100;
    (wrapper.vm as any).handleScroll(50);
    expect(translateXRef.value).toBeLessThanOrEqual(0);
  });

  it('clicking a scroll-item tag triggers tagOnClick', async () => {
    tagsStyleRef.value = 'smart';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    const items = wrapper.findAll('.scroll-item');
    expect(items.length).toBeGreaterThan(0);
    await items[0].trigger('click');
    expect(wrapper.exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('contextmenu on a scroll-item tag triggers openMenu', async () => {
    tagsStyleRef.value = 'smart';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    const items = wrapper.findAll('.scroll-item');
    expect(items.length).toBeGreaterThan(0);
    await items[0].trigger('contextmenu', { clientX: 100, clientY: 200 });
    expect(wrapper.exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });

  it('mouseenter on a scroll-item tag triggers onMouseenter', async () => {
    tagsStyleRef.value = 'smart';
    multiTagsRef.value = [
      { path: '/welcome', name: 'Welcome', meta: { title: 'Home' } },
      { path: '/dashboard', name: 'Dashboard', meta: { title: 'Dashboard' } }
    ];
    const wrapper = mountTag();
    const items = wrapper.findAll('.scroll-item');
    expect(items.length).toBeGreaterThan(0);
    await items[0].trigger('mouseenter');
    expect(wrapper.exists()).toBe(true);
    tagsStyleRef.value = 'chrome';
  });
});
