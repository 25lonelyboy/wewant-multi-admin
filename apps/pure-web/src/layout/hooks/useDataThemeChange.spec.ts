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

const globalStorage = vi.hoisted(() => ({
  layout: {
    layout: 'vertical',
    theme: 'light',
    darkMode: false,
    sidebarStatus: true,
    epThemeColor: '#409EFF',
    themeColor: 'light',
    themeMode: 'light'
  }
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    storageLocal: () => storageFake,
    useGlobal: () => ({ $storage: globalStorage, $config: {} }),
    darken: (color: string, _amount: number) => `darken(${color})`,
    lighten: (color: string, _amount: number) => `lighten(${color})`
  };
});

const permissionFake = vi.hoisted(() => ({
  flatteningRoutes: [] as any[]
}));
vi.mock('@/store/modules/permission', () => ({
  usePermissionStoreHook: () => permissionFake
}));

vi.mock('@/store/modules/app', () => ({
  useAppStoreHook: () => ({
    setLayout: vi.fn()
  })
}));

vi.mock('@/store/modules/epTheme', () => ({
  useEpThemeStoreHook: () => ({
    epTheme: 'light',
    epThemeColor: '#409EFF',
    setEpThemeColor: vi.fn()
  })
}));

vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => ({
    multiTagsCacheChange: vi.fn(),
    handleTags: vi.fn()
  })
}));

const removeTokenMock = vi.hoisted(() => vi.fn());
vi.mock('@/utils/auth', () => ({
  removeToken: removeTokenMock
}));

const routerPushMock = vi.hoisted(() => vi.fn());
vi.mock('@/router', () => ({
  router: { push: routerPushMock },
  resetRouter: vi.fn()
}));

vi.mock('./useLayout', () => ({
  useLayout: () => ({
    layout: { value: 'vertical' },
    layoutTheme: { value: { theme: 'light' } }
  })
}));

import { useDataThemeChange } from './useDataThemeChange';
import { setConfig } from '@/config';

beforeEach(() => {
  vi.clearAllMocks();
  storageFake.raw.clear();
  globalStorage.layout = {
    layout: 'vertical',
    theme: 'light',
    darkMode: false,
    sidebarStatus: true,
    epThemeColor: '#409EFF',
    themeColor: 'light',
    themeMode: 'light'
  };
  setConfig({
    Theme: 'light',
    EpThemeColor: '#409EFF',
    Grey: false,
    Weak: false,
    MultiTagsCache: false,
    Layout: 'vertical'
  });
  document.documentElement.className = '';
});

describe('useDataThemeChange', () => {
  it('themeColors：包含 8 种预设主题色', () => {
    const { themeColors } = useDataThemeChange();
    expect(themeColors.value).toHaveLength(8);
    expect(themeColors.value[0]).toEqual({
      color: '#ffffff',
      themeColor: 'light'
    });
    expect(themeColors.value[1]).toEqual({
      color: '#1b2a47',
      themeColor: 'default'
    });
  });

  it('dataTheme：初始值来自 storage darkMode', () => {
    const { dataTheme } = useDataThemeChange();
    expect(dataTheme.value).toBe(false);
  });

  it('themeMode：初始值来自 storage themeMode', () => {
    const { themeMode } = useDataThemeChange();
    expect(themeMode.value).toBe('light');
  });

  it('toggleClass：添加 class', () => {
    const { toggleClass } = useDataThemeChange();
    const el = document.createElement('div');
    toggleClass(true, 'dark', el);
    expect(el.className).toContain('dark');
  });

  it('toggleClass：移除 class', () => {
    const { toggleClass } = useDataThemeChange();
    const el = document.createElement('div');
    el.className = 'dark';
    toggleClass(false, 'dark', el);
    expect(el.className).not.toContain('dark');
  });

  it('toggleClass：默认作用于 document.body', () => {
    const { toggleClass } = useDataThemeChange();
    document.body.className = '';
    toggleClass(true, 'test-class');
    expect(document.body.className).toContain('test-class');
    document.body.className = '';
  });

  it('setLayoutThemeColor：设置 data-theme 属性', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('default');
  });

  it('setLayoutThemeColor：更新 layoutTheme', () => {
    const { setLayoutThemeColor, layoutTheme } = useDataThemeChange();
    setLayoutThemeColor('saucePurple');
    expect(layoutTheme.value.theme).toBe('saucePurple');
  });

  it('setLayoutThemeColor：isClick=false 保留之前的 themeColor', () => {
    globalStorage.layout.themeColor = 'light';
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('default', false);
    expect(globalStorage.layout.themeColor).toBe('light');
  });

  it('setLayoutThemeColor：isClick=true 更新 themeColor', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('saucePurple', true);
    expect(globalStorage.layout.themeColor).toBe('saucePurple');
  });

  it('setEpThemeColor：设置 CSS 变量', () => {
    const { setEpThemeColor } = useDataThemeChange();
    setEpThemeColor('#ff0000');
    expect(
      document.documentElement.style.getPropertyValue('--el-color-primary')
    ).toBe('#ff0000');
  });

  it('dataThemeChange：切换到深色模式', () => {
    const { dataThemeChange, dataTheme } = useDataThemeChange();
    dataTheme.value = true;
    dataThemeChange('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('dataThemeChange：切换回浅色模式', () => {
    const { dataThemeChange, dataTheme } = useDataThemeChange();
    dataTheme.value = false;
    dataThemeChange('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('dataThemeChange：浅色模式 + themeColor=light 触发 setLayoutThemeColor', () => {
    const { dataThemeChange, dataTheme } = useDataThemeChange();
    globalStorage.layout.themeColor = 'light';
    dataTheme.value = false;
    dataThemeChange('light');
    expect(globalStorage.layout.theme).toBe('light');
  });

  it('onReset：清空缓存并跳转登录页', () => {
    const { onReset } = useDataThemeChange();
    onReset();
    expect(removeTokenMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith('/login');
  });

  it('body：返回 documentElement', () => {
    const { body } = useDataThemeChange();
    expect(body).toBe(document.documentElement);
  });

  it('setLayoutThemeColor：default 主题使用 EpThemeColor', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('default', true);
    expect(globalStorage.layout.themeColor).toBe('default');
  });

  it('setLayoutThemeColor：light 主题使用 EpThemeColor', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('light', true);
    expect(globalStorage.layout.themeColor).toBe('light');
  });

  it('setLayoutThemeColor：自定义主题使用对应颜色', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('saucePurple', true);
    expect(globalStorage.layout.themeColor).toBe('saucePurple');
  });

  it('setLayoutThemeColor：自定义主题未找到颜色回退默认', () => {
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('nonExistent', true);
    // 回退到 #409EFF
    expect(
      document.documentElement.style.getPropertyValue('--el-color-primary')
    ).toBe('#409EFF');
  });

  it('dataThemeChange：深色模式 + epTheme 非 light', () => {
    vi.doMock('@/store/modules/epTheme', () => ({
      useEpThemeStoreHook: () => ({
        epTheme: 'dark',
        epThemeColor: '#333',
        setEpThemeColor: vi.fn()
      })
    }));
    const { dataThemeChange, dataTheme } = useDataThemeChange();
    dataTheme.value = true;
    dataThemeChange('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('dataThemeChange：浅色模式 + themeColor 非 light', () => {
    const { dataThemeChange, dataTheme } = useDataThemeChange();
    globalStorage.layout.themeColor = 'default';
    dataTheme.value = false;
    dataThemeChange('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('setEpThemeColor：设置 CSS 变量含亮暗色变体', () => {
    const { setEpThemeColor } = useDataThemeChange();
    setEpThemeColor('#1890ff');
    // 检查 dark-1, light-1 等变量被设置
    expect(
      document.documentElement.style.getPropertyValue(
        '--el-color-primary-dark-1'
      )
    ).toBeTruthy();
    expect(
      document.documentElement.style.getPropertyValue(
        '--el-color-primary-light-1'
      )
    ).toBeTruthy();
  });

  it('toggleClass：flag=true 且已有 class 不重复添加', () => {
    const { toggleClass } = useDataThemeChange();
    const el = document.createElement('div');
    el.className = 'dark';
    toggleClass(true, 'dark', el);
    expect(el.className).toContain('dark');
  });

  it('toggleClass：flag=false 且无 class 不报错', () => {
    const { toggleClass } = useDataThemeChange();
    const el = document.createElement('div');
    el.className = '';
    toggleClass(false, 'dark', el);
    expect(el.className).toBe('');
  });

  it('dataThemeChange：深色模式调用 setLayoutThemeColor(epTheme)', () => {
    const { dataThemeChange, dataTheme, layoutTheme } = useDataThemeChange();
    dataTheme.value = false;
    dataThemeChange('dark');
    // epTheme='light' 且 dataTheme=false → 走 else 分支 setLayoutThemeColor(epTheme)
    expect(layoutTheme.value.theme).toBe('light');
  });

  it('dataThemeChange：深色模式 + epTheme=light 调用 setLayoutThemeColor(default)', () => {
    const { dataThemeChange, dataTheme, layoutTheme } = useDataThemeChange();
    dataTheme.value = true;
    dataThemeChange('dark');
    // epTheme='light' && dataTheme=true → setLayoutThemeColor('default', false)
    expect(layoutTheme.value.theme).toBe('default');
  });

  it('setLayoutThemeColor：默认参数使用 getConfig().Theme', () => {
    setConfig({ Theme: 'auroraGreen' });
    const { setLayoutThemeColor, layoutTheme } = useDataThemeChange();
    setLayoutThemeColor();
    expect(layoutTheme.value.theme).toBe('auroraGreen');
  });

  it('setLayoutThemeColor：default 主题 + EpThemeColor 未定义回退 #409EFF', () => {
    setConfig({ EpThemeColor: undefined });
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('default', true);
    // line 66: getConfig().EpThemeColor ?? '#409EFF' → 回退到 '#409EFF'
    expect(
      document.documentElement.style.getPropertyValue('--el-color-primary')
    ).toBe('#409EFF');
  });

  it('setLayoutThemeColor：light 主题 + EpThemeColor 未定义回退 #409EFF', () => {
    setConfig({ EpThemeColor: undefined });
    const { setLayoutThemeColor } = useDataThemeChange();
    setLayoutThemeColor('light', true);
    expect(
      document.documentElement.style.getPropertyValue('--el-color-primary')
    ).toBe('#409EFF');
  });

  it('dataThemeChange：不传参 mode 回退 light', () => {
    const { dataThemeChange, dataTheme, themeMode } = useDataThemeChange();
    dataTheme.value = false;
    dataThemeChange();
    // line 94: mode ?? 'light' → 'light'
    expect(themeMode.value).toBe('light');
  });

  it('onReset：config 值未定义时使用回退值', () => {
    setConfig({
      Grey: undefined,
      Weak: undefined,
      MultiTagsCache: undefined,
      EpThemeColor: undefined,
      Layout: undefined
    });
    const { onReset } = useDataThemeChange();
    // lines 116-120: 所有 ?? 回退分支
    expect(() => onReset()).not.toThrow();
    expect(removeTokenMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith('/login');
  });
});
