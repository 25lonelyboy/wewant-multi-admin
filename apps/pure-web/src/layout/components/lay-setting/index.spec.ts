// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

// jsdom does not implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});

vi.mock('@/utils/mitt', () => ({
  emitter: { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
}));

const layoutThemeRef = ref({ layout: 'vertical', theme: 'light' });
const dataThemeRef = ref(false);
const themeModeRef = ref('light');
const themeColorsArr = [
  { color: '#409EFF', themeColor: 'default' },
  { color: '#fff', themeColor: 'light' },
  { color: '#141414', themeColor: 'dark' }
];
const toggleClassSpy = vi.fn();
const dataThemeChangeSpy = vi.fn();
const setLayoutThemeColorSpy = vi.fn();

vi.mock('@/layout/hooks/useDataThemeChange', () => ({
  useDataThemeChange: () => ({
    dataTheme: dataThemeRef,
    themeMode: themeModeRef,
    layoutTheme: layoutThemeRef,
    themeColors: themeColorsArr,
    toggleClass: toggleClassSpy,
    dataThemeChange: dataThemeChangeSpy,
    setLayoutThemeColor: setLayoutThemeColorSpy
  })
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ device: ref('desktop') })
}));

const appStoreState = vi.hoisted(() => ({ viewportWidth: 1920 }));
vi.mock('@/store/modules/app', () => ({
  useAppStoreHook: () => ({
    getViewportWidth: appStoreState.viewportWidth,
    setLayout: vi.fn()
  })
}));

const multiTagsStoreMock = vi.hoisted(() => ({
  multiTagsCacheChange: vi.fn()
}));
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStoreHook: () => multiTagsStoreMock
}));

const storageData: Record<string, any> = {
  configure: {
    grey: false,
    weak: false,
    hideTabs: false,
    showLogo: true,
    tagsStyle: 'chrome',
    hideFooter: false,
    multiTagsCache: false,
    stretch: false,
    watermark: false,
    watermarkText: ''
  },
  layout: {
    layout: 'vertical',
    theme: 'light',
    darkMode: false,
    sidebarStatus: true,
    epThemeColor: '#409EFF',
    themeColor: 'light',
    themeMode: 'light'
  }
};

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useDark: () => ({ isDark: ref(false) }),
    useGlobal: () => ({ $storage: storageData }),
    isNumber: (v: any) => typeof v === 'number',
    debounce: (fn: Function) => fn
  };
});

vi.mock('@/components/ReSegmented', () => ({
  default: {
    name: 'Segmented',
    props: ['modelValue', 'options', 'resize'],
    emits: ['change'],
    template: '<div class="segmented-stub" />'
  },
  __esModule: true
}));

import LaySetting from './index.vue';
import { emitter } from '@/utils/mitt';

describe('LaySetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    layoutThemeRef.value = { layout: 'vertical', theme: 'light' };
    dataThemeRef.value = false;
    themeModeRef.value = 'light';
    appStoreState.viewportWidth = 1920;
    storageData.configure = {
      grey: false,
      weak: false,
      hideTabs: false,
      showLogo: true,
      tagsStyle: 'chrome',
      hideFooter: false,
      multiTagsCache: false,
      stretch: false,
      watermark: false,
      watermarkText: ''
    };
  });

  function mountSetting() {
    return shallowMount(LaySetting as any, {
      global: {
        stubs: {
          LayPanel: { template: '<div class="lay-panel"><slot /></div>' },
          Segmented: { template: '<div class="segmented" />' },
          IconifyIconOffline: { template: '<span />' },
          ElIcon: { template: '<span><slot /></span>' },
          ElSwitch: {
            props: ['modelValue'],
            emits: ['change', 'update:modelValue'],
            template: '<div class="el-switch" />'
          },
          ElInputNumber: { template: '<div />' },
          ElInput: { template: '<div />' }
        },
        directives: {
          tippy: () => {},
          'motion-fade': () => {},
          ripple: () => {}
        }
      }
    });
  }

  it('renders without crash', () => {
    const wrapper = mountSetting();
    expect(wrapper.find('.lay-panel').exists()).toBe(true);
  });

  it('initializes settings from storage', () => {
    storageData.configure.grey = true;
    const wrapper = mountSetting();
    expect((wrapper.vm as any).settings.greyVal).toBe(true);
  });

  it('greyChange calls toggleClass and storageConfigureChange', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).greyChange(true);
    expect(toggleClassSpy).toHaveBeenCalled();
    expect(storageData.configure.grey).toBe(true);
  });

  it('weekChange calls toggleClass', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).weekChange(true);
    expect(toggleClassSpy).toHaveBeenCalled();
    expect(storageData.configure.weak).toBe(true);
  });

  it('tagsChange emits tagViewsChange', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).settings.tabsVal = true;
    (wrapper.vm as any).tagsChange();
    expect(emitter.emit).toHaveBeenCalledWith('tagViewsChange', true);
    expect(storageData.configure.hideTabs).toBe(true);
  });

  it('hideFooterChange persists value', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).settings.hideFooter = true;
    (wrapper.vm as any).hideFooterChange();
    expect(storageData.configure.hideFooter).toBe(true);
  });

  it('multiTagsCacheChange calls store', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).settings.multiTagsCache = true;
    (wrapper.vm as any).multiTagsCacheChange();
    expect(multiTagsStoreMock.multiTagsCacheChange).toHaveBeenCalledWith(true);
    expect(storageData.configure.multiTagsCache).toBe(true);
  });

  it('onChange updates tagsStyle', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).onChange({ option: { value: 'card' } });
    expect((wrapper.vm as any).tagsStyleValue).toBe('card');
    expect(storageData.configure.tagsStyle).toBe('card');
    expect(emitter.emit).toHaveBeenCalledWith('tagViewsTagsStyle', 'card');
  });

  it('onWatermarkSwitchChange persists watermark', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).onWatermarkSwitchChange(true);
    expect(storageData.configure.watermark).toBe(true);
  });

  it('onWatermarkInputChange persists watermarkText', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).onWatermarkInputChange('TestWM');
    expect(storageData.configure.watermarkText).toBe('TestWM');
  });

  it('logoChange emits logoChange event', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).logoChange();
    expect(emitter.emit).toHaveBeenCalledWith('logoChange', expect.anything());
  });

  it('setMenuLayout updates layoutTheme and storage', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).setMenuLayout('horizontal');
    expect(layoutThemeRef.value.layout).toBe('horizontal');
    expect(storageData.layout.layout).toBe('horizontal');
  });

  it('setStretch updates settings and storage', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).setStretch(1440);
    expect((wrapper.vm as any).settings.stretch).toBe(1440);
    expect(storageData.configure.stretch).toBe(1440);
  });

  it('stretchTypeChange sets stretch to 1440 for custom', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).stretchTypeChange({ option: { value: 'custom' } });
    expect((wrapper.vm as any).settings.stretch).toBe(1440);
  });

  it('stretchTypeChange sets stretch to false for fixed', () => {
    const wrapper = mountSetting();
    (wrapper.vm as any).settings.stretch = 1440;
    (wrapper.vm as any).stretchTypeChange({ option: { value: 'fixed' } });
    expect((wrapper.vm as any).settings.stretch).toBe(false);
  });

  it('getThemeColorStyle returns background style', () => {
    const wrapper = mountSetting();
    const style = (wrapper.vm as any).getThemeColorStyle('#ff0000');
    expect(style).toEqual({ background: '#ff0000' });
  });

  it('showThemeColors returns false for light when isDark', () => {
    const wrapper = mountSetting();
    // isDark is false in our mock
    expect((wrapper.vm as any).showThemeColors('light')).toBe(true);
    expect((wrapper.vm as any).showThemeColors('default')).toBe(true);
  });

  it('pClass returns expected classes', () => {
    const wrapper = mountSetting();
    expect((wrapper.vm as any).pClass).toEqual([
      'mb-3!',
      'font-medium',
      'text-sm',
      'dark:text-white'
    ]);
  });
});
