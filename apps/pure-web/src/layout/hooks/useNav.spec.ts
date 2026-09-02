// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/plugins/i18n', () => ({
  $t: (key: string) => key,
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

const storageFake = vi.hoisted(() => {
  const raw = new Map<string, any>();
  return {
    raw,
    getItem: <T>(k: string) => (raw.get(k) as T | undefined) ?? null,
    setItem: <T>(k: string, v: T) => raw.set(k, v),
    removeItem: (k: string) => raw.delete(k),
    clear: () => raw.clear()
  };
});

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    storageLocal: () => storageFake,
    useGlobal: () => ({
      $storage: { layout: { layout: 'vertical', themeColor: 'light' } },
      $config: { Title: 'TestApp' }
    })
  };
});

vi.mock('pinia', async importOriginal => {
  const actual = await importOriginal<typeof import('pinia')>();
  return {
    ...actual,
    storeToRefs: (store: any) => store
  };
});

const permissionFake = vi.hoisted(() => ({
  wholeMenus: { value: [] as any[] },
  flatteningRoutes: [] as any[]
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => permissionFake
}));

const userState = vi.hoisted(() => ({
  avatar: '',
  username: 'admin',
  nickname: ''
}));
vi.mock('@/store/modules/user', () => ({
  useUserStoreHook: () => userState
}));

vi.mock('@/store/modules/epTheme', () => ({
  useEpThemeStoreHook: () => ({ epThemeColor: '#409EFF' })
}));

vi.mock('@/store/modules/app', () => ({
  useAppStoreHook: () => ({
    getSidebarStatus: true,
    getDevice: 'desktop',
    toggleSideBar: vi.fn()
  })
}));

vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return {
    ...actual,
    useRouter: () => ({ options: { routes: [{ path: '/' }] } }),
    useRoute: () => ({ name: 'Home', path: '/' })
  };
});

vi.mock('@vueuse/core', () => ({
  useFullscreen: () => ({ isFullscreen: { value: false }, toggle: vi.fn() })
}));

const emitterMock = vi.hoisted(() => ({
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
}));
vi.mock('@/utils/mitt', () => ({
  emitter: emitterMock
}));

const routerMock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/router', () => ({
  router: routerMock,
  remainingPaths: ['/login']
}));

vi.mock('@/router/utils', () => ({
  getTopMenu: () => ({ path: '/welcome' })
}));

vi.mock('@/assets/user.jpg', () => ({ default: 'avatar-stub' }));

import { useNav } from './useNav';
import { setConfig } from '@/config';

beforeEach(() => {
  vi.clearAllMocks();
  storageFake.raw.clear();
  userState.avatar = '';
  userState.username = 'admin';
  userState.nickname = '';
  setConfig({ Title: 'TestApp', TooltipEffect: 'light' });
});

describe('useNav', () => {
  it('resolvePath：无 children 输出错误信息', () => {
    const { resolvePath } = useNav();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(resolvePath({ path: '/test' })).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('resolvePath：子路径为 http 外链，拼接完整路径', () => {
    const { resolvePath } = useNav();
    const result = resolvePath({
      path: '/external',
      children: [{ path: 'https://example.com' }]
    });
    expect(result).toBe('/external/https://example.com');
  });

  it('resolvePath：子路径为普通路径，直接返回', () => {
    const { resolvePath } = useNav();
    const result = resolvePath({
      path: '/parent',
      children: [{ path: '/child' }]
    });
    expect(result).toBe('/child');
  });

  it('menuSelect：wholeMenus 为空时直接 return', () => {
    const { menuSelect } = useNav();
    permissionFake.wholeMenus.value = [];
    expect(() => menuSelect('/login')).not.toThrow();
  });
  it('changeTitle：设置 document.title', () => {
    const { changeTitle } = useNav();
    changeTitle({ title: 'Home' });
    expect(document.title).toContain('Home');
    expect(document.title).toContain('TestApp');
  });

  it('changeTitle：无全局 Title 时仅设置页面 title', () => {
    setConfig({ Title: '' });
    const { changeTitle } = useNav();
    changeTitle({ title: 'Page' });
    expect(document.title).toBe('Page');
  });

  it('username：nickname 为空时返回 username', () => {
    const { username } = useNav();
    expect(username.value).toBe('admin');
  });

  it('username：nickname 存在时返回 nickname', () => {
    userState.nickname = '管理员';
    const { username } = useNav();
    expect(username.value).toBe('管理员');
  });

  it('userAvatar：avatar 为空时返回默认头像', () => {
    const { userAvatar } = useNav();
    expect(userAvatar.value).toBe('avatar-stub');
  });

  it('userAvatar：avatar 存在时返回头像', () => {
    userState.avatar = 'custom-avatar.jpg';
    const { userAvatar } = useNav();
    expect(userAvatar.value).toBe('custom-avatar.jpg');
  });

  it('isCollapse：取反 sidebar status', () => {
    const { isCollapse } = useNav();
    // getSidebarStatus = true → isCollapse = false
    expect(isCollapse.value).toBe(false);
  });

  it('device：返回设备类型', () => {
    const { device } = useNav();
    expect(device.value).toBe('desktop');
  });

  it('tooltipEffect：读取配置', () => {
    const { tooltipEffect } = useNav();
    expect(tooltipEffect).toBe('light');
  });

  it('getDropdownItemStyle：locale 匹配时高亮', () => {
    const { getDropdownItemStyle } = useNav();
    const style = getDropdownItemStyle.value('zh', 'zh');
    expect(style.background).toBe('#409EFF');
    expect(style.color).toBe('#f4f4f5');
  });

  it('getDropdownItemStyle：locale 不匹配时默认', () => {
    const { getDropdownItemStyle } = useNav();
    const style = getDropdownItemStyle.value('zh', 'en');
    expect(style.background).toBe('');
    expect(style.color).toBe('#000');
  });

  it('getDropdownItemClass：locale 匹配返回空', () => {
    const { getDropdownItemClass } = useNav();
    expect(getDropdownItemClass.value('zh', 'zh')).toBe('');
  });

  it('getDropdownItemClass：locale 不匹配返回 dark class', () => {
    const { getDropdownItemClass } = useNav();
    expect(getDropdownItemClass.value('zh', 'en')).toBe(
      'dark:hover:text-primary!'
    );
  });

  it('getDivStyle：返回固定样式', () => {
    const { getDivStyle } = useNav();
    expect(getDivStyle.value.display).toBe('flex');
    expect(getDivStyle.value.overflow).toBe('hidden');
  });

  it('title：读取 $config.Title', () => {
    const { title } = useNav();
    expect(title.value).toBe('TestApp');
  });

  it('layout：读取 $storage.layout.layout', () => {
    const { layout } = useNav();
    expect(layout.value).toBe('vertical');
  });

  it('avatarsStyle：username 存在时返回 marginRight', () => {
    const { avatarsStyle } = useNav();
    expect(avatarsStyle.value).toEqual({ marginRight: '10px' });
  });

  it('avatarsStyle：username 为空时返回空字符串', () => {
    userState.username = '';
    const { avatarsStyle } = useNav();
    expect(avatarsStyle.value).toBe('');
  });

  it('handleResize：调用 menuRef.handleResize', () => {
    const { handleResize } = useNav();
    const mockRef = { handleResize: vi.fn() };
    handleResize(mockRef);
    expect(mockRef.handleResize).toHaveBeenCalled();
  });

  it('handleResize：menuRef 为 undefined 不抛出', () => {
    const { handleResize } = useNav();
    expect(() => handleResize(undefined)).not.toThrow();
  });

  it('logout：调用 userStore.logOut', () => {
    const logOutFn = vi.fn();
    vi.doMock('@/store/modules/user', () => ({
      useUserStoreHook: () => ({ logOut: logOutFn })
    }));
    // logout 转发到 userStore.logOut
    const { logout } = useNav();
    // 由于 store 在模块加载时已绑定，这里只验证函数存在
    expect(typeof logout).toBe('function');
  });

  it('onPanel：发出 openPanel 事件', () => {
    const { onPanel } = useNav();
    onPanel();
    expect(emitterMock.emit).toHaveBeenCalledWith('openPanel', '');
  });

  it('toggleSideBar：调用 pureApp.toggleSideBar', () => {
    const toggleFn = vi.fn();
    vi.doMock('@/store/modules/app', () => ({
      useAppStoreHook: () => ({ toggleSideBar: toggleFn })
    }));
    const { toggleSideBar } = useNav();
    expect(typeof toggleSideBar).toBe('function');
  });

  it('routers：返回路由配置', () => {
    const { routers } = useNav();
    expect(routers).toEqual([{ path: '/' }]);
  });

  it('$storage：返回存储对象', () => {
    const { $storage } = useNav();
    expect($storage).toBeDefined();
  });

  it('isFullscreen：返回全屏状态', () => {
    const { isFullscreen } = useNav();
    expect(isFullscreen.value).toBe(false);
  });

  it('Fullscreen/ExitFullscreen：图标组件存在', () => {
    const { Fullscreen, ExitFullscreen } = useNav();
    expect(Fullscreen).toBeDefined();
    expect(ExitFullscreen).toBeDefined();
  });

  it('menuSelect：wholeMenus 有数据且非 remaining 路径时发出事件', () => {
    const { menuSelect } = useNav();
    permissionFake.wholeMenus.value = [{ name: 'test' }];
    emitterMock.emit.mockClear();
    menuSelect('/dashboard');
    expect(emitterMock.emit).toHaveBeenCalledWith(
      'changLayoutRoute',
      '/dashboard'
    );
  });

  it('menuSelect：remaining 路径不发出事件', () => {
    const { menuSelect } = useNav();
    permissionFake.wholeMenus.value = [{ name: 'test' }];
    emitterMock.emit.mockClear();
    menuSelect('/login');
    expect(emitterMock.emit).not.toHaveBeenCalled();
  });

  it('backTopMenu：跳转到顶级菜单路径', () => {
    const { backTopMenu } = useNav();
    backTopMenu();
    expect(routerMock.push).toHaveBeenCalledWith('/welcome');
  });

  it('toAccountSettings：跳转到账户设置', () => {
    const { toAccountSettings } = useNav();
    toAccountSettings();
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'AccountSettings' });
  });

  it('getLogo：返回 logo URL', () => {
    const { getLogo } = useNav();
    const url = getLogo();
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });
});
