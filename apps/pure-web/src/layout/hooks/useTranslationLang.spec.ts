import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

// ── mocks ──
const mockStorage: Record<string, any> = {};
const mockChangeTitle = vi.fn();
const mockHandleResize = vi.fn();
const mockLocaleRef = ref('zh');

vi.mock('./useNav', () => ({
  useNav: () => ({
    $storage: mockStorage,
    changeTitle: mockChangeTitle,
    handleResize: mockHandleResize
  })
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: mockLocaleRef,
    t: (key: string) => key
  })
}));

const mockRouteMeta: Record<string, any> = { title: 'Home' };
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', meta: mockRouteMeta })
}));

import { useTranslationLang } from './useTranslationLang';

describe('useTranslationLang', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocaleRef.value = 'zh';
    Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  });

  /** helper：在组件 setup 中调用 useTranslationLang */
  function mountHook(refArg?: any) {
    let hookResult: ReturnType<typeof useTranslationLang>;
    const Comp = defineComponent({
      setup() {
        hookResult = useTranslationLang(refArg);
        return () => h('div');
      }
    });
    mount(Comp);
    return hookResult!;
  }

  it('translationCh 设置 locale 为 zh', () => {
    const { translationCh } = mountHook();
    translationCh();
    expect(mockStorage.locale).toEqual({ locale: 'zh' });
    expect(mockLocaleRef.value).toBe('zh');
  });

  it('translationEn 设置 locale 为 en', () => {
    const { translationEn } = mountHook();
    translationEn();
    expect(mockStorage.locale).toEqual({ locale: 'en' });
    expect(mockLocaleRef.value).toBe('en');
  });

  it('translationCh 带 ref 参数时调用 handleResize', () => {
    const menuRef = { value: { handleResize: vi.fn() } };
    const { translationCh } = mountHook(menuRef);
    translationCh();
    expect(mockHandleResize).toHaveBeenCalledWith(menuRef.value);
  });

  it('translationEn 带 ref 参数时调用 handleResize', () => {
    const menuRef = { value: { handleResize: vi.fn() } };
    const { translationEn } = mountHook(menuRef);
    translationEn();
    expect(mockHandleResize).toHaveBeenCalledWith(menuRef.value);
  });

  it('translationCh 不带 ref 参数时不调用 handleResize', () => {
    const { translationCh } = mountHook();
    translationCh();
    expect(mockHandleResize).not.toHaveBeenCalled();
  });

  it('返回 t / route / locale / translationCh / translationEn', () => {
    const result = mountHook();
    expect(result.t).toBeTypeOf('function');
    expect(result.locale).toBeDefined();
    expect(result.route).toBeDefined();
    expect(result.translationCh).toBeTypeOf('function');
    expect(result.translationEn).toBeTypeOf('function');
  });

  it('onBeforeMount 从 $storage.locale 读取 locale', async () => {
    mockStorage.locale = { locale: 'en' };
    mountHook();
    // onBeforeMount 在 mount 时已执行
    expect(mockLocaleRef.value).toBe('en');
  });

  it('onBeforeMount $storage.locale 不存在时默认 zh', async () => {
    // mockStorage 无 locale
    mountHook();
    expect(mockLocaleRef.value).toBe('zh');
  });

  it('watch locale 变化时调用 changeTitle', async () => {
    const { locale } = mountHook();
    mockChangeTitle.mockClear();
    locale.value = 'en';
    // Vue watch 回调需要多个 tick 完成 flush
    await nextTick();
    await nextTick();
    await nextTick();
    expect(mockChangeTitle).toHaveBeenCalled();
  });
});
