// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}));

vi.mock('@/plugins/i18n', () => ({
  transformI18n: (m: any) => (typeof m === 'object' ? (m?.zh ?? m) : (m ?? ''))
}));

vi.mock('@/store/modules/epTheme', () => ({
  useEpThemeStoreHook: () => ({ epThemeColor: '#409EFF' })
}));

vi.mock('@pureadmin/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@pureadmin/utils')>();
  return {
    ...actual,
    useResizeObserver: vi.fn(),
    isArray: Array.isArray,
    delay: (_ms: number) => Promise.resolve()
  };
});

vi.mock('sortablejs', () => ({
  default: { create: vi.fn(() => ({})) },
  __esModule: true
}));

import SearchHistory from './SearchHistory.vue';

const historyItems = [
  {
    path: '/dashboard',
    type: 'history' as const,
    meta: { title: 'Dashboard' }
  },
  { path: '/users', type: 'history' as const, meta: { title: 'Users' } }
];

const collectItems = [
  { path: '/settings', type: 'collect' as const, meta: { title: 'Settings' } }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SearchHistory', () => {
  const baseProps = {
    value: '/dashboard',
    options: [...historyItems, ...collectItems]
  };

  const mountOpts = (props = baseProps) => ({
    props,
    global: {
      stubs: {
        SearchHistoryItem: {
          template: '<div class="mock-history-item"><slot /></div>',
          props: ['item']
        }
      }
    }
  });

  it('renders history section when history items exist', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const text = wrapper.text();
    expect(text).toContain('search.pureHistory');
  });

  it('renders correct number of history items', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const historySection = wrapper.findAll('.history-item');
    // 2 history items + 1 collect item = 3 total .history-item divs
    expect(historySection.length).toBe(3);
  });

  it('renders collect section when collect items exist', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const text = wrapper.text();
    expect(text).toContain('search.pureCollect');
  });

  it('does not render collect section when no collect items', () => {
    const wrapper = shallowMount(
      SearchHistory as any,
      mountOpts({
        value: '/dashboard',
        options: [...historyItems]
      })
    );
    const text = wrapper.text();
    expect(text).not.toContain('search.pureCollect');
  });

  it('applies active style to item matching value prop', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const items = wrapper.findAll('.history-item');
    // First item (/dashboard) matches active value
    expect(items[0].attributes('style')).toContain('rgb(64, 158, 255)');
    // Second item (/users) does not match
    expect(items[1].attributes('style')).not.toContain('rgb(64, 158, 255)');
  });

  it('emits enter when a history item is clicked', async () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const items = wrapper.findAll('.history-item');
    await items[0].trigger('click');
    expect(wrapper.emitted('enter')).toBeTruthy();
  });

  it('emits update:value on mouseenter', async () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const items = wrapper.findAll('.history-item');
    await items[1].trigger('mouseenter');
    expect(wrapper.emitted('update:value')).toBeTruthy();
    expect(wrapper.emitted('update:value')![0]).toEqual(['/users']);
  });

  it('exposes handleScroll method', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    expect(typeof (wrapper.vm as any).handleScroll).toBe('function');
  });

  it('handleScroll returns 0 for invalid index', () => {
    const wrapper = shallowMount(SearchHistory as any, mountOpts());
    const result = (wrapper.vm as any).handleScroll(99);
    expect(result).toBe(0);
  });

  it('does not render history section when no history items', () => {
    const wrapper = shallowMount(
      SearchHistory as any,
      mountOpts({
        value: '/settings',
        options: [...collectItems]
      })
    );
    const text = wrapper.text();
    expect(text).not.toContain('search.pureHistory');
  });
});
