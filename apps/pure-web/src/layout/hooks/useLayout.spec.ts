import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mocks ──
const mockLocaleRef = { value: 'zh' };
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: mockLocaleRef })
}));

// 每个测试前重建 storage / config 桩
const storage: Record<string, any> = {};
const config: Record<string, any> = {};

vi.mock('@pureadmin/utils', () => ({
  useGlobal: () => ({ $storage: storage, $config: config })
}));

let mockMultiTagsCache = false;
vi.mock('@/store/modules/multiTags', () => ({
  useMultiTagsStore: () => ({ multiTagsCache: mockMultiTagsCache })
}));

vi.mock('@/layout/types', () => ({
  routerArrays: [{ path: '/welcome', name: 'Welcome' }]
}));

import { useLayout } from './useLayout';

describe('useLayout', () => {
  beforeEach(() => {
    // 清空 storage 和 config
    Object.keys(storage).forEach(k => delete storage[k]);
    Object.keys(config).forEach(k => delete config[k]);
    mockMultiTagsCache = false;
    mockLocaleRef.value = 'zh';
  });

  // ── initStorage 4 分支 ──

  it('分支1：multiTagsCache=true 且 tags 为空 → 写入 routerArrays', () => {
    mockMultiTagsCache = true;
    // tags 不存在
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.tags).toEqual([{ path: '/welcome', name: 'Welcome' }]);
  });

  it('分支1：multiTagsCache=true 但 tags 已有数据 → 不覆盖', () => {
    mockMultiTagsCache = true;
    storage.tags = [{ path: '/existing' }];
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.tags).toEqual([{ path: '/existing' }]);
  });

  it('分支1：multiTagsCache=false → 不写入 tags', () => {
    mockMultiTagsCache = false;
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.tags).toBeUndefined();
  });

  it('分支2：locale 不存在 → 写入默认 locale', () => {
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.locale).toEqual({ locale: 'zh' });
    expect(mockLocaleRef.value).toBe('zh');
  });

  it('分支2：$config.Locale 存在时使用配置值', () => {
    config.Locale = 'en';
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.locale).toEqual({ locale: 'en' });
    expect(mockLocaleRef.value).toBe('en');
  });

  it('分支2：locale 已存在 → 不覆盖', () => {
    storage.locale = { locale: 'en' };
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.locale).toEqual({ locale: 'en' });
  });

  it('分支3：layout 不存在 → 写入默认 layout', () => {
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.layout).toBeDefined();
    expect(storage.layout.layout).toBe('vertical');
    expect(storage.layout.theme).toBe('light');
  });

  it('分支3：$config 有值时使用配置', () => {
    config.Layout = 'horizontal';
    config.Theme = 'dark';
    config.DarkMode = true;
    config.SidebarStatus = false;
    config.EpThemeColor = '#ff0000';
    config.ThemeMode = 'dark';
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.layout.layout).toBe('horizontal');
    expect(storage.layout.theme).toBe('dark');
    expect(storage.layout.darkMode).toBe(true);
    expect(storage.layout.sidebarStatus).toBe(false);
    expect(storage.layout.epThemeColor).toBe('#ff0000');
    expect(storage.layout.themeMode).toBe('dark');
  });

  it('分支4：configure 不存在 → 写入默认 configure', () => {
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.configure).toBeDefined();
    expect(storage.configure.grey).toBe(false);
    expect(storage.configure.weak).toBe(false);
    expect(storage.configure.hideTabs).toBe(false);
    expect(storage.configure.hideFooter).toBe(true);
    expect(storage.configure.showLogo).toBe(true);
    expect(storage.configure.tagsStyle).toBe('chrome');
  });

  it('分支4：$config 有值时使用配置', () => {
    config.Grey = true;
    config.Weak = true;
    config.HideTabs = true;
    config.HideFooter = false;
    config.ShowLogo = false;
    config.Watermark = true;
    config.WatermarkText = 'test';
    config.TagsStyle = 'card';
    config.MultiTagsCache = true;
    config.Stretch = true;
    const { initStorage } = useLayout();
    initStorage();
    expect(storage.configure.grey).toBe(true);
    expect(storage.configure.weak).toBe(true);
    expect(storage.configure.hideTabs).toBe(true);
    expect(storage.configure.hideFooter).toBe(false);
    expect(storage.configure.showLogo).toBe(false);
    expect(storage.configure.watermark).toBe(true);
    expect(storage.configure.watermarkText).toBe('test');
    expect(storage.configure.tagsStyle).toBe('card');
    expect(storage.configure.multiTagsCache).toBe(true);
    expect(storage.configure.stretch).toBe(true);
  });

  // ── computed ──

  it('layout computed 返回 $storage.layout.layout', () => {
    storage.layout = { layout: 'horizontal' };
    const { layout } = useLayout();
    expect(layout.value).toBe('horizontal');
  });

  it('layoutTheme computed 返回 $storage.layout', () => {
    storage.layout = { layout: 'vertical', theme: 'dark' };
    const { layoutTheme } = useLayout();
    expect(layoutTheme.value).toEqual({ layout: 'vertical', theme: 'dark' });
  });
});
