// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}));

vi.mock('@/layout/hooks/useNav', () => ({
  useNav: () => ({ device: { value: 'desktop' } })
}));

import SearchFooter from './SearchFooter.vue';

describe('SearchFooter（T3 smoke）', () => {
  it('挂载不崩且根元素渲染', () => {
    const wrapper = mount(SearchFooter, {
      props: { total: 5 },
      global: {
        components: {
          IconifyIconOffline: { template: '<span />' },
          MdiKeyboardEsc: { template: '<span />' },
          EnterOutlined: { template: '<span />' },
          ArrowUpLine: { template: '<span />' },
          ArrowDownLine: { template: '<span />' }
        }
      }
    });
    expect(wrapper.find('.search-footer').exists()).toBe(true);
  });

  it('total > 0 时显示总数', () => {
    const wrapper = mount(SearchFooter, {
      props: { total: 3 },
      global: {
        components: {
          IconifyIconOffline: { template: '<span />' },
          MdiKeyboardEsc: { template: '<span />' },
          EnterOutlined: { template: '<span />' },
          ArrowUpLine: { template: '<span />' },
          ArrowDownLine: { template: '<span />' }
        }
      }
    });
    expect(wrapper.find('.search-footer-total').exists()).toBe(true);
    expect(wrapper.text()).toContain('3');
  });
});
